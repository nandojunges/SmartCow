// src/pages/Reproducao/VisaoGeral/VisaoGeral.jsx
// -----------------------------------------------------------------------------
// VisãoGeral conectado ao backend (com colunas novas e "Decisões")
// + Correções Produtiva x Reprodutiva e sugestões coerentes com o estado
// - IA/DG/Protocolo/Clínica salvando no backend
// - Baixa de dose do touro tratada pelo backend (POST /reproducao/ia)
// - Decisão: salva localmente (lista do técnico) + salva evento no backend
// - Refresh da lista após IA/DG/Clínica/Protocolo para refletir dados do banco
// - Ao carregar, busca últimas decisões no backend e pré-seleciona no select
// - FIX: nunca usar "estado" (produtivo) como reprodutivo; fallback seguro = Vazia
// - AÇÕES: botão "Registrar" abre o drawer (DG). Ações rápidas abrem drawers.
// - OBS: conteúdo do drawer vem de arquivos separados:
//        Inseminacao.jsx, Diagnostico.jsx, AplicarProtocolo.jsx, OcorrenciaClinica.jsx
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import CreatableSelect from "react-select/creatable";
import api from "../../../api";

// Componentes
import Inseminacao from "./Inseminacao";
import Diagnostico from "./Diagnostico";
import AplicarProtocolo from "./AplicarProtocolo";
import OcorrenciaClinica from "./OcorrenciaClinica";

/* ================= CONSISTÊNCIA: token de limpeza de decisão ================= */
const CLEAR_TOKEN = "__CLEAR__";

/* ================= datas/util ================= */
const DAY = 86400000;
const today = () => new Date();

