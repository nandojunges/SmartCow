import React, { useMemo, useState } from "react";

/* ===== helpers ===== */
const todayBR = () =>
  new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const compact = (n) => (typeof n === "number" ? (n >= 1e6 ? (n/1e6).toFixed(1)+"M" : n >= 1e3 ? (n/1e3).toFixed(1)+"K" : String(n)) : n);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const COLORS = {
  green: "#16a34a",
  orange: "#d97706",
  red: "#ef4444",
  blue: "#2563eb",
  amber: "#ca8a04",
  gray: "#6b7280",
  neutral: "#111827",
};

/* ===== Página ===== */
export default function Inicio() {
  // dados fictícios só para layout
  const [kpis] = useState({ lactacao: 124, pev: 18, negativas: 9, preParto: 12, carencias: 3 });
  const [execView] = useState({
    leiteHoje: 184200,
    mediaMes: 178000,
    variacao: +3.5,
    spark: [160,170,155,165,172,178,182,176,186,184,190,184],
  });
  const [repro] = useState({ taxaIA: 62, taxaDG: 41, ipp: 408, prenhezPct: 31 });
  const [tarefas] = useState([
    { tag: "Hoje",    txt: "Coletar amostras CMT — Lote Lactação 1" },
    { tag: "Alerta",  txt: "Aplicar PGF2α (IATF) — Lote 2" },
    { tag: "DG",      txt: "Diagnóstico de gestação — 18 animais" },
    { tag: "Estoque", txt: "Selo intravaginal próximo do mínimo" },
  ]);

  const dataLegivel = useMemo(() => todayBR(), []);
  const totalAlertas = useMemo(
    () => tarefas.filter(t => t.tag !== "Hoje").length + (kpis.carencias>0?1:0),
    [tarefas, kpis]
  );

  return (
    <div style={ui.page}>
      {/* status topo */}
      <div style={{
        ...banner.box,
        background: totalAlertas ? "#fff7ed" : "#f0fdf4",
        borderColor: totalAlertas ? "#fdba74" : "#86efac"
      }}>
        <span style={{ ...banner.dot, background: totalAlertas ? COLORS.orange : COLORS.green }} />
        <span style={banner.text}>
          {totalAlertas ? `${totalAlertas} item(ns) exigem atenção hoje` : "Tudo em conformidade"}
        </span>
        <span style={banner.right}>{dataLegivel}</span>
      </div>

      {/* KPIs + busca */}
      <div style={ui.top}>
        <div style={ui.kpiChipsWrap}>
          <KpiChip color="#16a34a" icon={<IconCowOutline/>}  label="Lactação"  value={kpis.lactacao}/>
          <KpiChip color="#d97706" icon={<IconTubeOutline/>} label="PEV"       value={kpis.pev}/>
          <KpiChip color="#ef4444" icon={<IconXOutline/>}    label="Negativas" value={kpis.negativas}/>
          <KpiChip color="#2563eb" icon={<IconPregOutline/>} label="Pré-parto" value={kpis.preParto}/>
          <KpiChip color="#ca8a04" icon={<IconWarnOutline/>} label="Carências" value={kpis.carencias}/>
        </div>

        <form style={ui.search} onSubmit={(e)=>e.preventDefault()}>
          <IconSearch/>
          <input placeholder="Buscar animal, tarefa, lote..." style={ui.searchInput}/>
        </form>
      </div>

      {/* grid principal */}
      <div style={ui.grid}>
        <section style={ui.colMain}>
          {/* tarefas do dia (igual ao print) */}
          <div style={tasks.card}>
            <div style={tasks.header}>
              <h3 style={tasks.title}><IconList/> Tarefas do Dia</h3>
            </div>
            <div style={tasks.body}>
              {tarefas.map((t,i)=>(
                <div key={i} style={tasks.item}>
                  <span style={{...tasks.badge, ...badgeColor(t.tag)}}>{t.tag}</span>
                  <span>{t.txt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* visão rápida */}
          <Card title={<><IconBolt/> Visão rápida</>}>
            <div style={exec.row}>
              <ExecCard
                label="Leite de hoje"
                value={`${compact(execView.leiteHoje)} L`}
                delta={execView.variacao}
                spark={execView.spark}
              />
              <DonutPct label="% Prenhez" value={repro.prenhezPct}/>
              <SmallKpi label="Média do mês" value={`${compact(execView.mediaMes)} L`} trend="up"/>
            </div>
          </Card>

          {/* reprodução — gauges “velocímetro” */}
          <Card title={<><IconGauge/> Reprodução — indicadores</>}>
            <div style={gauge.row}>
              <SpeedGauge label="Taxa de IA" value={repro.taxaIA} min={0} max={100} good="right"/>
              <SpeedGauge label="Taxa de DG+" value={repro.taxaDG} min={0} max={100} good="right"/>
              <SpeedGauge label="Intervalo Parto-Parto (dias)" value={repro.ipp} min={350} max={500} good="left"/>
            </div>
          </Card>

          <Card title={<><IconRocket/> Atalhos rápidos</>}>
            <div style={short.wrap}>
              {["Animais","Reprodução","Leite","Estoque","Financeiro","Calendário"].map(b=>(
                <button key={b} style={short.btn}>{b}</button>
              ))}
            </div>
          </Card>
        </section>

        <aside style={ui.colSide}>
          <Card title={<><IconBox/> Estoque crítico</>}>
            <ul style={stub.ul}>
              <li>Oxitetraciclina — <b>2</b> frascos</li>
              <li>PGF2α — <b>1</b> frasco</li>
              <li>Selo intravaginal — <b>3</b> un.</li>
            </ul>
          </Card>
          <Card title={<><IconIdea/> Insights</>}>
            <ul style={stub.ul}>
              <li>DEL médio ↑ no Lote 3 — revisar transição.</li>
              <li>Negativas ↑ — checar janela IA→DG.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ===== visuais ===== */
function KpiChip({ icon, label, value, color }) {
  return (
    <div style={{...chip.box, borderLeft:`3px solid ${color}`}}>
      <div style={chip.left}>
        <div style={chip.iconWrap}>{icon}</div>
        <div>
          <div style={chip.label}>{label}</div>
          <div style={chip.value}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={card.box}>
      <div style={card.header}><h3 style={card.title}>{title}</h3></div>
      <div style={card.body}>{children}</div>
    </div>
  );
}

/* ---- Exec cards ---- */
function ExecCard({ label, value, delta, spark=[] }) {
  const w=160, h=38, max=Math.max(...spark,1), min=Math.min(...spark,0);
  const pts = spark.map((v,i)=>`${(i/(spark.length-1||1))*w},${h-((v-min)/(max-min||1))*h}`).join(" ");
  const up = delta>=0;
  return (
    <div style={exec.card}>
      <div style={exec.valRow}>
        <div style={exec.value}>{value}</div>
        <div style={{...exec.delta, color: up?COLORS.green:COLORS.red}}>
          {up ? <IconUp/> : <IconDown/>} {Math.abs(delta).toFixed(1)}%
        </div>
      </div>
      <svg width={w} height={h} style={{ display:"block" }}>
        <polyline fill="none" stroke={COLORS.blue} strokeWidth="2" points={pts}/>
      </svg>
      <div style={exec.label}>{label}</div>
    </div>
  );
}
function SmallKpi({ label, value, trend="flat" }) {
  const color = trend==="up"?COLORS.green : trend==="down"?COLORS.red : COLORS.gray;
  const Icon = trend==="up"?IconUp : trend==="down"?IconDown : IconDot;
  return (
    <div style={exec.small}>
      <div style={{...exec.smallValue, color}}>{value}</div>
      <div style={exec.smallRow}><Icon/><span>{label}</span></div>
    </div>
  );
}

/* ---- Donut percent ---- */
function DonutPct({ label, value }) {
  const size=120, stroke=16, r=(size-stroke)/2, c=2*Math.PI*r, off=c-(value/100)*c;
  return (
    <div style={donut.box}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="#7c3aed" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="butt" transform={`rotate(-90 ${size/2} ${size/2})`}
        />
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle"
          style={{fontWeight:900,fontSize:18,fill:COLORS.neutral}}>{value}%</text>
      </svg>
      <div style={donut.label}>{label}</div>
    </div>
  );
}

/* ---- Gauge semicircular com degradê e seta ----
   good = "right" -> bom à direita (verde); "left" -> bom à esquerda
*/
function SpeedGauge({ label, value, min=0, max=100, good="right" }) {
  const pct = clamp01((value - min) / (max - min || 1));
  const W=320, H=170, R=125, CX=W/2, CY=H, STROKE=26;
  const arc = `M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}`;
  const gradId = `grad-${label.replace(/\s+/g,'-')}`;

  const leftColor  = good==="right" ? COLORS.red   : COLORS.green;
  const midColor   = COLORS.orange;
  const rightColor = good==="right" ? COLORS.green : COLORS.red;

  // ângulo do valor
  const ang = Math.PI * (1 - pct);
  const tipLen = R + STROKE/2 - 4;
  const baseLen = 28;      // proximidade do centro
  const half = 10;         // metade da base (largura)
  const tipX = CX + tipLen * Math.cos(ang);
  const tipY = CY - tipLen * Math.sin(ang);
  const baseX = CX + baseLen * Math.cos(ang);
  const baseY = CY - baseLen * Math.sin(ang);
  const nx = Math.cos(ang + Math.PI/2), ny = Math.sin(ang + Math.PI/2);
  const b1x = baseX + half*nx, b1y = baseY - half*ny;
  const b2x = baseX - half*nx, b2y = baseY + half*ny;

  return (
    <div style={gauge.box}>
      <svg width={W} height={H+10}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={leftColor}/>
            <stop offset="60%"  stopColor={midColor}/>
            <stop offset="100%" stopColor={rightColor}/>
          </linearGradient>
        </defs>
        {/* trilha */}
        <path d={arc} stroke="#e5e7eb" strokeWidth={STROKE} fill="none" strokeLinecap="butt"/>
        {/* progresso (degradê) */}
        <path d={arc} stroke={`url(#${gradId})`} strokeWidth={STROKE} fill="none"
              strokeLinecap="butt" pathLength="100"
              strokeDasharray={`${pct*100} ${100-pct*100}`}/>
        {/* seta (triângulo) */}
        <polygon points={`${b1x},${b1y} ${b2x},${b2y} ${tipX},${tipY}`} fill={COLORS.neutral}/>
        {/* cubo central */}
        <circle cx={CX} cy={CY} r="6" fill={COLORS.neutral}/>
      </svg>
      <div style={gauge.value}>{compact(value)}</div>
      <div style={gauge.label}>{label}</div>
      <div style={gauge.scale}><span>{compact(min)}</span><span>{compact(max)}</span></div>
    </div>
  );
}

/* ===== Ícones outline (neutros) ===== */
function IconCowOutline(){return(
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 6h10l2 3v7a4 4 0 1 1-8 0H7a3 3 0 1 1 0-6h1V9L7 6Z"/>
    <path d="M16 11h4v5a2 2 0 1 1-4 0v-5Z"/>
  </svg>
)}
function IconTubeOutline(){return(
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2h8v2H8v12a4 4 0 1 0 8 0V8" />
  </svg>
)}
function IconXOutline(){return(
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="square">
    <path d="M7 7l10 10M17 7 7 17"/>
  </svg>
)}
function IconPregOutline(){return(
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="3"/><path d="M9 10v5a3 3 0 1 0 6 0v-2h1a3 3 0 0 0 0-6"/>
  </svg>
)}
function IconWarnOutline(){return(
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="round">
    <path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>
  </svg>
)}
function IconSearch(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>)}
function IconList(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>)}
function IconBolt(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M13 2 3 14h7l-1 8 11-12h-7l0-8Z"/></svg>)}
function IconGauge(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M12 6a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V6Zm0 3 5 5-1.5 1.5L12 12V9Z"/></svg>)}
function IconRocket(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M14 3c3 0 7 4 7 7l-6 6c-3 0-7-4-7-7l6-6ZM5 19l3-1 1 3-3 1-1-3Z"/></svg>)}
function IconBox(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M3 7 12 3l9 4-9 4-9-4Zm0 4 9 4v6l-9-4v-6Zm18 0-9 4v6l9-4v-6Z"/></svg>)}
function IconIdea(){return(<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827"><path d="M12 3a7 7 0 0 1 4 13l-1 2H9l-1-2a7 7 0 0 1 4-13Zm-3 17h6v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1Z"/></svg>)}
function IconUp(){return(<svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a"><path d="m5 15 7-7 7 7H5Z"/></svg>)}
function IconDown(){return(<svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444"><path d="m5 9 7 7 7-7H5Z"/></svg>)}
function IconDot(){return(<svg width="10" height="10" viewBox="0 0 24 24" fill="#6b7280"><circle cx="12" cy="12" r="4"/></svg>)}

/* ===== badges de tarefa (iguais ao print) ===== */
function badgeColor(tag){
  switch(tag){
    case "Hoje":    return { background:"#dbeafe", color:"#1e3a8a" };
    case "Alerta":  return { background:"#fde68a", color:"#92400e" };
    case "DG":      return { background:"#bbf7d0", color:"#065f46" };
    case "Estoque": return { background:"#ffedd5", color:"#7c2d12" };
    default:        return {};
  }
}

/* ===== estilos ===== */
const ui = {
  page:{ padding:"10px 14px", background:"#f6f7fb", fontFamily:"Poppins, system-ui, sans-serif", minHeight:"100dvh" },
  top:{ marginTop:8, marginBottom:10, display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"center" },
  kpiChipsWrap:{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" },
  search:{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 8px" },
  searchInput:{ border:"none", outline:"none", width:240, fontSize:12 },
  grid:{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 320px", gap:12, alignItems:"start" },
  colMain:{ display:"flex", flexDirection:"column", gap:12 },
  colSide:{ display:"flex", flexDirection:"column", gap:12 }
};

const banner = {
  box:{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, border:"1px solid", padding:"6px 10px", borderRadius:8, marginBottom:8 },
  dot:{ width:8, height:8, borderRadius:99, display:"inline-block" },
  text:{ fontSize:12, fontWeight:700, color:"#374151" },
  right:{ fontSize:11, color:"#6b7280" }
};

const chip = {
  box:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px" },
  left:{ display:"flex", alignItems:"center", gap:10 },
  iconWrap:{ width:26, height:26, borderRadius:6, background:"#f8fafc", display:"grid", placeItems:"center", border:"1px solid #e5e7eb" },
  label:{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:.2 },
  value:{ fontSize:18, fontWeight:900, lineHeight:1 }
};

const card = {
  box:{ background:"#fff", borderRadius:8, boxShadow:"0 1px 4px rgba(0,0,0,.06)" },
  header:{ padding:"8px 10px", borderBottom:"1px solid #eef2f7" },
  title:{ margin:0, fontSize:14, fontWeight:800, letterSpacing:.2, display:"flex", alignItems:"center", gap:8, color:"#111827" },
  body:{ padding:10 }
};

const tasks = {
  card:{ background:"#fff", borderRadius:8, border:"1px solid #e5e7eb", position:"relative", boxShadow:"0 1px 4px rgba(0,0,0,.06), inset 4px 0 0 0 #2563eb" },
  header:{ padding:"8px 10px", borderBottom:"1px solid #e5e7eb" },
  title:{ margin:0, fontSize:14, fontWeight:900, letterSpacing:.2, display:"flex", alignItems:"center", gap:8, color:"#111827" },
  body:{ padding:10 },
  item:{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"#fafafa", border:"1px solid #e5e7eb", borderRadius:12, marginBottom:10, boxShadow:"0 1px 0 rgba(0,0,0,.03)" },
  badge:{ padding:"4px 10px", borderRadius:999, fontSize:12, fontWeight:800 }
};

const exec = {
  row:{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0,1fr))", gap:10 },
  card:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:10 },
  valRow:{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 },
  value:{ fontWeight:900, fontSize:18 },
  delta:{ fontWeight:800, fontSize:12, display:"flex", alignItems:"center", gap:4 },
  label:{ fontSize:12, color:"#6b7280" },
  small:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:10, display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start" },
  smallValue:{ fontSize:18, fontWeight:900 },
  smallRow:{ display:"flex", alignItems:"center", gap:6, color:"#6b7280", fontSize:12 }
};

const donut = {
  box:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:10, display:"flex", flexDirection:"column", alignItems:"center", gap:4 },
  label:{ fontSize:12, color:"#6b7280" }
};

const gauge = {
  row:{ display:"grid", gridTemplateColumns:"repeat(3, minmax(0,1fr))", gap:10 },
  box:{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, padding:8, display:"flex", flexDirection:"column", alignItems:"center", gap:2 },
  value:{ fontWeight:900, fontSize:18, color:"#111827", marginTop:2 },
  label:{ fontSize:12, color:"#6b7280", marginTop:-2 },
  scale:{ width:"100%", display:"flex", justifyContent:"space-between", fontSize:10, color:"#9ca3af" }
};

const short = {
  wrap:{ display:"flex", flexWrap:"wrap", gap:8 },
  btn:{ padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", fontWeight:700 }
};

const stub = { ul:{ margin:0, paddingLeft:18, fontSize:13, color:"#374151" } };
