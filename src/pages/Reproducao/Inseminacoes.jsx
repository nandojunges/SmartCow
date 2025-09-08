// -----------------------------------------------------------------------------
// Inseminações — lista + filtros (usa eventos do backend; fallback demo)
// -----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import api from "../../api";

const fmtBR = (iso)=> iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const DEMO = [
  { id:"e1", animal_id:"a1", numero:"1023", brinco:"B-88", data:"2025-08-15", tipo:"IA", detalhes:{ touro_id:"t1", touro_nome:"TopGun 123", inseminador_id:"i1", obs:"Lote A" }, resultado:null },
  { id:"e2", animal_id:"a2", numero:"1045", brinco:"C-12", data:"2025-08-01", tipo:"IA", detalhes:{ touro_id:"t2", touro_nome:"Apollo 77", inseminador_id:"i2", obs:"" }, resultado:null },
];

export default function Inseminacoes(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [filtro,setFiltro]=useState({ periodo:"30", touro:"", inseminador:"", q:"" });

  useEffect(()=>{
    let alive=true;
    (async()=>{
      setLoading(true);
      try{
        const { data } = await api.get("/api/v1/reproducao/eventos", { params:{ limit:1000, sort:"data", order:"DESC" }});
        const items = Array.isArray(data?.items)?data.items:Array.isArray(data)?data:[];
        const ia = items.filter(e=>String(e.tipo).toUpperCase()==="IA")
                        .map(e=>({ ...e, numero:e.numero||e.animal_numero, brinco:e.brinco||e.animal_brinco }));
        setRows(ia.length?ia:DEMO);
      }catch(e){ setRows(DEMO); }
      finally{ if(alive) setLoading(false); }
    })();
    return ()=>{alive=false};
  },[]);

  const filtered = useMemo(()=>{
    const n=Number(filtro.periodo||0);
    const minTs = n? (Date.now() - n*24*3600*1000) : 0;
    const q=(filtro.q||"").toLowerCase().trim();
    return rows.filter(r=>{
      const okP = !n || (new Date(r.data).getTime()>=minTs);
      const okT = !filtro.touro || r?.detalhes?.touro_id===filtro.touro;
      const okI = !filtro.inseminador || r?.detalhes?.inseminador_id===filtro.inseminador;
      const okQ = !q || `${r.numero}${r.brinco}`.toLowerCase().includes(q);
      return okP && okT && okI && okQ;
    });
  },[rows,filtro]);

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-3 md:px-5">
        <div className="flex items-center gap-3 mb-3">
          <select className="border rounded px-3 py-2" value={filtro.periodo} onChange={e=>setFiltro(f=>({...f,periodo:e.target.value}))}>
            <option value="30">Últimos 30 dias</option>
            <option value="60">Últimos 60 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="0">Tudo</option>
          </select>
          <input className="border rounded px-3 py-2" placeholder="Buscar nº/brinco…" value={filtro.q} onChange={e=>setFiltro(f=>({...f,q:e.target.value}))}/>
          <div className="ml-auto">
            <button className="botao-acao" onClick={()=>window.print()}>Imprimir</button>
          </div>
        </div>

        <table className="w-full border-separate [border-spacing:0_6px] text-[14px]">
          <thead>
            <tr>
              {["Data","Número","Brinco","Touro","Inseminador","Obs."].map(h=><th key={h} className="bg-[#e6f0ff] px-3 py-2 text-left font-bold text-[#1e3a8a]">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-2" colSpan={6}>Carregando…</td></tr>
            ) : filtered.map(r=>(
              <tr key={r.id} className="even:bg-[#fafbff]">
                <td className="px-3 py-2 bg-white border-b">{fmtBR(r.data)}</td>
                <td className="px-3 py-2 bg-white border-b">{r.numero||"—"}</td>
                <td className="px-3 py-2 bg-white border-b">{r.brinco||"—"}</td>
                <td className="px-3 py-2 bg-white border-b">{r?.detalhes?.touro_nome||r?.detalhes?.touro_id||"—"}</td>
                <td className="px-3 py-2 bg-white border-b">{r?.detalhes?.inseminador_nome||r?.detalhes?.inseminador_id||"—"}</td>
                <td className="px-3 py-2 bg-white border-b">{r?.detalhes?.obs||"—"}</td>
              </tr>
            ))}
            {!loading && filtered.length===0 && (
              <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={6}>Nenhum lançamento no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