/** Parsers tolerantes (aceitam "dd/mm/aaaa ..." e "aaaa-mm-dd...") */
function parseBR(str){
  const m = String(str||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if(!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo-1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function parseISO(str){
  const m = String(str||"").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo-1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function parseAnyDate(str){
  if (str instanceof Date) return Number.isFinite(str.getTime()) ? str : null;
  if(!str && str!==0) return null;
  const s = String(str).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return parseBR(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s))  return parseISO(s);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatBR(dt){ return dt ? dt.toLocaleDateString("pt-BR") : "—"; }
function toISODate(dt){
  const y=dt.getFullYear();
  const m=String(dt.getMonth()+1).padStart(2,"0");
  const d=String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function brToISO(br){
  const dt = parseBR(br);
  return dt ? toISODate(dt) : null;
}
function isoToBR(iso){
  const s = String(iso||"").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s.includes("/") ? s.slice(0,10) : "";
}

function addDays(dt,n){ const d=new Date(dt.getTime()); d.setDate(d.getDate()+n); return d; }
function diffDays(a,b){
  if(!a||!b) return 0;
  const A=new Date(a.getFullYear(),a.getMonth(),a.getDate()).getTime();
  const B=new Date(b.getFullYear(),b.getMonth(),b.getDate()).getTime();
  return Math.round((A-B)/DAY);
}
function diasDesde(br){
  const dt=parseBR(br);
  if(!dt) return "—";
  return String(Math.max(0,diffDays(today(),dt)));
}
function calcPrevisaoParto({previsao_parto,previsaoParto,ultima_ia,ultimaIa}){
  const pp=parseAnyDate(previsaoParto ?? previsao_parto);
  if(pp) return pp;
  const ia=parseAnyDate(ultimaIa ?? ultima_ia);
  // 283 para bater com backend (DIAS_GESTACAO)
  return ia?addDays(ia,283):null;
}
const asArray=(v)=>Array.isArray(v)?v:typeof v==="string"?(JSON.parse(v||"[]")||[]):[];

/* ================= ajustes padrão ================= */
const DEFAULT_SETTINGS = {
  idadeMinMeses: 12, vwpDias: 50,
  dg30janela: [28,35], dg60janela:[55,75],
  presyncNoFinalDoPEV: 7, permitirPresyncEmPEV:true,
  prepartoDias: 21, // usado para produtiva "Pré-parto"
};

/* ================= UI helpers ================= */
const tableClasses="w-full border-separate [border-spacing:0_6px] text-[14px] text-[#333] table-auto";
const thClass="bg-[#e6f0ff] px-3 py-2 text-left font-bold text-[15px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky top-[48px] z-10";
const tdBase="px-3 py-2 bg-white border-b border-[#eee] whitespace-nowrap";
const rowAlt="even:bg-[#fafbff]";
const badge=(texto,t="neutro")=>{
  const map={neutro:["#eef2ff","#1e40af"],warn:["#fff7ed","#9a3412"],ok:["#ecfdf5","#065f46"],info:["#e0f2fe","#075985"],muted:["#f3f4f6","#374151"]};
  const [bg,fg]=map[t]||map.neutro;
  return <span style={{background:bg,color:fg,borderRadius:999,fontWeight:700,padding:"2px 10px",fontSize:12}}>{texto||"—"}</span>;
};

/* ===== botão chip ===== */
const BtnChip = ({ children, className = "", ...p }) => (
  <button
    type="button"
    className={
      "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5 " +
      className
    }
    {...p}
  >
    {children}
  </button>
);

/* ===== Botão “Registrar” (abre direto o first-tab: DG) ===== */
function RegistrarButton({ onOpen }) {
  return <BtnChip onClick={onOpen}>Registrar</BtnChip>;
}

/* =================== CLASSIFICAÇÕES =================== */
/** Produtiva: Lactante / Seca / Pré-parto / — */
function classifyProd(row, settings){
  // valor explícito do backend (aceita snake e camel já normalizados em getAnimaisFromAPI)
  const prodRawVal = row.situacaoProdutiva ?? row.situacao_produtiva ?? "";
  const raw = String(prodRawVal||"").toLowerCase();
  if(raw.includes("seca"))     return { label:"Seca",      tone:"muted" };
  if(raw.includes("lact"))     return { label:"Lactante",  tone:"ok" };
  if(raw.includes("pré")||raw.includes("pre-")||raw.includes("preparto")||raw.includes("pré-parto")||raw.includes("pre-parto"))
    return { label:"Pré-parto", tone:"info" };

  // heurística por previsão de parto
  const pp = calcPrevisaoParto(row);
  if(pp){
    const d=diffDays(pp,today());
    if(d>=0 && d<=settings.prepartoDias) return { label:"Pré-parto", tone:"info" };
    if(d>settings.prepartoDias && d<=60) return { label:"Seca",      tone:"muted" };
    if(d>60)                              return { label:"Lactante",  tone:"ok" };
  }

  // se houver data de parto (DEL calculável), considera lactante
  if (row.parto && parseBR(row.parto)) return { label:"Lactante", tone:"ok" };

  return { label:"—", tone:"neutro" };
}

/** Reprodutiva: PEV / Pré-sincr. / IATF / Inseminada / Prenhe / Vazia */
function classifyReprod(row, settings, normProd){
  // nunca herdar produtivo como reprodutivo
  const repRawVal = row.situacaoReprodutiva ?? row.situacao_reprodutiva ?? "";
  let base = String(repRawVal||"").toLowerCase();
  const produtivos = ["lact", "seca", "pré-parto", "pre-parto", "preparto"];
  if (produtivos.some(t => base.includes(t))) base = "";

  // Prenhe explícito
  if (base.includes("pren")) return { label:"Prenhe", tone:"ok" };

  // Pré-parto ou Seca no produtivo => Prenhe (coerência)
  if (normProd.label === "Pré-parto" || normProd.label === "Seca")
    return { label:"Prenhe", tone:"ok" };

  // Sinais explícitos de protocolos
  if (base.includes("iatf")) return { label:"IATF", tone:"info" };
  if (base.includes("pré") && base.includes("sincr")) return { label:"Pré-sincr.", tone:"info" };

  // PEV (puerpério) — usa data de parto (DEL<VWP)
  const partoDt=parseBR(row.parto);
  if(partoDt){
    const DEL=diffDays(today(),partoDt);
    if(DEL < settings.vwpDias) return { label:"PEV", tone:"info" };
  }

  // IA recente → Inseminada (+ janelas de DG)
  const iaDt = parseAnyDate(row.ultimaIa ?? row.ultima_ia);
  if(iaDt){
    const d = diffDays(today(), iaDt);
    // janelas explícitas
    if (d < settings.dg30janela[0])             return { label:"Inseminada",        tone:"info" };
    if (d >= settings.dg30janela[0] && d <= settings.dg30janela[1])
                                                return { label:"Inseminada (DG30)", tone:"warn" };
    if (d > settings.dg30janela[1] && d < settings.dg60janela[0])
                                                return { label:"Inseminada",        tone:"info" };
    if (d >= settings.dg60janela[0] && d <= settings.dg60janela[1])
                                                return { label:"Inseminada (DG60)", tone:"warn" };
    if (d <= settings.dg60janela[1] + 15)       return { label:"Inseminada",        tone:"info" };
  }

  // Vazia declarada
  if (base.includes("vaz")) return { label:"Vazia", tone:"warn" };

  // Default seguro
  return { label:"Vazia", tone:"warn" };
}

/* ================= regra de sugestão ================= */
function buildStep(row, settings, normRep){
  const hoje=today();
  const iaDt=parseAnyDate(row.ultimaIa ?? row.ultima_ia);

  // 1) Prenhe => nada
  if(normRep.label==="Prenhe") return { key:"NONE", label:"—", dueDate:null, detail:{ sitReprod:"Prenhe" } };

  // 2) Existe IA? **DG tem prioridade** sobre outras sugestões (exceto Prenhe).
  if (iaDt) {
    const d = diffDays(hoje, iaDt);
    if (d >= settings.dg30janela[0] && d <= settings.dg30janela[1]) {
      return { key:"DG30", label:"DG 30d", dueDate: addDays(iaDt, settings.dg30janela[0]), detail:{ sitReprod:"IA 30d" } };
    }
    if (d >= settings.dg60janela[0] && d <= settings.dg60janela[1]) {
      return { key:"DG60", label:"DG 60d", dueDate: addDays(iaDt, settings.dg60janela[0]), detail:{ sitReprod:"IA 60d" } };
    }
    // Fora das janelas de DG → segue fluxo normal
  }

  // 3) Em PEV => sugestão de Pré-sincr. nos últimos dias do PEV
  if(normRep.label==="PEV"){
    const partoDt=parseBR(row.parto);
    if(partoDt){
      const DEL = diffDays(hoje, partoDt);
      const faltam = settings.vwpDias - DEL;
      if(settings.permitirPresyncEmPEV && faltam<=settings.presyncNoFinalDoPEV){
        return { key:"PRESYNC", label:"Iniciar Pré-sincr.", dueDate:hoje, detail:{ sitReprod:"PEV" } };
      }
    }
    return { key:"NONE", label:"—", dueDate:null, detail:{ sitReprod:"PEV" } };
  }

  // 4) Pré-sincr. => próximo passo é IATF
  if(normRep.label==="Pré-sincr.")
    return { key:"IATF", label:"Iniciar IATF", dueDate:hoje, detail:{ sitReprod:"Pré-sincr." } };

  // 5) IATF => registrar IA
  if(normRep.label==="IATF")
    return { key:"IA", label:"Registrar IA", dueDate:hoje, detail:{ sitReprod:"IATF" } };

  // (nota: o bloco de IA → DG subiu para antes do PEV)

  // 6) Vazia ou “Inseminada” muito antiga (sem DG registrado) => IATF
  //    cobre o caso “cadastrei como vazia após IA” (você já fez o DG e marcou vazia)
  if(normRep.label==="Vazia")
    return { key:"IATF", label:"Iniciar IATF", dueDate:hoje, detail:{ sitReprod:"Vazia" } };

  return { key:"REVIEW", label:"Revisar dados", dueDate:null, detail:{ sitReprod:normRep.label } };
}

/* ================= Overlays/Modais ================= */
function Overlay({children,onClose}){
  return (
    <div onMouseDown={(e)=>e.target===e.currentTarget&&onClose?.()}
         style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}>
      {children}
    </div>
  );
}

function ProtocolPickerModal({ tipo, protocolos=[], onPick, onClose }){
  const list=protocolos.filter(p=>tipo==="IATF"?String(p.tipo||"").toUpperCase()==="IATF":String(p.tipo||"").toUpperCase()!=="IATF");
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"#fff",width:"min(560px,95vw)",borderRadius:14,overflow:"hidden",boxShadow:"0 10px 30px rgba(0,0,0,.25)"}}>
        <div style={{background:"#1F3FB6",color:"#fff",padding:"12px 16px",fontWeight:700}}>
          {tipo==="IATF"?"Escolher protocolo de IATF":"Escolher protocolo de Pré-sincronização"}
        </div>
        <div style={{padding:16}}>
          {list.length===0 && <div className="text-gray-600">Nenhum protocolo do tipo.</div>}
          <div className="space-y-2">
            {list.map(p=> (
              <div key={p.id} className="flex items-center justify-between" style={{border:"1px solid #e5e7eb",borderRadius:10,padding:12}}>
                <div>
                  <div className="font-semibold">{p.nome}</div>
                  <div className="text-xs text-gray-500">{(asArray(p.etapas)||[]).length} etapas • {p.tipo}</div>
                </div>
                <button className="botao-acao pequeno" onClick={()=>onPick?.(p)}>Aplicar</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2" style={{padding:12,borderTop:"1px solid #eee"}}>
          <button className="botao-cancelar" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Overlay>
  );
}

function QuickIAModal({ open, onClose, touros=[], inseminadores=[], onConfirm }){
  const [data,setData]=useState(formatBR(today()));
  const [touro,setTouro]=useState(touros[0]?.id || "");
  const [ins,setIns]=useState(inseminadores[0]?.id||"");
  const [obs,setObs]=useState("");
  useEffect(()=>{ if(open){ setTouro(touros[0]?.id||""); setIns(inseminadores[0]?.id||""); setData(formatBR(today())); setObs(""); }},[open,touros,inseminadores]);
  const selecionado = touros.find(t => t.id === touro);
  const semEstoque = !selecionado || (Number.isFinite(+selecionado?.restantes) && selecionado.restantes<=0);
  if(!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"#fff",width:"min(560px,95vw)",borderRadius:14,overflow:"hidden",boxShadow:"0 10px 30px rgba(0,0,0,.25)"}}>
        <div style={{background:"#1F3FB6",color:"#fff",padding:"12px 16px",fontWeight:700}}>IA Rápida (lote)</div>
        <div style={{padding:16}} className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label>Data</label>
            <input className="w-full border rounded px-2 py-1" value={data} onChange={e=>setData(e.target.value)} placeholder="dd/mm/aaaa"/>
          </div>
          <div className="col-span-1">
            <label>Touro</label>
            <select className="w-full border rounded px-2 py-1" value={touro} onChange={e=>setTouro(e.target.value)}>
              {touros.length===0
                ? <option value="">Nenhum touro cadastrado</option>
                : touros.map(t=>(
                    <option key={t.id} value={t.id} disabled={Number.isFinite(+t.restantes) && t.restantes<=0}>
                      {t.nome} {t.codigo||t.raca?`(${t.codigo||t.raca})`:""} • {Number.isFinite(+t.restantes)?`${t.restantes} rest.`:"—"}
                    </option>
                  ))
              }
            </select>
          </div>
          <div className="col-span-1">
            <label>Inseminador</label>
            <select className="w-full border rounded px-2 py-1" value={ins} onChange={e=>setIns(e.target.value)}>
              {inseminadores.length===0
                ? <option value="">Nenhum inseminador cadastrado</option>
                : inseminadores.map(i=> <option key={i.id} value={i.id}>{i.nome}</option>)
              }
            </select>
          </div>
          <div className="col-span-3">
            <label>Observação</label>
            <input className="w-full border rounded px-2 py-1" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Lote / observação (opcional)"/>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2" style={{padding:12,borderTop:"1px solid #eee"}}>
          <div className="text-sm text-gray-500">
            {Number.isFinite(+selecionado?.restantes) ? `Doses restantes do touro: ${selecionado.restantes}` : " "}
          </div>
          <div className="flex gap-2">
            <button className="botao-cancelar" onClick={onClose}>Cancelar</button>
            <button className="botao-acao" disabled={!touro || !ins || semEstoque} onClick={()=>onConfirm?.({data, touroId:touro, inseminadorId:ins, obs})}>Lançar IA</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/* ================= Drawer (conteúdo vindo de arquivos separados) ================= */
function RegistrarDrawer({ open, animal, initialTab="DG", onClose, children }){
  const [tab,setTab]=useState(initialTab);
  useEffect(()=>{ if(open) setTab(initialTab||"DG"); },[open,initialTab]);
  if(!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"#fff",width:"min(760px,96vw)",maxHeight:"90vh",borderRadius:14,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{background:"#1F3FB6",color:"#fff",padding:"12px 16px",fontWeight:700}}>Registrar • {animal?.numero} ({animal?.brinco})</div>
        <div style={{padding:12}}>
          <div className="flex gap-2 mb-2">
            {["DG","IA","PROTOCOLO","CLINICA"].map(t=>(
              <button key={t} className="botao-acao pequeno" onClick={()=>setTab(t)}
                style={{background:tab===t?"#1F3FB6":"#eef2ff",color:tab===t?"#fff":"#1F3FB6"}}>
                {t==="DG"?"Diagnóstico":t==="IA"?"Inseminação":t==="PROTOCOLO"?"Aplicar protocolo":"Ocorrência clínica"}
              </button>
            ))}
          </div>

          <div className="mt-2">
            {typeof children === "function" ? children(tab) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2" style={{padding:12,borderTop:"1px solid #eee"}}>
          <button className="botao-cancelar" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Overlay>
  );
}

function AjustesModal({ open, settings, onSave, onClose }){
  const [loc,setLoc]=useState(settings||DEFAULT_SETTINGS);
  useEffect(()=>{ if(open) setLoc(settings||DEFAULT_SETTINGS); },[open,settings]);
  if(!open) return null;
  const upd=(k,v)=>setLoc(p=>({...p,[k]:v}));
  const number=(v,min=0,max=999)=>{ const n=parseInt(v,10); if(Number.isNaN(n)) return ""; return Math.min(max,Math.max(min,n)); };
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"#fff",width:"min(720px,96vw)",borderRadius:14,overflow:"hidden",boxShadow:"0 10px 30px rgba(0,0,0,.25)"}}>
        <div style={{background:"#1F3FB6",color:"#fff",padding:"12px 16px",fontWeight:700}}>Ajustes reprodutivos</div>
        <div style={{padding:16}} className="grid grid-cols-3 gap-3">
          <div><label>Idade mínima (meses)</label><input className="w-full border rounded px-2 py-1" value={loc.idadeMinMeses} onChange={e=>upd("idadeMinMeses",number(e.target.value,0,60))}/></div>
          <div><label>VWP (dias)</label><input className="w-full border rounded px-2 py-1" value={loc.vwpDias} onChange={e=>upd("vwpDias",number(e.target.value,0,200))}/></div>
          <div><label>Pré-sincr. nos últimos (dias do PEV)</label><input className="w-full border rounded px-2 py-1" value={loc.presyncNoFinalDoPEV} onChange={e=>upd("presyncNoFinalDoPEV",number(e.target.value,0,30))}/></div>
          <div><label>DG30 (início)</label><input className="w-full border rounded px-2 py-1" value={loc.dg30janela[0]} onChange={e=>upd("dg30janela",[number(e.target.value,1,90),loc.dg30janela[1]])}/></div>
          <div><label>DG30 (fim)</label><input className="w-full border rounded px-2 py-1" value={loc.dg30janela[1]} onChange={e=>upd("dg30janela",[loc.dg30janela[0],number(e.target.value,1,120)])}/></div>
          <div><label>Permitir pré-sincr. em PEV</label>
            <select className="w-full border rounded px-2 py-1" value={loc.permitirPresyncEmPEV?"sim":"nao"} onChange={e=>upd("permitirPresyncEmPEV",e.target.value==="sim")}><option value="sim">Sim</option><option value="nao">Não</option></select>
          </div>
        </div>
        <div className="flex justify-end gap-2" style={{padding:12,borderTop:"1px solid #eee"}}>
          <button className="botao-cancelar" onClick={onClose}>Cancelar</button>
          <button className="botao-acao" onClick={()=>onSave?.(loc)}>Salvar ajustes</button>
        </div>
      </div>
    </Overlay>
  );
}

function Kebab({ onPrint, onAjustes, onDecisoes }){
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:"relative"}}>
      <button className="botao-acao pequeno" onClick={()=>setOpen(o=>!o)} title="Mais ações">⋯</button>
      {open && (
        <div
          onMouseDown={(e)=>e.stopPropagation()}
          style={{position:"absolute",right:0,top:"110%",background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,boxShadow:"0 8px 20px rgba(0,0,0,.12)",minWidth:200,zIndex:60}}
        >
          <button className="w-full text-left px-3 py-2 hover:bg-[#f5f7ff]" onClick={()=>{onPrint?.();setOpen(false);}}>🖨️ Imprimir lista</button>
          <button className="w-full text-left px-3 py-2 hover:bg-[#f5f7ff]" onClick={()=>{onAjustes?.();setOpen(false);}}>⚙️ Ajustes</button>
          <button className="w-full text-left px-3 py-2 hover:bg-[#f5f7ff]" onClick={()=>{onDecisoes?.();setOpen(false);}}>🧠 Decisões</button>
        </div>
      )}
    </div>
  );
}

