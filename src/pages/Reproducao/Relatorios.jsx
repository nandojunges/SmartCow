// src/pages/Reproducao/Relatorios.jsx
// -----------------------------------------------------------------------------
// Reprodução — Relatórios (ranking compacto + detalhamento em modal + séries)
// - Pareia IA com 1º DG entre 28–60 dias
// - Barras/SVG sem libs
// - DEMO completo (FORCE_DEMO=true) — troque para false para usar backend
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import api from "../../api";

/* =============================== DEMO switch =============================== */
const FORCE_DEMO = true; // <<< quando conectar, coloque false

/* =============================== datas/util =============================== */
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso, n) => {
  const [y, m, d] = (iso || todayISO()).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
const mkISO = (off) => addDaysISO(todayISO(), off);
const monthKey = (iso) => iso.slice(0, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (ok, tot) => (tot > 0 ? Math.round((ok * 100) / tot) : 0);

/* ============================ DEMO: eventos ricos ========================== */
// 8 meses de IAs + DGs, 10 touros, 6 inseminadores, 70 animais
function genDemoEvents() {
  const touros = [
    { id: "T001", nome: "Alta Legend 456", base: 68 },
    { id: "T002", nome: "Supreme 101",    base: 67 },
    { id: "T003", nome: "Kingboy 909",    base: 61 },
    { id: "T004", nome: "Denver 305",     base: 57 },
    { id: "T005", nome: "Doorman 21",     base: 50 },
    { id: "T006", nome: "Mogul 777",      base: 35 },
    { id: "T007", nome: "Defiant 990",    base: 63 },
    { id: "T008", nome: "Tahoe 321",      base: 54 },
    { id: "T009", nome: "Goldwyn 888",    base: 47 },
    { id: "T010", nome: "Atomic 404",     base: 52 },
  ];
  const insems = [
    { id: "I001", nome: "Maria", adj: +6 },
    { id: "I002", nome: "João",  adj: -8 },
    { id: "I003", nome: "Ana",   adj: -15 },
    { id: "I004", nome: "Pedro", adj: +12 },
    { id: "I005", nome: "Lucas", adj: +3 },
    { id: "I006", nome: "Sara",  adj: -3 },
  ];
  const animals = Array.from({ length: 70 }, (_, i) => `A${String(i + 1).padStart(3, "0")}`);

  const rnd = (seed) => {
    let x = seed % 2147483647;
    return () => (x = (x * 48271) % 2147483647) / 2147483647;
  };
  const rand = rnd(123456);

  const events = [];
  let seq = 1;

  // 8 meses, 55–85 IAs/mês
  for (let mOff = 1; mOff <= 8; mOff++) {
    const baseDate = mkISO(-30 * mOff - 4);
    const qtd = 55 + Math.floor(rand() * 31); // 55..86
    for (let k = 0; k < qtd; k++) {
      const animal_id = animals[Math.floor(rand() * animals.length)];
      const t = touros[Math.floor(rand() * touros.length)];
      const ins = insems[Math.floor(rand() * insems.length)];

      const dataIA = addDaysISO(baseDate, Math.floor(rand() * 25));
      const offDG = 28 + Math.floor(rand() * 33); // 28..60
      const dataDG = addDaysISO(dataIA, offDG);

      // chance = base do touro + ajuste do inseminador + ruído leve
      const chance = clamp(t.base + ins.adj + Math.floor(rand() * 11) - 5, 20, 90);
      const resultado = rand() * 100 < chance ? "prenhe" : "vazia";

      events.push({
        id: `e${seq++}`,
        animal_id, data: dataIA, tipo: "IA",
        detalhes: {
          touro_id: t.id, touro_nome: t.nome,
          inseminador_id: ins.id, inseminador_nome: ins.nome,
        },
      });
      events.push({
        id: `d${seq++}`,
        animal_id, data: dataDG, tipo: "DIAGNOSTICO", resultado,
      });
    }
  }
  events.sort((a, b) => a.data.localeCompare(b.data));
  return events;
}

/* ============================== API (ou DEMO) ============================== */
const filterByRange = (items, ini, fim) =>
  items.filter(
    (e) => e.data >= ini && e.data <= fim && (e.tipo === "IA" || e.tipo === "DIAGNOSTICO")
  );

async function fetchEventosIAeDG(dtIni, dtFim) {
  if (FORCE_DEMO) {
    return { items: filterByRange(genDemoEvents(), dtIni, dtFim), demo: true };
  }
  try {
    const { data } = await api.get("/api/v1/reproducao/eventos", { params: { limit: 10000 } });
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    const filtered = filterByRange(items, dtIni, dtFim);
    if (filtered.length) return { items: filtered, demo: false };
  } catch {}
  return { items: filterByRange(genDemoEvents(), dtIni, dtFim), demo: true };
}

/* ========================== pareamento IA → DG 28–60 ======================== */
function relateIAtoDG(events) {
  const ias = events.filter((e) => e.tipo === "IA");
  const dgs = events.filter((e) => e.tipo === "DIAGNOSTICO");
  const byAnimal = dgs.reduce((m, e) => {
    (m[e.animal_id] ||= []).push(e);
    return m;
  }, {});
  Object.values(byAnimal).forEach((arr) => arr.sort((a, b) => a.data.localeCompare(b.data)));

  const pairs = [];
  for (const ia of ias) {
    const ini = addDaysISO(ia.data, 28);
    const fim = addDaysISO(ia.data, 60);
    const dg = (byAnimal[ia.animal_id] || []).find((d) => d.data >= ini && d.data <= fim);
    if (dg) pairs.push({ ia, dg });
  }
  return pairs;
}

/* ========================== agregadores / séries =========================== */
function rankBy(pairs, kind /* 'touro'|'inseminador' */, onlyActive90d, topN, minN) {
  const map = {};
  const now = todayISO();
  for (const { ia, dg } of pairs) {
    const det = ia?.detalhes || {};
    const id = kind === "touro" ? det.touro_id : det.inseminador_id;
    const nome = kind === "touro" ? det.touro_nome : det.inseminador_nome;
    if (!id || !nome) continue;
    if (onlyActive90d && addDaysISO(ia.data, 90) < now) continue; // inativo
    const r = (map[id] ||= { id, nome, total: 0, prenhe: 0, meses: {} });
    r.total += 1;
    if (dg.resultado === "prenhe") r.prenhe += 1;
    const mk = monthKey(ia.data);
    const m = (r.meses[mk] ||= { ia: 0, prenhe: 0 });
    m.ia += 1;
    if (dg.resultado === "prenhe") m.prenhe += 1;
  }
  let arr = Object.values(map);
  if (minN) arr = arr.filter((r) => r.total >= minN);
  arr.sort((a, b) => pct(b.prenhe, b.total) - pct(a.prenhe, a.total));
  if (topN) arr = arr.slice(0, topN);
  return arr;
}

function monthSeries(pairs) {
  const map = {};
  for (const { ia, dg } of pairs) {
    const mk = monthKey(ia.data);
    const r = (map[mk] ||= { mes: mk, ia: 0, prenhe: 0, vazia: 0 });
    r.ia += 1;
    if (dg.resultado === "prenhe") r.prenhe += 1;
    else r.vazia += 1;
  }
  return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
}

function kpisBasicos(pairs) {
  const totalIAs = pairs.length;
  const prenhe = pairs.filter((p) => p.dg.resultado === "prenhe").length;
  const taxaConcepcao = pct(prenhe, totalIAs);

  // proxies simples para demo
  const abortos = Math.round(0.09 * prenhe); // 9% de abortos sobre prenhes
  const perda30 = Math.round(0.14 * prenhe);
  const perda60 = Math.round(0.05 * prenhe);
  const metrite = 6;
  const endometrite = 0;

  // taxa de serviço (proxy) = IA por 100 vacas ativas/mês (usa média de IA/mês)
  const ms = monthSeries(pairs);
  const mediaIA = ms.length ? Math.round(ms.reduce((s, m) => s + m.ia, 0) / ms.length) : 0;
  const pop = 120; // você pode substituir por # de vacas elegíveis/lactantes do backend
  const taxaServico = pct(mediaIA, pop);

  return {
    totalIAs,
    prenhe,
    taxaConcepcao,
    abortos,
    perda30,
    perda60,
    metrite,
    endometrite,
    taxaServico,
    popProxy: pop,
  };
}

/* ================================ UI bits ================================= */
// cartão KPI
function Kpi({ title, value, hint }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500 flex items-center gap-1">
        <span>{title}</span>
        {hint && <span title={hint} className="text-[10px] text-gray-400">proxy</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// coluna “ranking” (um bloco único, muitas colunas)
function ColumnRanking({ title, items, onClickItem, onClickVerTodos }) {
  // itens: {id, nome, total, prenhe}
  const maxPct = Math.max(1, ...items.map((r) => pct(r.prenhe, r.total)));
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-[#1F3FB6]">{title}</div>
        <button className="text-xs underline text-[#1F3FB6]" onClick={onClickVerTodos}>
          Ver todos ▸
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {items.map((r) => {
          const p = pct(r.prenhe, r.total);
          const h = Math.round((p * 100) / maxPct); // normaliza ao maior
          const color =
            p >= 60 ? "#065f46" : p >= 45 ? "#92400e" : "#991b1b"; // verde / âmbar / vermelho
        return (
            <div
              key={r.id}
              onClick={() => onClickItem?.(r)}
              className="rounded-lg border border-gray-200 p-2 cursor-pointer hover:shadow-sm"
              title={`${r.nome} — ${p}% (${r.prenhe}/${r.total})`}
            >
              <div className="h-28 flex items-end justify-center">
                <div
                  style={{
                    width: 28,
                    height: `${h}%`,
                    background: color,
                    borderRadius: 6,
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-center font-semibold line-clamp-1">{r.nome}</div>
              <div className="text-[11px] text-center text-gray-500">n={r.total}</div>
              <div className="text-center font-bold" style={{ color }}>{p}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// mini donut para amostra rápida (usado nos chips da visão geral anterior)
function Donut({ value, size = 44, stroke = 6, color = "#065f46" }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - clamp(value, 0, 100) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${C} ${C}`}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#111827"
      >
        {value}%
      </text>
    </svg>
  );
}

// gráfico combinado simples (barras IA + linha %conceb) — usa SVG puro
function ComboMensal({ serie }) {
  // serie: [{mes, ia, prenhe}]
  const h = 160, pad = 28;
  const maxIA = Math.max(1, ...serie.map((m) => m.ia));
  const xs = (i) => pad + (i * (400 - pad * 2)) / Math.max(1, serie.length - 1);
  const yh = (v) => h - pad - (v * (h - pad * 2)) / maxIA;

  return (
    <svg width="100%" height={h} viewBox={`0 0 400 ${h}`}>
      {/* grade */}
      <line x1="0" y1={h - pad} x2="400" y2={h - pad} stroke="#e5e7eb" />
      {/* barras IA */}
      {serie.map((m, i) => {
        const x = xs(i) - 10;
        const y = yh(m.ia);
        return <rect key={`b${i}`} x={x} y={y} width="20" height={h - pad - y} fill="#1F3FB6" rx="3" />;
      })}
      {/* linha % concepção (sobre IAs pareadas) */}
      {serie.map((m, i) => {
        const rate = pct(m.prenhe, m.ia) / 100;
        const x = xs(i);
        const y = pad + (1 - rate) * (h - pad * 2);
        return <circle key={`c${i}`} cx={x} cy={y} r="3" fill="#065f46" />;
      })}
      {serie.slice(1).map((m, i) => {
        const r1 = pct(serie[i].prenhe, serie[i].ia) / 100;
        const r2 = pct(m.prenhe, m.ia) / 100;
        const x1 = xs(i), x2 = xs(i + 1);
        const y1 = pad + (1 - r1) * (h - pad * 2);
        const y2 = pad + (1 - r2) * (h - pad * 2);
        return <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#065f46" strokeWidth="2" />;
      })}
      {/* labels */}
      {serie.map((m, i) => (
        <text key={`t${i}`} x={xs(i)} y={h - 6} textAnchor="middle" fontSize="9" fill="#6b7280">
          {m.mes}
        </text>
      ))}
    </svg>
  );
}

// modal genérico
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
      }}
    >
      <div style={{ background: "#fff", width: "min(980px,96vw)", borderRadius: 14, overflow: "hidden" }}>
        <div className="flex items-center justify-between" style={{ background: "#1F3FB6", color: "#fff", padding: "10px 14px" }}>
          <div className="font-bold">{title}</div>
          <button className="text-white" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

/* =============================== componente =============================== */
export default function Relatorios() {
  const [periodo, setPeriodo] = useState({ ini: addDaysISO(todayISO(), -240), fim: todayISO() });
  const [onlyActive, setOnlyActive] = useState(true);
  const [topN, setTopN] = useState(6);
  const [minN, setMinN] = useState(4);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);

  // modal (detalhes por Touro ou Inseminador)
  const [modal, setModal] = useState({ open: false, kind: "touro", focusId: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { items, demo } = await fetchEventosIAeDG(periodo.ini, periodo.fim);
      if (alive) {
        setEvents(items);
        setDemo(demo);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [periodo]);

  const pairs = useMemo(() => relateIAtoDG(events), [events]);

  const serieGeral = useMemo(() => monthSeries(pairs), [pairs]);
  const kpis = useMemo(() => kpisBasicos(pairs), [pairs]);

  const rankTouros = useMemo(
    () => rankBy(pairs, "touro", onlyActive, topN, minN),
    [pairs, onlyActive, topN, minN]
  );
  const rankIns = useMemo(
    () => rankBy(pairs, "inseminador", onlyActive, topN, minN),
    [pairs, onlyActive, topN, minN]
  );

  // dados para modal
  const allTouros = useMemo(() => rankBy(pairs, "touro", onlyActive, 0, 0), [pairs, onlyActive]);
  const allIns = useMemo(() => rankBy(pairs, "inseminador", onlyActive, 0, 0), [pairs, onlyActive]);

  const openModal = (kind, focusId = null) => setModal({ open: true, kind, focusId });
  const closeModal = () => setModal({ open: false, kind: "touro", focusId: null });

  const listForModal = modal.kind === "touro" ? allTouros : allIns;

  const selected = useMemo(() => {
    if (!modal.focusId) return listForModal[0];
    return listForModal.find((x) => x.id === modal.focusId) || listForModal[0];
  }, [modal.focusId, listForModal]);

  const serieSelecionado = useMemo(() => {
    if (!selected) return [];
    const arr = Object.entries(selected.meses).map(([mes, obj]) => ({
      mes,
      ia: obj.ia,
      prenhe: obj.prenhe,
    }));
    return arr.sort((a, b) => a.mes.localeCompare(b.mes));
  }, [selected]);

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-3 md:px-5">

        {/* filtros topo */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label>Início</label>
            <input type="date" className="border rounded px-2 py-1"
                   value={periodo.ini}
                   onChange={(e) => setPeriodo((p) => ({ ...p, ini: e.target.value }))}/>
          </div>
          <div>
            <label>Fim</label>
            <input type="date" className="border rounded px-2 py-1"
                   value={periodo.fim}
                   onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}/>
          </div>

          <div className="flex items-center gap-2">
            <input id="act" type="checkbox" checked={onlyActive} onChange={(e)=>setOnlyActive(e.target.checked)}/>
            <label htmlFor="act" className="text-sm">Apenas ativos (&lt;90d)</label>
          </div>

          <div>
            <label>Top N</label>
            <input type="number" className="border rounded px-2 py-1 w-16" value={topN}
                   onChange={(e)=>setTopN(Math.max(0, parseInt(e.target.value||"0")))} />
          </div>
          <div>
            <label>n mín.</label>
            <input type="number" className="border rounded px-2 py-1 w-16" value={minN}
                   onChange={(e)=>setMinN(Math.max(0, parseInt(e.target.value||"0")))} />
          </div>

          {loading && <div className="text-gray-600">Carregando…</div>}
          {!loading && demo && (
            <div className="ml-auto text-xs px-2 py-1 rounded border border-sky-300 bg-sky-50 text-sky-900">
              Modo demonstração (sem dados do backend)
            </div>
          )}
        </div>

        {/* KPIs principais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Kpi title="Taxa de serviço" value={`${kpis.taxaServico}%`} hint="proxy" />
          <Kpi title="Taxa de concepção" value={`${kpis.taxaConcepcao}%`} />
          <Kpi title="Abortos (sobre prenhes)" value={`${kpis.abortos}`} />
          <Kpi title="Perda até 30d (prenhes)" value={`${kpis.perda30}%`} />
          <Kpi title="Perda até 60d (prenhes)" value={`${kpis.perda60}%`} />
          <Kpi title="Retenção de placenta" value={`5`} />
          <Kpi title="Metrite" value={`${kpis.metrite}`} />
          <Kpi title="Endometrite" value={`${kpis.endometrite}`} />
        </div>

        {/* Ranking único — Touros */}
        <ColumnRanking
          title="Ranking — Touros (clique para detalhes)"
          items={rankTouros}
          onClickItem={(r)=>openModal("touro", r.id)}
          onClickVerTodos={()=>openModal("touro")}
        />

        {/* Ranking único — Inseminadores */}
        <ColumnRanking
          title="Ranking — Inseminadores (clique para detalhes)"
          items={rankIns}
          onClickItem={(r)=>openModal("inseminador", r.id)}
          onClickVerTodos={()=>openModal("inseminador")}
        />

        {/* Série mensal geral */}
        <div className="mb-2 font-bold text-[#1F3FB6]">Evolução mensal — IA × % concepção</div>
        {serieGeral.length === 0 ? (
          <div className="text-gray-600">Sem dados no período.</div>
        ) : (
          <div className="rounded-lg border border-gray-200 p-2">
            <ComboMensal serie={serieGeral} />
          </div>
        )}

        {/* Rodapé de contadores brutos */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500">IAs pareadas (28–60d)</div>
            <div className="text-2xl font-bold">{kpis.totalIAs}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Prenhe</div>
            <div className="text-2xl font-bold">{kpis.prenhe}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Animais com IA (proxy população)</div>
            <div className="text-2xl font-bold">{kpis.totalIAs}</div>
          </div>
        </div>
      </div>

      {/* ===== MODAL detalhado (Touro / Inseminador) ===== */}
      <Modal
        open={modal.open}
        title={modal.kind === "touro" ? "Detalhes — Touros" : "Detalhes — Inseminadores"}
        onClose={closeModal}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* lista/“tabela” simples */}
          <div className="md:col-span-1 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-2 py-2 font-semibold bg-gray-50 text-gray-700 text-sm">
              {modal.kind === "touro" ? "Touros" : "Inseminadores"}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {listForModal.map((r) => {
                const p = pct(r.prenhe, r.total);
                const active = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setModal((m) => ({ ...m, focusId: r.id }))}
                    className="w-full text-left px-2 py-2 border-b border-gray-100 hover:bg-[#f6f9ff]"
                    style={{ background: active ? "#eef5ff" : "#fff" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm mr-2 line-clamp-1">{r.nome}</div>
                      <div className="text-sm font-bold"
                        style={{ color: p >= 60 ? "#065f46" : p >= 45 ? "#92400e" : "#991b1b" }}>
                        {p}%
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500">n={r.total} • {r.prenhe} prenhe</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* detalhe do selecionado */}
          <div className="md:col-span-2 rounded-lg border border-gray-200 p-3">
            {selected ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <Donut
                    value={pct(selected.prenhe, selected.total)}
                    size={64}
                    color={
                      pct(selected.prenhe, selected.total) >= 60
                        ? "#065f46"
                        : pct(selected.prenhe, selected.total) >= 45
                        ? "#92400e"
                        : "#991b1b"
                    }
                  />
                  <div>
                    <div className="text-lg font-bold">{selected.nome}</div>
                    <div className="text-sm text-gray-600">
                      {selected.prenhe}/{selected.total} prenhe • {pct(selected.prenhe, selected.total)}%
                    </div>
                  </div>
                </div>
                {serieSelecionado.length === 0 ? (
                  <div className="text-gray-600">Sem série mensal.</div>
                ) : (
                  <>
                    <div className="text-sm text-gray-600 mb-1">IA × % concepção — por mês</div>
                    <ComboMensal serie={serieSelecionado} />
                  </>
                )}
              </>
            ) : (
              <div className="text-gray-600">Selecione um item ao lado.</div>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}
