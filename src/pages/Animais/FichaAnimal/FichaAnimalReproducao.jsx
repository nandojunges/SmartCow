// src/pages/Animais/FichaAnimal/FichaAnimalReproducao.jsx
import React, { useMemo, useState, useEffect } from "react";
import html2pdf from "html2pdf.js";

/* ========= Recharts ========= */
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
  ReferenceLine,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";

/* ========= Config API ========= */
const RAW_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API_ROOT = RAW_BASE ? `${RAW_BASE}/api/v1` : "/api/v1";
const API_REPRO = `${API_ROOT}/reproducao`;
const API_ANIM  = `${API_ROOT}/animals`; // derivados apenas

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    Authorization: token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };
}
async function apiGet(url) {
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function apiDelete(url) {
  const r = await fetch(url, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  try { return await r.json(); } catch { return { ok: true }; }
}

async function apiPost(url, payload) {
  const r = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload || {}) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ações: usam as rotas do backend (validações de janela/422 já no PR #6)

/* ========= Datas ========= */
const DAY = 86400000;
const fmtBR = (d) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
function parseAnyDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") return new Date(v);
  const s = String(v).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, a] = s.split("/").map(Number);
    return new Date(a, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [yyyy, mm, dd] = s.slice(0, 10).split("-").map(Number);
    return new Date(yyyy, mm - 1, dd);
  }
  const tryDate = new Date(s);
  return isNaN(tryDate) ? null : tryDate;
}
function brOrNull(v) {
  const d = parseAnyDate(v);
  return d ? fmtBR(d) : null;
}
function toDateBR(str) {
  if (!str || typeof str !== "string" || str.length !== 10) return null;
  const [d, m, a] = str.split("/").map(Number);
  const dt = new Date(a, (m || 1) - 1, d || 1);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
const hojeGlobal = new Date();

/* ========= Heurísticas & Cálculos ========= */
function calcularDELPorCiclo(ciclos, secagens = [], hoje = new Date()) {
  return (ciclos || []).map((c, index) => {
    const dataParto = c.parto?.data;
    if (!dataParto) return { ciclo: index + 1, dias: null };

    const parto = toDateBR(dataParto);
    let secagem = null;

    const proximoPartoData = ciclos[index + 1]?.parto?.data;
    const proximoParto = proximoPartoData ? toDateBR(proximoPartoData) : null;

    for (let s of secagens) {
      if (!s || typeof s !== "string") continue;
      const d = toDateBR(s);
      if (d && d > parto && (!proximoParto || d < proximoParto)) {
        secagem = d; break;
      }
    }
    if (!secagem && proximoParto) { secagem = new Date(proximoParto); secagem.setDate(secagem.getDate() - 60); }
    if (!secagem) secagem = hoje;

    const dias = Math.floor((secagem - parto) / DAY);
    return { ciclo: index + 1, dias: dias >= 0 ? dias : null };
  });
}

/* ========= Normalização a partir de /eventos ========= */
function normalizeFromEventos(items = []) {
  // Ordenar ascendente por data
  const eventos = [...items]
    .map(ev => ({ ...ev, dataISO: String(ev.data || "").slice(0, 10), d: parseAnyDate(ev.data) }))
    .filter(ev => ev.d && Number.isFinite(ev.d.getTime()))
    .sort((a, b) => a.d - b.d);

  // IA
  const ias = eventos.filter(e => e.tipo === "IA").map(e => ({
    data: brOrNull(e.dataISO),
    touro: e.detalhes?.touro_nome || e.detalhes?.touro || "",
    inseminador: e.detalhes?.inseminador || e.detalhes?.tecnico || "",
    diagnostico: undefined, // será inferido pelos DG/parto
  }));

  // Partos
  const partos = eventos.filter(e => e.tipo === "PARTO").map(e => ({
    data: brOrNull(e.dataISO),
    obs: e.detalhes?.obs || e.detalhes?.observacao || "",
  }));

  // Diagnóstico de gestação: parear com IA imediatamente anterior
  const iasAsc = [...ias].map(x => ({ ...x, _d: toDateBR(x.data) })).sort((a, b) => a._d - b._d);
  const diagnosticosGestacao = eventos
    .filter(e => e.tipo === "DIAGNOSTICO")
    .map(e => {
      const dxd = parseAnyDate(e.dataISO);
      let iaRef = null;
      for (let i = iasAsc.length - 1; i >= 0; i--) {
        if (iasAsc[i]._d && iasAsc[i]._d < dxd) { iaRef = iasAsc[i]; break; }
      }
      const res = String(e.resultado || e.detalhes?.resultado || "")
        .toLowerCase()
        .replace("prenhe", "positivo")
        .replace("vazia", "negativo");
      return {
        data: brOrNull(e.dataISO),
        dataIA: iaRef ? iaRef.data : null,
        resultado: res === "positivo" || res === "negativo" ? res : "indeterminado",
      };
    })
    .filter(x => x.data && x.dataIA);

  // Secagens (heurística): TRATAMENTO cujo plano/subtipo contenha 'seca'
  const secagens = eventos
    .filter(e =>
      e.tipo === "SECAGEM" ||
      (e.tipo === "TRATAMENTO" && (() => {
        const dd = e.detalhes || {};
        const s = (dd.plano || dd.subtipo || dd.tipo || "").toString().toLowerCase();
        return s.includes("seca");
      })())
    )
    .map(e => ({
      data: brOrNull(e.dataISO),
      subtipo: e.detalhes?.plano || e.detalhes?.subtipo || "Secagem",
      obs: e.detalhes?.obs || e.detalhes?.observacao || "",
    }));

  // Ocorrências genéricas p/ tabela por ciclo (mostramos além de IA/Parto/Secagem)
  const ocorrencias = eventos
    .filter(e => !["IA", "PARTO"].includes(e.tipo)) // manter TRATAMENTO, PROTOCOLO_ETAPA, DIAGNOSTICO, DECISAO...
    .map(e => ({
      id: e.id,
      data: brOrNull(e.dataISO),
      tipo:
        e.tipo === "PROTOCOLO_ETAPA" ? "Protocolo" :
        e.tipo === "DIAGNOSTICO" ? "Diagnostico" :
        e.tipo === "DECISAO" ? "Decisão" :
        e.tipo === "TRATAMENTO" ? "Tratamento" :
        e.tipo === "PRE_PARTO" ? "Pré-parto" :
        e.tipo === "SECAGEM" ? "Secagem" :
        e.tipo === "PERDA_REPRODUTIVA" ? "Perda reprodutiva" :
        (e.tipo || "Evento"),
      nomeProtocolo: e.detalhes?.origem_protocolo || null,
      obs:
        e.detalhes?.obs || e.detalhes?.observacao ||
        e.detalhes?.acao ||
        e.detalhes?.hormonio ||
        e.detalhes?.descricao || "—",
      aplicacao_id: e.aplicacao_id || e.aplicacaoId || null,
      protocolo_id: e.protocolo_id || e.protocoloId || null,
      _raw: e,
    }));

  return { inseminacoes: ias, partos, secagens, diagnosticosGestacao, ocorrenciasAll: ocorrencias, eventosRaw: eventos };
}

// pinta tipos/cores + tooltip rico (usa detalhes do backend)
function processarEventosParaTimeline(evs){
  return (evs||[]).map(e=>{
    const tipo = e.tipo;
    let cor = '#64748b';
    if (tipo==='IA') cor='#2563eb';
    else if (tipo==='DIAGNOSTICO') cor='#06b6d4';
    else if (tipo==='TRATAMENTO') cor='#f59e0b';
    else if (tipo==='SECAGEM') cor='#8b5cf6';
    else if (tipo==='PARTO') cor='#22c55e';
    else if (tipo==='PROTOCOLO_ETAPA') cor='#7c3aed';
    else if (tipo==='DECISAO') cor='#6b7280';
    const d = e.detalhes || {};
    const hover = {
      data: e.data,
      janela_dg: e.janela_dg || d.janela,
      ia_ref_data: e.ia_ref_data || d.ia_ref_data,
      origem_protocolo: e.origem_protocolo || d.origem_protocolo,
      parent_aplicacao_id: e.parent_aplicacao_id || d.parent_aplicacao_id,
      touro_id: d.touro_id,
      inseminador_id: d.inseminador_id,
      observacao: d.observacao,
      resultado: e.resultado
    };
    return { ...e, _ui:{ cor, label:e.tipo_humano||tipo, hover } };
  });
}

/* ========= Persistência local (edições rápidas) ========= */
const KEY_CICLOS = (numero) => `ciclosEditados:${numero}`;
function getCiclosLS(numero) {
  try { const raw = localStorage.getItem(KEY_CICLOS(numero)); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function setCiclosLS(numero, obj) { localStorage.setItem(KEY_CICLOS(numero), JSON.stringify(obj || {})); }

/* ========= UI helpers ========= */
const COLORS = { green:"#16a34a", orange:"#d97706", red:"#ef4444", blue:"#2563eb", purple:"#7c3aed", gray:"#6b7280", slate:"#1f2937" };

function Card({ title, children, right }) {
  return (
    <div style={card.box}>
      <div style={card.header}><h3 style={card.title}>{title}</h3>{right}</div>
      <div style={card.body}>{children}</div>
    </div>
  );
}
function DonutPct({ label, value = 0 }) {
  const size=108, stroke=14, r=(size-stroke)/2, c=2*Math.PI*r;
  const off=c-(Math.max(0, Math.min(100, value))/100)*c;
  return (
    <div style={donut.box}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={COLORS.purple} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" style={{fontWeight:900,fontSize:18,fill:COLORS.slate}}>
          {Math.round(value)}%
        </text>
      </svg>
      <div style={donut.label}>{label}</div>
    </div>
  );
}

/* ========= Componente principal ========= */
export default function FichaAnimalReproducao({ animal }) {
  const [modoEdicao, setModoEdicao] = useState({});
  const [ciclosEditados, setCiclosEditados] = useState({});
  const [eventoExcluir, setEventoExcluir] = useState(null); // {id, aplicacao_id, mensagem}
  const [atualizar, setAtualizar] = useState(0);

  const [historicoRemoto, setHistoricoRemoto] = useState(null);
  const [ocorrencias, setOcorrencias] = useState([]); // normalizadas a partir dos eventos
  const [animalId, setAnimalId] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [animalDeriv, setAnimalDeriv] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [range, setRange] = useState(() => {
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate()-7);
    const end = new Date(today); end.setDate(end.getDate()+35);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { start: iso(start), end: iso(end) };
  });

  // carregar ciclos editados (local)
  useEffect(() => { setCiclosEditados(getCiclosLS(animal?.numero || "vaca")); }, [animal?.numero]);
  const salvarAlteracoes = async (i) => { setCiclosLS(animal?.numero || "vaca", { ...ciclosEditados }); setModoEdicao((p)=>({ ...p, [i]: false })); };

  async function resolverAnimalId(a) {
    if (a?.id) return a.id;
    if (a?.numero) {
      try {
        const data = await apiGet(`${API_ANIM}?limit=5&numeros=${encodeURIComponent(a.numero)}`);
        const id = data?.items?.[0]?.id || null;
        return id;
      } catch { return null; }
    }
    return null;
  }

  async function carregarTudo() {
    const id = await resolverAnimalId(animal);
    setAnimalId(id);
    if (!id) return;
    await carregarTimeline(id);
    const anim = await apiGet(`${API_ANIM}/${encodeURIComponent(id)}`);
    setAnimalDeriv(anim);

    await carregarCalendario(id);

    // notifica que veio atualização (para outras telas que escutam)
    window.dispatchEvent(new Event("registroReprodutivoAtualizado"));
  }

  useEffect(() => { carregarTudo(); }, [animal?.id, animal?.numero]);
  useEffect(() => {
    const h = () => carregarTudo();
    window.addEventListener("registroReprodutivoAtualizado", h);
    return () => window.removeEventListener("registroReprodutivoAtualizado", h);
  }, [animal?.id, animal?.numero]);

  async function carregarTimeline(id = animalId) {
    if (!id) return;
    const data = await apiGet(`${API_REPRO}/eventos/animal/${encodeURIComponent(id)}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    setEventos(processarEventosParaTimeline(items));
    const norm = normalizeFromEventos(items);
    setHistoricoRemoto({
      inseminacoes: norm.inseminacoes,
      partos: norm.partos,
      secagens: norm.secagens,
      diagnosticosGestacao: norm.diagnosticosGestacao,
    });
    setOcorrencias(norm.ocorrenciasAll);
  }

  async function carregarCalendario(id = animalId) {
    if (!id) return;
    const qs = `start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
    const data = await apiGet(`${API_REPRO}/calendario?${qs}`);
    const itens = Array.isArray(data?.itens) ? data.itens : [];
    const mine = itens.filter(it => !it.animal_id || String(it.animal_id) === String(id));
    setAgenda(normalizarTarefasCalendario(mine));
  }

  useEffect(() => {
    carregarCalendario();
    const h = () => carregarCalendario();
    window.addEventListener('atualizarCalendario', h);
    window.addEventListener('registroReprodutivoAtualizado', h);
    return () => {
      window.removeEventListener('atualizarCalendario', h);
      window.removeEventListener('registroReprodutivoAtualizado', h);
    };
  }, [range.start, range.end, animalId]);

  async function afterMutacao(id) {
    const target = id || animalId;
    await carregarCalendario(target);
    await carregarTimeline(target);
  }

  const TYPE_META = {
    PROTOCOLO_ETAPA: { cor:'#7c3aed', ic:'🧪', rot:'Etapa de Protocolo' },
    TRATAMENTO:      { cor:'#f59e0b', ic:'💊', rot:'Dose de Tratamento' },
    PREV_DG30:       { cor:'#06b6d4', ic:'🔎', rot:'Previsão DG30' },
    PREV_DG60:       { cor:'#06b6d4', ic:'🔎', rot:'Previsão DG60' },
    PRE_PARTO_INICIO:{ cor:'#22c55e', ic:'🌿', rot:'Início Pré-Parto' },
    PARTO_PREVISTO:  { cor:'#22c55e', ic:'👶', rot:'Parto Previsto' },
    SECAGEM:         { cor:'#7e22ce', ic:'🟣', rot:'Secagem' },
    SECAGEM_PREVISTA:{ cor:'#a78bfa', ic:'🟣', rot:'Secagem Prevista' },
  };
  function normalizarTarefasCalendario(itens) {
    return (itens || []).map(raw => {
      const tipo = raw.tipo;
      const meta = TYPE_META[tipo] || { cor:'#64748b', ic:'📌', rot:tipo };
      const tip = {
        data: raw.data,
        tipo,
        protocolo: raw.origem_protocolo || raw.protocolo_id,
        aplicacao: raw.aplicacao_id,
        ref_ia: raw.ref_ia,
        observacao: raw.detalhes?.observacao
      };
      return {
        ...raw,
        _ui: { cor: meta.cor, icone: meta.ic, rotulo: meta.rot, tooltip: tip },
        _cancellable: Boolean(raw.aplicacao_id || raw.id || raw.evento_id)
      };
    }).sort((a,b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  async function cancelarTarefa(t) {
    try {
      if (t.aplicacao_id) {
        await apiDelete(`${API_REPRO}/aplicacao/${t.aplicacao_id}`);
      } else if (t.evento_id || t.id) {
        const idDel = t.evento_id || t.id;
        await apiDelete(`${API_REPRO}/eventos/${idDel}`);
      } else {
        return;
      }
      await afterMutacao(t.animal_id);
    } catch (e) {
      console.error(e);
    }
  }

  async function registrarIA(payload){ const r=await apiPost(`${API_REPRO}/ia`, payload); await afterMutacao(payload?.animal_id); return r; }
  async function registrarDG(payload){ const r=await apiPost(`${API_REPRO}/diagnostico`, payload); await afterMutacao(payload?.animal_id); return r; }
  async function aplicarProtocolo(payload){ const r=await apiPost(`${API_REPRO}/aplicar-protocolo`, payload); await afterMutacao(payload?.animal_id); return r; }
  async function iniciarTratamento(payload){ const r=await apiPost(`${API_REPRO}/tratamento`, payload); await afterMutacao(payload?.animal_id); return r; }
  async function registrarSecagem(payload){ const r=await apiPost(`${API_REPRO}/secagem`, payload); await afterMutacao(payload?.animal_id); return r; }
  async function registrarParto(payload){ const r=await apiPost(`${API_REPRO}/parto`, payload); await afterMutacao(payload?.animal_id); return r; }

  // ---- usa historico remoto (do backend) se disponível; senão o do prop:
  const histMerged = useMemo(() => {
    if (historicoRemoto) return historicoRemoto;
    return animal?.historico || {};
  }, [historicoRemoto, animal]);

  /* ===== Derivações (mantive sua lógica/estética) ===== */
  const ciclos = useMemo(() => {
    const hist = histMerged || {};
    const ia       = [...(hist.inseminacoes || [])].map(i => ({ ...i, tipo: "IA" })).filter(i => i.data && toDateBR(i.data));
    const partos   = [...(hist.partos || [])]       .map(p => ({ ...p, tipo: "Parto" })).filter(p => p.data && toDateBR(p.data));
    const secagens = [...(hist.secagens || [])]     .map(s => ({ ...s, tipo: "Secagem" })).filter(s => s.data && toDateBR(s.data));

    const outras = (ocorrencias || [])
      .filter(o => o?.data && toDateBR(o.data))
      .map(o => ({ id:o.id, data:o.data, tipo:o.tipo, nomeProtocolo:o.nomeProtocolo, obs:o.obs || "—", aplicacao_id:o.aplicacao_id, protocolo_id:o.protocolo_id }));

    const todos = [...ia, ...partos, ...secagens, ...outras].sort((a,b)=>toDateBR(a.data)-toDateBR(b.data));
    const partosOrdenados = todos.filter(e=>e.tipo==="Parto");

    if (partosOrdenados.length === 0) {
      const ultimaIA = [...ia].sort((a,b)=>toDateBR(a.data)-toDateBR(b.data)).slice(-1)[0];
      if (!ultimaIA) return [];
      const ini = toDateBR(ultimaIA.data);
      const eventosCiclo = todos.filter(ev => toDateBR(ev.data) >= ini);
      const ias  = eventosCiclo.filter(ev => ev.tipo === "IA");
      const secs = eventosCiclo.filter(ev => ev.tipo === "Secagem");
      const outros2 = eventosCiclo.filter(ev => !["IA","Secagem","Parto"].includes(ev.tipo));
      const eventos = [...ias, ...outros2, ...secs].sort((a,b)=>toDateBR(a.data)-toDateBR(b.data));
      return [{ ia: ias, parto: null, eventos, secagens: secs }];
    }

    const ciclosSep = [];
    for (let i=0;i<partosOrdenados.length;i++){
      const inicio = toDateBR(partosOrdenados[i].data);
      const prox = partosOrdenados[i+1];
      const fim = prox ? toDateBR(prox.data) : hojeGlobal;

      const eventosCiclo = todos.filter(ev => {
        const d = toDateBR(ev.data);
        return d > inicio && d <= fim;
      });

      const ias  = eventosCiclo.filter(ev=>ev.tipo==="IA");
      const secs = eventosCiclo.filter(ev=>ev.tipo==="Secagem");
      const outros2 = eventosCiclo.filter(ev=>!["IA","Secagem","Parto"].includes(ev.tipo));
      const eventos = [...ias, ...outros2, ...(prox ? [prox] : []), ...secs].sort((a,b)=>toDateBR(a.data)-toDateBR(b.data));
      ciclosSep.push({ ia: ias, parto: prox || null, eventos, secagens: secs });
    }
    return ciclosSep;
  }, [histMerged, ocorrencias, atualizar]);

  const delPorCiclo = useMemo(() => {
    const hist = histMerged || {};
    return calcularDELPorCiclo(ciclos, hist.secagens?.map(s=>s.data) || [], hojeGlobal)
      .map((c,i)=>({ ...c, ciclo:`Ciclo ${i+1}` }))
      .filter(c=>c.dias!==null);
  }, [ciclos, histMerged]);

  const tempoEntrePartos = useMemo(() => {
    return ciclos.map((c,i)=>{
      if (!c.parto || !ciclos[i+1]?.parto) return null;
      const d1 = toDateBR(c.parto.data);
      const d2 = toDateBR(ciclos[i+1].parto.data);
      if (!d1 || !d2) return null;
      const dias = Math.floor((d2 - d1) / DAY);
      return { ciclo:`Ciclo ${i+1}`, meses: parseFloat((dias/30).toFixed(1)) };
    }).filter(Boolean);
  }, [ciclos]);

  const curvaPrenhez = useMemo(() => {
    const hist = histMerged || {};
    return (hist.diagnosticosGestacao || [])
      .filter(d => d.resultado === "positivo" && d.data && d.dataIA && toDateBR(d.data) && toDateBR(d.dataIA))
      .map(d => {
        const ia = toDateBR(d.dataIA);
        const dx = toDateBR(d.data);
        const dias = Math.floor((dx - ia) / DAY);
        return { data:d.data, dias };
      });
  }, [histMerged]);

  const eventosLinha = useMemo(() => {
    const eventos = [];
    ciclos.forEach((ciclo,i)=>{
      const ias = (ciclosEditados[i]?.ia || ciclo.ia || []);
      ias.forEach(ia=>{
        if (ia?.data && toDateBR(ia.data)) {
          eventos.push({ tipo:"IA", data:ia.data, touro:ia.touro, inseminador:ia.inseminador, subtipo:ia.touro || null, obs:ia.obs || "—" });
        }
      });
      if (ciclo.parto?.data && toDateBR(ciclo.parto.data)) eventos.push({ tipo:"Parto", data:ciclo.parto.data, subtipo:"", obs:ciclo.parto.obs || "—" });
      (ciclo.secagens || []).forEach(s=>{
        if (s?.data && toDateBR(s.data)) eventos.push({ tipo:"Secagem", data:s.data, subtipo:s.subtipo || "", obs:s.obs || "—" });
      });
      (ciclo.eventos || []).forEach(e=>{
        if (e?.data && toDateBR(e.data)) {
          const tipo = e.tipo || "Evento";
          eventos.push({ tipo, data:e.data, subtipo:e.nomeProtocolo || "", obs:e.obs || "—", id:e.id, aplicacao_id:e.aplicacao_id, protocolo_id:e.protocolo_id });
        }
      });
    });
    return eventos.sort((a,b)=>toDateBR(a.data)-toDateBR(b.data));
  }, [ciclos, ciclosEditados]);

  // KPIs: IA+ = DG+ pareado OU parto subsequente; IA− = DG− pareado OU retorno de cio (18–25d sem DG+)
  const taxaIA = useMemo(() => {
    let pos = 0, neg = 0;
    const diagnosticos = histMerged?.diagnosticosGestacao || [];
    ciclos.forEach(c => {
      const ordenadas = [...(c.ia || [])].sort((a,b) => toDateBR(a.data) - toDateBR(b.data));
      const partoData = c.parto?.data ? toDateBR(c.parto.data) : null;
      ordenadas.forEach((ia, idx) => {
        const iaDate = toDateBR(ia.data);
        if (!iaDate) return;
        const dx = diagnosticos.find(d => d.dataIA === ia.data);
        if (dx?.resultado === "positivo") { pos++; return; }
        if (dx?.resultado === "negativo") { neg++; return; }
        if (partoData && (!ordenadas[idx+1] || toDateBR(ordenadas[idx+1].data) > partoData)) { pos++; return; }
        const proxIA = ordenadas[idx+1] ? toDateBR(ordenadas[idx+1].data) : null;
        if (proxIA) {
          const diff = Math.floor((proxIA - iaDate) / DAY);
          if (diff >= 18 && diff <= 25) neg++;
        }
      });
    });
    const taxa = (pos + neg) > 0 ? (pos / (pos + neg)) * 100 : 0;
    return { pos, neg, taxa };
  }, [ciclos, histMerged]);

  /* ===== Ações backend ===== */
  async function excluirEventoById(id) {
    await apiDelete(`${API_REPRO}/eventos/${encodeURIComponent(id)}`);
    await afterMutacao();
  }
  async function cancelarAplicacao(aplicacaoId) {
    await apiDelete(`${API_REPRO}/aplicacao/${encodeURIComponent(aplicacaoId)}`);
    // notificar telas relacionadas
    window.dispatchEvent(new Event("protocolosAtivosAtualizados"));
    window.dispatchEvent(new Event("registroReprodutivoAtualizado"));
    window.dispatchEvent(new Event("atualizarCalendario"));
    window.dispatchEvent(new Event("tarefasAtualizadas"));
    await afterMutacao();
  }

  function normalizaTipo(t) {
    const s = String(t || "").toLowerCase();
    if (s.startsWith("diagn")) return "Diagnostico";
    if (s.startsWith("part"))   return "Parto";
    if (s.startsWith("sec"))    return "Secagem";
    if (s.startsWith("trat"))   return "Tratamento";
    if (s.includes("protocolo")) return "Protocolo";
    if (s === "ia" || s.includes("insemin")) return "IA";
    if (s.includes("decis")) return "Decisão";
    return (t || "Evento");
  }

  /* ====== LAYOUT ====== */
  return (
    <div style={ui.page}>
      <div style={ui.topbar}>
        <div>
          <div style={ui.title}>Reprodução — Ficha</div>
          <div style={ui.subtitle}>{animal?.numero ? `Animal ${animal.numero}` : (animal?.brinco || "")}</div>
        </div>
        <button onClick={()=>html2pdf().from(document.getElementById("reproducao-pdf")).save()} style={ui.btnPrimary}>Exportar PDF</button>
      </div>

      <div id="reproducao-pdf" style={ui.grid}>
        <section style={ui.colMain}>
          <Card title="Resumo reprodutivo">
            <FichaAnimalResumoReprodutivo historico={histMerged}/>
            <div style={kpi.row}>
              <DonutPct label="Taxa global de IA" value={taxaIA.taxa || 0}/>
              <MiniStat label="IA positivas" value={taxaIA.pos}/>
              <MiniStat label="IA negativas" value={taxaIA.neg}/>
            </div>
          </Card>

          <Card title="Linha do Tempo Reprodutiva (compacta)">
            <LinhaDoTempoCompacta eventos={eventosLinha}/>
            <LegendTimeline/>
          </Card>

          {/* Calendário — apresentação de tarefas */}
          <section className="mt-6">
            <header style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
              <strong>Calendário (tarefas)</strong>
              <input type="date" value={range.start} onChange={e=>setRange(r=>({...r,start:e.target.value}))}/>
              <span>→</span>
              <input type="date" value={range.end} onChange={e=>setRange(r=>({...r,end:e.target.value}))}/>
              <button onClick={carregarCalendario}>Atualizar</button>
            </header>

            {/* Agrupa por dia */}
            {Object.entries(agenda.reduce((acc,t)=>{
              (acc[t.data]??=[]).push(t); return acc;
            }, {})).map(([dia, itens])=>(
              <div key={dia} style={{marginBottom:12}}>
                <div style={{fontWeight:600, opacity:.8, marginBottom:4}}>{dia}</div>
                {itens.map((t,i)=>(
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'6px 8px', borderRadius:8, border:'1px solid #e5e7eb'
                  }}>
                    <span style={{fontSize:18}}>{t._ui.icone}</span>
                    <span style={{width:10,height:10,borderRadius:999,background:t._ui.cor}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600}}>{t._ui.rotulo}</div>
                      <div style={{fontSize:12,opacity:.8}}>
                        {t._ui.tooltip?.protocolo ? `Protocolo: ${t._ui.tooltip.protocolo} • ` : ''}
                        {t._ui.tooltip?.ref_ia ? `Ref IA: ${t._ui.tooltip.ref_ia} • ` : ''}
                        {t._ui.tooltip?.observacao ? t._ui.tooltip.observacao : ''}
                      </div>
                    </div>
                    {t._cancellable && (
                      <button onClick={()=>cancelarTarefa(t)} style={{fontSize:12}}>
                        Cancelar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>

          <Card title="DEL por Lactação (dias)">
            <GraficoDELporLactacao delPorCiclo={delPorCiclo}/>
          </Card>

          <Card title="Tempo entre Partos (meses)">
            <GraficoTempoEntrePartos tempoEntrePartos={tempoEntrePartos}/>
          </Card>

          <Card title="IA por Ciclo — Resultado e Eficiência">
            <GraficoIAPorCiclo ciclos={ciclos}/>
          </Card>

          <Card title="Eventos por ciclo">
            {ciclos.map((c, i) => {
              const emEdicao = !!(modoEdicao[i]);
              const dadosIA = ciclosEditados[i]?.ia || c.ia || [];
              return (
                <details key={`ciclo-${i}`} style={acc.box} open={i===0}>
                  <summary style={acc.summary}>
                    <span style={acc.sumTitle}>📑 Ciclo {i+1}</span>
                    <span style={acc.sumRight}>
                      {!emEdicao
                        ? <button onClick={()=>setModoEdicao(p=>({ ...p, [i]: true }))} style={btn.edit}>✏️ Editar</button>
                        : <button onClick={()=>salvarAlteracoes(i)} style={btn.save}>💾 Salvar</button>}
                    </span>
                  </summary>
                  <div style={{ overflowX:"auto" }}>
                    <table style={tbl.table}>
                      <thead style={tbl.thead}>
                        <tr><th style={tbl.th}>Data</th><th style={tbl.th}>Evento</th><th style={tbl.th}>Touro / Inseminador</th><th style={tbl.th}>Observações</th><th style={tbl.th}>Ações</th></tr>
                      </thead>
                      <tbody>
                        {(c.eventos || []).map((evento, idx) => (
                          <tr key={`evento-${i}-${idx}`} style={idx%2?tbl.trOdd:undefined}>
                            <td style={tbl.td}>{evento.data || "—"}</td>
                            <td style={tbl.td}>{normalizaTipo(evento.tipo)}</td>
                            <td style={tbl.td}>
                              {evento.tipo==="IA" && emEdicao ? (
                                <>
                                  <input type="text" value={dadosIA[idx]?.touro ?? evento.touro ?? ""} onChange={(e)=>editarCampo(i, idx, "touro", e.target.value)} placeholder="Touro" style={frm.inputHalf}/>
                                  <input type="text" value={dadosIA[idx]?.inseminador ?? evento.inseminador ?? ""} onChange={(e)=>editarCampo(i, idx, "inseminador", e.target.value)} placeholder="Inseminador" style={frm.inputHalf}/>
                                </>
                              ) : evento.tipo==="IA" ? `${evento.touro || "—"} / ${evento.inseminador || "—"}` : (evento.nomeProtocolo || "—")}
                            </td>
                            <td style={tbl.td}>
                              {evento.tipo==="IA" && emEdicao ? (
                                <input type="text" value={dadosIA[idx]?.obs ?? evento.obs ?? ""} onChange={(e)=>editarCampo(i, idx, "obs", e.target.value)} placeholder="Observação" style={frm.inputFull}/>
                              ) : (evento.obs || "—")}
                            </td>
                            <td style={tbl.td}>
                              {evento.id && (
                                <button
                                  onClick={() => {
                                    const msg = evento.aplicacao_id
                                      ? "Deseja cancelar a APLICAÇÃO inteira deste protocolo? (todas as etapas deste animal serão removidas)"
                                      : "Deseja excluir este evento?";
                                    setEventoExcluir({ id: evento.id, aplicacao_id: evento.aplicacao_id || null, mensagem: msg });
                                  }}
                                  title={evento.aplicacao_id ? "Cancelar aplicação do protocolo" : "Excluir evento"}
                                  style={btn.trash}
                                >🗑️</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </Card>
        </section>

        <aside style={ui.colSide}>
          <Card title="Ações rápidas">
            <div style={quick.wrap}>
              <button style={quick.btn}>Registrar IA</button>
              <button style={quick.btn}>Lançar Diagnóstico</button>
              <button style={quick.btn}>Aplicar Protocolo</button>
            </div>
          </Card>
          <Card title="Insights">
            <ul style={stub.ul}>
              <li>Verifique janela IA → DG para otimizar confirmações.</li>
              <li>Secagens próximas? Garanta estoque.</li>
            </ul>
          </Card>
        </aside>
      </div>

      {eventoExcluir && (
        <ModalConfirmarExclusao
          mensagem={eventoExcluir.mensagem}
          onCancelar={() => setEventoExcluir(null)}
          onConfirmar={async () => {
            try {
              if (eventoExcluir.aplicacao_id) {
                await cancelarAplicacao(eventoExcluir.aplicacao_id);
              } else if (eventoExcluir.id) {
                await excluirEventoById(eventoExcluir.id);
              }
              setEventoExcluir(null);
              setAtualizar(a => a + 1);
              await carregarTudo();
            } catch (e) {
              console.error("Falha ao excluir:", e);
              setEventoExcluir(null);
            }
          }}
        />
      )}
    </div>
  );
}

/* ========= Linha do Tempo compacta + legend ========= */
function LinhaDoTempoCompacta({ eventos = [] }) {
  const parsed = useMemo(() => {
    const list = (eventos || [])
      .filter(e => e?.data && toDateBR(e.data))
      .map(e => ({ ...e, d: toDateBR(e.data) }))
      .sort((a,b)=>a.d-b.d);
    if (!list.length) return { list: [], start: null, end: null };
    const s = new Date(list[0].d.getFullYear(), list[0].d.getMonth(), 1);
    const e = new Date(list[list.length - 1].d.getFullYear(), list[list.length - 1].d.getMonth() + 1, 0);
    return { list, start: s, end: e };
  }, [eventos]);

  if (!parsed.list.length) return <div style={{ color:"#6b7280", fontStyle:"italic" }}>Sem eventos reprodutivos para exibir.</div>;

  const { list, start, end } = parsed;
  const span = Math.max(1, end - start);
  const months = [];
  { let cur = new Date(start); while (cur <= end) { months.push(new Date(cur)); cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); } }
  const leftPct = (d) => `${((d - start) / span) * 100}%`;
  const color = (tipo) =>
    tipo==="IA" ? "#3b82f6" :
    tipo==="Parto" ? "#22c55e" :
    tipo==="Diagnostico" ? "#0ea5e9" :
    tipo==="Secagem" ? "#a855f7" :
    tipo==="Tratamento" ? "#f97316" :
    tipo.toLowerCase().includes("protocolo") ? "#9333ea" :
    "#64748b";

  return (
    <div>
      <div style={tl.wrapper}>
        <div style={tl.bar}/>
        {months.map((m,i)=> <div key={i} style={{ ...tl.tick, left: leftPct(new Date(m.getFullYear(), m.getMonth(), 1)) }}/>)}
        <div style={tl.months}>
          {months.map((m,i)=> <div key={i} style={tl.monthLabel}>{m.toLocaleDateString("pt-BR", { month:"short" }).toUpperCase()}</div>)}
        </div>
        {list.map((e,i)=>(
          <div key={i} style={{ ...tl.dot, left: leftPct(e.d), background: color(e.tipo) }} title={[
            `${e.tipo} — ${e.data}`,
            e.touro?`Touro: ${e.touro}`:"",
            e.inseminador?`Inseminador: ${e.inseminador}`:"",
            e.subtipo?`• ${e.subtipo}`:"",
            e.obs && e.obs!=="—"?`Obs: ${e.obs}`:"",
          ].filter(Boolean).join("\n")}/>
        ))}
      </div>
    </div>
  );
}
function LegendTimeline() {
  const items = [
    { c: "#3b82f6", t: "IA" },
    { c: "#0ea5e9", t: "Diagnóstico" },
    { c: "#f97316", t: "Tratamento" },
    { c: "#a855f7", t: "Secagem" },
    { c: "#22c55e", t: "Parto" },
    { c: "#9333ea", t: "Protocolo" },
  ];
  return (
    <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginTop:10 }}>
      {items.map((it,i)=>(
        <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:12 }}>
          <span style={{ width:10, height:10, borderRadius:10, background:it.c }}/> {it.t}
        </span>
      ))}
    </div>
  );
}

/* ========= Resumo (usa historico vindo por prop) ========= */
function FichaAnimalResumoReprodutivo({ historico }) {
  const hoje = new Date();
  const [cardAberto, setCardAberto] = useState(null);
  const hist = historico || {};

  const ciclos = useMemo(() => {
    const ia = [...(hist.inseminacoes || [])].map((i) => ({ ...i, tipo: "IA" })).filter(i => i.data && toDateBR(i.data));
    const partos = [...(hist.partos || [])].map((p) => ({ ...p, tipo: "Parto" })).filter(p => p.data && toDateBR(p.data));
    ia.sort((a, b) => toDateBR(a.data) - toDateBR(b.data));
    partos.sort((a, b) => toDateBR(a.data) - toDateBR(b.data));

    const ciclosSep = [];
    let iParto = 0;
    for (let i = 0; i < ia.length; i++) {
      const dataIA = toDateBR(ia[i].data);
      while (iParto < partos.length && dataIA > toDateBR(partos[iParto].data)) iParto++;
      const cicloIA = [ia[i]];
      let j = i + 1;
      while (j < ia.length && (!partos[iParto] || toDateBR(ia[j].data) < toDateBR(partos[iParto].data))) { cicloIA.push(ia[j]); j++; }
      i = j - 1;
      const parto = partos[iParto] || null;
      ciclosSep.push({ ia: cicloIA, parto });
      if (parto) iParto++;
    }
    return ciclosSep;
  }, [historico]);

  const totalIA = ciclos.reduce((acc, c) => acc + c.ia.length, 0);
  const totalPartos = ciclos.filter((c) => !!c.parto).length;

  const cicloComUltimoParto = [...ciclos].reverse().find((c) => c.parto?.data);
  const dataUltimoParto = cicloComUltimoParto?.parto?.data || null;

  const delAtual = useMemo(() => {
    if (!dataUltimoParto) return "—";
    const partoData = toDateBR(dataUltimoParto);
    const dias = Math.floor((hoje - partoData) / DAY);
    return dias;
  }, [dataUltimoParto]);

  const delPorCiclo = useMemo(() => {
    const base = calcularDELPorCiclo(ciclos, hist.secagens?.map(s=>s.data) || [], hoje);
    return base.filter((c) => c.dias !== null);
  }, [ciclos, historico]);

  const mediaDEL = delPorCiclo.length
    ? Math.round(delPorCiclo.reduce((acc, cur) => acc + cur.dias, 0) / delPorCiclo.length)
    : "—";

  return (
    <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:6 }}>
      <Resumo titulo="Total de IA" valor={totalIA} tooltip="Total de inseminações" />
      <Resumo titulo="Ciclos com Parto" valor={totalPartos} tooltip="Ciclos com pelo menos um parto" />
      <Resumo
        titulo="DEL Atual" valor={delAtual} tooltip="Dias em lactação desde o último parto"
        destaque={typeof delAtual === "number" ? delAtual : null}
        onClick={()=>setCardAberto(cardAberto === "DEL" ? null : "DEL")}
        expandido={cardAberto === "DEL"}
        detalhes={
          dataUltimoParto && typeof delAtual === "number"
            ? (<><div>📅 Último parto: <strong>{dataUltimoParto}</strong></div>
                <div>⏱️ DEL atual: <strong>{delAtual} dias</strong></div>
                <div>🧮 Secagem prevista: <strong>{calcSecagem(dataUltimoParto)}</strong></div></>)
            : <div>Sem informações de parto.</div>
        }
      />
      <Resumo titulo="Média DEL por Lactação" valor={mediaDEL} tooltip="Média de DEL por ciclo" />
    </div>
  );
}
function calcSecagem(dataPartoStr) { const parto = toDateBR(dataPartoStr); const d = new Date(parto); d.setDate(d.getDate() + 245); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; }
function Resumo({ titulo, valor, tooltip, destaque, detalhes, onClick, expandido }) {
  const cor = (() => { if (titulo.includes("DEL") && typeof destaque === "number") { if (destaque < 250) return "#bbf7d0"; if (destaque <= 400) return "#fef08a"; return "#fecaca"; } return "#f8fafc"; })();
  return (
    <div onClick={onClick} title={tooltip} style={{ flex:"1 1 160px", background:cor, borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,.06)", cursor:onClick?"pointer":"default" }}>
      <div style={{ fontSize:18, fontWeight:900, color:"#1f2937" }}>{valor}</div>
      <div style={{ fontSize:12, color:"#444", marginTop:2 }}>{titulo}</div>
      {expandido && detalhes && <div style={{ marginTop:10, fontSize:13, color:"#333", lineHeight:1.4 }}>{detalhes}</div>}
    </div>
  );
}

/* ========= Gráficos ========= */
function GraficoDELporLactacao({ delPorCiclo }) {
  const dados = (delPorCiclo || []).map((item, index) => ({ ciclo: item.ciclo || `Ciclo ${index + 1}`, dias: item.dias ?? 0 }));
  const corPorDEL = (dias) => (dias <= 305 ? "#10b981" : dias <= 400 ? "#facc15" : "#ef4444");
  const mediaDEL = dados.length ? dados.reduce((acc, d) => acc + d.dias, 0) / dados.length : null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, 46 + dados.length * 42)}>
      <BarChart layout="vertical" data={dados} barSize={22} margin={{ top:18, right:32, left:80, bottom:6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" domain={[0, "dataMax + 30"]} tick={{ fontSize:12 }}/>
        <YAxis dataKey="ciclo" type="category" width={76} tick={{ fontSize:12, fontWeight:600 }}/>
        <Tooltip formatter={(v)=>`${v} dias`} labelFormatter={(l)=>`Ciclo: ${l}`}/>
        {mediaDEL !== null && <ReferenceLine x={mediaDEL} stroke="#1e40af" strokeDasharray="3 3" strokeWidth={2}/>}
        <ReferenceLine x={305} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={2}/>
        <ReferenceLine x={400} stroke="#dc2626" strokeDasharray="5 5" strokeWidth={2}/>
        <Bar dataKey="dias" radius={[0,8,8,0]} label={{ position:"right", fill:"#333", fontSize:12, fontWeight:600 }}>
          {dados.map((item, i) => <Cell key={i} fill={corPorDEL(item.dias)}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function GraficoTempoEntrePartos({ tempoEntrePartos }) {
  const dados = (tempoEntrePartos || []).map((item, index) => ({ ciclo: item.ciclo || `Ciclo ${index + 1}`, meses: item.meses ?? 0 }));
  const corPorMeses = (m) => (m < 14 ? "#10b981" : m <= 16 ? "#facc15" : "#ef4444");
  const media = dados.length ? dados.reduce((acc, d) => acc + d.meses, 0) / dados.length : null;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dados} margin={{ top:20, right:24, left:24, bottom:6 }} barSize={24}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
        <XAxis dataKey="ciclo" tick={{ fontSize:12 }}/>
        <YAxis tick={{ fontSize:12 }}/>
        <Tooltip formatter={(v)=>`${v} meses`}/>
        <ReferenceLine y={13.5} stroke="#15803d" strokeDasharray="4 4" strokeWidth={2}/>
        {media !== null && <ReferenceLine y={media} stroke="#60a5fa" strokeDasharray="6 3" strokeWidth={1.5}/>}
        <Bar dataKey="meses" radius={[4,4,0,0]}>
          {dados.map((item, i) => <Cell key={i} fill={corPorMeses(item.meses)}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function GraficoIAPorCiclo({ ciclos }) {
  const dados = (ciclos || []).map((c, i) => {
    const totalIA = c.ia?.length || 0;
    if (totalIA === 0) return { ciclo:`Ciclo ${i+1}`, positivas:0, negativas:0, taxa:0 };

    let positivas=0, negativas=0;
    const partoData = c.parto?.data ? toDateBR(c.parto.data) : null;
    const ordenadas = [...(c.ia || [])].sort((a,b)=>toDateBR(a.data)-toDateBR(b.data));

    let idxUltimaValida=-1;
    if (partoData) for (let j=ordenadas.length-1;j>=0;j--){ const iaDate=toDateBR(ordenadas[j].data); if (iaDate && iaDate < partoData){ idxUltimaValida=j; break; } }

    ordenadas.forEach((ia,idx)=>{ if (ia.diagnostico==="positivo") positivas++; else if (!ia.diagnostico && idx===idxUltimaValida) positivas++; else negativas++; });

    const taxa = (positivas+negativas)>0 ? Math.round((positivas/(positivas+negativas))*100) : 0;
    return { ciclo:`Ciclo ${i+1}`, positivas, negativas, taxa };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={dados} margin={{ top:20, right:28, left:24, bottom:6 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3"/>
        <XAxis dataKey="ciclo" tick={{ fontSize:12 }}/>
        <YAxis yAxisId="esquerda" allowDecimals={false} tick={{ fontSize:12 }}/>
        <YAxis yAxisId="direita" orientation="right" domain={[0,100]} tickFormatter={(v)=>`${v}%`} tick={{ fontSize:12 }}/>
        <Tooltip
          formatter={(value, name) => name==="taxa" ? [`${value}%`, "Taxa de Sucesso"] : name==="positivas" ? [value,"IA Positiva"] : name==="negativas" ? [value,"IA Negativa"] : [value,name]}
          labelFormatter={(label)=>`${label}`}
          contentStyle={{ backgroundColor:"#1e293b", borderRadius:"8px", color:"#fff", border:"none" }}
        />
        <Bar yAxisId="esquerda" dataKey="negativas" stackId="ia" fill="#ef4444" radius={[4,4,0,0]}/>
        <Bar yAxisId="esquerda" dataKey="positivas" stackId="ia" fill="#10b981" radius={[4,4,0,0]}/>
        <Line yAxisId="direita" type="monotone" dataKey="taxa" stroke="#3b82f6" strokeWidth={2} dot={{ r:4 }}/>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ========= Modal ========= */
function ModalConfirmarExclusao({ mensagem = "Deseja excluir?", onConfirmar, onCancelar }) {
  useEffect(() => { const esc = (e) => e.key === "Escape" && onCancelar?.(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onCancelar]);
  return (
    <div style={mx_overlay}>
      <div style={mx_modal}>
        <h3 style={{ marginBottom:12, fontSize:"1.05rem" }}>❗ Confirmar</h3>
        <p style={{ marginBottom:16 }}>{mensagem}</p>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={onCancelar} style={btn.gray}>Cancelar</button>
          <button onClick={onConfirmar} style={btn.red}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
function MiniStat({ label, value }) { return (<div style={mini.box}><div style={mini.value}>{value}</div><div style={mini.label}>{label}</div></div>); }

/* ========= estilos ========= */
const ui = { page:{ padding:"10px 14px", background:"#f6f7fb", fontFamily:"Poppins, system-ui, sans-serif" }, topbar:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }, title:{ fontSize:18, fontWeight:900, color:"#111827" }, subtitle:{ fontSize:12, color:"#6b7280", marginTop:2 }, grid:{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 320px", gap:12, alignItems:"start" }, colMain:{ display:"flex", flexDirection:"column", gap:12 }, colSide:{ display:"flex", flexDirection:"column", gap:12 }, btnPrimary:{ background:"#1e40af", color:"#fff", border:0, padding:"8px 12px", borderRadius:8, cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,.15)" } };
const card = { box:{ background:"#fff", borderRadius:8, boxShadow:"0 1px 4px rgba(0,0,0,.06)" }, header:{ padding:"8px 10px", borderBottom:"1px solid #eef2f7", display:"flex", alignItems:"center", justifyContent:"space-between" }, title:{ margin:0, fontSize:14, fontWeight:800, letterSpacing:.2, color:"#111827" }, body:{ padding:10 } };
const donut = { box:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:10, display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:120 }, label:{ fontSize:12, color:"#6b7280" } };
const kpi = { row:{ display:"flex", gap:10, flexWrap:"wrap", marginTop:8 } };
const mini = { box:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:10, minWidth:120 }, value:{ fontSize:18, fontWeight:900, color:"#111827" }, label:{ fontSize:12, color:"#6b7280" } };
const acc = { box:{ border:"1px solid #e5e7eb", borderRadius:10, marginBottom:10, background:"#fafafa" }, summary:{ listStyle:"none", cursor:"pointer", padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #e5e7eb", userSelect:"none" }, sumTitle:{ fontWeight:800, color:"#1e40af" }, sumRight:{ display:"flex", gap:8 } };
const tbl = { table:{ width:"100%", borderCollapse:"separate", borderSpacing:0, fontSize:13 }, thead:{ position:"sticky", top:0, background:"#eef2ff", zIndex:1 }, th:{ textAlign:"left", padding:8, borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" }, td:{ padding:8, borderBottom:"1px solid #eee", whiteSpace:"nowrap" }, trOdd:{ background:"#fcfcfc" } };
const frm = { inputHalf:{ width:"45%", marginRight:8, padding:"6px 8px", border:"1px solid #e5e7eb", borderRadius:6 }, inputFull:{ width:"100%", padding:"6px 8px", border:"1px solid #e5e7eb", borderRadius:6 } };
const quick = { wrap:{ display:"flex", flexWrap:"wrap", gap:8 }, btn:{ padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", fontWeight:700, cursor:"pointer" } };
const stub = { ul:{ margin:0, paddingLeft:18, fontSize:13, color:"#374151" } };
const btn = { gray:{ background:"#f3f4f6", border:"1px solid #d1d5db", padding:"8px 14px", borderRadius:8, cursor:"pointer" }, red:{ background:"#ef4444", color:"#fff", border:"1px solid #dc2626", padding:"8px 14px", borderRadius:8, cursor:"pointer" }, edit:{ background:"#dbeafe", border:"1px solid #3b82f6", padding:"6px 10px", borderRadius:6, fontSize:12, cursor:"pointer", color:"#1d4ed8" }, save:{ background:"#dcfce7", border:"1px solid #22c55e", padding:"6px 10px", borderRadius:6, fontSize:12, cursor:"pointer", color:"#166534" }, trash:{ background:"none", border:"none", cursor:"pointer", fontSize:16 } };
const mx_overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
const mx_modal = { background:"#fff", borderRadius:12, padding:16, width:"92%", maxWidth:480, boxShadow:"0 10px 24px rgba(0,0,0,.25)" };
const tl = { wrapper:{ position:"relative", height:92, paddingTop:26 }, bar:{ position:"absolute", left:0, right:0, top:44, height:10, borderRadius:999, background:"linear-gradient(90deg,#f59e0b,#3b82f6,#22c55e)" }, tick:{ position:"absolute", top:34, width:1, height:28, background:"#e5e7eb" }, months:{ position:"absolute", top:0, left:0, right:0, display:"grid", gridTemplateColumns:"repeat(12, 1fr)", gap:0, padding:"0 2px" }, monthLabel:{ fontSize:11, color:"#6b7280", textAlign:"center" }, dot:{ position:"absolute", top:39, width:18, height:18, borderRadius:999, border:"3px solid #fff", boxShadow:"0 1px 3px rgba(0,0,0,.2)", transform:"translateX(-50%)" } };