// src/pages/Animais/PrePartoParto.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Select from "react-select";
import { getAnimais, atualizarAnimal, criarAnimal } from "../../api";

export const iconePreParto = "/icones/preparto.png";
export const rotuloPreParto = "Pré-parto/Parto";

const SETTING_KEY = "preparto_dias_antes_parto";
const MARGEM_ALERTA = 5;
const STICKY_OFFSET = 48;

/* ===== utils ===== */
function parseBR(str){ if(!str || typeof str!=="string" || str.length!==10) return null; const [d,m,y]=str.split("/").map(Number); const dt=new Date(y,m-1,d); return Number.isFinite(dt.getTime())?dt:null; }
function formatBR(dt){ return dt ? dt.toLocaleDateString("pt-BR") : "—"; }
function addDays(dt,n){ const d=new Date(dt.getTime()); d.setDate(d.getDate()+n); return d; }
function idadeTexto(nascimento){ const dt=parseBR(nascimento); if(!dt) return "—"; const meses=Math.max(0, Math.floor((Date.now()-dt.getTime())/(1000*60*60*24*30.44))); return `${Math.floor(meses/12)}a ${meses%12}m`; }
function calcPrevisaoParto({previsao_parto, previsaoParto, ultima_ia, ultimaIa}){
  const pp = parseBR(previsao_parto || previsaoParto);
  if(pp) return pp;
  const ia = parseBR(ultima_ia || ultimaIa);
  return ia ? addDays(ia, 280) : null;
}
const onlyDigits = (s) => String(s||"").replace(/\D/g,"");
const fmtData = (val) => { const d=onlyDigits(val).slice(0,8); const p1=d.slice(0,2), p2=d.slice(2,4), p3=d.slice(4,8); return [p1,p2,p3].filter(Boolean).join("/"); };
const DAY = 86400000;
const startOfDay = (dt) => { const d = new Date(dt); d.setHours(0,0,0,0); return d; };
const toISO = (br) => { const dt=parseBR(br); if(!dt) return ""; const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,"0"); const d=String(dt.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; };

/* ===== tabela / efeitos ===== */
const tableClasses = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase = "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap cursor-pointer";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap transition-transform";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs transition-colors";
const rowAlt  = "even:bg-[#f7f7f8]";
const bgHL = "bg-[rgba(33,150,243,0.08)]";
const ringCell = "relative z-[1] ring-1 ring-[#1e3a8a]/30 shadow-sm scale-[1.01]";

/* ===== react-select style ===== */
const selectStyle = { control: (base) => ({ ...base, height: 44, minHeight: 44, borderRadius: 8, borderColor: "#ccc", boxShadow: "none", fontSize: "0.95rem" }), menu: (b) => ({ ...b, zIndex: 9999 }) };

/* ===== persistência (local; opcional servidor) ===== */
const USE_REMOTE_SETTINGS = false;
async function getSetting(key) {
  if (USE_REMOTE_SETTINGS) {
    try {
      const r = await fetch(`/api/v1/settings/${key}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        const val = data?.value ?? null;
        try { localStorage.setItem(`SETTINGS:${key}`, JSON.stringify(val)); } catch {}
        return val;
      }
    } catch {}
  }
  try { const raw = localStorage.getItem(`SETTINGS:${key}`); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function setSetting(key, value) {
  try { localStorage.setItem(`SETTINGS:${key}`, JSON.stringify(value)); } catch {}
  if (USE_REMOTE_SETTINGS) {
    try {
      await fetch(`/api/v1/settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value })
      });
    } catch {}
  }
}

