// src/pages/Reproducao/VisaoGeral/Inseminacao.jsx
import { useEffect, useMemo, useState } from "react";
import Select from "react-select";

/** Utils locais (iguais às do VisaoGeral) */
const DAY = 86400000;
const today = () => new Date();
const formatBR = (dt) => (dt ? dt.toLocaleDateString("pt-BR") : "—");
const toISODate = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const parseBR = (str) => {
  if (!str || typeof str !== "string" || str.length !== 10) return null;
  const [d, m, y] = str.split("/").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return Number.isFinite(dt.getTime()) ? dt : null;
};
const parseISO = (str) => {
  if (!str || typeof str !== "string" || str.length !== 10) return null;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return Number.isFinite(dt.getTime()) ? dt : null;
};
const parseAnyDate = (str) => {
  if (!str) return null;
  return str.includes("/") ? parseBR(str) : (str.includes("-") ? parseISO(str) : null);
};
const brToISO = (br) => { const dt = parseBR(br); return dt ? toISODate(dt) : null; };
const addDays = (dt, n) => { const d = new Date(dt.getTime()); d.setDate(d.getDate() + n); return d; };
const diffDays = (a, b) => {
  if (!a || !b) return 0;
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((A - B) / DAY);
};

/** Estilos do react-select (alinha com inputs nativos + z-index alto) */
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderColor: state.isFocused ? "#94a3b8" : "#cbd5e1",
    boxShadow: "none",
    "&:hover": { borderColor: "#94a3b8" },
    fontSize: 14,
  }),
  valueContainer: (base) => ({ ...base, padding: "0 8px" }),
  input: (base) => ({ ...base, margin: 0 }),
  indicatorsContainer: (base) => ({ ...base, height: 36 }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

const RAZOES = [
  "Aceitando monta",
  "Montando",
  "Muco",
  "Marcação de tinta",
  "Cio silencioso",
  "Atividade (sensor)",
  "IATF / programa",
  "ReSynch",
  "Outro",
];
const TIPO_SEMEN = ["Convencional", "Fêmea sexado", "Macho sexado"];

/**
 * Inseminacao (com react-select)
 * - onSubmit({ kind:"IA", data, touroId, inseminadorId, obs, extras })
 */
export default function Inseminacao({
  animal,
  touros = [],
  inseminadores = [],
  onSubmit,
  vwpDias = 50,
  dg30 = [28, 35],
  dg60 = [55, 75],
}) {
  // ===== estado
  const [data, setData] = useState(formatBR(today()));
  const [touroId, setTouroId] = useState("");
  const [insId, setInsId] = useState("");
  const [obs, setObs] = useState("");

  // extras
  const [razao, setRazao] = useState("");
  const [tipoSemen, setTipoSemen] = useState("Convencional");
  const [palhetas, setPalhetas] = useState(1);
  const [lote, setLote] = useState("");

  // ordenar touros: mais estoque primeiro
  const tourosOrdenados = useMemo(() => {
    const arr = [...touros];
    arr.sort((a, b) => {
      const ra = Number.isFinite(+a.restantes) ? +a.restantes : -1;
      const rb = Number.isFinite(+b.restantes) ? +b.restantes : -1;
      return rb - ra;
    });
    return arr;
  }, [touros]);

  // ===== options p/ react-select
  const inseminadorOptions = useMemo(
    () => inseminadores.map((i) => ({ value: i.id, label: i.nome })),
    [inseminadores]
  );

  const razoesOptions = useMemo(
    () => RAZOES.map((r) => ({ value: r, label: r })),
    []
  );

  const tipoSemenOptions = useMemo(
    () => TIPO_SEMEN.map((t) => ({ value: t, label: t })),
    []
  );

  const touroOptions = useMemo(
    () =>
      tourosOrdenados.map((t) => {
        const restoOK = Number.isFinite(+t.restantes);
        const isDisabled = restoOK && +t.restantes <= 0;
        const extra =
          (t.codigo || t.raca ? `(${t.codigo || t.raca})` : "") +
          (restoOK ? ` • ${t.restantes} rest.` : "");
        return {
          value: t.id,
          label: `${t.nome} ${extra}`.trim(),
          isDisabled,
          raw: t,
        };
      }),
    [tourosOrdenados]
  );

  // sincronizar seleção padrão quando listas carregarem
  useEffect(() => {
    if (!insId && inseminadorOptions.length) {
      setInsId(inseminadorOptions[0].value);
    }
  }, [inseminadorOptions, insId]);

  useEffect(() => {
    if (!touroId && touroOptions.length) {
      // seleciona o primeiro não desabilitado, se existir
      const firstEnabled = touroOptions.find((o) => !o.isDisabled) || touroOptions[0];
      setTouroId(firstEnabled?.value || "");
    }
  }, [touroOptions, touroId]);

  const selectedInseminador = useMemo(
    () => inseminadorOptions.find((o) => o.value === insId) || null,
    [inseminadorOptions, insId]
  );
  const selectedRazao = useMemo(
    () => razoesOptions.find((o) => o.value === razao) || null,
    [razoesOptions, razao]
  );
  const selectedTipoSemen = useMemo(
    () => tipoSemenOptions.find((o) => o.value === tipoSemen) || null,
    [tipoSemenOptions, tipoSemen]
  );
  const selectedTouro = useMemo(
    () => touroOptions.find((o) => o.value === touroId) || null,
    [touroOptions, touroId]
  );

  const touroSel = useMemo(
    () => tourosOrdenados.find((t) => t.id === touroId),
    [tourosOrdenados, touroId]
  );

  const semEstoque =
    !touroSel || (Number.isFinite(+touroSel?.restantes) && touroSel.restantes <= 0);
  const estoqueInsuficiente =
    Number.isFinite(+touroSel?.restantes) && palhetas > touroSel.restantes;

  // ===== avisos inteligentes
  const ultimaIA = parseAnyDate(animal?.ultima_ia);
  const dtAtual = parseBR(data) || today();
  const diasDesdeIA = ultimaIA ? diffDays(dtAtual, ultimaIA) : null;

  const avisos = [];
  if (diasDesdeIA !== null && diasDesdeIA >= 0 && diasDesdeIA < 18) {
    avisos.push(
      `Última IA há ${diasDesdeIA} dia(s). Avalie risco de dupla contagem/repique precoce.`
    );
  }
  const partoDt = parseBR(animal?.parto);
  if (partoDt) {
    const delHoje = diffDays(dtAtual, partoDt);
    if (delHoje < vwpDias) {
      avisos.push(`PEV: ${delHoje} DEL < ${vwpDias} (abaixo do VWP).`);
    }
  }
  if (semEstoque) avisos.push("Touro sem doses restantes.");
  else if (estoqueInsuficiente)
    avisos.push(`Palhetas (${palhetas}) > estoque (${touroSel.restantes}).`);

  // datas de DG sugeridas (a partir da DATA da IA escolhida)
  const dg30Inicio = addDays(dtAtual, dg30[0]);
  const dg30Fim = addDays(dtAtual, dg30[1]);
  const dg60Inicio = addDays(dtAtual, dg60[0]);
  const dg60Fim = addDays(dtAtual, dg60[1]);

  // habilitar salvar
  const podeSalvar =
    !!touroId && !!insId && !semEstoque && !estoqueInsuficiente && palhetas > 0;

  // monta um “resumo técnico” dos extras para anexar ao obs (sem quebrar API)
  const extrasResumo = useMemo(() => {
    const parts = [];
    if (razao) parts.push(`Razão: ${razao}`);
    if (tipoSemen) parts.push(`Sêmen: ${tipoSemen}`);
    if (Number.isFinite(+palhetas)) parts.push(`Palhetas: ${palhetas}`);
    if (lote) parts.push(`Lote: ${lote}`);
    return parts.join(" | ");
  }, [razao, tipoSemen, palhetas, lote]);

  const handleSalvar = () => {
    const obsFinal = [obs?.trim(), extrasResumo].filter(Boolean).join(" || ");
    onSubmit?.({
      kind: "IA",
      data,
      touroId,
      inseminadorId: insId,
      obs: obsFinal,
      extras: { razao, tipoSemen, palhetas, lote },
    });
  };

  // ===== UI
  return (
    <div className="space-y-3">
      {/* Linha 1: Data + Inseminador + Razão */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold mb-1">Data</label>
          <input
            className="w-full border rounded px-2 py-2 text-[14px]"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="dd/mm/aaaa"
          />
          <div className="text-xs text-gray-500 mt-1">
            DG30: {formatBR(dg30Inicio)} – {formatBR(dg30Fim)} • DG60:{" "}
            {formatBR(dg60Inicio)} – {formatBR(dg60Fim)}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Inseminador</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={inseminadorOptions}
            value={selectedInseminador}
            onChange={(opt) => setInsId(opt?.value || "")}
            isClearable={false}
            isSearchable
            placeholder={
              inseminadorOptions.length ? "Selecione…" : "Nenhum inseminador cadastrado"
            }
            noOptionsMessage={() => "Nenhuma opção"}
            isDisabled={!inseminadorOptions.length}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Razão / Evidência</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={razoesOptions}
            value={selectedRazao}
            onChange={(opt) => setRazao(opt?.value || "")}
            isClearable
            isSearchable
            placeholder="— Selecionar —"
            noOptionsMessage={() => "Nenhuma opção"}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>
      </div>

      {/* Linha 2: Touro + Tipo do sêmen + Palhetas */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold mb-1">Touro</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={touroOptions}
            value={selectedTouro}
            onChange={(opt) => setTouroId(opt?.value || "")}
            isClearable={false}
            isSearchable
            placeholder={
              touroOptions.length ? "Selecione o touro…" : "Nenhum touro cadastrado"
            }
            noOptionsMessage={() => "Nenhuma opção"}
            isOptionDisabled={(o) => o.isDisabled}
            isDisabled={!touroOptions.length}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
          <div className="text-xs text-gray-500 mt-1">
            {Number.isFinite(+touroSel?.restantes)
              ? `Doses restantes: ${touroSel.restantes}`
              : " "}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Tipo do sêmen</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={tipoSemenOptions}
            value={selectedTipoSemen}
            onChange={(opt) => setTipoSemen(opt?.value || "Convencional")}
            isClearable={false}
            placeholder="Selecione…"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Palhetas</label>
          <input
            type="number"
            min={1}
            className="w-full border rounded px-2 py-2 text-[14px]"
            value={palhetas}
            onChange={(e) =>
              setPalhetas(Math.max(1, parseInt(e.target.value || "1", 10)))
            }
          />
        </div>
      </div>

      {/* Linha 3: Lote + Comentário */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold mb-1">Lote (opcional)</label>
          <input
            className="w-full border rounded px-2 py-2 text-[14px]"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            placeholder="Nº do lote/estante"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold mb-1">Comentário</label>
          <input
            className="w-full border rounded px-2 py-2 text-[14px]"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: IA em retorno de cio, muco + atividade…"
          />
        </div>
      </div>

      {/* Avisos/validações contextuais */}
      {avisos.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
          <ul className="list-disc ml-4">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ação */}
      <div className="flex items-center justify-end">
        <button className="botao-acao" onClick={handleSalvar} disabled={!podeSalvar}>
          Lançar IA
        </button>
      </div>

      {/* Rodapé de inteligência */}
      <div className="text-xs text-gray-500">
        Sugestões: realizar DG por US/PA entre <b>{formatBR(dg30Inicio)}</b>–<b>{formatBR(dg30Fim)}</b> (30d) e, se negativo/duvidoso, repetir entre{" "}
        <b>{formatBR(dg60Inicio)}</b>–<b>{formatBR(dg60Fim)}</b> (60d).
      </div>
    </div>
  );
}
