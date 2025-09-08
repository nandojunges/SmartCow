// src/pages/Reproducao/VisaoGeral/Diagnostico.jsx
import { useEffect, useMemo, useState } from "react";
import Select from "react-select";

/* utils mínimos (iguais aos do VisaoGeral) */
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
const diffDays = (a, b) => {
  if (!a || !b) return 0;
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((A - B) / DAY);
};

/** estilos do react-select (alinhado a inputs nativos + z-index alto) */
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

const RESULTADOS = ["Prenhe", "Vazia", "Não vista"];
const LABEL_DOPPLER = "Doppler (>=20d)";
const LABEL_DG30 = "DG 30d";
const LABEL_DG60 = "DG 60d";
const LABEL_AVANC = "Avançado (>90d)";
const LABEL_OUTRO = "Outro";
const LABEL_SEMIA = "— sem IA —";

export default function Diagnostico({
  animal,
  onSubmit,
  // janelas ajustáveis
  dg30 = [28, 35],
  dg60 = [55, 75],
  dopplerMin = 20,
  avancadoMin = 100,
}) {
  const [resultado, setResultado] = useState("Prenhe");
  const [data, setData] = useState(formatBR(today()));
  const [comentario, setComentario] = useState("");

  const dtIA = useMemo(() => parseAnyDate(animal?.ultima_ia), [animal]);
  const dtExame = useMemo(() => parseBR(data) || today(), [data]);
  const diasDesdeIA = useMemo(
    () => (dtIA ? diffDays(dtExame, dtIA) : null),
    [dtIA, dtExame]
  );

  // sugestão automática do tipo de exame conforme dias pós-IA
  const tipoDefault = useMemo(() => {
    if (diasDesdeIA == null) return LABEL_SEMIA;
    if (diasDesdeIA >= dg30[0] && diasDesdeIA <= dg30[1]) return LABEL_DG30;
    if (diasDesdeIA >= dg60[0] && diasDesdeIA <= dg60[1]) return LABEL_DG60;
    if (diasDesdeIA >= avancadoMin) return LABEL_AVANC;
    if (diasDesdeIA >= dopplerMin && diasDesdeIA < dg30[0]) return LABEL_DOPPLER;
    return LABEL_OUTRO;
  }, [diasDesdeIA, dg30, dg60, dopplerMin, avancadoMin]);

  const temIAValida = !!dtIA;

  // estado do select de tipo
  const [tipoExame, setTipoExame] = useState(tipoDefault);

  // sincroniza suavemente quando muda a janela e a sugestão é clara (evita sobrescrever se usuário escolheu "Outro")
  useEffect(() => {
    if (!temIAValida) {
      setTipoExame(LABEL_SEMIA);
      return;
    }
    if (tipoExame === LABEL_SEMIA || tipoDefault !== LABEL_OUTRO) {
      setTipoExame(tipoDefault);
    }
  }, [tipoDefault, temIAValida]); // eslint-disable-line react-hooks/exhaustive-deps

  // opções de "Tipo de exame" com ordem amigável ao contexto
  const tipoOptions = useMemo(() => {
    if (!temIAValida) return [{ value: LABEL_SEMIA, label: LABEL_SEMIA }];
    const inDoppler = diasDesdeIA >= dopplerMin && diasDesdeIA < dg30[0];
    const ordered = inDoppler
      ? [LABEL_DOPPLER, LABEL_DG30, LABEL_DG60, LABEL_AVANC, LABEL_OUTRO]
      : [LABEL_DG30, LABEL_DG60, LABEL_AVANC, LABEL_DOPPLER, LABEL_OUTRO];
    return ordered.map((v) => ({ value: v, label: v }));
  }, [temIAValida, diasDesdeIA, dopplerMin, dg30]);

  // options de Resultado
  const resultadoOptions = useMemo(
    () => RESULTADOS.map((r) => ({ value: r, label: r })),
    []
  );

  const selectedTipo = useMemo(
    () => tipoOptions.find((o) => o.value === tipoExame) || null,
    [tipoOptions, tipoExame]
  );
  const selectedResultado = useMemo(
    () => resultadoOptions.find((o) => o.value === resultado) || null,
    [resultadoOptions, resultado]
  );

  const podeSalvar = temIAValida; // regra: precisa existir IA para registrar DG

  // avisos
  const avisos = [];
  if (!temIAValida)
    avisos.push(
      "Este animal não possui IA registrada (data inválida ou ausente). Registre uma IA antes do diagnóstico."
    );
  else {
    if (diasDesdeIA < dg30[0]) {
      if (diasDesdeIA >= dopplerMin)
        avisos.push(
          `IA há ${diasDesdeIA} dia(s). Fora da janela de 30d — você pode usar Doppler.`
        );
      else
        avisos.push(
          `IA há ${diasDesdeIA} dia(s). Ainda antes do mínimo recomendado para DG 30d.`
        );
    }
    if (diasDesdeIA > dg60[1]) {
      avisos.push(
        `IA há ${diasDesdeIA} dia(s). Fora da janela de 60d — considere classificar como exame avançado/atrasado.`
      );
    }
  }

  const handleSalvar = () => {
    onSubmit?.({
      kind: "DG",
      dg: resultado, // "Prenhe" | "Vazia" | "Não vista"
      data, // dd/mm/aaaa
      extras: {
        tipoExame, // "DG 30d" | "DG 60d" | "Doppler (>=20d)" | "Avançado (>90d)" | "Outro" | "— sem IA —"
        diasDesdeIA, // inteiro
        comentario: comentario?.trim() || "",
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {/* Resultado */}
        <div>
          <label className="block text-sm font-semibold mb-1">Resultado</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={resultadoOptions}
            value={selectedResultado}
            onChange={(opt) => setResultado(opt?.value || "Prenhe")}
            isClearable={false}
            placeholder="Selecione…"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>

        {/* Data */}
        <div>
          <label className="block text-sm font-semibold mb-1">Data</label>
          <input
            className="w-full border rounded px-2 py-2 text-[14px]"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="dd/mm/aaaa"
          />
          <div className="text-xs text-gray-500 mt-1">
            {temIAValida ? `IA: ${formatBR(dtIA)} • ${diasDesdeIA} dia(s)` : "Sem IA válida"}
          </div>
        </div>

        {/* Tipo de exame */}
        <div>
          <label className="block text-sm font-semibold mb-1">Tipo de exame</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={tipoOptions}
            value={selectedTipo}
            onChange={(opt) => setTipoExame(opt?.value || tipoDefault)}
            isClearable={false}
            isDisabled={!temIAValida}
            placeholder={temIAValida ? "Selecione…" : "— sem IA —"}
            noOptionsMessage={() => "Nenhuma opção"}
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
          />
        </div>
      </div>

      {/* Comentário */}
      <div>
        <label className="block text-sm font-semibold mb-1">Comentário</label>
        <input
          className="w-full border rounded px-2 py-2 text-[14px]"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ex.: US 5,0 MHz; corpo lúteo presente; líquor uterino; etc."
        />
      </div>

      {/* Avisos */}
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
          Salvar diagnóstico
        </button>
      </div>
    </div>
  );
}
