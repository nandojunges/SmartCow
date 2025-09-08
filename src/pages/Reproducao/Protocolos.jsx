// src/pages/Reproducao/Protocolos.jsx
// -----------------------------------------------------------------------------
// Aba “Protocolos” conectada ao backend (CRUD completo).
// - FIX 1: comitar seleção pendente (hormônio/ação) ao trocar de dia/fechar/salvar.
// - FIX 2: remover animais demo e buscar vacas ativas do protocolo,
//          mostrando somente até o último dia (Inseminação) e calculando próxima etapa.
// - AJUSTES p/ calendário: aceitar id/uuid, usar /aplicacoes ou /protocolos/:id/vinculos,
//          ler data_inicio do backend e usar meta.ultimoDia quando disponível.
// -----------------------------------------------------------------------------

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import api from "../../api";

/* ========================= helpers visuais ========================= */
const table =
  "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase =
  "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap";
const tdBase = "px-4 py-2 bg-white border-b border-[#eee] whitespace-nowrap";
const rowBase = "bg-white shadow-xs transition-colors hover:bg-[#eaf5ff]";
const rowAlt = "even:bg-[#f7f7f8]";

/* Botões padronizados */
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
const BtnDanger = ({ children, className = "", ...p }) => (
  <button
    type="button"
    className={
      "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:border-rose-500 hover:bg-rose-50 " +
      className
    }
    {...p}
  >
    {children}
  </button>
);

/* ===== tabs ===== */
const TabButton = ({ active = false, children, className = "", ...p }) => (
  <button
    type="button"
    className={
      "inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold transition " +
      (active
        ? "bg-[#1F3FB6] text-white shadow-sm"
        : "bg-[#eef2ff] text-[#1F3FB6] hover:bg-[#e3e9ff]") +
      (className ? " " + className : "")
    }
    {...p}
  >
    {children}
  </button>
);

/* ================= util de render (tabela da lista) ================= */
const TITULOS = ["Nome", "Descrição", "Tipo", "Etapas", "Ações"];

