// Drawer: Aplicar Protocolo (com react-select)
// - Campos: tipo, protocolo, data de início, hora do 1º evento, criar agenda por etapas
// - Emite onSubmit({ kind:"PROTOCOLO", tipo, protocoloId, protocolo_id, dataInicio, horaInicio, criarAgenda })
import { useEffect, useMemo, useState } from "react";
import Select from "react-select";

const todayBR = () => new Date().toLocaleDateString("pt-BR");
const pad2 = (n) => String(n).padStart(2, "0");
const nowHM = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// helper: extrai o identificador do protocolo (id/uuid/etc.)
const getProtoId = (p) => p?.id ?? p?.uuid ?? p?.ID ?? p?.codigo ?? "";

// validação de data BR real (não só regex)
function isValidBRDate(s) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(s || ""))) return false;
  const [dd, mm, yyyy] = String(s).split("/").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}

// soma dias a uma data BR e retorna BR
function addDaysBR(s, days) {
  if (!isValidBRDate(s)) return null;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  d.setDate(d.getDate() + Number(days || 0));
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// estilos básicos p/ alinhar com inputs nativos e garantir z-index do menu
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
  menu: (base) => ({ ...base }),
};

const tipoOptions = [
  { value: "IATF", label: "IATF" },
  { value: "PRESYNC", label: "Pré-sincronização" },
];

export default function AplicarProtocolo({
  animal,
  protocolos = [],
  onSubmit,
}) {
  const [tipo, setTipo] = useState("IATF");
  const [protId, setProtId] = useState("");
  const [dataInicio, setDataInicio] = useState(todayBR());
  const [horaInicio, setHoraInicio] = useState(nowHM());
  const [criarAgenda, setCriarAgenda] = useState(true);
  const [erro, setErro] = useState("");

  // filtra pela aba "Tipo"
  const opcoes = useMemo(() => {
    const t = String(tipo || "").toUpperCase();
    return (protocolos || []).filter((p) => {
      const tp = String(p?.tipo || "").toUpperCase();
      return t === "IATF" ? tp === "IATF" : tp !== "IATF";
    });
  }, [protocolos, tipo]);

  useEffect(() => {
    // reset quando muda tipo
    setProtId("");
    setErro("");
  }, [tipo]);

  const protSel = useMemo(
    () => opcoes.find((p) => getProtoId(p) === protId) || null,
    [opcoes, protId]
  );

  function validar() {
    if (!protId) return "Escolha um protocolo.";
    if (!isValidBRDate(dataInicio)) return "Data inválida (use dd/mm/aaaa).";
    if (!/^\d{2}:\d{2}$/.test(horaInicio)) return "Hora inválida (use HH:mm).";
    return "";
  }

  const submit = () => {
    const e = validar();
    if (e) {
      setErro(e);
      return;
    }
    onSubmit?.({
      kind: "PROTOCOLO",
      tipo,
      protocoloId: protId,   // camelCase (mantido p/ compat)
      protocolo_id: protId,  // snake_case (facilita chamar o backend)
      dataInicio,            // dd/mm/aaaa
      horaInicio,            // HH:mm
      criarAgenda,           // bool -> gerar tarefas no calendário
    });
  };

  // ajuda visual sobre o que será agendado
  const etapasResumo = useMemo(() => {
    const ets = Array.isArray(protSel?.etapas) ? protSel.etapas : [];
    return ets.map((et, i) => {
      const offset = Number.isFinite(+et?.dia) ? +et.dia : i === 0 ? 0 : i; // fallback leve
      const hora = et?.hora || horaInicio;
      const descricao = et?.descricao || et?.acao || `Etapa ${i + 1}`;
      const dataPrevista = addDaysBR(dataInicio, offset);
      return {
        idx: i + 1,
        offset,
        hora,
        descricao,
        dataPrevista, // dd/mm/aaaa (ou null se dataInicio inválida)
      };
    });
  }, [protSel, horaInicio, dataInicio]);

  // opções para react-select (Protocolo)
  const protocoloOptions = useMemo(
    () => opcoes.map((p) => ({ value: getProtoId(p), label: p.nome })),
    [opcoes]
  );

  const selectedTipo = useMemo(
    () => tipoOptions.find((o) => o.value === tipo) || null,
    [tipo]
  );
  const selectedProtocolo = useMemo(
    () => protocoloOptions.find((o) => o.value === protId) || null,
    [protocoloOptions, protId]
  );

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-1">
        <label className="block mb-1 font-medium text-sm">Tipo</label>
        <Select
          classNamePrefix="rs"
          styles={selectStyles}
          options={tipoOptions}
          value={selectedTipo}
          onChange={(opt) => setTipo(opt?.value || "IATF")}
          isClearable={false}
          placeholder="Selecione o tipo…"
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          menuPosition="fixed"
        />
      </div>

      <div className="col-span-2">
        <label className="block mb-1 font-medium text-sm">Protocolo</label>
        <Select
          classNamePrefix="rs"
          styles={selectStyles}
          options={protocoloOptions}
          value={selectedProtocolo}
          onChange={(opt) => setProtId(opt?.value || "")}
          isClearable
          isSearchable
          placeholder={
            opcoes.length ? "Selecione o protocolo…" : "Nenhum protocolo disponível"
          }
          noOptionsMessage={() => "Nenhuma opção"}
          isDisabled={!opcoes.length}
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          menuPosition="fixed"
        />
      </div>

      <div className="col-span-1">
        <label className="block mb-1 font-medium text-sm">Data de início</label>
        <input
          className="w-full border rounded px-2 py-2 text-[14px]"
          placeholder="dd/mm/aaaa"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
        />
      </div>

      <div className="col-span-1">
        <label className="block mb-1 font-medium text-sm">Hora do 1º evento</label>
        <input
          className="w-full border rounded px-2 py-2 text-[14px]"
          placeholder="HH:mm"
          value={horaInicio}
          onChange={(e) => setHoraInicio(e.target.value)}
        />
      </div>

      <div className="col-span-1 flex items-end">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={criarAgenda}
            onChange={(e) => setCriarAgenda(e.target.checked)}
          />
          Criar agenda das etapas
        </label>
      </div>

      {/* Resumo das etapas (ajuda) */}
      {selectedProtocolo && criarAgenda && (
        <div className="col-span-3 text-sm text-gray-600 bg-gray-50 border rounded px-3 py-2">
          <div className="font-semibold mb-1">Agenda prevista</div>
          {etapasResumo.length === 0 ? (
            <div>Nenhuma etapa cadastrada para este protocolo.</div>
          ) : (
            <ul className="list-disc pl-5">
              {etapasResumo.map((et) => (
                <li key={et.idx}>
                  {et.descricao} — {et.dataPrevista ? `${et.dataPrevista} às ${et.hora}` : `offset ${et.offset}d • ${et.hora}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {erro && (
        <div className="col-span-3 text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {erro}
        </div>
      )}

      <div className="col-span-3 flex justify-end">
        <button className="botao-acao" disabled={!protId} onClick={submit}>
          Aplicar protocolo
        </button>
      </div>
    </div>
  );
}
