// src/pages/Leite/Leite.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, FlaskConical } from "lucide-react";
import api, { getAnimais } from "../../api";
import FichaLeiteira from "./FichaLeiteira";

/* ===== presets de tabela ===== */
const tableClasses = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase = "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[17px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky top-0 z-10 whitespace-nowrap cursor-pointer";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs hover:bg-[#eaf5ff] transition-colors";
const rowAlt = "even:bg-[#f7f7f8]";
const hoverTH = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");
const hoverTD = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");

/* ===== helpers ===== */
const toNum = (v) => parseFloat(String(v ?? "0").replace(",", ".")) || 0;

// historico pode vir como JSONB (objeto) ou TEXT (string JSON) — normaliza aqui
const getHist = (a) => {
  const h = a?.historico;
  if (!h) return {};
  if (typeof h === "string") {
    try { return JSON.parse(h); } catch { return {}; }
  }
  return h;
};
const getLeiteArr = (a) =>
  Array.isArray(getHist(a)?.leite) ? getHist(a).leite :
  Array.isArray(a?.leite) ? a.leite : [];

/* ===== datas ===== */
function parseBR(str) {
  if (!str || str.length !== 10) return null;
  const [d, m, y] = str.split("/").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function calcularDEL(partoBR) {
  const dt = parseBR(partoBR);
  if (!dt) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje - dt) / 86400000));
}
function ymdHoje() {
  const hoje = new Date();
  return hoje.toISOString().split("T")[0];
}
function maxDateBR(arr, field = "data") {
  if (!Array.isArray(arr)) return null;
  let best = null;
  for (const it of arr) {
    const dt = parseBR(field ? it?.[field] : it);
    if (dt && (!best || dt > best)) best = dt;
  }
  return best;
}
function toBR(dt) {
  if (!dt) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function getUltimoPartoDate(a) {
  const hist = getHist(a);
  const dTopo = parseBR(a?.parto);
  const dHist = maxDateBR(hist?.partos, "data");
  return dTopo && dHist ? (dTopo > dHist ? dTopo : dHist) : (dTopo || dHist || null);
}
function getUltimoPartoBR(a) {
  return toBR(getUltimoPartoDate(a));
}

/* ===== regra de NEGÓCIO: está em lactação? ===== */
function isLactatingAnimal(a) {
  const hist = getHist(a);

  // último parto (no topo ou no histórico)
  const dtParto = getUltimoPartoDate(a);
  const dtSecagem = maxDateBR(hist?.secagens, "data");

  const categoria = String(a?.categoria || "").toLowerCase();
  const statusProd = String(a?.situacao_produtiva || a?.status_produtivo || a?.estado || "").toLowerCase();
  const statusReprod = String(a?.situacao_reprodutiva || "").toLowerCase();

  // negativas
  if (statusProd.includes("seca") || categoria.includes("seca")) return false;
  if (statusProd.includes("não lact") || statusProd.includes("nao lact")) return false;
  if (dtSecagem && dtParto && dtSecagem.getTime() >= dtParto.getTime()) return false; // secou depois do último parto

  // afirmativas
  if (statusProd.includes("lact")) return true;  // declarado como lactante
  if (statusReprod.includes("pev")) return true; // PEV = recém-parida
  if (categoria.includes("lact")) return true;   // compat por categoria
  if (dtParto) return true;                      // tem parto registrado e não secou depois

  // padrão
  return false;
}

/* ===== SoT em animals/:id ===== */
function datasDoRebanho(vacas = []) {
  const set = new Set();
  (vacas || []).forEach((v) => getLeiteArr(v).forEach((r) => r?.data && set.add(r.data)));
  return [...set].sort((a, b) => new Date(a) - new Date(b));
}
function snapshotDoDia(vacas = [], date) {
  const dados = {};
  (vacas || []).forEach((v) => {
    const reg = getLeiteArr(v).find((r) => r.data === date);
    if (!reg) return;
    const n = String(v.numero);
    const litros =
      reg.litros != null ? Number(reg.litros) : toNum(reg.manha) + toNum(reg.tarde) + toNum(reg.terceira);
    dados[n] = {
      manha: reg.manha,
      tarde: reg.tarde,
      terceira: reg.terceira,
      total: Number.isFinite(litros) ? litros.toFixed(1) : undefined,
      lote: reg.lote || "",
      loteSugerido: reg.loteSugerido,
      acaoSugerida: reg.acaoSugerida,
      motivoSugestao: reg.motivoSugestao,
    };
  });
  return { id: date, dados };
}
function guessTipoLancamentoDoDia(vacas = [], date) {
  for (const v of vacas) {
    const reg = getLeiteArr(v).find((r) => r.data === date);
    if (!reg) continue;
    if (reg.terceira != null && reg.terceira !== "") return "3";
    if (reg.manha != null || reg.tarde != null) return "2";
    if (reg.litros != null) return "total";
  }
  return "2";
}

// Lotes de reposição (rota correta no backend)
const apiListarLotes = async () => {
  const r = await api.get("/api/v1/consumo/lotes");
  return r.data;
};

/* =================== TABELA (resumo do dia) =================== */
function TabelaResumoDia({ vacas = [], medicoes = {}, dataAtual, onClickFicha, onClickRegistrar }) {
  const titulos = ["Número","Brinco","DEL","Manhã","Tarde","3ª","Total","Última Medição","Lote","Ações"];
  const COLS = [70, 90, 80, 80, 80, 70, 90, 140, 110, 170];
  const [colunaHover, setColunaHover] = useState(null);

  return (
    <table className={tableClasses}>
      <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr>
          {titulos.map((t, i) => (
            <th
              key={t}
              onMouseEnter={() => setColunaHover(i)}
              onMouseLeave={() => setColunaHover(null)}
              className={`${thBase} ${hoverTH(i, colunaHover)}`}
            >
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {vacas.map((vaca, idx) => {
          const numeroStr = String(vaca.numero ?? "");
          const dados = medicoes[numeroStr] || {};
          const totalCalc = (toNum(dados.manha) + toNum(dados.tarde) + toNum(dados.terceira)).toFixed(1);

          const del = calcularDEL(getUltimoPartoBR(vaca));
          const loteFinal = dados.loteSugerido || dados.lote || "—";
          const ultimaMed = dados.total ? dataAtual.split("-").reverse().join("/") : "—";

          const cols = [
            vaca.numero ?? "—",
            vaca.brinco ?? "—",
            String(del),
            dados.manha ?? "—",
            dados.tarde ?? "—",
            dados.terceira ?? "—",
            dados.total ?? totalCalc ?? "—",
            ultimaMed,
            loteFinal,
          ];

          return (
            <tr key={vaca.id ?? vaca.numero ?? idx} className={`${rowBase} ${rowAlt}`}>
              {cols.map((c, i) => (
                <td key={i} className={`${i <= 1 ? tdClamp : tdBase} ${hoverTD(i, colunaHover)}`} title={i <= 1 ? String(c) : undefined}>
                  {c}
                </td>
              ))}
              <td className={`${tdBase} ${hoverTD(9, colunaHover)}`}>
                <div className="flex items-center gap-2 justify-center">
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                    title="Ficha leiteira"
                    onClick={() => onClickFicha?.(vaca)}
                  >
                    <FileText size={16} />
                    <span className="hidden sm:inline">Ficha</span>
                  </button>
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                    title="Registrar medição"
                    onClick={() => onClickRegistrar?.(vaca)}
                  >
                    <FlaskConical size={16} />
                    <span className="hidden sm:inline">Registrar</span>
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
        {vacas.length === 0 && (
          <tr>
            <td colSpan={titulos.length} className={tdBase} style={{ textAlign: "center", padding: "1rem" }}>
              Nenhuma vaca em lactação encontrada.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/* ============ TABELA MEDIÇÃO (inline) ============ */
function TabelaMedicaoLeite({
  vacas = [],
  medicoes = {},
  tipoLancamento,
  onChange,
  onKeyDown,
  inputRefs,
  colunaHover,
  setColunaHover,
  lotes = [],
}) {
  if (!Array.isArray(vacas)) {
    return <div style={{ color: "red" }}>Erro: lista de vacas inválida.</div>;
  }
  const titulos = [
    "Número","Brinco","DEL",
    ...(tipoLancamento !== "total" ? ["Manhã","Tarde"] : []),
    ...(tipoLancamento === "3" ? ["3ª"] : []),
    "Total","Lote","Ação","Motivo",
  ];
  const estiloAcao = (acao) => {
    if (acao === "Manter") return { color: "green",  fontWeight: 600 };
    if (acao === "Secar")  return { color: "red",    fontWeight: 600 };
    if (acao === "Mover")  return { color: "orange", fontWeight: 600 };
    return { color: "#444" };
  };
  const iconeAcao = (acao) => (acao === "Manter" ? "✅" : acao === "Secar" ? "🛑" : acao === "Mover" ? "🔁" : "➖");

  const opcoesLote = Array.isArray(lotes) ? lotes : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tabela-padrao">
        <thead>
          <tr>
            {titulos.map((titulo, index) => (
              <th
                key={index}
                onMouseEnter={() => setColunaHover(index)}
                onMouseLeave={() => setColunaHover(null)}
                className={colunaHover === index ? "coluna-hover" : ""}
              >
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vacas.length === 0 ? (
            <tr>
              <td colSpan={titulos.length} style={{ textAlign: "center", padding: "1rem" }}>
                Nenhuma vaca em lactação encontrada.
              </td>
            </tr>
          ) : (
            vacas.map((vaca, row) => {
              const numeroStr = String(vaca.numero);
              const dados = medicoes?.[numeroStr] || {};
              const del = calcularDEL(getUltimoPartoBR(vaca));

              const campos = [];
              if (tipoLancamento !== "total") {
                campos.push(
                  <input
                    type="number"
                    value={dados.manha ?? ""}
                    onChange={(e) => onChange(numeroStr, "manha", e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, row, "manha")}
                    ref={(el) => (inputRefs.current[`${row}-manha`] = el)}
                    className="input-medir"
                  />,
                  <input
                    type="number"
                    value={dados.tarde ?? ""}
                    onChange={(e) => onChange(numeroStr, "tarde", e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, row, "tarde")}
                    ref={(el) => (inputRefs.current[`${row}-tarde`] = el)}
                    className="input-medir"
                  />
                );
              }
              if (tipoLancamento === "3") {
                campos.push(
                  <input
                    type="number"
                    value={dados.terceira ?? ""}
                    onChange={(e) => onChange(numeroStr, "terceira", e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, row, "terceira")}
                    ref={(el) => (inputRefs.current[`${row}-terceira`] = el)}
                    className="input-medir"
                  />
                );
              }
              const totalReadOnly = tipoLancamento !== "total";
              campos.push(
                <input
                  type="number"
                  value={dados.total ?? ""}
                  readOnly={totalReadOnly}
                  onChange={(e) => !totalReadOnly && onChange(numeroStr, "total", e.target.value)}
                  className="input-medir"
                  style={{ backgroundColor: totalReadOnly ? "#f1f5f9" : "white", cursor: totalReadOnly ? "not-allowed" : "auto" }}
                />,
                <select
                  value={dados.lote || ""}
                  onChange={(e) => {
                    const novoLote = e.target.value;
                    const acao = novoLote === dados.loteSugerido ? "Manter" : "Mover";
                    onChange(numeroStr, "lote", novoLote);
                    onChange(numeroStr, "acaoSugerida", acao);
                  }}
                  className="input-medir"
                >
                  {opcoesLote.length === 0 ? (
                    <option value="" disabled>Cadastre lotes na aba Consumo/Reposição</option>
                  ) : (
                    <>
                      <option value="">—</option>
                      {opcoesLote.map((l) => (
                        <option key={l.nome} value={l.nome}>{l.nome}</option>
                      ))}
                    </>
                  )}
                </select>,
                <span style={estiloAcao(dados.acaoSugerida)}>{iconeAcao(dados.acaoSugerida)} {dados.acaoSugerida || "—"}</span>,
                <span title={dados.motivoSugestao || "—"}>{dados.motivoSugestao || "—"}</span>
              );

              const colunas = [vaca.numero, vaca.brinco || "—", String(del), ...campos];

              return (
                <tr key={vaca.numero}>
                  {colunas.map((conteudo, colIdx) => (
                    <td key={colIdx} className={colunaHover === colIdx ? "coluna-hover" : ""}>
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

/* ============== Modal Filtro/Lote Inteligente (inline) ============== */
function ModalFiltroLoteInteligente({ aberto = true, vacas, medicoes, onAplicar, onFechar }) {
  const [parametros, setParametros] = useState({
    producaoMinimaParaLote1: 15,
    usarProducaoMinimaParaLote1: true,
    producaoMaximaParaLote3: 8,
    usarProducaoMaximaParaLote3: true,
    forcarSecagemComDEL: 300,
    usarForcarSecagemComDEL: true,
  });
  if (!aberto) return null;

  const aplicar = () => {
    const sugestoes = (vacas || []).map((v) => {
      const numeroStr = String(v.numero);
      const dados = (medicoes || {})[numeroStr] || {};
      const total = toNum(dados.total);
      const del = calcularDEL(getUltimoPartoBR(v));

      let lote = "Lote 2";
      if (parametros.usarProducaoMaximaParaLote3 && total <= parametros.producaoMaximaParaLote3) lote = "Lote 3";
      else if (parametros.usarProducaoMinimaParaLote1 && total >= parametros.producaoMinimaParaLote1) lote = "Lote 1";
      if (parametros.usarForcarSecagemComDEL && del >= parametros.forcarSecagemComDEL) lote = "Secar";

      return { numero: v.numero, lote };
    });
    onAplicar?.(sugestoes);
    onFechar?.();
  };

  return (
    <div style={overlay}>
      <div style={modalSmall}>
        <div style={header}>🔍 Sugerir Lote de Manejo — Filtro Inteligente</div>
        <div style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>
          {Object.entries(parametros).map(([k, v]) => {
            if (typeof v === "number") {
              const chaveBool = `usar${k.charAt(0).toUpperCase()}${k.slice(1)}`;
              return (
                <div key={k}>
                  <label style={labelEstilo}>
                    {k.replace(/^usar/, "Usar ").replace(/([A-Z])/g, " $1").replace(/\bDEL\b/g, "DEL")}
                    {parametros[chaveBool] !== undefined && (
                      <input
                        type="checkbox"
                        checked={!!parametros[chaveBool]}
                        onChange={(e) => setParametros((p) => ({ ...p, [chaveBool]: e.target.checked }))}
                        style={{ transform: "scale(1.2)", marginLeft: 8 }}
                      />
                    )}
                  </label>
                  <input
                    type="number"
                    value={v}
                    onChange={(e) => setParametros((p) => ({ ...p, [k]: parseFloat(e.target.value || 0) }))}
                    style={inputBase}
                  />
                </div>
              );
            }
            if (typeof v === "boolean") {
              return (
                <div key={k}>
                  <label style={labelEstilo}>
                    {k.replace(/^usar/, "Usar ").replace(/([A-Z])/g, " $1").replace(/\bDEL\b/g, "DEL")}
                    <input
                      type="checkbox"
                      checked={v}
                      onChange={(e) => setParametros((p) => ({ ...p, [k]: e.target.checked }))}
                      style={{ transform: "scale(1.2)", marginLeft: 8 }}
                    />
                  </label>
                </div>
              );
            }
            return null;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "0.75rem 1.25rem", borderTop: "1px solid #ddd" }}>
          <button onClick={onFechar} style={botaoClaro}>Cancelar</button>
          <button onClick={aplicar} style={botaoConfirmar}>✅ Aplicar Sugestões</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== MODAL MEDIÇÃO (inline) ===================== */
const LAST_TIPO_KEY = "leite:lastTipoLancamento";

function ModalMedicaoLeite({ data, vacas = [], onFechar, onSalvar }) {
  const [tipoLancamento, setTipoLancamento] = useState(() => localStorage.getItem(LAST_TIPO_KEY) || "2");
  const [medicoes, setMedicoes] = useState({});
  const [mostrarFiltro, setMostrarFiltro] = useState(false);
  const [dataMedicao, setDataMedicao] = useState(data);
  const inputRefs = useRef({});
  const [colunaHover, setColunaHover] = useState(null);
  const [lotes, setLotes] = useState([]);

  useEffect(() => { localStorage.setItem(LAST_TIPO_KEY, tipoLancamento); }, [tipoLancamento]);

  // monta campos a partir do que existe no historico.leite do animal
  useEffect(() => {
    const mapa = {};
    (vacas || []).forEach((v) => {
      const reg = getLeiteArr(v).find((r) => r.data === dataMedicao);
      const n = String(v.numero);
      if (reg) {
        const litros = reg.litros != null ? Number(reg.litros) : toNum(reg.manha) + toNum(reg.tarde) + toNum(reg.terceira);
        mapa[n] = {
          manha: reg.manha ?? "",
          tarde: reg.tarde ?? "",
          terceira: reg.terceira ?? "",
          total: Number.isFinite(litros) ? litros.toFixed(1) : "",
          lote: reg.lote || "",
          loteSugerido: reg.loteSugerido,
          acaoSugerida: reg.acaoSugerida,
          motivoSugestao: reg.motivoSugestao,
        };
      } else {
        mapa[n] = {};
      }
    });
    setMedicoes(mapa);
    const hasReg = (vacas || []).some((v) => getLeiteArr(v).some((r) => r.data === dataMedicao));
    if (hasReg) setTipoLancamento(guessTipoLancamentoDoDia(vacas, dataMedicao));
  }, [dataMedicao, vacas]);

  useEffect(() => { (async () => setLotes(await apiListarLotes()))(); }, []);

  const calcularTotal = ({ manha, tarde, terceira }) => {
    const m = toNum(manha);
    const t = toNum(tarde);
    const c = toNum(terceira);
    return (tipoLancamento === "3" ? m + t + c : m + t).toFixed(1);
  };

  const handleChange = (numero, campo, valor) => {
    const numeroStr = String(numero);
    setMedicoes((prev) => {
      const anterior = prev[numeroStr] || {};
      const atualizado = { ...anterior, [campo]: valor };

      const manha = campo === "manha" ? valor : anterior.manha || "0";
      const tarde = campo === "tarde" ? valor : anterior.tarde || "0";
      const terceira = campo === "terceira" ? valor : anterior.terceira || "0";
      atualizado.total = calcularTotal({ manha, tarde, terceira });

      const vaca = vacas.find((v) => String(v.numero) === numeroStr);
      const del = calcularDEL(getUltimoPartoBR(vaca));
      const totalNum = toNum(atualizado.total || "0");

      const sugestao = (() => {
        if (totalNum >= 20 && del < 100) return { acao: "Manter", motivo: "Alta produção e início da lactação", lote: "Lote 1" };
        if (totalNum < 8 && del > 250) return { acao: "Secar",  motivo: "Baixa produção e DEL avançado",       lote: "Secar"  };
        return { acao: "Mover", motivo: "Produção intermediária", lote: "Lote 2" };
      })();

      atualizado.loteSugerido = sugestao.lote;
      atualizado.motivoSugestao = sugestao.motivo;

      if (campo === "lote") atualizado.lote = valor;
      if (atualizado.lote && atualizado.lote === atualizado.loteSugerido) atualizado.acaoSugerida = "Manter";
      else if (atualizado.lote && atualizado.lote !== atualizado.loteSugerido) atualizado.acaoSugerida = "Mover";
      else atualizado.acaoSugerida = sugestao.acao;

      return { ...prev, [numeroStr]: atualizado };
    });
  };
  const toISO = (s) => {
    if (!s) return s;
    const v = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  };
  const num = (x) => {
    if (x == null || x === "") return x;
    const n = Number(String(x).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : x;
  };
  const normTurno = (v) => {
    if (v == null || v === "") return "manha";
    const t = String(v).toLowerCase();
    if (["1","m","manhã","manha","morning"].includes(t)) return "manha";
    if (["2","t","tarde","afternoon"].includes(t)) return "tarde";
    if (["3","n","noite","night"].includes(t)) return "noite";
    if (["manha","manhã","tarde","noite"].includes(t)) return t.replace("ã","a");
    return "manha";
  };

  const salvar = async () => {
    // ✅ grava em /animals/:id/leite (merge por data no backend — não apaga CMT/CCS)
    for (const v of vacas) {
      const n = String(v.numero);
      const dados = medicoes[n];
      if (!dados) continue;

      // resolve id com fallback por número
      let id = v.id;
      if (!id) {
        try {
          const lista = await getAnimais();
          const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
          id = arr.find((a) => String(a.numero) === n)?.id;
        } catch {}
      }
      if (!id) continue;

      const m = toNum(dados.manha);
      const t = toNum(dados.tarde);
      const c = toNum(dados.terceira);
      const litros = (tipoLancamento === "total")
        ? toNum(dados.total)
        : m + t + (tipoLancamento === "3" ? c : 0);

      const payload = {
        data: dataMedicao,
        tipo: tipoLancamento,
        ...(tipoLancamento !== "total" ? { manha: m, tarde: t } : {}),
        ...(tipoLancamento === "3" ? { terceira: c } : {}),
        litros: Number.isFinite(litros) ? Number(litros.toFixed(1)) : 0,
        lote: dados.lote || "",
        loteSugerido: dados.loteSugerido,
        acaoSugerida: dados.acaoSugerida,
        motivoSugestao: dados.motivoSugestao,
      };
      
      // compat: garantir formato aceito pelo backend
      payload.animal_id = payload.animal_id || id;
      if (payload.data) payload.data = toISO(payload.data);
      payload.turno = normTurno(payload.turno ?? payload.ordenha ?? payload.turnoOrdenha ?? payload.milking);
      if (!payload.data) payload.data = new Date().toISOString().slice(0,10);
      if (!payload.tipo) payload.tipo = "medicao";
      for (const k of [
        "litros","volume","quantidade",
        "gordura","proteina","lactose","ureia",
        "ccs","solidos","sólidos","caseina","sng"
      ]) {
        if (k in payload) payload[k] = num(payload[k]);
      }
      if (payload.litros == null) {
        if (payload.volume != null) payload.litros = payload.volume;
        else if (payload.quantidade != null) payload.litros = num(payload.quantidade);
        else if (payload.producao != null) payload.litros = num(payload.producao);
      }
      if (payload.ccs == null && payload.celulas_somaticas != null) {
        payload.ccs = num(payload.celulas_somaticas);
      }
      if (payload.litros == null || Number(payload.litros) <= 0) {
        throw new Error("Informe a quantidade de leite (litros) maior que zero.");
      }

      try {
        await api.post(`/animals/${id}/leite`, payload);
      } catch (e) {
        console.warn("Falha ao salvar medição para o animal", n, e?.response?.data || e?.message);
      }
    }

    window.dispatchEvent(new Event("animaisAtualizados"));
    onSalvar?.();
    onFechar?.();
  };

  const navegarComTeclado = (e, row, campo, ordemCampos, totalLinhas, refs) => {
    const index = ordemCampos.indexOf(campo);
    const flatIndex = row * ordemCampos.length + index;
    const totalInputs = totalLinhas * ordemCampos.length;

    let targetIndex = flatIndex;
    if (e.key === "ArrowDown" || e.key === "Enter") targetIndex += ordemCampos.length;
    else if (e.key === "ArrowUp") targetIndex -= ordemCampos.length;
    else if (e.key === "ArrowLeft") targetIndex -= 1;
    else if (e.key === "ArrowRight") targetIndex += 1;

    if (targetIndex >= 0 && targetIndex < totalInputs) {
      const r = Math.floor(targetIndex / ordemCampos.length);
      const c = ordemCampos[targetIndex % ordemCampos.length];
      refs.current[`${r}-${c}`]?.focus();
    }
  };
  const handleKeyDown = (e, row, campo) => {
    const ordem = ["manha", "tarde", "terceira"].filter(
      (c) => tipoLancamento !== "total" && (tipoLancamento === "3" || c !== "terceira")
    );
    navegarComTeclado(e, row, campo, ordem, (vacas || []).length, inputRefs);
  };

  return (
    <div style={overlay}>
      <div style={modalBig}>
        <div style={header}>
          🥛 Registro da Coleta de Leite — {new Date(dataMedicao).toLocaleDateString("pt-BR")}
          <button onClick={() => setMostrarFiltro(true)} style={botaoClaro}>⚙️ Sugerir Lotes</button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div style={gridCompacto}>
            <div>
              <label>Data da Medição</label>
              <input
                type="date"
                value={dataMedicao}
                onChange={(e) => setDataMedicao(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && onFechar?.()}
                style={inputBase}
              />
            </div>

            <div>
              <label>Tipo de Lançamento</label>
              <select
                value={tipoLancamento}
                onChange={(e) => setTipoLancamento(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && onFechar?.()}
                style={inputBase}
              >
                <option value="total">Somente Total</option>
                <option value="2">2 Ordenhas</option>
                <option value="3">3 Ordenhas</option>
              </select>
            </div>
          </div>

          <TabelaMedicaoLeite
            vacas={vacas}
            medicoes={medicoes}
            tipoLancamento={tipoLancamento}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            inputRefs={inputRefs}
            colunaHover={colunaHover}
            setColunaHover={setColunaHover}
            lotes={lotes}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
            <button onClick={onFechar} style={botaoCancelar}>Cancelar</button>
            <button onClick={salvar} style={botaoConfirmar}>📂 Salvar Medições</button>
          </div>
        </div>

        {mostrarFiltro && (
          <ModalFiltroLoteInteligente
            aberto
            vacas={vacas}
            medicoes={medicoes}
            onFechar={() => setMostrarFiltro(false)}
            onAplicar={(sugestoes) => {
              setMedicoes((prev) => {
                const atualizado = { ...prev };
                (sugestoes || []).forEach((v) => {
                  const num = String(v.numero);
                  if (!atualizado[num]) atualizado[num] = {};
                  atualizado[num].lote = v.lote;
                });
                return atualizado;
              });
              setMostrarFiltro(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* =========================== PÁGINA =========================== */
export default function Leite() {
  const [vacas, setVacas] = useState([]);
  const [dataAtual, setDataAtual] = useState(ymdHoje());
  const [datasDisponiveis, setDatasDisponiveis] = useState([]);
  const [registro, setRegistro] = useState({ id: ymdHoje(), dados: {} });

  const [abrirMedicao, setAbrirMedicao] = useState(false);
  const [vacaSelecionada, setVacaSelecionada] = useState(null);

  const [fichaOpen, setFichaOpen] = useState(false);
  const [vacaFicha, setVacaFicha] = useState(null);

  const carregarAnimais = async () => {
    try {
      const lista = await getAnimais();
      const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
      const ativos = arr.filter((a) => (a.status ?? "ativo") !== "Inativo");
      const lactantes = ativos.filter(isLactatingAnimal);
      setVacas(lactantes);
    } catch (e) {
      console.error("Leite: erro ao carregar animais", e);
      setVacas([]);
    }
  };

  useEffect(() => { carregarAnimais(); }, []);
  useEffect(() => { setDatasDisponiveis(datasDoRebanho(vacas)); }, [vacas]);
  useEffect(() => { setRegistro(snapshotDoDia(vacas, dataAtual)); }, [vacas, dataAtual]);

  // auto-refresh quando nasce/seca ou outras telas salvam
  useEffect(() => {
    const h = () => carregarAnimais();
    window.addEventListener("animaisAtualizados", h);
    return () => window.removeEventListener("animaisAtualizados", h);
  }, []);

  const temAnterior = useMemo(
    () => datasDisponiveis.some((d) => new Date(d) < new Date(dataAtual)),
    [datasDisponiveis, dataAtual]
  );
  const temProxima = useMemo(
    () => datasDisponiveis.some((d) => new Date(d) > new Date(dataAtual)),
    [datasDisponiveis, dataAtual]
  );
  const irParaAnterior = () => {
    const anterior = [...datasDisponiveis].filter((d) => new Date(d) < new Date(dataAtual)).pop();
    if (anterior) setDataAtual(anterior);
  };
  const irParaProxima = () => {
    const proxima = datasDisponiveis.find((d) => new Date(d) > new Date(dataAtual));
    if (proxima) setDataAtual(proxima);
  };

  const medicoesDoDia = registro?.dados || {};

  return (
    <div className="w-full px-6 py-4 font-sans">
      <div style={toolbar}>
        <button onClick={() => setAbrirMedicao(true)} style={botaoConfirmar}>➕ Nova Medição</button>

        <div style={toolbarRight}>
          <button
            onClick={irParaAnterior}
            disabled={!temAnterior}
            title="Dia anterior"
            style={{ ...navBtn, opacity: temAnterior ? 1 : 0.5, cursor: temAnterior ? "pointer" : "not-allowed" }}
          >‹</button>

          <input
            type="date"
            value={dataAtual}
            onChange={(e) => setDataAtual(e.target.value)}
            className="border border-gray-300 text-base font-medium shadow-sm"
            style={inputToolbar}
          />

          <button
            onClick={irParaProxima}
            disabled={!temProxima}
            title="Próximo dia"
            style={{ ...navBtn, opacity: temProxima ? 1 : 0.5, cursor: temProxima ? "pointer" : "not-allowed" }}
          >›</button>
        </div>
      </div>

      <TabelaResumoDia
        vacas={vacas}
        medicoes={medicoesDoDia}
        dataAtual={dataAtual}
        onClickFicha={(vaca) => { setVacaFicha(vaca); setFichaOpen(true); }}
        onClickRegistrar={(vaca) => { setAbrirMedicao(true); setVacaSelecionada(vaca); }}
      />

      {abrirMedicao && (
        <ModalMedicaoLeite
          vacas={vacaSelecionada ? [vacaSelecionada] : vacas}
          data={dataAtual}
          onFechar={() => { setAbrirMedicao(false); setVacaSelecionada(null); }}
          onSalvar={async () => { await carregarAnimais(); setAbrirMedicao(false); setVacaSelecionada(null); }}
        />
      )}

      {fichaOpen && vacaFicha && (
        <FichaLeiteira
          vaca={vacaFicha}
          onFechar={() => { setFichaOpen(false); setVacaFicha(null); }}
        />
      )}
    </div>
  );
}

/* ===== estilos comuns ===== */
const overlay = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 };
const modalBig = { background: "#fff", borderRadius: "1rem", width: "1300px", maxWidth: "95vw", maxHeight: "95vh", overflowY: "auto", fontFamily: "Poppins, sans-serif", boxShadow: "0 0 20px rgba(0,0,0,0.15)" };
const modalSmall = { background: "#fff", borderRadius: "1rem", width: "680px", maxHeight: "90vh", overflow: "hidden", fontFamily: "Poppins, sans-serif" };
const header = { background: "#1e3a8a", color: "white", padding: "1rem 1.5rem", fontWeight: "bold", fontSize: "1.1rem", borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" };
const gridCompacto = { display: "grid", gridTemplateColumns: "240px 240px", gap: "2rem" };
const inputBase = { width: "100%", padding: "0.75rem", fontSize: "0.95rem", borderRadius: "0.6rem", border: "1px solid #ccc" };
const botaoClaro = { background: "#f3f4f6", border: "1px solid #cbd5e1", padding: "0.5rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.95rem" };
const botaoCancelar = { background: "#f3f4f6", border: "1px solid #d1d5db", padding: "0.6rem 1.2rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: "500" };
const botaoConfirmar = { background: "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.4rem", borderRadius: "0.5rem", cursor: "pointer", fontWeight: "600" };
const labelEstilo = { marginBottom: "0.2rem", display: "inline-block", fontWeight: 600 };
const toolbar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const toolbarRight = { display: "flex", alignItems: "center", gap: 8 };
const navBtn = { width: 36, height: 36, background: "#e5edff", border: "1px solid #c7d2fe", color: "#1e3a8a", borderRadius: 8, fontSize: 18, lineHeight: 1 };
const inputToolbar = { width: 180, height: 36, padding: "0 10px", borderRadius: 8 };