function BlocoEtapas({ etapas = [] }) {
  const byDay = etapas.reduce((acc, e) => {
    const d = e.dia ?? 0;
    (acc[d] ||= []).push(e.hormonio || e.acao || e.descricao);
    return acc;
  }, {});
  const dias = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b);
  if (!dias.length) return <i className="text-gray-500">—</i>;

  return (
    <div
      style={{
        background: "#F2F6FF",
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
        border: "1px dashed #C7D2FE",
      }}
      className="whitespace-normal"
    >
      <div style={{ fontWeight: 700, color: "#1F3FB6", marginBottom: 4 }}>
        Etapas
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        {dias.map((d) => (
          <div key={d}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Dia {d}</div>
            <div className="flex flex-wrap gap-2">
              {byDay[d].map((t, i) => (
                <span
                  key={i}
                  className="inline-flex items-center h-6 px-2 rounded-full border text-xs font-semibold"
                  style={{
                    borderColor: "#D1D5DB",
                    color: "#334155",
                    background: "#fff",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =============== Modal: Construtor Rápido de Protocolo =============== */
const HORMONIOS = [
  "Benzoato de Estradiol",
  "Cipionato de Estradiol",
  "PGF2α",
  "GnRH",
  "eCG",
  "hCG",
];
const ACOES = ["Inserir Dispositivo", "Retirar Dispositivo", "Inseminação"];

const TEMPLATES = {
  IATF: [
    { dia: 0, hormonio: "Benzoato de Estradiol" },
    { dia: 0, acao: "Inserir Dispositivo" },
    { dia: 7, hormonio: "PGF2α" },
    { dia: 7, acao: "Retirar Dispositivo" },
    { dia: 9, acao: "Inseminação" },
  ],
  "PRÉ-SINCRONIZAÇÃO": [
    { dia: 0, hormonio: "GnRH" },
    { dia: 7, hormonio: "PGF2α" },
  ],
};

/* ==================== Helpers de datas e próxima etapa ==================== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// aceita "dd/mm/aaaa" ou ISO "aaaa-mm-dd"
const parseDateLoose = (s) => {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return new Date(+yyyy, +mm - 1, +dd);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const maxDiaInseminacao = (etapas = []) => {
  const diasInsem = etapas
    .filter((e) =>
      String(e.acao || e.descricao || "").toLowerCase().includes("insemin")
    )
    .map((e) => +e.dia)
    .filter((n) => Number.isFinite(n));
  if (diasInsem.length) return Math.max(...diasInsem);
  // fallback: último dia cadastrado
  const diasAll = etapas
    .map((e) => +e.dia)
    .filter((n) => Number.isFinite(n));
  return diasAll.length ? Math.max(...diasAll) : 0;
};

const proximaEtapaInfo = (etapas = [], dataInicio, refDate = new Date()) => {
  // calcula offset atual (dias transcorridos)
  const d0 = parseDateLoose(dataInicio);
  if (!d0) return { descricao: "—", data: null };
  const diff =
    Math.floor((new Date(toISO(refDate)) - new Date(toISO(d0))) / 86400000) || 0;

  const ordenadas = [...etapas]
    .map((e, i) => ({
      ...e,
      dia: Number.isFinite(+e.dia) ? +e.dia : i === 0 ? 0 : i,
      _desc: e.descricao || e.acao || e.hormonio || "Etapa",
    }))
    .sort((a, b) => a.dia - b.dia);

  const prox = ordenadas.find((e) => e.dia >= diff);
  if (!prox) return { descricao: "—", data: null };

  const data = addDays(d0, prox.dia);
  return { descricao: prox._desc, data };
};

/* ==================== ID helper (id/uuid) ==================== */
const getId = (obj) => obj?.id ?? obj?.uuid ?? obj?.ID ?? obj?.codigo ?? null;

/* =============== MODAL CADASTRO (com commit fix) =============== */
function ModalCadastroProtocolo({
  onFechar,
  onSalvar,
  protocoloInicial = null,
  indiceEdicao = null,
}) {
  const baseDias = Array.from({ length: 10 }, (_, i) => i);
  const [tipo, setTipo] = useState(
    (protocoloInicial?.tipo || "IATF").toUpperCase()
  );
  const [nome, setNome] = useState(protocoloInicial?.nome || "");
  const [descricao, setDescricao] = useState(protocoloInicial?.descricao || "");
  const [dias, setDias] = useState(
    protocoloInicial
      ? Array.from(
          new Set((protocoloInicial.etapas || []).map((e) => e.dia))
        ).sort((a, b) => a - b)
      : baseDias
  );
  const [etapas, setEtapas] = useState(
    protocoloInicial
      ? (protocoloInicial.etapas || []).reduce((acc, e) => {
          const d = e.dia ?? 0;
          (acc[d] ||= []).push({
            hormonio: e.hormonio || "",
            acao: e.acao || "",
          });
          return acc;
        }, {})
      : {}
  );

  const [formDia, setFormDia] = useState(null);
  const [form, setForm] = useState({ hormonio: "", acao: "" });
  const overlayRef = useRef(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml || "";
      document.body.style.overflow = prevBody || "";
    };
  }, []);

  // commit automático
  const commitPendentes = useCallback(() => {
    if (formDia == null) return;
    const { hormonio, acao } = form || {};
    if (!hormonio && !acao) return;
    setEtapas((prev) => {
      const list = prev[formDia] ? [...prev[formDia]] : [];
      list.push({ hormonio: hormonio || "", acao: acao || "" });
      return { ...prev, [formDia]: list };
    });
    setForm({ hormonio: "", acao: "" });
  }, [formDia, form]);

  const buildEtapasList = useCallback(() => {
    const temp = { ...etapas };
    if (formDia != null && (form.hormonio || form.acao)) {
      (temp[formDia] ||= []).push({
        hormonio: form.hormonio || "",
        acao: form.acao || "",
      });
    }
    const list = [];
    Object.entries(temp).forEach(([d, arr]) => {
      (arr || []).forEach((e) => list.push({ ...e, dia: parseInt(d, 10) }));
    });
    return list.sort((a, b) => a.dia - b.dia);
  }, [etapas, formDia, form]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        commitPendentes();
        onFechar?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar, commitPendentes]);

  const handleOverlayDown = (e) => {
    if (e.target === overlayRef.current) {
      commitPendentes();
      onFechar?.();
    }
  };
  const stopWheel = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = e.deltaY;
    const atTop = el.scrollTop === 0 && delta < 0;
    const atBottom =
      Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight && delta > 0;
    if (atTop || atBottom) e.preventDefault();
  };

  const aplicarTemplate = (tplKey) => {
    const tpl = TEMPLATES[tplKey];
    if (!tpl) return;
    const novo = {};
    tpl.forEach((e) => {
      (novo[e.dia] ||= []).push({
        hormonio: e.hormonio || "",
        acao: e.acao || "",
      });
    });
    const ds = Object.keys(novo)
      .map(Number)
      .sort((a, b) => a - b);
    setDias(ds);
    setEtapas(novo);
    setFormDia(null);
    setForm({ hormonio: "", acao: "" });
  };

  const adicionarDia = () => {
    commitPendentes();
    const n = dias.length ? Math.max(...dias) + 1 : 0;
    setDias((d) => [...d, n]);
  };
  const removerDia = (d) => {
    commitPendentes();
    setDias((arr) => arr.filter((x) => x !== d));
    setEtapas((prev) => {
      const cp = { ...prev };
      delete cp[d];
      return cp;
    });
    if (formDia === d) setFormDia(null);
  };

  const abrirEtapa = (d) => {
    commitPendentes();
    setFormDia((cur) => (cur === d ? null : d));
    setForm({ hormonio: "", acao: "" });
  };

  const salvarEtapa = () => {
    if (formDia == null) return;
    if (!form.hormonio && !form.acao) {
      alert("Selecione um hormônio ou uma ação.");
      return;
    }
    setEtapas((prev) => {
      const list = prev[formDia] ? [...prev[formDia]] : [];
      list.push({ hormonio: form.hormonio || "", acao: form.acao || "" });
      return { ...prev, [formDia]: list };
    });
    setForm({ hormonio: "", acao: "" });
  };
  const removerEtapa = (dia, idx) => {
    setEtapas((prev) => {
      const list = prev[dia] ? [...prev[dia]] : [];
      list.splice(idx, 1);
      return { ...prev, [dia]: list };
    });
  };

  const totalEtapas = useMemo(
    () => Object.values(etapas).reduce((s, arr) => s + (arr?.length || 0), 0),
    [etapas]
  );
  const valido =
    nome.trim() && (totalEtapas > 0 || (form.hormonio || form.acao)) && tipo;

  const salvarProtocolo = () => {
    if (!valido) return;
    const etapasList = buildEtapasList();
    onSalvar?.(
      {
        nome,
        descricao,
        tipo: String(tipo || "").toUpperCase(),
        etapas: etapasList,
      },
      indiceEdicao
    );
    onFechar?.();
  };

  const ui = {
    card: {
      background: "#fff",
      border: "1px solid #E5E7EB",
      borderRadius: 10,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    },
  };
  const overlay = {
    position: "fixed",
    inset: 0,
    background: "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.35))",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backdropFilter: "blur(2px)",
  };
  const modal = {
    background: "#fff",
    width: "min(980px, 96vw)",
    height: "min(88vh, 760px)",
    borderRadius: 14,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
  const header = {
    padding: "12px 16px",
    background: "linear-gradient(135deg, #1F3FB6 0%, #3B82F6 100%)",
    color: "#fff",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 8,
    letterSpacing: 0.2,
    fontSize: 15,
  };
  const body = {
    display: "grid",
    gridTemplateColumns: "300px 1fr",
    gap: 14,
    padding: 14,
    overflowY: "auto",
    flex: 1,
  };
  const leftCard = { ...ui.card, padding: 10 };
  const rightGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 10,
    alignContent: "start",
  };
  const field =
    "w-full px-3 py-2 border border-gray-300 rounded-[10px] outline-none text-[13px]";

  return (
    <div
      ref={overlayRef}
      style={overlay}
      onMouseDown={handleOverlayDown}
      onWheelCapture={stopWheel}
      role="dialog"
      aria-modal="true"
    >
      <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontSize: 16 }}>🧬</span>
          <span>
            {indiceEdicao != null ? "Editar Protocolo" : "Cadastrar Protocolo"}
          </span>
        </div>

        {/* corpo rolável */}
        <div ref={scrollerRef} style={body}>
          {/* Coluna esquerda */}
          <div style={leftCard}>
            <div className="grid gap-2">
              <label>Tipo do Protocolo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value.toUpperCase())}
                className={field}
              >
                <option value="IATF">IATF</option>
                <option value="PRÉ-SINCRONIZAÇÃO">Pré-sincronização</option>
              </select>

              <label>Nome do Protocolo</label>
              <input
                className={field}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: IATF 9 dias"
              />

              <label>Descrição</label>
              <input
                className={field}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Uso interno (opcional)"
              />
            </div>

            <div className="mt-3 p-3 rounded-[10px] border border-dashed border-slate-300 bg-slate-50">
              <div className="font-extrabold mb-2">Templates rápidos</div>
              <div className="flex gap-2 flex-wrap">
                <BtnChip onClick={() => aplicarTemplate("IATF")}>
                  ⚡ IATF Padrão
                </BtnChip>
                <BtnChip onClick={() => aplicarTemplate("PRÉ-SINCRONIZAÇÃO")}>
                  ⚡ Pré-sincronização
                </BtnChip>
              </div>
            </div>

            <div className="mt-3 p-3 rounded-[10px] border border-indigo-100 bg-white">
              <div className="font-extrabold mb-2">Resumo</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center rounded border bg-white p-2">
                  <div className="text-xs text-slate-500">Dias</div>
                  <div className="text-lg font-extrabold">{dias.length}</div>
                </div>
                <div className="text-center rounded border bg-white p-2">
                  <div className="text-xs text-slate-500">Etapas</div>
                  <div className="text-lg font-extrabold">
                    {Object.values(etapas).reduce(
                      (s, arr) => s + (arr?.length || 0),
                      0
                    ) + (form.hormonio || form.acao ? 1 : 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna direita: grid de dias */}
          <div style={rightGrid}>
            {dias.map((d) => (
              <div
                key={d}
                className="p-2 text-[13px]"
                style={{
                  background: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 10,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-extrabold text-[14px]">
                    <span className="mr-1.5">🕒</span>Dia {d}
                  </div>
                  <div className="flex gap-2">
                    <BtnChip onClick={() => abrirEtapa(d)}>
                      {formDia === d ? "− Fechar" : "+ Nova Etapa"}
                    </BtnChip>
                    <BtnDanger onClick={() => removerDia(d)}>🗑 Remover</BtnDanger>
                  </div>
                </div>

                <div className="grid gap-1.5 mb-1.5">
                  {(etapas[d] || []).map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-[12px] bg-white border border-gray-200 rounded-md px-2 py-1"
                    >
                      {e.hormonio && (
                        <span className="font-bold">🧪 {e.hormonio}</span>
                      )}
                      {e.acao && <span className="font-bold">📎 {e.acao}</span>}
                      <button
                        onClick={() => removerEtapa(d, i)}
                        title="Excluir"
                        className="ml-auto inline-flex items-center px-2 py-[2px] rounded border border-gray-300 text-[12px] hover:border-gray-500"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>

                {formDia === d && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-gray-200 rounded-md p-2">
                    <div>
                      <label className="text-[11px]">Hormônio</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-[10px] outline-none text-[13px] mt-1"
                        value={form.hormonio}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, hormonio: e.target.value }))
                        }
                      >
                        <option value="">Nenhum</option>
                        {HORMONIOS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px]">Ação</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-[10px] outline-none text-[13px] mt-1"
                        value={form.acao}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, acao: e.target.value }))
                        }
                      >
                        <option value="">Nenhuma</option>
                        {ACOES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2 flex gap-2">
                      <BtnChip onClick={salvarEtapa}>➕ Adicionar</BtnChip>
                      <BtnChip
                        className="border-gray-300 text-gray-700 hover:border-gray-500"
                        onClick={() => {
                          commitPendentes();
                          setFormDia(null);
                        }}
                      >
                        Fechar
                      </BtnChip>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div>
              <BtnChip onClick={adicionarDia}>➕ Adicionar Dia</BtnChip>
            </div>
          </div>
        </div>

        {/* footer fixo */}
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-4 py-2.5">
          <BtnChip
            className="border-gray-300 text-gray-700 hover:border-gray-500"
            onClick={onFechar}
          >
            Cancelar
          </BtnChip>
          <BtnChip
            onClick={salvarProtocolo}
            disabled={!valido}
            className={!valido ? "opacity-60 pointer-events-none" : ""}
          >
            💾 Salvar Protocolo
          </BtnChip>
        </div>
      </div>
    </div>
  );
}

/* ================================ Protocolos (lista conectada) ================================ */
export default function Protocolos() {
  const [modalAberto, setModalAberto] = useState(false);
  const [indiceEdicao, setIndiceEdicao] = useState(null);
  const [protocoloExpandido, setProtocoloExpandido] = useState(null);

  const [busca, setBusca] = useState("");
  const [debouncedBusca, setDebouncedBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");

  const [protocolos, setProtocolos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // cache das vacas ativas por protocolo
  const [vinculos, setVinculos] = useState({}); // { [protKey]: { loading, error, items: [...] } }

  /* ----------- helpers de fetch dos vínculos/animais ativos ----------- */
  const fetchVinculosProtocolo = useCallback(
    async (prot) => {
      const pid = getId(prot);
      if (!pid) return;
      setVinculos((m) => ({ ...m, [pid]: { loading: true, error: "", items: [] } }));

      try {
        // Tente 1: endpoint genérico de aplicações/vínculos por protocolo
        let data;
        try {
          const r1 = await api.get("/api/v1/reproducao/aplicacoes", {
            params: { protocoloId: pid, status: "ATIVO", limit: 500 },
          });
          data = r1?.data;
        } catch {
          // Tente 2: endpoint específico por protocolo (vínculos)
          const r2 = await api.get(
            `/api/v1/reproducao/protocolos/${pid}/vinculos`,
            { params: { status: "ATIVO", limit: 500 } }
          );
          data = r2?.data;
        }

        const bruto =
          (Array.isArray(data?.items) && data.items) ||
          (Array.isArray(data?.data) && data.data) ||
          (Array.isArray(data) && data) ||
          [];

        const ultimoDia = Number.isFinite(+data?.meta?.ultimoDia)
          ? +data.meta.ultimoDia
          : maxDiaInseminacao(prot.etapas || []);
        const hoje = new Date();

        const items = bruto
          .map((x) => {
            // normaliza campos vindos do backend
            const numero = x?.numero ?? x?.animalNumero ?? x?.animal?.numero ?? null;
            const brinco = x?.brinco ?? x?.animalBrinco ?? x?.animal?.brinco ?? null;
            const dataInicio =
              x?.data_inicio ?? x?.dataInicio ?? x?.inicio ?? x?.started_at ?? null;
            return { numero, brinco, dataInicio };
          })
          .filter((x) => x.numero || x.brinco);

        // filtro por janela (até inseminação)
        const ativos = items.filter((it) => {
          const d0 = parseDateLoose(it.dataInicio);
          if (!d0) return false;
          const fim = addDays(d0, ultimoDia);
          // ativo se hoje <= fim
          return new Date(toISO(hoje)) <= new Date(toISO(fim));
        });

        // calcula próxima etapa para exibir
        const comProxima = ativos.map((it) => {
          const { descricao, data } = proximaEtapaInfo(
            prot.etapas || [],
            it.dataInicio,
            hoje
          );
          return {
            ...it,
            proximaDesc: descricao,
            proximaData: data ? toISO(data).split("-").reverse().join("/") : "—",
          };
        });

        setVinculos((m) => ({
          ...m,
          [pid]: { loading: false, error: "", items: comProxima },
        }));
      } catch (e) {
        console.error("Falha ao listar vínculos do protocolo:", e);
        setVinculos((m) => ({
          ...m,
          [pid]: {
            loading: false,
            error: "Não foi possível carregar as vacas ativas.",
            items: [],
          },
        }));
      }
    },
    []
  );

  /* ----------------- busca de protocolos (lista) ----------------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusca(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const parseEtapas = (maybe) => {
    if (!maybe) return [];
    if (Array.isArray(maybe)) return maybe;
    if (typeof maybe === "string") {
      try {
        const arr = JSON.parse(maybe);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    if (typeof maybe === "object") return Array.isArray(maybe) ? maybe : [];
    return [];
  };

  const carregar = async (query = debouncedBusca) => {
    try {
      setCarregando(true);
      setErro("");

      const params = { limit: 200 };
      const q = (query ?? "").trim();
      if (q) params.q = q;

      const { data } = await api.get("/api/v1/reproducao/protocolos", { params });

      const bruto =
        (Array.isArray(data?.items) && data.items) ||
        (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data) && data) ||
        [];

      const items = bruto.map((p) => ({
        ...p,
        tipo: String(p.tipo || "").toUpperCase(),
        etapas: parseEtapas(p.etapas),
      }));

      setProtocolos(items);
    } catch (e) {
      console.error("Falha ao listar protocolos:", e);
      const status = e?.response?.status;
      setErro(
        status
          ? `Falha ao carregar protocolos (HTTP ${status}).`
          : "Falha ao carregar protocolos."
      );
    } finally {
      setCarregando(false);
    }
  };

  const ultimaBuscaRef = useRef(null);
  useEffect(() => {
    if (ultimaBuscaRef.current === debouncedBusca) return;
    ultimaBuscaRef.current = debouncedBusca;
    carregar(debouncedBusca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBusca]);

  const abrirCadastro = () => {
    setIndiceEdicao(null);
    setModalAberto(true);
  };
  const editar = (idx) => {
    setIndiceEdicao(idx);
    setModalAberto(true);
  };
  const excluir = async (idx) => {
    try {
      const item = protocolos[idx];
      const pid = getId(item);
      if (!item || !pid) return;
      if (!confirm(`Excluir o protocolo "${item.nome}"?`)) return;
      await api.delete(`/api/v1/reproducao/protocolos/${pid}`);
      setProtocolos((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      console.error("Falha ao excluir:", e);
      alert("Não foi possível excluir o protocolo.");
    }
  };

  const toggleExpandir = (idx) => {
    setProtocoloExpandido((cur) => {
      const novo = cur === idx ? null : idx;
      if (novo !== null) {
        const prot = protocolos[novo];
        const pid = getId(prot);
        if (pid && !vinculos[pid]) {
          fetchVinculosProtocolo(prot);
        }
      }
      return novo;
    });
  };

  // salvar (create/update)
  const handleSalvar = async (protocolo, idxEdicao) => {
    try {
      const payload = {
        nome: protocolo.nome,
        descricao: protocolo.descricao || "",
        tipo: String(protocolo.tipo || "").toUpperCase(),
        etapas: protocolo.etapas || [],
        ativo: true,
      };

      if (idxEdicao != null) {
        const atual = protocolos[idxEdicao];
        const pid = getId(atual);
        if (!pid) {
          console.warn("Item sem id para atualização; recarregando...");
          await carregar();
          return;
        }
        const { data: atualizado } = await api.put(
          `/api/v1/reproducao/protocolos/${pid}`,
          payload
        );
        const norm = {
          ...atualizado,
          etapas: parseEtapas(atualizado?.etapas),
          tipo: String(atualizado?.tipo || "").toUpperCase(),
        };
        setProtocolos((prev) =>
          prev.map((p, i) => (i === idxEdicao ? norm : p))
        );
      } else {
        const { data: criado } = await api.post(
          "/api/v1/reproducao/protocolos",
          payload
        );
        const norm = {
          ...criado,
          etapas: parseEtapas(criado?.etapas),
          tipo: String(criado?.tipo || "").toUpperCase(),
        };
        setProtocolos((prev) => [norm, ...prev]);
      }
    } catch (e) {
      console.error("Falha ao salvar protocolo:", e);
      alert("Não foi possível salvar o protocolo.");
    }
  };

  const filtrados = useMemo(() => {
    const q = debouncedBusca.toLowerCase();
    return protocolos.filter((p) => {
      const okTipo = filtroTipo === "TODOS" || p.tipo === filtroTipo;
      const okBusca =
        !q ||
        (p.nome || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q);
      return okTipo && okBusca;
    });
  }, [protocolos, debouncedBusca, filtroTipo]);

  const totalIATF = protocolos.filter((p) => p.tipo === "IATF").length;
  const totalPre = protocolos.filter((p) => p.tipo === "PRÉ-SINCRONIZAÇÃO").length;

  return (
    <div className="w-full px-3 md:px-5 py-6 font-sans">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar protocolo…"
          className="h-9 px-3 rounded-md border border-gray-300 outline-none text-[13px] w-[220px]"
        />

        <TabButton
          active={filtroTipo === "TODOS"}
          onClick={() => setFiltroTipo("TODOS")}
          title="Todos"
        >
          Todos ({protocolos.length})
        </TabButton>

        <TabButton
          active={filtroTipo === "IATF"}
          onClick={() => setFiltroTipo("IATF")}
          title="IATF"
        >
          IATF ({totalIATF})
        </TabButton>

        <TabButton
          active={filtroTipo === "PRÉ-SINCRONIZAÇÃO"}
          onClick={() => setFiltroTipo("PRÉ-SINCRONIZAÇÃO")}
          title="Pré-sincronização"
        >
          Pré-sincr. ({totalPre})
        </TabButton>

        <div className="ml-auto flex items-center gap-2">
          <TabButton onClick={abrirCadastro}>Cadastrar Protocolo</TabButton>
          <TabButton onClick={() => carregar()} title="Atualizar lista">
            Atualizar
          </TabButton>
        </div>
      </div>

      {erro && (
        <div className="mb-3 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900">
          {erro}
        </div>
      )}

      <table className={table}>
        <thead>
          <tr>
            {TITULOS.map((t) => (
              <th key={t} className={thBase}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {carregando ? (
            <tr>
              <td className={tdBase} colSpan={5}>
                <div className="text-center text-gray-600 py-6">Carregando…</div>
              </td>
            </tr>
          ) : filtrados.length === 0 ? (
            <tr>
              <td className={tdBase} colSpan={5}>
                <div className="text-center text-gray-600 py-6">
                  {debouncedBusca
                    ? "Nenhum protocolo encontrado para a busca."
                    : "Nenhum protocolo cadastrado ainda."}
                </div>
              </td>
            </tr>
          ) : (
            filtrados.map((protocolo, index) => {
              const pid = getId(protocolo);
              const vinc = vinculos[pid];
              return (
                <Fragment key={pid || index}>
                  <tr className={`${rowBase} ${rowAlt}`}>
                    <td className={tdBase} style={{ fontWeight: 700 }}>
                      {protocolo.nome}
                    </td>
                    <td className={tdBase}>{protocolo.descricao || "—"}</td>
                    <td className={tdBase}>
                      <span className="px-2 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700">
                        {protocolo.tipo}
                      </span>
                    </td>
                    <td className={`${tdBase} whitespace-normal`}>
                      <BlocoEtapas etapas={protocolo.etapas} />
                    </td>
                    <td className={`${tdBase}`}>
                      <div className="flex flex-wrap gap-2">
                        <BtnChip onClick={() => editar(index)}>Editar</BtnChip>
                        <BtnDanger onClick={() => excluir(index)}>Excluir</BtnDanger>
                        <BtnChip onClick={() => toggleExpandir(index)}>
                          {protocoloExpandido === index
                            ? "🔼 Ocultar"
                            : "🔽 Ver Vacas"}
                        </BtnChip>
                      </div>
                    </td>
                  </tr>

                  {protocoloExpandido === index && (
                    <tr>
                      <td className={tdBase} colSpan={5}>
                        <div className="bg-gray-50 rounded border border-gray-200 p-2 text-sm">
                          <div className="text-center text-gray-500 mb-2">
                            Vacas ativas neste protocolo
                          </div>

                          {vinc?.loading ? (
                            <div className="text-center text-gray-600 py-3">
                              Carregando vacas…
                            </div>
                          ) : vinc?.error ? (
                            <div className="text-center text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                              {vinc.error}
                            </div>
                          ) : (vinc?.items || []).length === 0 ? (
                            <div className="text-center text-gray-500 py-3">
                              Nenhuma vaca ativa no período do protocolo.
                            </div>
                          ) : (
                            <table className="w-full text-left border border-gray-200 mt-1">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-2 py-1">Número</th>
                                  <th className="px-2 py-1">Brinco</th>
                                  <th className="px-2 py-1">Data de início</th>
                                  <th className="px-2 py-1">Próxima etapa</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vinc.items.map((it, i) => (
                                  <tr
                                    key={i}
                                    className="odd:bg-white even:bg-gray-50"
                                  >
                                    <td className="px-2 py-1">
                                      {it.numero || "—"}
                                    </td>
                                    <td className="px-2 py-1">
                                      {it.brinco || "—"}
                                    </td>
                                    <td className="px-2 py-1">
                                      {/* mostra em dd/mm/aaaa se vier em ISO */}
                                      {(() => {
                                        const d = parseDateLoose(it.dataInicio);
                                        return d
                                          ? toISO(d).split("-").reverse().join("/")
                                          : "—";
                                      })()}
                                    </td>
                                    <td className="px-2 py-1">
                                      {it.proximaDesc} {it.proximaData ? `(${it.proximaData})` : ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalCadastroProtocolo
          onFechar={() => {
            setModalAberto(false);
            setIndiceEdicao(null);
          }}
          onSalvar={handleSalvar}
          protocoloInicial={
            indiceEdicao != null
              ? {
                  ...protocolos[indiceEdicao],
                  etapas: Array.isArray(protocolos[indiceEdicao]?.etapas)
                    ? protocolos[indiceEdicao]?.etapas
                    : [],
                }
              : null
          }
          indiceEdicao={indiceEdicao}
        />
      )}
    </div>
  );
}

/* alias simples p/ não importar React.Fragment */
function Fragment({ children }) {
  return children;
}
