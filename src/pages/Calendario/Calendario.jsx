// src/pages/Calendario/Calendario.jsx
import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";

import useBuscadeCalendario, { TIPOS } from "./BuscadeCalendario";
import RoletaModal from "./RoletaModal";

const ICONES = {
  parto: "/icones/parto.png",
  secagem: "/icones/secagem.png",
  dispositivo: "/icones/dispositivoIATF.png",
  hormonio: "/icones/aplicacao.png",
  tratamento: "/icones/tratamento.png",
  protocolo: "/icones/protocoloIATF.png",
  vacina: "/icones/aplicacao.png",
  preparto: null, exame: null, limpeza: null, estoque: null, checkup: null,
};
const getIcone = (tipo) => ICONES[tipo] || null;

export default function Calendario() {
  const {
    eventos, overview,
    categorias, setCategorias,
    mostrarRotineiros, setMostrarRotineiros,
    setRangeAndRefresh, createLembrete,
  } = useBuscadeCalendario();

  const [diaRoleta, setDiaRoleta] = useState(null);
  const [modalLembrete, setModalLembrete] = useState(false);

  useEffect(() => {
    const id="cal-smartcow-css";
    if (document.getElementById(id)) return;
    const el=document.createElement("style");
    el.id=id; el.innerHTML = css;
    document.head.appendChild(el);
  }, []);

  const eventContent = (info) => {
    const tipo = info.event.extendedProps?.tipo;
    const icon = tipo ? getIcone(tipo) : null;
    if (!icon) return null;
    return { domNodes: [ (() => {
      const img = document.createElement("img");
      img.src = icon; img.alt = tipo; img.className = "icone-tarefa";
      const wrap = document.createElement("div"); wrap.appendChild(img); return wrap;
    })() ] };
  };

  const [novo, setNovo] = useState({ data: "", tipo: "checkup", titulo:"", prioridade:true });
  const salvarLembrete = async () => {
    if (!novo.data || !novo.titulo) return;
    await createLembrete({ start: novo.data, end: novo.data, tipo: novo.tipo, title: novo.titulo, prioridadeVisual: novo.prioridade });
    setModalLembrete(false);
  };

  return (
    <div className="w-full min-h-screen bg-white p-6 overflow-auto">
      <h1 className="text-3xl font-bold mb-3 text-blue-900 text-center">📅 Calendário de Atividades</h1>

      <div className="toolbar">
        <div className="chips">
          {TIPOS.map((t) => (
            <label key={t} className="chip">
              <input
                type="checkbox"
                checked={!!categorias[t]}
                onChange={() => setCategorias((p)=>({ ...p, [t]: !p[t] }))}
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
          <label className="chip">
            <input type="checkbox" checked={mostrarRotineiros} onChange={()=>setMostrarRotineiros(p=>!p)} />
            <span>Rotineiros</span>
          </label>
        </div>
        <div className="spacer" />
        <button className="btn-primaria" onClick={()=>setModalLembrete(true)}>+ Lembrete</button>
      </div>

      <div className="cal-card">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={ptBrLocale}
          timeZone="local"
          height="auto"
          events={eventos}
          eventContent={eventContent}
          selectable
          dateClick={(info)=>setDiaRoleta(info.dateStr)}
          datesSet={(arg)=>setRangeAndRefresh({ start: arg.startStr.slice(0,10), end: arg.endStr.slice(0,10) })}
        />
      </div>

      <div className="overview">
        <div className="overview-grid">
          {overview.barras.length ? overview.barras.map((b)=>(
            <div key={b.tipo} className="ov-card">
              <div className="ov-head">
                <div className="ov-left">
                  {ICONES[b.tipo] ? <img src={ICONES[b.tipo]} alt={b.tipo} className="w-4 h-4" /> : <span>•</span>}
                  <span className="capitalize">{b.tipo}</span>
                </div>
                <span className="ov-count">{b.qtd}</span>
              </div>
              <div className="ov-bar"><div style={{width:`${b.pct}%`}} /></div>
            </div>
          )) : <div className="muted">Nenhum evento no período.</div>}
        </div>
      </div>

      {diaRoleta && (
        <RoletaModal
          initialISO={diaRoleta}
          onClose={()=>setDiaRoleta(null)}
          eventos={eventos}
          getIcone={getIcone}
        />
      )}

      {modalLembrete && (
        <div className="overlay" onClick={()=>setModalLembrete(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <h2 className="modal-title">➕ Adicionar Lembrete</h2>
            <div className="form-grid">
              <label className="lbl"><span>Data</span>
                <input className="inp" type="date" value={novo.data} onChange={e=>setNovo(p=>({...p, data:e.target.value}))}/>
              </label>
              <label className="lbl"><span>Tipo</span>
                <select className="inp" value={novo.tipo} onChange={e=>setNovo(p=>({...p, tipo:e.target.value}))}>
                  {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="lbl lbl-colspan"><span>Título / Descrição</span>
                <input className="inp" value={novo.titulo} onChange={e=>setNovo(p=>({...p, titulo:e.target.value}))} placeholder="Ex.: Aplicar GnRH em lote X" />
              </label>
              <label className="chk">
                <input type="checkbox" checked={novo.prioridade} onChange={()=>setNovo(p=>({...p, prioridade:!p.prioridade}))}/>
                Mostrar em destaque no mês
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-sec" onClick={()=>setModalLembrete(false)}>Cancelar</button>
              <button className="btn-primaria" onClick={salvarLembrete}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
.fc-daygrid-day:hover{ background:#f0f4ff; border-radius:8px; transition:background-color .2s ease; }
.fc-event{ border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,.08); font-weight:500; }
.icone-tarefa{ width:16px; height:16px; margin:2px; }

.btn-primaria{ background:#1e3a8a; color:#fff; border:none; border-radius:10px; padding:.5rem 1rem; font-weight:600; box-shadow:0 2px 6px rgba(30,58,138,.25); }
.btn-primaria:hover{ filter:brightness(.95); }
.btn-sec{ background:#e5e7eb; border:none; border-radius:10px; padding:.5rem 1rem; font-weight:600; }

.overlay{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; }
.modal{ background:#fff; padding:1.25rem; border-radius:14px; width:92%; max-width:620px; animation:fadeIn .25s ease; }
.modal-title{ font-weight:800; margin-bottom:.75rem; color:#1e3a8a; }
.form-grid{ display:grid; grid-template-columns:1fr 1fr; gap:.75rem 1rem; align-items:end; }
.lbl{ display:flex; flex-direction:column; gap:.35rem; font-size:.9rem; }
.lbl-colspan{ grid-column:1 / -1; }
.inp{ border:1px solid #d9e1f5; border-radius:10px; padding:.55rem .7rem; outline:none; }
.inp:focus{ border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
.chk{ display:flex; align-items:center; gap:.5rem; }
.modal-actions{ display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }

.cal-card{ max-width: 1120px; margin: 0 auto 16px; background:#fff; padding:12px; border-radius:14px; box-shadow:0 8px 18px rgba(16,24,40,.06); }
.toolbar{
  position: sticky; top: 8px; z-index: 5;
  display:flex; align-items:center; gap:12px;
  background: rgba(255,255,255,.92); backdrop-filter: blur(6px);
  border:1px solid #e9eef6; border-radius:12px; padding:.5rem .75rem;
  box-shadow:0 10px 20px rgba(16,24,40,.06);
  max-width:1120px; margin: 0 auto 10px;
}
.toolbar .chips{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.toolbar .chip{ display:flex; gap:6px; align-items:center; font-size:.9rem; padding:2px 8px; border-radius:999px; border:1px solid #e9eef6; background:#f8fbff; }
.toolbar .spacer{ flex:1; }

.overview{ max-width:1120px; margin: 8px auto 24px; }
.muted{ color:#667085; font-weight:500; }
.overview-grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:12px; margin-top:12px; }
.ov-card{ padding:12px; border:1px solid #eaeef6; border-radius:12px; background:#f7faff; }
.ov-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.ov-left{ display:flex; align-items:center; gap:8px; font-weight:600; color:#1e3a8a; }
.ov-count{ font-size:.85rem; color:#344054; }
.ov-bar{ height:8px; border-radius:999px; background:#e9eefc; overflow:hidden; }
.ov-bar > div{ height:8px; background:#3b82f6; border-radius:999px; }

@keyframes fadeIn{ from{opacity:0; transform:scale(.98)} to{opacity:1; transform:scale(1)} }
`;
