// src/pages/Animais/SubAbasAnimais.jsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { getAnimais } from "../../api";

// ✅ SUB-ABAS
import Plantel from "./Plantel.jsx";
import Secagem from "./Secagem.jsx";
import PrePartoParto from "./PrePartoParto.jsx";

const LS_LAST_TAB = "subabas:last";

/* --------- Chips (abas compactas) --------- */
function Chips({ selected, setSelected, contadores }) {
  const tabs = useMemo(
    () => [
      { id: "plantel", label: "Plantel" },
      { id: "secagem", label: "Secagem" },
      { id: "preparto_parto", label: "Pré-parto/Parto" },
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
    <div
      role="tablist"
      aria-label="Sub-abas de animais"
      onKeyDown={onKey}
      style={{
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
      }}
    >
      {tabs.map((t) => {
        const active = selected === t.id;
        const qtd = contadores?.[t.id] ?? 0;
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
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 28,
              padding: "0 12px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: active ? 700 : 600,
              border: "1px solid",
              borderColor: active ? "#2563eb" : "#e5e7eb",
              background: active ? "#eaf2ff" : "#fff",
              color: active ? "#1e3a8a" : "#334155",
              cursor: "pointer",
              whiteSpace: "nowrap",
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
              {qtd}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ===== helpers para alinhar a contagem com a tabela ===== */
function parseBR(str) {
  if (!str || str.length !== 10) return null;
  const [d, m, y] = str.split("/").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function addDays(dt, n) {
  const d = new Date(dt.getTime());
  d.setDate(d.getDate() + n);
  return d;
}
function calcPrevisaoPartoLocal({ previsao_parto, ultima_ia }) {
  const pp = parseBR(previsao_parto);
  if (pp) return pp;
  const ia = parseBR(ultima_ia);
  return ia ? addDays(ia, 280) : null;
}
/** Mesmo filtro usado na tabela (PréPartoParto.somenteElegiveis) */
function filtrarElegiveisPreparto(items) {
  const hoje = new Date();
  return (items || []).filter((v) => {
    const pp = calcPrevisaoPartoLocal({
      previsao_parto: v.previsao_parto,
      ultima_ia: v.ultima_ia,
    });
    if (!pp) return false;
    if (pp < hoje) return false;
    const categoria = String(v?.categoria || "").toLowerCase();
    if (!categoria.includes("vaca") && !categoria.includes("lact")) {
      const ia = parseBR(v?.ultima_ia);
      if (!ia) return false;
    }
    return true;
  });
}

/* --------------- Componente principal --------------- */
export default function SubAbasAnimais({
  animais = [],
  onRefresh,
  components,
  componentes,
}) {
  // mapa padrão (permite sobrepor via props)
  const defaultComponents = useMemo(
    () => ({
      plantel: Plantel,
      secagem: Secagem,
      preparto_parto: PrePartoParto,
    }),
    []
  );
  const maps = useMemo(
    () => (components || componentes ? components || componentes : defaultComponents),
    [components, componentes, defaultComponents]
  );

  const [tab, setTab] = useState(() => localStorage.getItem(LS_LAST_TAB) || "plantel");
  useEffect(() => localStorage.setItem(LS_LAST_TAB, tab), [tab]);

  // listas carregadas sob demanda (secagem / preparto)
  const [listas, setListas] = useState({
    secagem: [],
    preparto: [],
    parto: [], // mantemos a chave por compatibilidade
  });

  // contagens exibidas nos chips
  const [counts, setCounts] = useState({
    secagem: 0,
    preparto_parto: 0, // **somente pré-parto**, igual à tabela
  });

  // 🔹 PREFETCH: buscar contagens com o MESMO filtro da tabela
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sec, pre] = await Promise.all([
          getAnimais({ view: "secagem", days: 60, page: 1, limit: 1 }),
          // precisamos dos itens para aplicar o mesmo filtro da tabela
          getAnimais({ view: "preparto", days: 30, page: 1, limit: 300 }),
        ]);
        if (!alive) return;
        const preElegiveis = filtrarElegiveisPreparto(pre?.items || []);
        setCounts({
          secagem: typeof sec?.total === "number" ? sec.total : (sec?.items?.length || 0),
          preparto_parto: preElegiveis.length, // ✔ alinhado com a lista renderizada
        });
      } catch (e) {
        console.warn("Prefetch contagens falhou:", e?.message);
      }
    })();

    const bump = () => {
      (async () => {
        try {
          const [sec, pre] = await Promise.all([
            getAnimais({ view: "secagem", days: 60, page: 1, limit: 1 }),
            getAnimais({ view: "preparto", days: 30, page: 1, limit: 300 }),
          ]);
          if (!alive) return;
          const preElegiveis = filtrarElegiveisPreparto(pre?.items || []);
          setCounts({
            secagem: typeof sec?.total === "number" ? sec.total : (sec?.items?.length || 0),
            preparto_parto: preElegiveis.length,
          });
        } catch {}
      })();
    };
    window.addEventListener("animaisAtualizados", bump);

    return () => {
      alive = false;
      window.removeEventListener("animaisAtualizados", bump);
    };
  }, []);

  // util: mescla por id (evita duplicatas)
  const mergeById = useCallback((a = [], b = []) => {
    const seen = new Set();
    const out = [];
    for (const x of [...a, ...b]) {
      const id = x?.id ?? `${x?.numero}-${x?.brinco}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(x);
      }
    }
    return out;
  }, []);

  // carrega dados sob demanda p/ a aba ativa
  useEffect(() => {
    const carregar = async () => {
      try {
        if (tab === "secagem") {
          const { items, total } = await getAnimais({ view: "secagem", days: 60 });
          setListas((l) => ({ ...l, secagem: items || [] }));
          setCounts((prev) => ({
            ...prev,
            secagem: typeof total === "number" ? total : (items?.length || 0),
          }));
        } else if (tab === "preparto_parto") {
          const preRes = await getAnimais({ view: "preparto", days: 30, page: 1, limit: 300 });
          const pre = preRes?.items || [];
          const preElegiveis = filtrarElegiveisPreparto(pre);
          setListas((l) => ({ ...l, preparto: preElegiveis, parto: [] }));
          setCounts((prev) => ({ ...prev, preparto_parto: preElegiveis.length }));
        }
      } catch (err) {
        console.error("Erro ao carregar animais (sub-abas):", err);
      }
    };
    if (tab !== "plantel") carregar();
  }, [tab]);

  // dados combinados para pré-parto/parto (hoje só pré)
  const dataPrePartoParto = useMemo(() => {
    const pre = listas.preparto || [];
    const pa = listas.parto || [];
    return {
      animaisPreParto: pre,
      animaisParto: pa,
      animaisMerged: mergeById(pre, pa),
    };
  }, [listas.preparto, listas.parto, mergeById]);

  // dataset entregue ao componente da aba ativa
  let data = animais;
  if (tab === "secagem") data = listas.secagem || [];
  if (tab === "preparto_parto") data = dataPrePartoParto.animaisPreParto || [];

  // contador do Plantel com a mesma regra da tabela (ativos e sem tipo_saida)
  const plantelCount = useMemo(() => {
    const arr = Array.isArray(animais) ? animais : [];
    return arr.filter(
      (v) => (v.status ?? "ativo") !== "inativo" && !v.tipo_saida
    ).length;
  }, [animais]);

  // contadores exibidos nos chips
  const contadores = useMemo(
    () => ({
      plantel: plantelCount,
      secagem: counts.secagem,
      preparto_parto: counts.preparto_parto,
    }),
    [plantelCount, counts]
  );

  // ✅ callbacks estáveis para receber contagens dos filhos
  const handleCountChange = useCallback((tabId, n) => {
    const num = Number(n) || 0;
    setCounts((prev) => (prev[tabId] === num ? prev : { ...prev, [tabId]: num }));
  }, []);
  const onCountSecagem = useCallback((n) => handleCountChange("secagem", n), [handleCountChange]);
  const onCountPreParto = useCallback((n) => handleCountChange("preparto_parto", n), [handleCountChange]);

  return (
    <div
      className="w-full"
      style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}
    >
      <Chips selected={tab} setSelected={setTab} contadores={contadores} />

      <div id={`pane-${tab}`} role="tabpanel" aria-labelledby={tab} style={{ padding: 12 }}>
        {tab === "plantel" && (
          <Plantel
            animais={animais}
            onAtualizado={onRefresh}
            // onCountChange={(n) => handleCountChange("plantel", n)} // opcional
          />
        )}

        {tab === "secagem" && (
          <Secagem animais={data} onCountChange={onCountSecagem} />
        )}

        {tab === "preparto_parto" && (
          <PrePartoParto
            animais={data}
            animaisPreParto={dataPrePartoParto.animaisPreParto}
            animaisParto={dataPrePartoParto.animaisParto}
            onCountChange={onCountPreParto} // o filho confirma a contagem exibida
          />
        )}
      </div>
    </div>
  );
}
