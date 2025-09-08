// src/pages/Leite/MedicaoLeite.jsx
import React from "react";

/**
 * Tabela de digitação das medições.
 * Props:
 *  - vacas: [{numero, brinco, parto, ...}]
 *  - medicoes: { [numero]: {manha, tarde, terceira, total, lote, loteSugerido, acaoSugerida, motivoSugestao} }
 *  - tipoLancamento: "2" | "3" | "total"
 *  - onChange(numero, campo, valor)
 *  - onKeyDown(e, rowIdx, campo)
 *  - inputRefs: useRef({})
 *  - colunaHover / setColunaHover: destaque visual da coluna
 *  - lotes: [{nome, funcao}]
 *  - calcularDEL(partoBR)
 */
export default function MedicaoLeite({
  vacas = [],
  medicoes = {},
  tipoLancamento = "2",
  onChange,
  onKeyDown,
  inputRefs,
  colunaHover,
  setColunaHover,
  lotes = [],
  calcularDEL = () => 0,
}) {
  const titulos = [
    "Número",
    "Brinco",
    "DEL",
    ...(tipoLancamento !== "total" ? ["Manhã", "Tarde"] : []),
    ...(tipoLancamento === "3" ? ["3ª"] : []),
    "Total",
    "Lote",
    "Ação",
    "Motivo",
  ];

  const estiloTh = (i) =>
    `bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[15px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky top-0 z-10 whitespace-nowrap ${
      colunaHover === i ? "bg-[rgba(33,150,243,0.08)]" : ""
    }`;
  const estiloTd = (i) =>
    `px-3 py-2 border-b border-[#eee] whitespace-nowrap ${
      colunaHover === i ? "bg-[rgba(33,150,243,0.08)]" : ""
    }`;
  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
  };

  const estiloAcao = (acao) => {
    if (acao === "Manter") return { color: "green", fontWeight: 600 };
    if (acao === "Secar") return { color: "red", fontWeight: 600 };
    if (acao === "Mover") return { color: "orange", fontWeight: 600 };
    return { color: "#444" };
  };
  const iconeAcao = (acao) =>
    acao === "Manter" ? "✅" : acao === "Secar" ? "🛑" : acao === "Mover" ? "🔁" : "➖";

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto">
        <thead>
          <tr>
            {titulos.map((t, i) => (
              <th
                key={i}
                className={estiloTh(i)}
                onMouseEnter={() => setColunaHover?.(i)}
                onMouseLeave={() => setColunaHover?.(null)}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vacas.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-center text-gray-600" colSpan={titulos.length}>
                Nenhuma vaca em lactação encontrada.
              </td>
            </tr>
          ) : (
            vacas.map((vaca, row) => {
              const numeroStr = String(vaca.numero);
              const d = medicoes?.[numeroStr] || {};
              const del = calcularDEL(vaca?.parto || "");

              const campos = [];
              if (tipoLancamento !== "total") {
                campos.push(
                  <input
                    key="manha"
                    type="number"
                    value={d.manha ?? ""}
                    onChange={(e) => onChange?.(numeroStr, "manha", e.target.value)}
                    onKeyDown={(e) => onKeyDown?.(e, row, "manha")}
                    ref={(el) => inputRefs && (inputRefs.current[`${row}-manha`] = el)}
                    className="input-medir"
                    style={inputStyle}
                  />,
                  <input
                    key="tarde"
                    type="number"
                    value={d.tarde ?? ""}
                    onChange={(e) => onChange?.(numeroStr, "tarde", e.target.value)}
                    onKeyDown={(e) => onKeyDown?.(e, row, "tarde")}
                    ref={(el) => inputRefs && (inputRefs.current[`${row}-tarde`] = el)}
                    className="input-medir"
                    style={inputStyle}
                  />
                );
              }
              if (tipoLancamento === "3") {
                campos.push(
                  <input
                    key="terceira"
                    type="number"
                    value={d.terceira ?? ""}
                    onChange={(e) => onChange?.(numeroStr, "terceira", e.target.value)}
                    onKeyDown={(e) => onKeyDown?.(e, row, "terceira")}
                    ref={(el) => inputRefs && (inputRefs.current[`${row}-terceira`] = el)}
                    className="input-medir"
                    style={inputStyle}
                  />
                );
              }
              const totalReadOnly = tipoLancamento !== "total";
              campos.push(
                <input
                  key="total"
                  type="number"
                  value={d.total ?? ""}
                  readOnly={totalReadOnly}
                  onChange={(e) => !totalReadOnly && onChange?.(numeroStr, "total", e.target.value)}
                  className="input-medir"
                  style={{
                    ...inputStyle,
                    backgroundColor: totalReadOnly ? "#f1f5f9" : "white",
                    cursor: totalReadOnly ? "not-allowed" : "auto",
                  }}
                />,
                <select
                  key="lote"
                  value={d.lote || ""}
                  onChange={(e) => {
                    const novo = e.target.value;
                    const acao = novo === d.loteSugerido ? "Manter" : "Mover";
                    onChange?.(numeroStr, "lote", novo);
                    onChange?.(numeroStr, "acaoSugerida", acao);
                  }}
                  className="input-medir"
                  style={inputStyle}
                >
                  {lotes.length === 0 ? (
                    <option value="" disabled>
                      Cadastre lotes na aba Consumo/Reposição
                    </option>
                  ) : (
                    <>
                      <option value="">—</option>
                      {lotes.map((l) => (
                        <option key={l.nome} value={l.nome}>
                          {l.nome}
                        </option>
                      ))}
                    </>
                  )}
                </select>,
                <span key="acao" style={estiloAcao(d.acaoSugerida)}>
                  {iconeAcao(d.acaoSugerida)} {d.acaoSugerida || "—"}
                </span>,
                <span key="motivo" title={d.motivoSugestao || "—"}>
                  {d.motivoSugestao || "—"}
                </span>
              );

              const colunas = [vaca.numero, vaca.brinco || "—", String(del), ...campos];

              return (
                <tr key={vaca.numero} className="bg-white even:bg-[#f7f7f8] hover:bg-[#eaf5ff]">
                  {colunas.map((conteudo, colIdx) => (
                    <td key={colIdx} className={estiloTd(colIdx)}>
                      {conteudo}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