/* ===== helpers modais ===== */
function useModalClose(refBox, onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const onClick = (e) => { if (refBox.current && !refBox.current.contains(e.target)) onClose?.(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, [refBox, onClose]);
}

/* ========================= MODAL PARTO (MÃE) ========================= */
function ModalParto({ animal, onCancelar, onContinuar }) {
  const boxRef = useRef(null);
  useModalClose(boxRef, onCancelar);
  const [data, setData] = useState("");
  const [facilidade, setFacilidade] = useState(null);
  const [retencao, setRetencao] = useState(null);
  const [drench, setDrench] = useState(null);
  const [anti, setAnti] = useState(null);
  const [principio, setPrincipio] = useState(null);
  const [dose, setDose] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [brix, setBrix] = useState("");
  const [brixNaoMedido, setBrixNaoMedido] = useState(false);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");

  const optSimNao = useMemo(() => (["Sim","Não"].map(v=>({value:v,label:v}))), []);
  const optFac = useMemo(() => (
    ["Sem auxílio","Auxílio leve","Auxílio moderado","Auxílio intenso","Cesárea","Distocia grave"]
      .map(v=>({value:v,label:v}))
  ), []);

  const continuar = () => {
    if (!data || !facilidade?.value) { setErro("Preencha Data e Facilidade."); return; }
    setErro("");
    onContinuar?.({
      data,
      facilidade: facilidade?.value,
      retencaoPlacenta: retencao?.value || "",
      drench: drench?.value || "",
      antiInflamatorio: anti?.value || "",
      principioAtivo: anti?.value === "Sim" ? (principio?.value || principio?.label || "") : "",
      dose: anti?.value === "Sim" ? dose : "",
      temperatura,
      brix: brixNaoMedido ? "Não medido" : brix,
      observacoes: obs,
    });
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
  const modal = { background:"#fff", borderRadius:"1rem", width:900, maxHeight:"92vh", display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"Poppins, sans-serif" };
  const header = { background:"#1e40af", color:"#fff", padding:"12px 16px", fontWeight:700 };
  const body = { padding:16, display:"grid", gridTemplateColumns:"1fr 1fr", columnGap:"2rem", rowGap:"12px", overflowY:"auto", flex:1 };
  const footer = { padding:"12px 16px", display:"flex", justifyContent:"flex-end", gap:12, borderTop:"1px solid #e5e7eb" };
  const input = { width:"100%", height:44, border:"1px solid #ccc", borderRadius:8, padding:"0 12px", boxSizing:"border-box" };

  return (
    <div style={overlay}>
      <div ref={boxRef} style={modal}>
        <div style={header}>🐄 Parto — Nº {animal?.numero} • Brinco {animal?.brinco}</div>
        <div style={body}>
          <div><label>Data *</label><input value={data} onChange={(e)=>setData(fmtData(e.target.value))} placeholder="dd/mm/aaaa" style={input}/></div>
          <div><label>Facilidade *</label><Select options={optFac} value={facilidade} onChange={setFacilidade} styles={selectStyle} placeholder="Selecione…" /></div>
          <div><label>Retenção de placenta</label><Select options={optSimNao} value={retencao} onChange={setRetencao} styles={selectStyle} placeholder="Selecione…" /></div>
          <div><label>Fornecido drench?</label><Select options={optSimNao} value={drench} onChange={setDrench} styles={selectStyle} placeholder="Selecione…" /></div>
          <div><label>Anti-inflamatório?</label><Select options={optSimNao} value={anti} onChange={setAnti} styles={selectStyle} placeholder="Selecione…" /></div>
          <div><label>Temperatura (°C)</label><input value={temperatura} onChange={(e)=>setTemperatura(e.target.value)} style={input}/></div>
          {anti?.value === "Sim" && (
            <>
              <div><label>Princípio ativo</label><Select options={[]} value={principio} onChange={setPrincipio} styles={selectStyle} isSearchable isClearable placeholder="Digite/Selecione…" /></div>
              <div><label>Dose (mL)</label><input value={dose} onChange={(e)=>setDose(e.target.value)} style={input}/></div>
            </>
          )}
          <div><label>BRIX do colostro (%)</label><input value={brixNaoMedido ? "" : brix} disabled={!!brixNaoMedido} onChange={(e)=>setBrix(e.target.value)} style={input}/></div>
          <div style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:8, marginTop:6 }}>
            <input type="checkbox" checked={brixNaoMedido} onChange={()=>setBrixNaoMedido(v=>!v)} />
            <span>Não medido</span>
          </div>
          <div style={{ gridColumn:"1 / -1" }}><label>Observações</label><textarea rows={3} value={obs} onChange={(e)=>setObs(e.target.value)} style={{ width:"100%", padding:"8px 12px", border:"1px solid #ccc", borderRadius:8, resize:"none" }} /></div>
          {erro && <div style={{ gridColumn:"1 / -1", color:"#b91c1c", fontWeight:600 }}>⚠️ {erro}</div>}
        </div>
        <div style={footer}>
          <button className="px-4 py-2 rounded-md border" onClick={onCancelar}>Cancelar</button>
          <button className="px-4 py-2 rounded-md text-white" style={{ background:"#2563eb" }} onClick={continuar}>Continuar para bezerro(s)</button>
        </div>
      </div>
    </div>
  );
}

