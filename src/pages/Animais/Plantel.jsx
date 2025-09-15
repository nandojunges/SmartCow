// src/pages/Animais/Plantel.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Pencil, FileText, ChevronDown, Check } from "lucide-react";
import Select from "react-select";
import api, { atualizarAnimal, atualizarAnimalLote } from "../../api";
import FichaAnimal from "./FichaAnimal/FichaAnimal";

/* ===== helpers ===== */
// Aceita 'yyyy-mm-dd', 'yyyy-mm-ddTHH:mm:ssZ' e 'dd/mm/aaaa'
function parseDateFlexible(s) {
  if (!s || typeof s !== "string") return null;
  // ISO: yyyy-mm-dd(THH:mm…)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    return Number.isFinite(+dt) ? dt : null;
  }
  // BR: dd/mm/aaaa
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    return Number.isFinite(+dt) ? dt : null;
  }
  return null;
}

function idadeTexto(nascimento) {
  const dt = parseDateFlexible(nascimento);
  if (!dt) return "—";
  const hoje = new Date();
  let meses = (hoje.getFullYear() - dt.getFullYear()) * 12 + (hoje.getMonth() - dt.getMonth());
  if (hoje.getDate() < dt.getDate()) meses -= 1;
  if (meses < 0) meses = 0;
  const anos = Math.floor(meses / 12);
  const rem = meses % 12;
  return `${anos}a ${rem}m`;
}

function del(parto) {
  const dt = parseDateFlexible(parto);
  if (!dt) return "—";
  const dias = Math.floor((Date.now() - dt.getTime()) / 86400000);
  return Number.isFinite(dias) ? String(Math.max(0, dias)) : "—";
}

