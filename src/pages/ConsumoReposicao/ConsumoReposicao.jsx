// src/pages/ConsumoReposicao/ConsumoReposicao.jsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import api from "../../api";

// Subpáginas
import Estoque from "./Estoque";
import Dieta from "./Dieta";
import Lotes from "./Lotes";
import Limpeza from "./Limpeza";
// ⚠️ Ajuste o case conforme o nome real do arquivo:
import CalendarioSanitario from "./calendariosanitario";
// import CalendarioSanitario from "./CalendarioSanitario";

const LS_LAST_TAB = "consumo:subabas:last";
const LS_COUNTS   = "consumo:subabas:counts";

/* ========================= Chips (abas compactas) ========================= */
function Chips({ selected, setSelected, contadores }) {
  const tabs = useMemo(
    () => [
      { id: "estoque",    label: "Estoque" },
      { id: "lotes",      label: "Lotes" },
      { id: "dieta",      label: "Dietas" },
      { id: "limpeza",    label: "Limpeza" },
      { id: "calendario", label: "Calendário Sanitário" },
    ],
    []
  );

  const onKey = useCallback(
    (e) => {
      const idx = tabs.findIndex((t) => t.id === selected);
      if (idx === -1) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelected(tabs[(idx + 1) % tabs.length].id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelected(tabs[(idx - 1 + tabs.length) % tabs.length].id);
      }
    },
    [selected, setSelected, tabs]
  );

  return (
    <div role="tablist" aria-label="Sub-abas de consumo e reposição" onKeyDown={onKey} style={chips.wrap}>
      {tabs.map((t) => {
        const active = selected === t.id;
        const qtd = contadores?.[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-controls={`pane-${t.id}`}
            onClick={() => setSelected(t.id)}
            tabIndex={active ? 0 : -1}
            title={t.label}
            style={{
              ...chips.btn,
              borderColor: active ? "#2563eb" : "#e5e7eb",
              background: active ? "#eaf2ff" : "#fff",
              color: active ? "#1e3a8a" : "#334155",
              fontWeight: active ? 700 : 600,
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: active ? "#1e40af" : "#e5e7eb",
                color: active ? "#fff" : "#111827",
              }}
            >
              {Number.isFinite(qtd) ? qtd : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ===== helpers de contagem ===== */

/** Requisição que NUNCA lança erro (evita 404 no console). */
async function requestCountNoThrow(url, params) {
  const res = await api.get(url, {
    params,
    validateStatus: () => true, // nunca rejeita
  });

  if (res.status >= 200 && res.status < 300) {
    const data = res.data;
    if (Array.isArray(data)) return { ok: true, count: data.length, status: res.status };
    if (Array.isArray(data?.items)) return { ok: true, count: data.items.length, status: res.status };
    const n = Number(data?.count ?? data?.total ?? 0);
    return { ok: true, count: Number.isFinite(n) ? n : 0, status: res.status };
  }

  return { ok: false, count: 0, status: res.status };
}

/** Conta itens em /consumo/estoque filtrando por categorias (client-side) */
async function countEstoquePorCategorias(categoriasLista) {
  const categorias = categoriasLista.join(",");
  const { ok, count } = await requestCountNoThrow(`/api/v1/consumo/estoque`, {
    categorias,
    limit: 10000,
  });
  return ok ? count : 0;
}

/** Router com fallback:
 *  - /limpeza 404 → conta via estoque por categorias conhecidas
 *  - /calendario[(-|_)sanitario]? 404 → retorna 0 (será coberto pelo “maior dos três”)
 */
async function countFrom(url) {
  const { ok, count, status } = await requestCountNoThrow(url);

  if (ok) return count;

  // Fallbacks específicos por rota quando 404
  if (status === 404) {
    if (url.endsWith("/limpeza")) {
      const categoriasLimpeza = [
        "Limpeza",
        "Higiene",
        "Produtos de limpeza",
        "Limpeza e higiene",
        "Sanitização",
      ];
      return await countEstoquePorCategorias(categoriasLimpeza);
    }
    if (
      url.endsWith("/calendario") ||
      url.endsWith("/calendario-sanitario") ||
      url.endsWith("/calendario_sanitario")
    ) {
      return 0;
    }
  }

  // Outros status → não quebra a UI
  return 0;
}

/** Prefetch dos contadores — valor inicial/estimativa */
async function prefetchAllCounts() {
  const [estoque, lotes, dieta, limpeza] = await Promise.all([
    countFrom("/api/v1/consumo/estoque"),
    countFrom("/api/v1/consumo/lotes"),
    countFrom("/api/v1/consumo/dietas"),
    countFrom("/api/v1/consumo/limpeza"),
  ]);

  // calendários variam; pegamos o maior como estimativa
  const calTries = await Promise.all([
    countFrom("/api/v1/consumo/calendario"),
    countFrom("/api/v1/consumo/calendario-sanitario"),
    countFrom("/api/v1/consumo/calendario_sanitario"),
  ]);
  const calendario = Math.max(0, ...calTries);

  return { estoque, lotes, dieta, limpeza, calendario };
}

/* ===== persistência leve para as badges ===== */
function readCountsLS() {
  try { return JSON.parse(localStorage.getItem(LS_COUNTS) || "{}"); } catch { return {}; }
}
function writeCountsLS(obj) {
  try { localStorage.setItem(LS_COUNTS, JSON.stringify(obj || {})); } catch {}
}

/* ========================= Página principal ========================= */
export default function ConsumoReposicao() {
  const [tab, setTab] = useState(() => localStorage.getItem(LS_LAST_TAB) || "estoque");
  useEffect(() => localStorage.setItem(LS_LAST_TAB, tab), [tab]);

  // Contadores dos chips (null = ainda não confirmado pelo filho)
  const [counts, setCounts] = useState(() => ({
    estoque:    null,
    lotes:      null,
    dieta:      null,
    limpeza:    null,
    calendario: null,
    ...readCountsLS(), // carrega último valor conhecido
  }));

  // 🔹 Prefetch como "estimativa". O valor REAL vem do componente-filho via onCountChange
  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await prefetchAllCounts();
      if (!alive) return;
      setCounts((prev) => {
        // só atualiza se ainda não houver valor (evita flicker sobre o que o filho já confirmou)
        const next = { ...prev };
        for (const k of Object.keys(c)) if (!Number.isFinite(next[k])) next[k] = c[k];
        writeCountsLS(next);
        return next;
      });
    })();
    return () => { alive = false; };
  }, []);

  // Filhos atualizam a contagem REAL (alinhada com a UI deles)
  const setCountKey = useCallback((key, n) => {
    const num = Number(n) || 0;
    setCounts((prev) => {
      if (prev[key] === num) return prev;
      const next = { ...prev, [key]: num };
      writeCountsLS(next);
      return next;
    });
  }, []);

  const onCountEstoque    = useCallback((n) => setCountKey("estoque", n),    [setCountKey]);
  const onCountLotes      = useCallback((n) => setCountKey("lotes", n),      [setCountKey]);
  const onCountDieta      = useCallback((n) => setCountKey("dieta", n),      [setCountKey]);
  const onCountLimpeza    = useCallback((n) => setCountKey("limpeza", n),    [setCountKey]);
  const onCountCalendario = useCallback((n) => setCountKey("calendario", n), [setCountKey]);

  // opcional: quando alguma subpágina disparar um evento global, atualizamos a aba ativa
  useEffect(() => {
    const h = () => {
      // window.dispatchEvent(new Event("consumoAtualizado"))
      // deixamos o filho recontar naturalmente
    };
    window.addEventListener("consumoAtualizado", h);
    return () => window.removeEventListener("consumoAtualizado", h);
  }, []);

  return (
    <div style={ui.page}>
      <Chips selected={tab} setSelected={setTab} contadores={counts} />

      <div id={`pane-${tab}`} role="tabpanel" aria-labelledby={tab} style={{ padding: 12 }}>
        {tab === "estoque"    && <Estoque             onCountChange={onCountEstoque} />}
        {tab === "lotes"      && <Lotes               onCountChange={onCountLotes} />}
        {tab === "dieta"      && <Dieta               onCountChange={onCountDieta} />}
        {tab === "limpeza"    && <Limpeza             onCountChange={onCountLimpeza} />}
        {tab === "calendario" && <CalendarioSanitario onCountChange={onCountCalendario} />}
      </div>
    </div>
  );
}

/* ========================= Estilos inline ========================= */
const ui = {
  page: {
    padding: 12,
    background: "#f6f7fb",
    fontFamily: "Poppins, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    minHeight: "100dvh",
    borderRadius: 16,
  },
};

const chips = {
  wrap: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    gap: 8,
    padding: 6,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    minHeight: 40,
    alignItems: "center",
    overflowX: "auto",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 28,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#334155",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background .15s ease, color .15s ease, border-color .15s ease",
  },
};