/* ========================= MODAL INICIAR PRÉ-PARTO ========================= */
function ModalIniciarPreParto({ animal, diasDefault = 30, onCancelar, onSalvo }) {
  const boxRef = useRef(null);
  useModalClose(boxRef, onCancelar);

  const hojeBR = new Date().toLocaleDateString("pt-BR");
  const [data, setData] = useState(hojeBR);
  const [dias, setDias] = useState(diasDefault);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  // date picker nativo (input date oculto)
  const hiddenDateRef = useRef(null);
  const openPicker = () => {
    const el = hiddenDateRef.current;
    if (!el) return;
    // showPicker é suportado no Chrome/Edge; fallback para click
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };
  const onHiddenDateChange = (e) => {
    const iso = e.target.value; // yyyy-mm-dd
    if (!iso) return;
    const [y,m,d] = iso.split("-").map(Number);
    const br = `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
    setData(br);
  };

  const salvar = async () => {
    const dt = parseBR(data);
    if (!dt) { setErro("Informe uma data válida (dd/mm/aaaa)."); return; }
    setErro(""); setSaving(true);
    try {
      const historico = animal?.historico && typeof animal.historico === "object"
        ? { ...animal.historico }
        : (animal?.historico ? JSON.parse(animal.historico) : {}) || {};

      const prepartoAtual = {
        ...(historico.preparto || {}),
        iniciado_em: data,
        dias_param: Number(dias) || diasDefault,
        observacoes: obs || undefined,
      };

      const prepartos = Array.isArray(historico.prepartos) ? [...historico.prepartos] : [];
      prepartos.push({ ...prepartoAtual, created_at: new Date().toISOString() });

      const novoHistorico = { ...historico, preparto: prepartoAtual, prepartos };

      const atualizado = await atualizarAnimal(animal.id, { historico: novoHistorico });
      window.dispatchEvent(new Event("animaisAtualizados"));
      onSalvo?.(atualizado?.historico || novoHistorico);
    } catch (e) {
      console.error("Erro ao iniciar pré-parto:", e);
      alert("❌ Erro ao salvar início de pré-parto.");
    } finally { setSaving(false); }
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
  const modal = { background:"#fff", borderRadius:"1rem", width:560, maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"Poppins, sans-serif" };
  const header = { background:"#1e40af", color:"#fff", padding:"12px 16px", fontWeight:700 };
  const body = { padding:16, display:"flex", flexDirection:"column", gap:12 };
  const footer = { padding:16, display:"flex", justifyContent:"flex-end", gap:12, borderTop:"1px solid #e5e7eb" };

  return (
    <div style={overlay}>
      <div ref={boxRef} style={modal}>
        <div style={header}>🍼 Iniciar pré-parto — Nº {animal?.numero} • Brinco {animal?.brinco}</div>
        <div style={body}>
          <div>
            <label className="font-medium">Data de início *</label>
            <div className="relative">
              <input
                value={data}
                onChange={(e)=>setData(fmtData(e.target.value))}
                placeholder="dd/mm/aaaa"
                className="w-full h-11 border rounded px-3 pr-11"
                aria-label="Data de início do pré-parto (dd/mm/aaaa)"
              />
              {/* botão com ícone de calendário */}
              <button
                type="button"
                onClick={openPicker}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-gray-100"
                title="Abrir calendário"
                aria-label="Abrir calendário"
              >
                {/* ícone (SVG leve) */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="17" rx="2" stroke="#1e3a8a" strokeWidth="1.6"/>
                  <path d="M8 2v4M16 2v4M3 9h18" stroke="#1e3a8a" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
              {/* input date oculto para abrir o picker nativo */}
              <input
                ref={hiddenDateRef}
                type="date"
                className="sr-only"
                value={toISO(data)}
                onChange={onHiddenDateChange}
              />
            </div>
          </div>
          <div>
            <label className="font-medium">Dias (parâmetro)</label>
            <input
              type="number"
              min={1} max={365}
              value={dias}
              onChange={(e)=>setDias(e.target.value)}
              className="w-full h-11 border rounded px-3"
            />
          </div>
          <div>
            <label className="font-medium">Observações</label>
            <textarea rows={3} value={obs} onChange={(e)=>setObs(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          {erro && <div className="text-red-600 font-semibold">{erro}</div>}
        </div>
        <div style={footer}>
          <button className="px-4 py-2 rounded-md border" onClick={onCancelar}>Cancelar</button>
          <button className="px-4 py-2 rounded-md text-white" style={{ background:"#2563eb" }} disabled={saving} onClick={salvar}>
            {saving ? "Salvando…" : "Iniciar pré-parto"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== aviso colostro ===== */
function avisoColostro(horaParto, horaColostro){
  const toMin = (hhmm) => { if(!hhmm||!hhmm.includes(":")) return null; const [h,m]=hhmm.split(":").map(Number); if([h,m].some(Number.isNaN)) return null; return h*60+m; };
  const a = toMin(horaParto), b = toMin(horaColostro);
  if(a==null || b==null) return null;
  const min = b - a;
  if (min < 0) return null;
  if (min <= 120) return "✅ Excelente! O colostro foi fornecido até 2 horas do parto.";
  if (min <= 360) return "⚠️ Atenção: o colostro foi fornecido entre 2 e 6 horas do parto.";
  return "❌ Cuidado! O fornecimento do colostro ocorreu após 6 horas do parto.";
}

/* ===================== MODAL BEZERROS ===================== */
function ModalBezerros({ vaca, dadosMae, onCancelar, onFinalizado }) {
  const boxRef = useRef(null);
  useModalClose(boxRef, onCancelar);

  const [qtd, setQtd] = useState(1);
  const [horaParto, setHoraParto] = useState("");
  const [horaColostro, setHoraColostro] = useState("");
  const [bez, setBez] = useState([{ sexo: "femea", brinco: "", numero: "" }, { sexo: "macho", brinco: "", numero: "" }]);
  const [saving, setSaving] = useState(false);
  const aviso = useMemo(() => avisoColostro(horaParto, horaColostro), [horaParto, horaColostro]);

  const salvar = async () => {
    setSaving(true);
    try {
      const bodyMae = {
        parto: dadosMae?.data || undefined,
        previsao_parto: null,
        situacao_produtiva: "lactante",
        situacao_reprodutiva: "vazia",
        historico: {
          ...(vaca?.historico || {}),
          parto: {
            ...(vaca?.historico?.parto || {}),
            ultimo: {
              data: dadosMae?.data,
              facilidade: dadosMae?.facilidade,
              observacoes: dadosMae?.observacoes,
              brix: dadosMae?.brix,
              retencaoPlacenta: dadosMae?.retencaoPlacenta,
              drench: dadosMae?.drench,
              antiInflamatorio: dadosMae?.antiInflamatorio,
              principioAtivo: dadosMae?.principioAtivo,
              dose: dadosMae?.dose,
              temperatura: dadosMae?.temperatura,
              horaParto: horaParto || undefined,
              horaColostro: horaColostro || undefined,
            },
          },
        },
      };
      const maeAtualizada = await atualizarAnimal(vaca.id, bodyMae);

      const qt = Math.max(1, Math.min(2, Number(qtd) || 1));
      for (let i = 0; i < qt; i++) {
        const b = bez[i] || {};
        try {
          await criarAnimal({
            nascimento: dadosMae?.data,
            sexo: b?.sexo || "femea",
            categoria: b?.sexo === "macho" ? "Bezerro" : "Bezerra",
            brinco: b?.brinco || undefined,
            numero: b?.numero || undefined,
            mae: vaca?.numero || vaca?.brinco || String(vaca?.id || ""),
            raca: vaca?.raca || undefined,
          });
        } catch (e) { console.warn("Falha ao criar bezerro:", e); }
      }

      window.dispatchEvent(new Event("animaisAtualizados"));
      onFinalizado?.(maeAtualizada || vaca);
    } catch (e) {
      console.error("Erro ao finalizar parto:", e);
      alert("❌ Erro ao salvar parto.");
    } finally {
      setSaving(false);
    }
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
  const modal = { background:"#fff", borderRadius:"1rem", width:880, maxHeight:"92vh", display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"Poppins, sans-serif" };
  const header = { background:"#1e40af", color:"#fff", padding:"12px 16px", fontWeight:700 };
  const body = { padding:16, display:"flex", flexDirection:"column", gap:12, overflowY:"auto", flex:1 };
  const grid = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" };

  return (
    <div style={overlay}>
      <div ref={boxRef} style={modal}>
        <div style={header}>🐄 Bezerro(s) — Mãe Nº {vaca?.numero} • Brinco {vaca?.brinco}</div>
        <div style={body}>
          <div style={grid}>
            <div>
              <label>Qtd. de bezerros</label>
              <select value={qtd} onChange={(e)=>setQtd(e.target.value)} className="w-full h-11 border rounded px-3">
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            <div />
            <div><label>Hora do parto (hh:mm)</label><input value={horaParto} onChange={(e)=>setHoraParto(e.target.value)} placeholder="00:00" className="w-full h-11 border rounded px-3"/></div>
            <div><label>Hora do colostro (hh:mm)</label><input value={horaColostro} onChange={(e)=>setHoraColostro(e.target.value)} placeholder="00:00" className="w-full h-11 border rounded px-3"/></div>
          </div>

          {aviso && <div className="text-sm">{aviso}</div>}

          {[0,1].slice(0, Math.max(1, Math.min(2, Number(qtd)||1))).map((i)=>(
            <fieldset key={i} className="border rounded-md p-3">
              <legend className="px-1 text-sm text-[#1e3a8a] font-semibold">Bezerro {i+1}</legend>
              <div style={grid}>
                <div>
                  <label>Sexo</label>
                  <select
                    value={bez[i]?.sexo || "femea"}
                    onChange={(e)=>setBez((b)=>{ const c=[...b]; c[i]={...(c[i]||{}), sexo:e.target.value}; return c; })}
                    className="w-full h-11 border rounded px-3"
                  >
                    <option value="femea">Fêmea</option>
                    <option value="macho">Macho</option>
                  </select>
                </div>
                <div><label>Brinco</label><input value={bez[i]?.brinco||""} onChange={(e)=>setBez((b)=>{ const c=[...b]; c[i]={...(c[i]||{}), brinco:e.target.value}; return c; })} className="w-full h-11 border rounded px-3" /></div>
                <div><label>Número</label><input value={bez[i]?.numero||""} onChange={(e)=>setBez((b)=>{ const c=[...b]; c[i]={...(c[i]||{}), numero:e.target.value}; return c; })} className="w-full h-11 border rounded px-3" /></div>
              </div>
            </fieldset>
          ))}

          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded-md border" onClick={onCancelar}>Cancelar</button>
            <button className="px-4 py-2 rounded-md text-white" style={{ background:"#2563eb" }} disabled={saving} onClick={salvar}>
              {saving ? "Salvando…" : "Concluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== LISTA: PRÉ-PARTO / PARTO ===================== */
export default function PrePartoParto({ animais = [], onCountChange }) {
  const [preDays, setPreDays] = useState(30);
  const [preDaysRaw, setPreDaysRaw] = useState("30");

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // efeitos de hover refinados
  const [hoverCol, setHoverCol] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverCell, setHoverCell] = useState({ r: null, c: null });

  const [sel, setSel] = useState(null);
  const [dadosMae, setDadosMae] = useState(null);
  const [showParto, setShowParto] = useState(false);
  const [showBezerros, setShowBezerros] = useState(false);
  const [showIniciarPreParto, setShowIniciarPreParto] = useState(false);

  // carrega preferência
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await getSetting(SETTING_KEY);
      const n = Number(v);
      const dv = Number.isFinite(n) && n > 0 ? n : 30;
      if (alive) { setPreDays(dv); setPreDaysRaw(String(dv)); }
    })();
    return () => { alive = false; };
  }, []);

  // salvar preferência
  const commitPreDays = useCallback(async () => {
    const n = Math.max(1, Math.min(365, parseInt(preDaysRaw, 10) || 1));
    setPreDaysRaw(String(n));
    setPreDays(n);
    await setSetting(SETTING_KEY, n);
  }, [preDaysRaw]);

  // carregar lista (plantel -> filtro em memória)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (preDays == null) return;
      setLoading(true); setErro("");
      try {
        const { items } = await getAnimais({ view: "plantel", page: 1, limit: 2000 });
        if (alive) setLista(items || []);
      } catch (e) {
        console.error("Erro ao carregar pré-parto/parto:", e);
        if (alive) { setErro("Não foi possível carregar do servidor. Mostrando dados locais."); setLista(Array.isArray(animais) ? animais : []); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [preDays, animais]);

  useEffect(() => {
    const h = () => setTimeout(() => setLista((l)=>[...l]), 50);
    window.addEventListener("animaisAtualizados", h);
    return () => window.removeEventListener("animaisAtualizados", h);
  }, []);

  const hoje0 = startOfDay(new Date());

  const isPrePartoIniciado = (v) => {
    const h = v?.historico;
    if (!h) return false;
    const raw =
      (h.preparto && (h.preparto.iniciado_em || h.preparto.iniciadoEm)) ||
      (Array.isArray(h.prepartos) && h.prepartos[h.prepartos.length-1]?.iniciado_em);
    return !!parseBR(raw);
  };

  function classificar(v, D) {
    const pp = calcPrevisaoParto({
      previsao_parto: v.previsao_parto, previsaoParto: v.previsaoParto,
      ultima_ia: v.ultima_ia, ultimaIa: v.ultimaIa
    });
    if (!pp) return { bucket: 3, dias: Infinity, pp };
    const dias = Math.floor((startOfDay(pp).getTime() - hoje0.getTime()) / DAY);
    if (dias < 0) return { bucket: 3, dias, pp };
    if (isPrePartoIniciado(v)) return { bucket: 1, dias, pp };
    if (dias < D - MARGEM_ALERTA) return { bucket: 0, dias, pp };
    if (dias <= D + MARGEM_ALERTA) return { bucket: 1, dias, pp };
    return { bucket: 2, dias, pp };
  }

  const somenteElegiveis = useMemo(() => {
    return (lista || []).filter(v => {
      const pp = calcPrevisaoParto({
        previsao_parto: v.previsao_parto, previsaoParto: v.previsaoParto,
        ultima_ia: v.ultima_ia, ultimaIa: v.ultimaIa
      });
      if (!pp) return false;
      return startOfDay(pp) >= hoje0;
    });
  }, [lista, hoje0]);

  const listaOrdenada = useMemo(() => {
    const enriched = somenteElegiveis
      .map(v => ({ v, meta: classificar(v, preDays ?? 30) }))
      .filter(x => x.meta.bucket !== 2 && x.meta.bucket !== 3);

    enriched.sort((a, b) => {
      if (a.meta.bucket !== b.meta.bucket) return a.meta.bucket - b.meta.bucket;
      return a.meta.dias - b.meta.dias;
    });
    return enriched;
  }, [somenteElegiveis, preDays]);

  useEffect(() => {
    onCountChange?.(listaOrdenada.length);
  }, [listaOrdenada.length, onCountChange]);

  const colunas = useMemo(
    () => ["Número","Brinco","Categoria","Idade","Raça","Previsão de parto","Dias para o parto","Ação"],
    []
  );

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        <div className="mb-2 flex items-center gap-3">
          <label className="font-semibold text-[#1e3a8a]">Entram em pré-parto a partir de</label>
          <input
            type="number" inputMode="numeric" min={1} max={365}
            value={preDaysRaw} onChange={(e)=>setPreDaysRaw(e.target.value)}
            onBlur={commitPreDays}
            onKeyDown={(e)=>{
              if(e.key==="Enter"){ e.preventDefault(); commitPreDays(); e.currentTarget.blur(); }
              if(e.key==="Escape"){ e.preventDefault(); setPreDaysRaw(String(preDays ?? 30)); e.currentTarget.blur(); }
            }}
            className="w-24 px-3 py-2 rounded-md border border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
          />
          <span className="text-sm text-gray-600">dias antes do parto</span>
          <div className="ml-auto text-sm">
            {loading
              ? <span className="text-[#1e3a8a]">Carregando…</span>
              : <span className="text-gray-600">Total: <strong>{listaOrdenada.length}</strong></span>}
          </div>
        </div>

        <div className="mb-4 text-xs text-gray-600">
          <span className="inline-flex items-center mr-3"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block mr-1.5"></span> Atrasada (&lt; {(preDays??30)-MARGEM_ALERTA} dias p/ parto)</span>
          <span className="inline-flex items-center mr-3"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block mr-1.5"></span> No prazo (até {preDays ?? 30} ± {MARGEM_ALERTA})</span>
          <span className="inline-flex items-center"><span className="w-3 h-3 rounded-sm bg-gray-400 inline-block mr-1.5"></span> Antecipada (&gt; {preDays ?? 30} + {MARGEM_ALERTA}) — não exibida</span>
        </div>

        {erro && <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-2 rounded">{erro}</div>}

        <table className={tableClasses}>
          <colgroup>
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverCol === i ? bgHL : ""}`}
                  style={{ top: STICKY_OFFSET }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listaOrdenada.map(({ v, meta }, rIdx) => {
              const numero    = v.numero ?? "—";
              const brinco    = v.brinco ?? "—";
              const categoria = v.categoria ?? "—";
              const idade     = idadeTexto(v.nascimento);
              const raca      = v.raca ?? "—";
              const prevParto = formatBR(meta.pp);
              const diasPara  = meta.dias ?? "—";

              const bucketClass =
                meta.bucket === 0 ? "bg-red-50 border-l-4 border-red-500 text-red-700"
                : "hover:bg-[#eaf5ff]";

              const TD = (content, cIdx, clamp=true) => {
                const isRowHL = hoverRow === rIdx;
                const isColHL = hoverCol === cIdx;
                const isCellHL = hoverCell.r === rIdx && hoverCell.c === cIdx;
                const klass = `${clamp ? tdClamp : tdBase} ${isRowHL || isColHL ? bgHL : ""} ${isCellHL ? ringCell : ""}`;
                return (
                  <td
                    className={klass}
                    onMouseEnter={() => { setHoverRow(rIdx); setHoverCol(cIdx); setHoverCell({ r: rIdx, c: cIdx }); }}
                    onMouseLeave={() => { setHoverRow(null); setHoverCell({ r: null, c: null }); }}
                  >
                    {content}
                  </td>
                );
              };

              return (
                <tr
                  key={v.id ?? rIdx}
                  className={`${rowBase} ${rowAlt} ${bucketClass}`}
                  onMouseEnter={() => setHoverRow(rIdx)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  {TD(numero, 0)}
                  {TD(brinco, 1)}
                  {TD(categoria, 2)}
                  {TD(idade, 3)}
                  {TD(raca, 4)}
                  {TD(prevParto, 5)}
                  {TD(diasPara, 6)}
                  <td
                    className={`${tdBase} ${hoverCol === 7 || hoverRow === rIdx ? bgHL : ""} ${hoverCell.r === rIdx && hoverCell.c === 7 ? ringCell : ""}`}
                    onMouseEnter={() => { setHoverRow(rIdx); setHoverCol(7); setHoverCell({ r: rIdx, c: 7 }); }}
                    onMouseLeave={() => { setHoverRow(null); setHoverCell({ r: null, c: null }); }}
                  >
                    <div className="flex items-center gap-2">
                      {!isPrePartoIniciado(v) && (
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a]"
                          onClick={() => { setSel(v); setShowIniciarPreParto(true); }}
                          title="Iniciar pré-parto"
                        >Iniciar pré-parto</button>
                      )}
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a]"
                        onClick={() => { setSel(v); setDadosMae(null); setShowParto(true); }}
                        title="Registrar parto"
                      >Parto</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!loading && listaOrdenada.length === 0) && (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">Nenhum animal em pré-parto na janela selecionada.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Modais */}
        {showIniciarPreParto && sel && (
          <ModalIniciarPreParto
            animal={sel}
            diasDefault={preDays ?? 30}
            onCancelar={() => { setShowIniciarPreParto(false); setSel(null); }}
            onSalvo={(novoHistorico) => {
              setLista((prev)=>prev.map(a => a.id === sel.id ? { ...a, historico: novoHistorico } : a));
              setShowIniciarPreParto(false);
              setSel(null);
            }}
          />
        )}

        {showParto && sel && (
          <ModalParto
            animal={sel}
            onCancelar={() => { setShowParto(false); setSel(null); }}
            onContinuar={(dados) => { setDadosMae(dados); setShowParto(false); setShowBezerros(true); }}
          />
        )}
        {showBezerros && sel && dadosMae && (
          <ModalBezerros
            vaca={sel}
            dadosMae={dadosMae}
            onCancelar={() => { setShowBezerros(false); setSel(null); setDadosMae(null); }}
            onFinalizado={(m) => {
              setLista((prev)=>prev.filter(x=>x.id!==m.id));
              setShowBezerros(false);
              setSel(null);
              setDadosMae(null);
              window.dispatchEvent(new Event("animaisAtualizados"));
            }}
          />
        )}
      </div>
    </section>
  );
}