// === datas (para previsão de parto por fallback) ===
function formatBR(dt) {
  if (!dt) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function addDays(dt, n) { const d = new Date(dt.getTime()); d.setDate(d.getDate() + n); return d; }
function calcPrevisaoParto(animal) {
  // tenta previsão pronta (BR ou ISO)
  const prev =
    parseDateFlexible(animal?.previsao_parto) ||
    parseDateFlexible(animal?.previsaoParto) ||
    parseDateFlexible(animal?.previsao_parto_iso) ||
    parseDateFlexible(animal?.previsaoPartoISO);
  if (prev) return prev;
  // fallback por última IA
  const ia =
    parseDateFlexible(animal?.ultima_ia) ||
    parseDateFlexible(animal?.ultimaIa);
  return ia ? addDays(ia, 280) : null;
}

/* === lote no animal === */
const LOTE_ID_KEYS = ["current_lote_id", "lote_id", "loteId", "grupo_id", "grupoId"];
const LOTE_NOME_KEYS = ["current_lote_nome", "lote_nome", "loteNome", "grupo_nome", "grupoNome"];

function extractLoteFrom(obj) {
  if (!obj || typeof obj !== "object") return { id: null, nome: null };
  for (const k of LOTE_ID_KEYS) if (obj[k] != null) {
    const id = obj[k];
    let nome = null;
    for (const kk of LOTE_NOME_KEYS) if (obj[kk] != null) { nome = obj[kk]; break; }
    return { id, nome };
  }
  if (obj.historico && typeof obj.historico === "object" && obj.historico.lote) {
    const l = obj.historico.lote;
    return { id: l?.id ?? null, nome: l?.nome ?? null };
  }
  if (obj.lote && typeof obj.lote === "object") {
    return { id: obj.lote.id ?? obj.loteId ?? null, nome: obj.lote.nome ?? obj.loteNome ?? null };
  }
  if (obj.grupo && typeof obj.grupo === "object") {
    return { id: obj.grupo.id ?? obj.grupoId ?? null, nome: obj.grupo.nome ?? obj.grupoNome ?? null };
  }
  return { id: null, nome: null };
}

/* === ativo x inativo (ONE SOURCE OF TRUTH) === */
function isInativo(a) {
  const st = String(a?.status ?? "").toLowerCase();
  if (st === "inativo") return true;
  if (a?.tipo_saida || a?.motivo_saida || a?.data_saida) return true;
  const saiu = Array.isArray(a?.historico?.saidas) && a.historico.saidas.length > 0;
  return saiu;
}
const isAtivo = (a) => !isInativo(a);

/* ===== estilos tabela ===== */
const STICKY_OFFSET = 48;
const tableClasses = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase =
  "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap cursor-pointer";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs hover:bg-[#eaf5ff] transition-colors";
const rowAlt = "even:bg-[#f7f7f8]";
const hoverTH = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");
const hoverTD = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");

/* colunas */
const COLUNAS = ["Número","Brinco","Lactações","DEL","Categoria","Idade","Previsão de parto","Sit. Produtiva","Lote","Ação"];
const COLS = [70, 90, 110, 80, 140, 95, 150, 130, 170, 150];

/* badges */
const badge = (texto, tipo = "neutro") => {
  const base = {
    display: "inline-flex", alignItems: "center", height: 22, padding: "0 10px",
    borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
  };
  const cores = {
    neutro: { background: "#eef2ff", color: "#1e40af" },
    lactante: { background: "#ecfdf5", color: "#065f46" },
    seca: { background: "#f1f5f9", color: "#334155" },
  };
  const key = String(tipo || "").includes("lact") ? "lactante"
            : String(tipo || "").includes("seca") ? "seca" : "neutro";
  return <span style={{ ...base, ...(cores[key] || cores.neutro) }}>{texto}</span>;
};

/* ================= Plantel ================= */
export default function Plantel({ animais = [], onAtualizado, onCountChange }) {
  const [rows, setRows] = useState(Array.isArray(animais) ? animais : []);
  useEffect(() => setRows(Array.isArray(animais) ? animais : []), [animais]);

  // some do plantel tudo que estiver inativo
  const visibleRows = useMemo(
    () => (Array.isArray(rows) ? rows : []).filter(isAtivo),
    [rows]
  );

  // qualquer cálculo futuro use visibleRows (só ativos)
  useEffect(() => { onCountChange?.(visibleRows.length); }, [visibleRows.length, onCountChange]);

  // se algum outro lugar disparar evento de saída, removemos aqui
  useEffect(() => {
    const h = (e) => {
      const id = e?.detail?.id;
      setRows(prev => id ? prev.filter(r => r.id !== id) : prev.filter(isAtivo));
    };
    window.addEventListener("saida-registrada", h);
    return () => window.removeEventListener("saida-registrada", h);
  }, []);

  const [hoverCol, setHoverCol] = useState(null);
  const [editAnimal, setEditAnimal] = useState(null);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [animalFicha, setAnimalFicha] = useState(null);

  /* lotes ativos */
  const [lotes, setLotes] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/api/v1/consumo/lotes");
        const list = Array.isArray(data) ? data : data?.items || [];
        const ativos = list.filter((l) => l.ativo !== false);
        if (alive) setLotes(ativos.map((l) => ({ id: l.id, nome: l.nome })));
      } catch (e) {
        console.error("⚠️ Não foi possível carregar lotes:", e);
        if (alive) setLotes([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* contagem por lote baseada nos ATIVOS */
  const loteCounts = useMemo(() => {
    const map = new Map();
    for (const a of visibleRows) {
      const { id } = extractLoteFrom(a);
      if (id == null) continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
    return map;
  }, [visibleRows]);

  async function fetchAnimalById(id) {
    try { const { data } = await api.get(`/api/v1/animals/${id}`, { headers: { "Cache-Control": "no-cache" } }); if (data) return data; } catch {}
    try { const { data } = await api.get(`/api/v1/animals`, { params: { id }, headers: { "Cache-Control": "no-cache" } }); if (Array.isArray(data)) return data.find(a => a.id === id) || null; } catch {}
    try { const { data } = await api.get(`/api/v1/animals`, { headers: { "Cache-Control": "no-cache" } }); const arr = Array.isArray(data) ? data : data?.items || []; return arr.find(a => a.id === id) || null; } catch {}
    return null;
  }

  /* ===== alteração de lote — persiste via endpoint dedicado ===== */
  async function mudarLote(animal, loteId, loteNome) {
    // se ficou inativo em outra aba por algum motivo, não permitir mover
    if (isInativo(animal)) return;

    const prev = extractLoteFrom(animal);
    const selected = loteId != null ? lotes.find((l) => l.id === loteId) : null;
    const nextNome = loteNome || selected?.nome || null;

    // UI otimista
    setRows((prevRows) =>
      prevRows.map((r) =>
        r.id === animal.id
          ? { ...r, current_lote_id: loteId ?? null, current_lote_nome: nextNome }
          : r
      )
    );

    let updated = null;
    try {
      updated = await atualizarAnimalLote(animal.id, {
        lote_id: loteId ?? null,
        lote_nome: nextNome ?? null,
      });
    } catch (e) {
      console.error("Erro ao salvar lote:", e);
    }

    if (!updated) {
      // rollback
      setRows((prevRows) =>
        prevRows.map((r) =>
          r.id === animal.id
            ? { ...r, current_lote_id: prev.id, current_lote_nome: prev.nome }
            : r
        )
      );
      alert("❌ Não consegui salvar o lote no servidor.");
      return;
    }

    const fresh = await fetchAnimalById(animal.id);
    const to = extractLoteFrom(fresh || updated);

    setRows((prevRows) => {
      const merged = prevRows.map((r) =>
        r.id === animal.id
          ? { ...r, ...(fresh || updated), current_lote_id: to.id, current_lote_nome: to.nome }
          : r
      );
      // se o backend marcou como inativo por algum motivo, some daqui
      return merged.filter(isAtivo);
    });

    window.dispatchEvent(new Event("animaisAtualizados"));
    onAtualizado?.(fresh || updated);
  }

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        <table className={tableClasses}>
          <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr>
              {COLUNAS.map((c, i) => (
                <th
                  key={c}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverTH(i, hoverCol)}`}
                  style={{ top: STICKY_OFFSET }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((v, idx) => {
              const prodTxt = v.situacao_produtiva || v.estado || "—";
              const loteRow = extractLoteFrom(v);
              const dtPrev = calcPrevisaoParto(v);
              const prevStr = formatBR(dtPrev);

              const disabled = isInativo(v); // segurança dupla

              return (
                <tr key={v.id ?? v.numero ?? v.brinco ?? idx} className={`${rowBase} ${rowAlt}`}>
                  <td className={`${tdClamp} ${hoverTD(0, hoverCol)}`} title={v.numero}>{v.numero}</td>
                  <td className={`${tdClamp} ${hoverTD(1, hoverCol)}`} title={v.brinco}>{v.brinco}</td>
                  <td className={`${tdClamp} ${hoverTD(2, hoverCol)}`} title={String(v.n_lactacoes ?? "—")}>{v.n_lactacoes ?? "—"}</td>
                  <td className={`${tdClamp} ${hoverTD(3, hoverCol)}`} title={del(v.parto)}>{del(v.parto)}</td>
                  <td className={`${tdClamp} ${hoverTD(4, hoverCol)}`} title={v.categoria ?? "—"}>{v.categoria ?? "—"}</td>
                  <td className={`${tdClamp} ${hoverTD(5, hoverCol)}`} title={idadeTexto(v.nascimento)}>{idadeTexto(v.nascimento)}</td>

                  <td className={`${tdBase}  ${hoverTD(6, hoverCol)}`}>{prevStr}</td>

                  <td className={`${tdClamp} ${hoverTD(7, hoverCol)}`} title={prodTxt}>
                    {badge(prodTxt, prodTxt)}
                  </td>

                  {/* Lote */}
                  <td className={`${tdBase} ${hoverTD(8, hoverCol)}`}>
                    <LoteQuickSelect
                      lotes={lotes}
                      counts={loteCounts}
                      valueId={loteRow.id}
                      valueNome={loteRow.nome}
                      onChange={(id, nome) => mudarLote(v, id, nome)}
                      disabled={disabled}
                    />
                  </td>

                  <td className={`${tdBase}  ${hoverTD(9, hoverCol)}`}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setAnimalFicha(v); setFichaOpen(true); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                        title="Ficha do animal"
                      >
                        <FileText size={16} />
                        <span className="hidden sm:inline">Ficha</span>
                      </button>
                      <button
                        onClick={() => !disabled && setEditAnimal(v)}
                        disabled={disabled}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border ${disabled ? "opacity-40 cursor-not-allowed" : "border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"}`}
                        title={disabled ? "Animal inativo" : "Editar animal"}
                      >
                        <Pencil size={16} />
                        <span className="hidden sm:inline">Editar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de edição */}
      {editAnimal && (
        <ModalEditarAnimal
          animal={editAnimal}
          onFechar={() => setEditAnimal(null)}
          onSalvo={(updated) => {
            // se virar inativo por algum motivo, removemos do plantel
            setRows((prev) => {
              const merged = prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
              return merged.filter(isAtivo);
            });
            setEditAnimal(null);
            window.dispatchEvent(new Event("animaisAtualizados"));
            onAtualizado?.(updated);
          }}
        />
      )}

      {/* Ficha do animal */}
      {fichaOpen && animalFicha && (
        <FichaAnimal
          animal={animalFicha}
          onClose={() => { setFichaOpen(false); setAnimalFicha(null); }}
        />
      )}
    </section>
  );
}

/* ============ Lote Quick Select ============ */
function LoteQuickSelect({ lotes = [], counts = new Map(), valueId, valueNome, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (!ref.current) return; if (!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = valueId != null ? lotes.find((l) => l.id === valueId) : null;
  const label = valueNome || selected?.nome || "Sem lote";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-3 h-[28px] rounded-full border text-[#1e3a8a] bg-white transition ${disabled ? "opacity-40 cursor-not-allowed border-gray-300" : "hover:bg-[#eef3ff] hover:border-[#1e3a8a] border-[#1e3a8a]"}`}
        title={disabled ? "Animal inativo" : "Selecionar lote"}
      >
        <span className="font-semibold leading-none truncate max-w-[130px]">{label}</span>
        <ChevronDown size={16} />
      </button>

      {!disabled && open && (
        <div className="absolute z-20 mt-2 w-72 max-h-80 overflow-y-auto overflow-x-hidden bg-white rounded-md shadow-lg border">
          <div className="px-3 py-2 text-xs text-gray-500 border-b">Lotes ativos</div>

          {/* remover vínculo */}
          <button
            className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#f1f5ff] ${
              valueId == null ? "bg-[#eef6ff]" : ""
            }`}
            onClick={() => { onChange?.(null, null); setOpen(false); }}
          >
            <span className="truncate">Sem lote</span>
            <span className="text-xs px-2 py-[3px] rounded-full bg-[#eef2ff] text-[#1e3a8a]">—</span>
            {valueId == null && <Check size={16} className="text-[#1e3a8a]" />}
          </button>

          {lotes.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-600">Nenhum lote encontrado.</div>
          ) : (
            lotes.map((l) => {
              const isSel = l.id === valueId;
              const qtd = counts.get(l.id) || 0;
              return (
                <button
                  key={l.id}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#f1f5ff] ${isSel ? "bg-[#eef6ff]" : ""}`}
                  onClick={() => { onChange?.(l.id, l.nome); setOpen(false); }}
                >
                  <span className="truncate">{l.nome}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs px-2 py-[3px] rounded-full bg-[#eef2ff] text-[#1e3a8a]">
                      {qtd}
                    </span>
                    {isSel && <Check size={16} className="text-[#1e3a8a]" />}
                  </span>
                </button>
              );
            })
          )}

          <div className="px-3 py-2 text-[11px] text-gray-500 border-t">
            Dica: mova a vaca entre lotes sem sair desta página.
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Modal de edição ===== */
function ModalEditarAnimal({ animal, onFechar, onSalvo }) {
  const initial = {
    id: animal?.id,
    numero: animal?.numero ?? "",
    brinco: animal?.brinco ?? "",
    nascimento: animal?.nascimento ?? "",
    sexo: animal?.sexo ?? "femea",
    raca: animal?.raca ?? "",
    categoria: animal?.categoria ?? "",
    situacao_produtiva: animal?.situacao_produtiva || animal?.estado || "",
    situacao_reprodutiva: animal?.situacao_reprodutiva || "",
    nLactacoes: animal?.n_lactacoes ?? "",
    ultimaIA: animal?.ultima_ia ?? "",
    ultimoParto: animal?.parto ?? "",
    pai: animal?.pai ?? "",
    mae: animal?.mae ?? "",
  };
  const [dados, setDados] = useState(initial);
  const [salvando, setSalvando] = useState(false);
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
    const esc = (e) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  useEffect(() => {
    if (!dados.nascimento || dados.nascimento.length !== 10) return;
    const [dia, mes, ano] = dados.nascimento.split("/").map(Number);
    const nascDate = new Date(ano, mes - 1, dia);
    const meses = Math.floor((Date.now() - +nascDate) / (1000 * 60 * 60 * 24 * 30.44));
    const idade = `${Math.floor(meses / 12)}a ${meses % 12}m`;
    let categoria = "";
    if (meses < 2) categoria = dados.sexo === "macho" ? "Bezerro" : "Bezerra";
    else if (meses < 12) categoria = dados.sexo === "macho" ? "Novilho" : "Novilha jovem";
    else if (meses < 24) categoria = dados.sexo === "macho" ? "Touro jovem" : "Novilha";
    else categoria = dados.sexo === "macho" ? "Touro" : "Vaca";
    setDados((p) => ({ ...p, idade, categoria }));
  }, [dados.nascimento, dados.sexo]);

  const setCampo = (k, v) => setDados((p) => ({ ...p, [k]: v }));
  const formatarDataDigitada = (val) => {
    const d = String(val || "").replace(/\D/g, "").slice(0, 8);
    const p1 = d.slice(0, 2), p2 = d.slice(2, 4), p3 = d.slice(4, 8);
    return [p1, p2, p3].filter(Boolean).join("/");
  };
  const toStr = (v) => { const s = String(v ?? "").trim(); return s ? s : undefined; };
  const toInt = (v) => { const s = String(v ?? "").trim(); if (!s) return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);

    const ultimoPartoStr = toStr(dados.ultimoParto);

    const body = {
      numero: toStr(dados.numero),
      brinco: toStr(dados.brinco),
      nascimento: toStr(dados.nascimento),
      sexo: toStr(dados.sexo),
      raca: toStr(dados.raca),
      categoria: toStr(dados.categoria),
      situacao_produtiva: toStr(dados.situacao_produtiva),
      situacao_reprodutiva: toStr(dados.situacao_reprodutiva),
      pai: toStr(dados.pai),
      mae: toStr(dados.mae),
      ...(dados.sexo !== "macho"
        ? {
            n_lactacoes: toInt(dados.nLactacoes),
            ultima_ia: toStr(dados.ultimaIA),
            parto: ultimoPartoStr,
            ...(ultimoPartoStr ? { previsao_parto: null, ultima_ia: null, categoria: "Lactante" } : {}),
          }
        : {}),
    };

    try {
      const updated = await atualizarAnimal(dados.id, body);
      onSalvo?.(updated);
    } catch (err) {
      const issues = err?.response?.data?.issues;
      if (issues?.length) {
        alert("❌ Validação:\n" + issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
      } else {
        const msg = err?.response?.data?.error || err?.message || "Erro ao atualizar animal";
        alert(`❌ ${msg}`);
      }
    } finally {
      setSalvando(false);
    }
  };

  const sexoOptions = [
    { value: "femea", label: "Fêmea" },
    { value: "macho", label: "Macho" },
  ];
  const racaOptions = [
    { value: "Holandês", label: "Holandês" },
    { value: "Jersey", label: "Jersey" },
    { value: "Girolando", label: "Girolando" },
    ...(dados.raca ? [{ value: dados.raca, label: dados.raca }] : []),
  ];
  const produtivaOptions = [
    { value: "lactante", label: "Lactante" },
    { value: "seca", label: "Seca" },
    { value: "nao_lactante", label: "Não lactante" },
  ];
  const reprodutivaOptions = [
    { value: "vazia", label: "Vazia" },
    { value: "inseminada st", label: "Inseminada ST" },
    { value: "prenha", label: "Prenha" },
    { value: "pré-parto", label: "Pré-parto" },
    { value: "PEV", label: "PEV" },
  ];

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>🐄 Editar Animal — Nº {dados.numero}</div>
        <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={grid}>
            <div><label>Número</label><input value={dados.numero} readOnly style={input(true)} /></div>
            <div>
              <label>Brinco</label>
              <input
                ref={(el) => (refs.current[0] = el)}
                value={dados.brinco}
                onChange={(e) => setCampo("brinco", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") refs.current[1]?.focus(); }}
                style={input()}
              />
            </div>
            <div>
              <label>Nascimento</label>
              <input
                ref={(el) => (refs.current[1] = el)}
                value={dados.nascimento}
                onChange={(e) => setCampo("nascimento", formatarDataDigitada(e.target.value))}
                placeholder="dd/mm/aaaa" style={input()}
              />
            </div>
            <div><label>Sexo</label>
              <Select options={sexoOptions}
                value={sexoOptions.find((o) => o.value === dados.sexo) || null}
                onChange={(opt) => setCampo("sexo", opt?.value || "femea")}
                placeholder="Selecione"/>
            </div>
            <div><label>Raça</label>
              <Select options={racaOptions}
                value={racaOptions.find((o) => o.value === dados.raca) || null}
                onChange={(opt) => setCampo("raca", opt?.value || "")}
                placeholder="Selecione"/>
            </div>
            <div><label>Categoria</label><input value={dados.categoria || ""} readOnly style={input(true)} /></div>
            <div><label>Idade</label><input value={dados.idade || ""} readOnly style={input(true)} /></div>

            <div><label>Situação produtiva</label>
              <Select
                options={produtivaOptions}
                value={
                  produtivaOptions.find((o) => o.value === (dados.situacao_produtiva || "").toLowerCase()) ||
                  (dados.situacao_produtiva ? { value: dados.situacao_produtiva, label: dados.situacao_produtiva } : null)
                }
                onChange={(opt) => setCampo("situacao_produtiva", opt?.value || "")}
                placeholder="Selecione"
              />
            </div>

            <div><label>Situação reprodutiva</label>
              <Select
                options={reprodutivaOptions}
                value={
                  reprodutivaOptions.find((o) => o.value.toLowerCase() === (dados.situacao_reprodutiva || "").toLowerCase()) ||
                  (dados.situacao_reprodutiva ? { value: dados.situacao_reprodutiva, label: dados.situacao_reprodutiva } : null)
                }
                onChange={(opt) => setCampo("situacao_reprodutiva", opt?.value || "")}
                placeholder="Selecione"
              />
            </div>

            {dados.sexo !== "macho" && (
              <>
                <div><label>Nº Lactações</label>
                  <input value={dados.nLactacoes}
                    onChange={(e) => setCampo("nLactacoes", e.target.value.replace(/\D/g, ""))}
                    style={input()} />
                </div>
                <div><label>Última IA</label>
                  <input value={dados.ultimaIA}
                    onChange={(e) => setCampo("ultimaIA", formatarDataDigitada(e.target.value))}
                    placeholder="dd/mm/aaaa" style={input()} />
                </div>
                <div><label>Último Parto</label>
                  <input value={dados.ultimoParto}
                    onChange={(e) => setCampo("ultimoParto", formatarDataDigitada(e.target.value))}
                    placeholder="dd/mm/aaaa" style={input()} />
                </div>
              </>
            )}

            <div><label>Pai</label><input value={dados.pai} onChange={(e) => setCampo("pai", e.target.value)} style={input()} /></div>
            <div><label>Mãe</label><input value={dados.mae} onChange={(e) => setCampo("mae", e.target.value)} style={input()} /></div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2rem" }}>
            <button onClick={onFechar} style={botaoCancelar}>Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} style={botaoConfirmar}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== estilos modal ===== */
const overlay = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 };
const modal = { background: "#fff", borderRadius: "1rem", width: "820px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Poppins, sans-serif" };
const header = { background: "#1e40af", color: "white", padding: "1rem 1.5rem", fontWeight: "bold", fontSize: "1.1rem", borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem", textAlign: "center" };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "2.0rem", rowGap: "1.2rem" };
const input = (readOnly = false) => ({ width: "100%", padding: "0.7rem 0.9rem", fontSize: "0.95rem", borderRadius: "0.6rem", border: "1px solid #ccc", backgroundColor: readOnly ? "#f3f4f6" : "#fff" });
const botaoCancelar = { background: "#f3f4f6", border: "1px solid #d1d5db", padding: "0.6rem 1.2rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 500 };
const botaoConfirmar = { background: "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.4rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 600 };