/* ================= Decisões (CRUD simples local) ================= */
const DEC_KEY = "repro.decisoes";
const loadDecisions = ()=>{
  try{
    const raw=localStorage.getItem(DEC_KEY);
    const arr = raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr.filter(i => (i?.label||"") !== CLEAR_TOKEN):[];
  }catch{ return []; }
};
const saveDecisions = (arr)=>{ try{ localStorage.setItem(DEC_KEY, JSON.stringify(arr)); }catch{} };

/* --- MODAL de Decisões --- */
function DecisoesModal({ open, onClose, onSave }){
  const [items,setItems]=useState(loadDecisions());
  const [novo,setNovo]=useState("");
  useEffect(()=>{ if(open){ setItems(loadDecisions()); setNovo(""); } },[open]);
  if(!open) return null;

  const add=()=>{ const v=(novo||"").trim(); if(!v || v===CLEAR_TOKEN) return; setItems(p=>[...p,{id:crypto.randomUUID(),label:v}]); setNovo(""); };
  const del=(id)=> setItems(items.filter(i=>i.id!==id));
  const ren=(id,label)=> setItems(items.map(i=>i.id===id?{...i,label: (label===CLEAR_TOKEN?"":label)}:i));
  const persist=()=>{ saveDecisions(items); onSave?.(items); onClose?.(); };

  return (
    <Overlay onClose={onClose}>
      <div style={{background:"#fff",width:"min(560px,96vw)",borderRadius:14,overflow:"hidden"}}>
        <div style={{background:"#1F3FB6",color:"#fff",padding:"12px 16px",fontWeight:700}}>Gerenciar decisões do técnico</div>
        <div style={{padding:16}}>
          <div className="flex gap-2 mb-3">
            <input className="flex-1 border rounded px-2 py-1" placeholder="Ex.: Colocar IATF, Fazer Metricure…" value={novo} onChange={e=>setNovo(e.target.value)} />
            <button className="botao-acao" onClick={add}>Adicionar</button>
          </div>
          <ul className="space-y-2">
            {items.map(it=> (
              <li key={it.id} className="flex items-center gap-2">
                <input className="flex-1 border rounded px-2 py-1" value={it.label} onChange={e=>ren(it.id,e.target.value)} />
                <button className="botao-cancelar pequeno" onClick={()=>del(it.id)}>Remover</button>
              </li>
            ))}
            {items.length===0 && <div className="text-gray-500">Nenhuma decisão cadastrada ainda.</div>}
          </ul>
        </div>
        <div className="flex justify-end gap-2" style={{padding:12,borderTop:"1px solid #eee"}}>
          <button className="botao-cancelar" onClick={onClose}>Fechar</button>
          <button className="botao-acao" onClick={persist}>Salvar lista</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ================= chamadas de API ================= */
async function getProtocolosFromAPI(){
  try{
    const { data } = await api.get("/api/v1/reproducao/protocolos",{ params:{ limit:200 }});
    const items = Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
    return items.map(p=>({...p, tipo:String(p.tipo||"").toUpperCase(), etapas:asArray(p.etapas)}));
  }catch(e){
    console.warn("[Reproducao] Falha ao carregar protocolos:", e?.response?.status||e?.message);
    return [];
  }
}
async function getAnimaisFromAPI(){
  const pick = (o, ...keys) =>
    keys.find(k => o && o[k] !== undefined && o[k] !== null && o[k] !== "") ?? null;

  const normalize = (arr = []) => (arr || []).map(a => {
    const id = a?.id || a?.animal_id || a?.uuid;
    const ultimaIaKey = pick(a, "ultimaIa","ultimaIA","ultima_ia","data_ultima_ia");
    const prevPartoKey = pick(a, "previsaoParto","previsao_parto","prev_parto","previsao_parto_dt");
    const sitRepKey  = pick(a, "situacaoReprodutiva","situacao_reprodutiva","sit_reprodutiva","status_reprodutivo","situacao_rep","situacao_repro","sit_rep");
    const sitProdKey = pick(a, "situacaoProdutiva","situacao_produtiva","sit_produtiva","status_produtivo","statusProdutivo","estado_produtivo","estado","sit_prod");

    const base = {
      id,
      numero: a?.numero || a?.num || a?.codigo || "",
      brinco: a?.brinco || a?.ear || a?.tag || "",
      parto: a?.parto || a?.ultimo_parto || "",
      ultima_ia: a?.[ultimaIaKey] || "",
      ultimaIa: a?.[ultimaIaKey] || "",
      previsao_parto: a?.[prevPartoKey] || "",
      previsaoParto: a?.[prevPartoKey] || "",
      situacao_reprodutiva: a?.[sitRepKey] || "",
      situacaoReprodutiva: a?.[sitRepKey] || "",
      situacao_produtiva: a?.[sitProdKey] || "",
      situacaoProdutiva: a?.[sitProdKey] || "",
      decisao: (a?.decisao === CLEAR_TOKEN ? "" : (a?.decisao || "")),
      status_geral: String(a?.status_geral || a?.situacao || "").toLowerCase(),
    };

    const isPrenhe = String(base.situacao_reprodutiva || "").toLowerCase().includes("pren");
    if (isPrenhe && !base.previsao_parto) {
      const d = parseAnyDate(base.ultima_ia);
      if (d) {
        const computed = isoToBR(toISODate(addDays(d, 283)));
        base.previsao_parto = computed;
        base.previsaoParto = computed;
      }
    }
    return base;
  });

  let rep = [], ani = [];
  await Promise.allSettled([
    (async () => {
      try {
        const { data } = await api.get("/api/v1/reproducao/animais", { params:{ limit:1000 }});
        rep = Array.isArray(data?.items) ? normalize(data.items)
            : Array.isArray(data) ? normalize(data)
            : [];
      } catch (e) {
        rep = [];
      }
    })(),
    (async () => {
      try {
        const { data } = await api.get("/api/v1/animals", { params:{ limit:1000 }});
        ani = Array.isArray(data?.items) ? normalize(data.items)
            : Array.isArray(data) ? normalize(data)
            : [];
      } catch (e) {
        ani = [];
      }
    })(),
  ]);

  const mapAni = new Map((ani||[]).map(a => [a.id, a]));
  const mapRep = new Map((rep||[]).map(a => [a.id, a]));
  const ids = new Set([...mapAni.keys(), ...mapRep.keys()]);

  const merged = [];
  for (const id of ids) {
    const A = mapAni.get(id) || {};
    const R = mapRep.get(id) || {};
    // ⚠️ Dê preferência ao /reproducao/animais (R), que reflete DG/IA imediatamente
    const situacao_reprodutiva = (R.situacao_reprodutiva || A.situacao_reprodutiva || "").trim();
    const situacao_produtiva   = (R.situacao_produtiva   || A.situacao_produtiva   || "").trim();
    const parto                = R.parto || A.parto || "";
    const ultima_ia            = R.ultima_ia || A.ultima_ia || "";
    const previsao_parto       = (R.previsao_parto || A.previsao_parto || "");

    const out = {
      ...(R.id ? R : A),
      situacao_reprodutiva,
      situacaoReprodutiva: situacao_reprodutiva,
      situacao_produtiva,
      situacaoProdutiva: situacao_produtiva,
      parto,
      ultima_ia,
      ultimaIa: ultima_ia,
      previsao_parto,
      previsaoParto: previsao_parto,
    };

    if (!out.previsao_parto && String(out.situacao_reprodutiva||"").toLowerCase().includes("pren")) {
      const d = parseAnyDate(out.ultima_ia);
      if (d) {
        const computed = isoToBR(toISODate(addDays(d, 283)));
        out.previsao_parto = computed;
        out.previsaoParto = computed;
      }
    }
    merged.push(out);
  }
  return merged;
}
async function getTourosFromAPI(){
  try{
    const { data } = await api.get("/api/v1/genetica/touros", { params:{ limit:500 }});
    const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return arr.map(t => ({
      id: t.id,
      nome: t.nome,
      codigo: t.codigo ?? "",
      raca: t.raca ?? "",
      adquiridas: Number.isFinite(+t.doses_adquiridas) ? +t.doses_adquiridas : undefined,
      restantes: Number.isFinite(+t.doses_restantes) ? +t.doses_restantes : undefined,
    }));
  }catch(e){
    console.warn("[Reproducao] Falha ao carregar touros:", e?.response?.status || e?.message);
    return [];
  }
}
async function getInseminadoresFromAPI(){
  try{
    const { data } = await api.get("/api/v1/reproducao/inseminadores",{ params:{ limit:500 }});
    const arr = Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
    return arr.map(i=>({ id:i.id, nome:i.nome, registro:i.registro||"" }));
  }catch(e){
    console.warn("[Reproducao] Falha ao carregar inseminadores:", e?.response?.status || e?.message);
    return [];
  }
}

/* === PROTOCOLO: aceita data/hora/agenda === */
async function aplicarProtocoloAPI({
  protocolo_id,
  animaisIds,
  data_inicioISO,
  hora_inicio,
  criar_agenda,
  protocolo_ref,
  detalhes_comuns,
}){
  const payload = {
    protocolo_id,
    animais: animaisIds,
    data_inicio: data_inicioISO || toISODate(today()),
    ...(hora_inicio ? { hora_inicio } : {}),
    ...(typeof criar_agenda === "boolean" ? { criar_agenda } : {}),
    ...(protocolo_ref ? { protocolo_ref } : {}),
    ...(detalhes_comuns ? { detalhes_comuns } : {}),
  };
  const { data } = await api.post("/api/v1/reproducao/aplicar-protocolo", payload);
  return data;
}

async function postDiagnosticoAPI({ animal_id, resultado, dataISO, detalhes }){
  const payload={ animal_id, data:dataISO||toISODate(today()), tipo:"DIAGNOSTICO", resultado, ...(detalhes?{detalhes}:{}) };
  try {
    const { data } = await api.post("/api/v1/reproducao/diagnostico", payload);
    return data;
  } catch (e) {
    if (e?.response?.status === 422 && e.response?.data?.detail) {
      alert(e.response.data.detail);
    }
    throw e;
  }
}

/* === CLÍNICA: ocorrência + tratamentos + agenda + baixa de estoque === */
async function postClinicoAPI({
  animal_id,
  dataISO,
  clin,
  obs,
  tratamentos = [],
  criarAgenda = false,
  baixarEstoque = false,
}){
  const payload = {
    animal_id,
    data: dataISO || toISODate(today()),
    tipo: "TRATAMENTO",
    detalhes: {
      ocorrencia: clin,
      obs: obs || "",
      tratamentos,
      criar_agenda: !!criarAgenda,
      baixar_estoque: !!baixarEstoque,
    },
  };
  const { data } = await api.post("/api/v1/reproducao/eventos", payload);
  return data;
}

async function postIAAPI({ animal_id, dataISO, touroId, inseminadorId, obs }){
  const payload={
    animal_id,
    data: dataISO || toISODate(today()),
    detalhes: { touro_id:touroId, inseminador_id:inseminadorId, obs:obs||"" }
  };
  const { data } = await api.post("/api/v1/reproducao/ia", payload);
  return data;
}
async function postDecisaoAPI({ animal_id, decisao, dataISO }) {
  const payload = { animal_id, decisao, ...(dataISO ? { data: dataISO } : {}) };
  const { data } = await api.post("/api/v1/reproducao/decisao", payload);
  return data;
}
async function getUltimasDecisoesAPI(ids){
  if(!ids?.length) return [];
  const { data } = await api.post("/api/v1/reproducao/decisoes/ultimas", { ids });
  const arr = Array.isArray(data?.items)?data.items:[];
  // normaliza: ignora CLEAR_TOKEN vindo do backend
  return arr.map(it => ({ ...it, decisao: (it.decisao === CLEAR_TOKEN ? null : it.decisao) }));
}

/* ================= principal ================= */
export default function VisaoGeral({ animais: animaisProp, onCountChange }){
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [protocolos,setProtocolos]=useState([]);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [touros,setTouros]=useState([]);
  const [insems,setInsems]=useState([]);

  // Decisões
  const [decisoes,setDecisoes]=useState(loadDecisions());
  const decisionOptions = useMemo(
    ()=>decisoes
      .filter(d => (d?.label||"") !== CLEAR_TOKEN)
      .map(d=>({ value:d.id, label:d.label })),
    [decisoes]
  );
  const [decisaoPorAnimal,setDecisaoPorAnimal]=useState(()=>({}));

  const ensureDecisionExists = (label) => {
    const trimmed = (label||"").trim();
    if(!trimmed || trimmed === CLEAR_TOKEN) return null;
    const found = decisoes.find(d => d.label.trim().toLowerCase() === trimmed.toLowerCase());
    if(found) return found.id;
    const created = { id: crypto.randomUUID(), label: trimmed };
    const next = [...decisoes, created];
    setDecisoes(next); saveDecisions(next);
    return created.id;
  };

  // carrega base
  const reloadBase = async () => {
    setLoading(true); setErr("");
    try{
      const [protos, animais, t, i] = await Promise.all([
        getProtocolosFromAPI(), getAnimaisFromAPI(), getTourosFromAPI(), getInseminadoresFromAPI()
      ]);
      setProtocolos(protos);
      const fromProp = Array.isArray(animaisProp)&&animaisProp.length?animaisProp:null;
      const rowsData = fromProp||animais;
      setRows(rowsData);
      setTouros(t); setInsems(i);

      // últimas decisões
      const ids = rowsData.map(a=>a.id);
      if(ids.length){
        const ult = await getUltimasDecisoesAPI(ids);
        if(Array.isArray(ult) && ult.length){
          const mapSel = {};
          for(const it of ult){
            const idDec = ensureDecisionExists(it.decisao);
            if(idDec) mapSel[it.animal_id] = idDec;
          }
          if(Object.keys(mapSel).length) setDecisaoPorAnimal(prev=>({ ...prev, ...mapSel }));
        }
      }
    }catch(e){
      setErr("Falha ao carregar dados.");
      console.error("[VisaoGeral] load fail:", e);
    }finally{ setLoading(false); }
  };

  useEffect(()=>{ let alive=true; (async()=>{ if(!alive) return; await reloadBase(); })(); return ()=>{alive=false}; },[animaisProp]);

  const [selecionados,setSelecionados]=useState(new Set());
  const [busca,setBusca]=useState("");
  const [filtro,setFiltro]=useState("TODOS");

  const enhanced=useMemo(()=>{
    return rows.map(a=>{
      const normProd = classifyProd(a, settings);
      const normRep  = classifyReprod(a, settings, normProd);
      const _step    = buildStep(a, settings, normRep);
      return { ...a, normProd, normRep, _step };
    });
  },[rows,settings]);

  const visibleRows=useMemo(()=>{
    const base = enhanced.filter(a=>(`${a.numero}${a.brinco}`).toLowerCase().includes(busca.trim().toLowerCase()));
    const isAtras=r=>r._step.dueDate && diffDays(today(),r._step.dueDate)>0 && (r._step.key==="DG30"||r._step.key==="DG60");
    const inProx7=r=>r._step.dueDate && diffDays(r._step.dueDate,today())>=0 && diffDays(r._step.dueDate,today())<=7;
    switch(filtro){
      case "HOJE": return base.filter(r=>r._step.dueDate && diffDays(r._step.dueDate,today())===0);
      case "ATRASADAS": return base.filter(isAtras);
      case "PROX7": return base.filter(inProx7);
      case "DG30": return base.filter(r=>r._step.key==="DG30");
      case "DG60": return base.filter(r=>r._step.key==="DG60");
      case "PRESYNC": return base.filter(r=>r._step.key==="PRESYNC");
      case "IATF": return base.filter(r=>r._step.key==="IATF");
      case "PEND": return base.filter(r=>r._step.key==="REVIEW");
      default: return base;
    }
  },[enhanced,busca,filtro]);

  // contagem segura
  const lastLenRef=useRef(null);
  useEffect(()=>{ if(!onCountChange) return; if(lastLenRef.current!==visibleRows.length){ lastLenRef.current=visibleRows.length; onCountChange(visibleRows.length); }},[visibleRows.length,onCountChange]);

  const idsVisiveis=visibleRows.map(r=>r.id);
  const toggleSel=(id,ck)=>setSelecionados(s=>{const n=new Set(s); ck?n.add(id):n.delete(id); return n;});
  const toggleAll=(ck)=>setSelecionados(ck?new Set(idsVisiveis):new Set());

  // modais/drawers
  const [picker,setPicker]=useState(null); // {tipo,row} ou {tipo,lote:true}
  const [drawer,setDrawer]=useState({open:false,row:null,initialTab:"DG"});
  const [drawerPreset,setDrawerPreset]=useState(null); // { dg?: "Prenhe"|"Vazia" }
  const [ajustesOpen,setAjustesOpen]=useState(false);
  const [iaLoteOpen,setIaLoteOpen]=useState(false);
  const [decisoesOpen,setDecisoesOpen]=useState(false);

  /* ===== helpers touros (estado) ===== */
  const debitaDoseLocal = (touroId, qtd=1) => {
    if(!touroId || !qtd) return;
    setTouros(prev => prev.map(t => t.id===touroId
      ? ({ ...t, restantes: Number.isFinite(+t.restantes) ? Math.max(0, t.restantes - qtd) : t.restantes })
      : t
    ));
  };

  /* ===== ações ===== */
  // Protege para NÃO despromover "Prenhe" ao aplicar protocolo
  const aplicarProtocolo = async (row, prot, extras = {})=>{
    try{
      const dataISO = extras?.dataInicioBR ? brToISO(extras.dataInicioBR) : toISODate(today());

      await aplicarProtocoloAPI({
        protocolo_id:prot.id,
        animaisIds:[row.id],
        data_inicioISO:dataISO,
        hora_inicio: extras?.horaInicio || null,
        criar_agenda: !!extras?.criarAgenda,
        protocolo_ref: prot,
      });

      const label = String(prot.tipo || "").toUpperCase() === "IATF" ? "IATF" : "Pré-sincronização";
      setRows(prev => prev.map(a => {
        if (a.id !== row.id) return a;
        const atual = a.situacaoReprodutiva ?? a.situacao_reprodutiva ?? "";
        const manterPrenhe = String(atual||"").toLowerCase().includes("prenhe");
        const valor = manterPrenhe ? atual : label;
        return { ...a, situacao_reprodutiva: valor, situacaoReprodutiva: valor };
      }));

      await reloadBase();
    }catch(e){ console.error("Aplicar protocolo:", e); alert("Não foi possível aplicar o protocolo."); }
    finally{ setPicker(null); }
  };
  const aplicarProtocoloLote = async (prot, extras = {})=>{
    const ids=Array.from(selecionados); if(!ids.length){ setPicker(null); return; }
    try{
      const dataISO = extras?.dataInicioBR ? brToISO(extras.dataInicioBR) : toISODate(today());

      await aplicarProtocoloAPI({
        protocolo_id:prot.id,
        animaisIds:ids,
        data_inicioISO:dataISO,
        hora_inicio: extras?.horaInicio || null,
        criar_agenda: !!extras?.criarAgenda,
        protocolo_ref: prot,
      });

      const label = String(prot.tipo || "").toUpperCase() === "IATF" ? "IATF" : "Pré-sincronização";
      setRows(prev => prev.map(a => {
        if (!ids.includes(a.id)) return a;
        const atual = a.situacaoReprodutiva ?? a.situacao_reprodutiva ?? "";
        const manterPrenhe = String(atual||"").toLowerCase().includes("prenhe");
        const valor = manterPrenhe ? atual : label;
        return { ...a, situacao_reprodutiva: valor, situacaoReprodutiva: valor };
      }));

      setSelecionados(new Set());
      await reloadBase();
    }catch(e){ console.error("Aplicar protocolo (lote):", e); alert("Falha ao aplicar protocolo ao lote."); }
    finally{ setPicker(null); }
  };
  const handleSugestao=(row)=>{
    const k=row._step.key;
    if(k==="IATF") setPicker({tipo:"IATF",row});
    else if(k==="PRESYNC") setPicker({tipo:"PRESYNC",row});
    else if(k==="DG30"||k==="DG60") setDrawer({open:true,row,initialTab:"DG"});
    else if(k==="IA") setDrawer({open:true,row,initialTab:"IA"});
  };

  const refreshAnimaisAfterChange = async () => {
    try {
      const animais = await getAnimaisFromAPI();
      setRows(animais);
      const ids = animais.map(a=>a.id);
      if(ids.length){
        const ult = await getUltimasDecisoesAPI(ids);
        const mapSel = {};
        for(const it of ult){
          const idDec = ensureDecisionExists(it.decisao);
          if(idDec) mapSel[it.animal_id] = idDec;
        }
        if(Object.keys(mapSel).length) setDecisaoPorAnimal(prev=>({ ...prev, ...mapSel }));
      }
    } catch (e) {
      console.warn("Refresh animais falhou:", e?.message);
    }
  };

  const handleRegistrarSubmit= async (payload)=>{
    const row=drawer.row; if(!row) return;
    try{
      if(payload.kind==="DG"){
        const mapa={ "Prenhe":"prenhe", "Vazia":"vazia", "Não vista":"indeterminado" };
        const resultado=mapa[payload.dg]||"indeterminado";
        const dataISO=brToISO(payload.data)||toISODate(today());

        const resp = await postDiagnosticoAPI({
          animal_id:row.id,
          resultado,
          dataISO,
          detalhes: payload.extras || {}
        });

        // Atualização OTIMISTA após DG usando retorno do backend
        setRows(prev => prev.map(a => {
          if (a.id !== row.id) return a;

          // 1) usa o que o backend retornou (ideal)
          let novaSit = resp?.situacaoReprodutiva
            || resp?.situacao_reprodutiva
            || a.situacaoReprodutiva
            || a.situacao_reprodutiva;
          const ppIso = resp?.previsaoParto || resp?.previsao_parto || null;
          let ppBR = ppIso ? isoToBR(ppIso) : (a.previsaoParto || a.previsao_parto);

          // 2) fallback otimista caso o backend ainda não atualize imediatamente
          if (!resp?.situacaoReprodutiva && !resp?.situacao_reprodutiva && resultado === "prenhe") {
            // manter otimista; front exibe bonito via classifyReprod
            novaSit = "prenhe";
            const ia = parseAnyDate(a.ultimaIa ?? a.ultima_ia);
            if (ia) ppBR = formatBR(addDays(ia, 283));
          }

          return {
            ...a,
            situacao_reprodutiva: novaSit,
            situacaoReprodutiva: novaSit,
            previsao_parto: ppBR,
            previsaoParto: ppBR,
          };
        }));

        await refreshAnimaisAfterChange();
      }else if(payload.kind==="PROTOCOLO"){
        const p=protocolos.find(x=>x.id===payload.protocoloId);
        if(p){
          await aplicarProtocolo(row,p,{
            dataInicioBR: payload.dataInicio,
            horaInicio: payload.horaInicio,
            criarAgenda: !!payload.criarAgenda,
          });
        }
      }else if(payload.kind==="CLINICA"){
        await postClinicoAPI({
          animal_id: row.id,
          dataISO: toISODate(new Date()),
          clin: payload.clin,
          obs: payload.obs,
          tratamentos: payload.tratamentos || [],
          criarAgenda: !!payload.criarAgenda,
          baixarEstoque: !!payload.baixarEstoque,
        });
        alert(`Ocorrência clínica registrada para ${row.numero} (${row.brinco}).`);
        await refreshAnimaisAfterChange();
      }else if(payload.kind==="IA"){
        const dataISO=brToISO(payload.data)||toISODate(today());
        await postIAAPI({ animal_id:row.id, dataISO, touroId:payload.touroId, inseminadorId:payload.inseminadorId, obs:payload.obs });
        setRows(prev => prev.map(a => a.id===row.id ? {
          ...a,
          ultima_ia: isoToBR(dataISO) || a.ultima_ia,
          ultimaIa: isoToBR(dataISO) || a.ultimaIa,
          // guardamos como veio do backend (minúsculo) para a classificação ficar estável
          situacao_reprodutiva: "inseminada",
          situacaoReprodutiva: "inseminada",
        } : a));
        debitaDoseLocal(payload.touroId, 1);
        await refreshAnimaisAfterChange();
      }
    }catch(e){ console.error("Registrar falhou:", e); alert(e?.response?.data?.detail || "Não foi possível salvar o registro."); }
    finally{
      setDrawer({open:false,row:null,initialTab:"DG"});
      setDrawerPreset(null);
    }
  };

  // DG rápido: abre drawer se houver 1 selecionado; caso contrário faz lote
  const dgRapidoAbrirOuLote = async (res)=>{
    const ids = Array.from(selecionados);
    if (ids.length === 1) {
      const row = rows.find(r => r.id === ids[0]);
      if (row) {
        setDrawerPreset({ dg: res });
        setDrawer({ open:true, row, initialTab:"DG" });
      }
      return;
    }
    if(!ids.length) return;
    const mapa={ "Prenhe":"prenhe", "Vazia":"vazia" };
    const resultado=mapa[res]||"indeterminado";
    const dataISO=toISODate(today());
    try{
      for(const id of ids) await postDiagnosticoAPI({ animal_id:id, resultado, dataISO });
      // otimista de lote (minúsculo; UI formata)
      setRows(prev => prev.map(a => {
        if (!ids.includes(a.id)) return a;
        const valor = (resultado==="prenhe"?"prenhe":"vazia");
        return { ...a, situacao_reprodutiva: valor, situacaoReprodutiva: valor };
      }));
      await refreshAnimaisAfterChange();
    }catch(e){ console.error("DG rápido (lote):", e); alert("Não foi possível registrar o DG rápido."); }
    finally{ setSelecionados(new Set()); }
  };

  // Aplicar protocolo (botão rápido): 1 selecionado abre drawer PROTOCOLO; >1 abre picker em lote
  const protocoloRapido = (tipo) => {
    const ids = Array.from(selecionados);
    if (ids.length === 1) {
      const row = rows.find(r => r.id === ids[0]);
      if (row) setDrawer({ open:true, row, initialTab:"PROTOCOLO" });
    } else if (ids.length > 1) {
      setPicker({ tipo, lote:true });
    }
  };

  const iaRapidaConfirm = async ({ data, touroId, inseminadorId, obs })=>{
    const ids=Array.from(selecionados); if(!ids.length){ setIaLoteOpen(false); return; }
    const dataISO=brToISO(data)||toISODate(today());
    const tSel = touros.find(t=>t.id===touroId);
    theSaldo: {
      const saldo = Number.isFinite(+tSel?.restantes) ? tSel.restantes : Infinity;
      if (Number.isFinite(saldo) && saldo < ids.length) {
        const cont = confirm(`Este touro tem apenas ${saldo} dose(s) restante(s). Deseja lançar IA para até ${saldo} animal(is)?`);
        if(!cont) { return; }
      }
    }
    let sucesso=0;
    try{
      for(const id of ids){
        await postIAAPI({ animal_id:id, dataISO, touroId, inseminadorId, obs });
        sucesso++;
      }
      if(sucesso>0){
        debitaDoseLocal(touroId, sucesso);
        setRows(prev => prev.map(a => ids.includes(a.id) ? {
          ...a,
          ultima_ia: isoToBR(dataISO) || a.ultima_ia,
          ultimaIa: isoToBR(dataISO) || a.ultimaIa,
          // mantemos minúsculo para bater com o backend e reaproveitar a classificação
          situacao_reprodutiva:"inseminada",
          situacaoReprodutiva:"inseminada",
        } : a));
      }
      await refreshAnimaisAfterChange();
    }catch(e){
      console.error("IA rápida lote:", e);
      alert(e?.response?.data?.detail || "Falha ao lançar IA em lote.");
    }finally{
      setSelecionados(new Set()); setIaLoteOpen(false);
    }
  };

  const printLista=()=>window.print();

  const onChangeDecision = async (animalId, option) => {
    // UI imediata
    setDecisaoPorAnimal(prev => {
      const next = { ...prev };
      if (!option) delete next[animalId]; else next[animalId] = option.value;
      return next;
    });

    // Persistência:
    try {
      if (!option) {
        await postDecisaoAPI({ animal_id: animalId, decisao: CLEAR_TOKEN });
        return;
      }
      const label = (decisoes.find(d => d.id === option.value)?.label || "").trim();
      if (!label) return;
      await postDecisaoAPI({ animal_id: animalId, decisao: label });
    } catch (e) {
      console.error("[Decisão] falha ao salvar:", e);
      alert("Não foi possível salvar a decisão no servidor.");
    }
  };

  const onCreateDecision = async (label, animalId) => {
    const trimmed = (label || "").trim();
    if (!trimmed || trimmed === CLEAR_TOKEN) return;
    const newItem = { id: crypto.randomUUID(), label: trimmed };
    const newList = [...decisoes, newItem];
    setDecisoes(newList);
    saveDecisions(newList);
    setDecisaoPorAnimal(prev => ({ ...prev, [animalId]: newItem.id }));
    try {
      await postDecisaoAPI({ animal_id: animalId, decisao: newItem.label });
    } catch (e) {
      console.error("[Decisão] falha ao salvar (create):", e);
      alert("Não foi possível salvar a decisão no servidor.");
    }
  };

  useEffect(() => {
    if (!rows?.length) return;
    const novo = {};
    for (const a of rows) {
      const txt = (a.decisao || "").trim();
      if (!txt || txt === CLEAR_TOKEN) continue;
      const id = ensureDecisionExists(txt);
      if(id) novo[a.id] = id;
    }
    if (Object.keys(novo).length) {
      setDecisaoPorAnimal(prev => ({ ...prev, ...novo }));
    }
  }, [rows]);

  /* ================= UI ================= */
  return (
    <section className="w-full py-6 font-sans">
      <div className="px-3 md:px-5">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3">
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} className="border rounded px-3 py-2" title="Filtro">
            <option value="TODOS">Todas</option>
            <optgroup label="Fila">
              <option value="HOJE">Hoje</option><option value="ATRASADAS">Atrasadas</option><option value="PROX7">Próx 7 dias</option>
            </optgroup>
            <optgroup label="Diagnóstico">
              <option value="DG30">DG 30d</option><option value="DG60">DG 60d</option>
            </optgroup>
            <optgroup label="Protocolos">
              <option value="PRESYNC">Pré-sincr.</option><option value="IATF">IATF</option>
            </optgroup>
            <option value="PEND">Pendências</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <input className="border rounded px-3 py-2" placeholder="Buscar nº/brinco…" value={busca} onChange={e=>setBusca(e.target.value)} style={{minWidth:240}}/>
            <Kebab onPrint={printLista} onAjustes={()=>setAjustesOpen(true)} onDecisoes={()=>setDecisoesOpen(true)} />
          </div>
        </div>

        {err && <div className="mb-2 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900">{err}</div>}

        {/* tabela */}
        <table className={tableClasses}>
          <thead>
            <tr>
              <th className={thClass} style={{width:28}}>
                <input type="checkbox" checked={idsVisiveis.length>0 && idsVisiveis.every(id=>selecionados.has(id))} onChange={e=>toggleAll(e.target.checked)}/>
              </th>
              {[
                "Número","Brinco","DEL","Última IA","Parto previsto",
                "Sit. Reprodutiva","Sit. Produtiva","Decisão","Ação sugerida","Ações"
              ].map(h=> <th key={h} className={thClass}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className={tdBase} colSpan={11}><div className="text-center text-gray-600 py-6">Carregando…</div></td></tr>
            ) : (
              <>
                {visibleRows.map(r=>{
                  const DEL=r.parto?diasDesde(r.parto):"—";
                  const partoPrev=formatBR(calcPrevisaoParto(r));
                  const tone=r._step.key==="DG30"||r._step.key==="DG60"?"info":r._step.key==="IATF"||r._step.key==="PRESYNC"?"ok":r._step.key==="REVIEW"?"warn":"neutro";
                  const sugText=r._step.label+(r._step.dueDate?` • ${formatBR(r._step.dueDate)}`:"");

                  const selectedId = decisaoPorAnimal[r.id] || null;
                  const selectedOpt = decisionOptions.find(o=>o.value===selectedId) || null;

                  const ultimaIaFmt = (() => {
                    const dt = parseAnyDate(r.ultimaIa ?? r.ultima_ia);
                    return dt ? formatBR(dt) : (r.ultimaIa || r.ultima_ia || "—");
                  })();

                  return (
                    <tr key={r.id} className={rowAlt}>
                      <td className={tdBase}><input type="checkbox" checked={selecionados.has(r.id)} onChange={e=>toggleSel(r.id,e.target.checked)}/></td>
                      <td className={tdBase}>{r.numero}</td>
                      <td className={tdBase}>{r.brinco}</td>
                      <td className={tdBase}>{DEL}</td>
                      <td className={tdBase}>{ultimaIaFmt}</td>
                      <td className={tdBase}>{partoPrev}</td>
                      <td className={tdBase}>{badge(r.normRep.label, r.normRep.tone)}</td>
                      <td className={tdBase}>{badge(r.normProd.label, r.normProd.tone)}</td>
                      <td className={tdBase} style={{minWidth:220}}>
                        <CreatableSelect
                          isClearable
                          placeholder="Escolher/Adicionar…"
                          value={selectedOpt}
                          onChange={(opt)=>onChangeDecision(r.id,opt)}
                          onCreateOption={(label)=>onCreateDecision(label, r.id)}
                          options={decisionOptions}
                          classNamePrefix="rs"
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          styles={{ menuPortal: base => ({ ...base, zIndex: 60 }) }}
                        />
                      </td>

                      {/* AÇÃO SUGERIDA */}
                      <td className={tdBase}>
                        <button
                          className="botao-acao pequeno"
                          style={{
                            background:tone==="ok"?"#ecfdf5":tone==="info"?"#e0f2fe":tone==="warn"?"#fff7ed":"#eef2ff",
                            color:tone==="ok"?"#065f46":tone==="info"?"#075985":tone==="warn"?"#9a3412":"#1e40af",
                            borderColor:"transparent"
                          }}
                          disabled={r._step.key==="NONE"}
                          onClick={()=>handleSugestao(r)}
                        >
                          {sugText}
                        </button>
                      </td>

                      {/* AÇÕES — botão Registrar abre direto o drawer (DG) */}
                      <td className={tdBase}>
                        <RegistrarButton onOpen={()=>{ setDrawerPreset(null); setDrawer({open:true,row:r,initialTab:"DG"}); }} />
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length===0 && (
                  <tr><td className={tdBase} colSpan={11}><div className="text-center text-gray-600 py-6">Nenhum dado encontrado.</div></td></tr>
                )}
              </>
            )}
          </tbody>
        </table>

        {/* barra de ações em lote */}
        {selecionados.size>0 && (
          <div className="flex items-center gap-2 mt-3"
               style={{position:"sticky",bottom:0,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"8px 10px",boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
            <div style={{fontWeight:700}}>Selecionados: {selecionados.size}</div>
            <span className="text-gray-400">|</span>
            {/* DG rápido */}
            <button className="botao-acao pequeno" onClick={()=>dgRapidoAbrirOuLote("Prenhe")}>DG: Prenhe</button>
            <button className="botao-acao pequeno" onClick={()=>dgRapidoAbrirOuLote("Vazia")}>DG: Vazia</button>
            <span className="text-gray-400">|</span>
            <button className="botao-acao pequeno" onClick={()=>protocoloRapido("IATF")}>Aplicar protocolo… (IATF)</button>
            <button className="botao-acao pequeno" onClick={()=>protocoloRapido("PRESYNC")}>Aplicar protocolo… (Pré-sincr.)</button>
            <span className="text-gray-400">|</span>
            <button className="botao-acao pequeno" onClick={()=>setIaLoteOpen(true)} disabled={touros.length===0 || insems.length===0}>IA Rápida (lote)</button>
          </div>
        )}

        <div className="text-xs text-gray-500 mt-2">
          * Produtiva: Lactante, Seca (≈60d antes do parto) e Pré-parto (≈21d antes). Reprodutiva: PEV, Pré-sincr., Inseminada, Prenhe, Vazia.
        </div>
      </div>

      {/* Modais auxiliares */}
      {picker && !picker.lote && (
        <ProtocolPickerModal tipo={picker.tipo} protocolos={protocolos}
          onPick={(p)=>aplicarProtocolo(picker.row,p)} onClose={()=>setPicker(null)} />
      )}
      {picker && picker.lote && (
        <ProtocolPickerModal tipo={picker.tipo} protocolos={protocolos}
          onPick={(p)=>aplicarProtocoloLote(p)} onClose={()=>setPicker(null)} />
      )}
      <QuickIAModal open={iaLoteOpen} onClose={()=>setIaLoteOpen(false)}
        touros={touros} inseminadores={insems}
        onConfirm={iaRapidaConfirm}/>

      {/* Drawer principal — conteúdo vem dos arquivos individuais */}
      <RegistrarDrawer
        open={drawer.open}
        animal={drawer.row}
        initialTab={drawer.initialTab}
        onClose={()=>{ setDrawer({open:false,row:null,initialTab:"DG"}); setDrawerPreset(null); }}
      >
        {(tab) => {
          if (tab === "IA") {
            return (
              <Inseminacao
                animal={drawer.row}
                touros={touros}
                inseminadores={insems}
                onSubmit={handleRegistrarSubmit}
              />
            );
          }
          if (tab === "PROTOCOLO") {
            return (
              <AplicarProtocolo
                animal={drawer.row}
                protocolos={protocolos}
                onSubmit={handleRegistrarSubmit}
              />
            );
          }
          if (tab === "CLINICA") {
            return (
              <OcorrenciaClinica
                animal={drawer.row}
                onSubmit={handleRegistrarSubmit}
              />
            );
          }
          // default: DG
          return (
            <Diagnostico
              animal={drawer.row}
              presetResultado={drawerPreset?.dg}
              onSubmit={handleRegistrarSubmit}
            />
          );
        }}
      </RegistrarDrawer>

      <AjustesModal open={ajustesOpen} settings={settings}
        onSave={(s)=>{setSettings(s);setAjustesOpen(false);}} onClose={()=>setAjustesOpen(false)} />
      <DecisoesModal open={decisoesOpen} onClose={()=>setDecisoesOpen(false)} onSave={(arr)=>{ setDecisoes(arr); saveDecisions(arr); }} />
    </section>
  );
}
