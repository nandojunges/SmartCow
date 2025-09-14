// src/pages/Animais/Inativas.jsx
import React, { useMemo, useState } from "react";
import api from "../../api";

/* ===== visual (mesmo padrão de PrePartoParto) ===== */
const STICKY_OFFSET = 48;
const tableClasses = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase = "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap cursor-pointer";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap transition-transform";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs transition-colors";
const rowAlt  = "even:bg-[#f7f7f8]";
const bgHL = "bg-[rgba(33,150,243,0.08)]";
const ringCell = "relative z-[1] ring-1 ring-[#1e3a8a]/30 shadow-sm scale-[1.01]";

/* ===== helpers ===== */
const getUltimaSaida = (a) => {
  const arr = a?.historico?.saidas;
  return Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null;
};
const isInativo = (a) => {
  if ((a?.status ?? "").toLowerCase() === "inativo") return true;
  if (a?.tipo_saida || a?.data_saida || a?.motivo_saida || a?.observacao_saida) return true;
  if (getUltimaSaida(a)) return true;
  return false;
};
const fmtData = (d, fallback = "—") => {
  if (!d) return fallback;
  if (typeof d === "string" && d.includes("/")) return d;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
};
const fmtValor = (v) => {
  if (v == null || v === "") return "—";
  const num = typeof v === "number"
    ? v
    : parseFloat(String(v).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isNaN(num) ? v : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function Inativas({
  animais = [],
  onAtualizar,          // recebe nova lista (reativação otimista)
  onVerFicha,           // opcional: (animal) => void
}) {
  const [hoverCol, setHoverCol] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverCell, setHoverCell] = useState({ r: null, c: null });
  const [okMsg, setOkMsg] = useState("");
  const [loadingId, setLoadingId] = useState(null); // id sendo reativado

  const lista = useMemo(
    () => (Array.isArray(animais) ? animais : []).filter(isInativo),
    [animais]
  );

  const doVerFicha = (animal) => {
    if (typeof onVerFicha === "function") {
      onVerFicha(animal);
    } else {
      window.dispatchEvent(new CustomEvent("abrirFichaAnimal", { detail: { animal } }));
    }
  };

  const reativar = async (id) => {
    // 1) encontra o registro
    const alvo = (Array.isArray(animais) ? animais : []).find(v => (v.id ?? v.numero) === id);
    if (!alvo) return;

    // 2) UI otimista local
    const novaLista = (Array.isArray(animais) ? animais : []).map((v) => {
      const vid = v.id ?? v.numero;
      if (vid !== id) return v;

      const hist = v?.historico && typeof v.historico === "object" ? { ...v.historico } : undefined;

      return {
        ...v,
        status: "ativo",
        tipo_saida: null,
        motivo_saida: null,
        observacao_saida: null,
        data_saida: null,
        valor_saida: null,
        valor_venda: null,
        // compat c/ chaves antigas
        saida: undefined,
        motivoSaida: undefined,
        dataSaida: undefined,
        valorVenda: undefined,
        observacoesSaida: undefined,
        tipoSaida: undefined,
        ...(hist ? { historico: hist } : {}),
      };
    });
    onAtualizar?.(novaLista);

    // 3) Persistência no backend
    setLoadingId(id);
    try {
      await api.post(`/api/v1/animals/${id}/reativar`);
      setOkMsg("✅ Animal reativado.");
      // força recarregar do servidor (para refletir remoção da última saída no histórico, etc.)
      window.dispatchEvent(new Event("animaisAtualizados"));
    } catch (e) {
      console.error("Erro ao reativar animal:", e);
      alert("❌ Falha ao reativar no servidor. Atualize a página ou tente novamente.");
    } finally {
      setLoadingId(null);
      setTimeout(() => setOkMsg(""), 2000);
    }
  };

  const colunas = ["Número","Categoria","Tipo de Saída","Motivo","Data","Valor","Observações","Ações"];

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        <h2 className="text-xl font-bold mb-3 text-[#1e3a8a]">❌ Animais Inativos</h2>
        {!!okMsg && (
          <div className="mb-3 text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-2 rounded">
            {okMsg}
          </div>
        )}

        <table className={tableClasses}>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 220 }} />
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
            {lista.map((a, rIdx) => {
              const ultima = getUltimaSaida(a);

              const tipoSaida =
                a.tipoSaida || a.tipo_saida || ultima?.tipo || a.saida?.tipo || "—";
              const motivoSaida =
                a.motivoSaida || a.motivo_saida || ultima?.motivo || a.saida?.motivo || "—";
              const dataSaida =
                a.dataSaida || a.data_saida || ultima?.dataISO || ultima?.data || a.saida?.data || null;
              const valorSaida =
                a.valorVenda || a.valorSaida || a.valor_saida || a.valor_venda || ultima?.valor || a.saida?.valor;
              const observacoesSaida =
                a.observacoesSaida || a.observacao_saida || ultima?.obs || a.saida?.observacao || "—";

              const TD = (content, cIdx, clamp = true) => {
                const klass = `${clamp ? tdClamp : tdBase} ${(hoverRow === rIdx || hoverCol === cIdx) ? bgHL : ""} ${hoverCell.r === rIdx && hoverCell.c === cIdx ? ringCell : ""}`;
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

              const idRow = a.id ?? a.numero;
              const busy = loadingId === idRow;

              return (
                <tr
                  key={idRow ?? `row-${rIdx}`}
                  className={`${rowBase} ${rowAlt} hover:bg-[#eaf5ff]`}
                  onMouseEnter={() => setHoverRow(rIdx)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  {TD(a.numero || a.brinco || "—", 0)}
                  {TD(a.categoria || a.tipo || "—", 1)}
                  {TD(tipoSaida, 2)}
                  {TD(motivoSaida, 3)}
                  {TD(fmtData(dataSaida), 4)}
                  {TD(fmtValor(valorSaida), 5)}
                  {TD(observacoesSaida, 6)}
                  <td
                    className={`${tdBase} ${hoverCol === 7 || hoverRow === rIdx ? bgHL : ""} ${hoverCell.r === rIdx && hoverCell.c === 7 ? ringCell : ""}`}
                    onMouseEnter={() => { setHoverRow(rIdx); setHoverCol(7); setHoverCell({ r: rIdx, c: 7 }); }}
                    onMouseLeave={() => { setHoverRow(null); setHoverCell({ r: null, c: null }); }}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a]"
                        onClick={() => doVerFicha(a)}
                        title="Ver ficha do animal"
                      >
                        📋 Ver Ficha
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1.5 rounded-md border text-emerald-700 ${busy ? "opacity-60 cursor-wait" : "hover:border-emerald-700"} border-emerald-700/20`}
                        onClick={() => !busy && reativar(idRow)}
                        disabled={busy}
                        title="Reativar animal"
                      >
                        🔁 {busy ? "Reativando…" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {lista.length === 0 && (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">
                    Nenhum animal inativo registrado.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
