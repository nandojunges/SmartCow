// src/pages/ConsumoReposicao/Lotes.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import Select from "react-select";
import api from "../../api";

/** =========================================================
 * LOTES
 * - CRUD em /api/v1/consumo/lotes
 * - Coluna “Nº de Vacas” calculada agrupando animais de /api/v1/animals
 * - Modal “Info” lista animais do lote (com navegação: ESC, ↑/↓, Enter)
 * - Atualiza contagem quando Plantel muda (evento window.animaisAtualizados)
 * ========================================================= */

const STICKY_OFFSET = 48;

/* ===== estilos ===== */
const tableClasses =
  "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase =
  "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs transition-colors";
const rowAlt = "even:bg-[#f7f7f8]";
const hoverTH = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");
const hoverTD = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");

/* pill status */
const pillBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 28,
  padding: "0 14px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 800,
  background: "#fff",
  border: "1.5px solid #e5e7eb",
  color: "#374151",
};
const pillOk = { borderColor: "#86efac", color: "#065f46" };
const pillMuted = { borderColor: "#e5e7eb", color: "#374151" };

/* react-select */
const rsStyles = {
  container: (base) => ({ ...base, width: "100%" }),
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 6,
    borderColor: state.isFocused ? "#2563eb" : "#d1d5db",
    boxShadow: state.isFocused ? "0 0 0 1px #2563eb" : "none",
    ":hover": { borderColor: "#2563eb" },
    fontSize: 14,
  }),
  valueContainer: (base) => ({ ...base, padding: "2px 8px" }),
  placeholder: (base) => ({ ...base, color: "#6b7280" }),
  menuPortal: (base) => ({ ...base, zIndex: 99999 }),
  menu: (base) => ({ ...base, zIndex: 99999 }),
};

/* modal base */
const overlay = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};
const modalCard = {
  background: "#fff",
  borderRadius: "1rem",
  width: "820px",
  maxHeight: "90vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  fontFamily: "Poppins, sans-serif",
};
const header = {
  background: "#1e40af",
  color: "white",
  padding: "1rem 1.2rem",
  fontWeight: "bold",
  fontSize: "1.05rem",
};

/* ================= helpers ================= */
const LOTE_ID_KEYS = ["current_lote_id", "lote_id", "loteId", "grupo_id", "grupoId"];
const LOTE_NOME_KEYS = ["current_lote_nome", "lote_nome", "loteNome", "grupo_nome", "grupoNome"];
function extractLoteFrom(obj) {
  if (!obj || typeof obj !== "object") return { id: null, nome: null };
  for (const k of LOTE_ID_KEYS) if (obj[k] != null) {
    const id = obj[k];
    let nome = null;
    for (const kk of LOTE_NOME_KEYS) if (obj[kk] != null) { nome = obj[kk]; break; }
    return { id, nome };
  }
  if (obj.historico && typeof obj.historico === "object" && obj.historico.lote) {
    return { id: obj.historico.lote?.id ?? null, nome: obj.historico.lote?.nome ?? null };
  }
  if (obj.lote && typeof obj.lote === "object") {
    return { id: obj.lote.id ?? obj.loteId ?? null, nome: obj.lote.nome ?? obj.loteNome ?? null };
  }
  if (obj.grupo && typeof obj.grupo === "object") {
    return { id: obj.grupo.id ?? obj.grupoId ?? null, nome: obj.grupo.nome ?? obj.grupoNome ?? null };
  }
  return { id: null, nome: null };
}

async function fetchTodosAnimais() {
  // busca página grande; se seu backend paginar, aumente o limit ou adicione laço.
  try {
    const { data } = await api.get("/api/v1/animals", { params: { page: 1, limit: 1000 } });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  } catch {
    return [];
  }
}

function idadeMeses(nascDDMMYYYY) {
  if (!nascDDMMYYYY || nascDDMMYYYY.length !== 10) return null;
  const [d, m, a] = nascDDMMYYYY.split("/").map(Number);
  const dt = new Date(a, m - 1, d);
  return Math.max(0, Math.floor((Date.now() - dt) / (1000 * 60 * 60 * 24 * 30.44)));
}

function ordenarPorNumero(arr) {
  const items = Array.isArray(arr) ? arr.slice() : [];
  items.sort((a, b) => {
    const na = (a?.numero ?? "").toString().padStart(6, "0");
    const nb = (b?.numero ?? "").toString().padStart(6, "0");
    return na.localeCompare(nb);
  });
  return items;
}

/* ================= componente ================= */
export default function Lotes() {
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // UI
  const [hoverCol, setHoverCol] = useState(null);
  const [cad, setCad] = useState({ open: false, index: null, lote: null });
  const [info, setInfo] = useState(null);
  const [excluirIdx, setExcluirIdx] = useState(null);

  // ===== carregar lotes =====
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErro("");
        setLoading(true);
        const { data } = await api.get("/api/v1/consumo/lotes");
        const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        if (!alive) return;
        list.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        // numVacas será preenchido já-já
        setLotes(list.map((l) => ({ ...l, numVacas: Number(l.numVacas ?? 0) })));
      } catch (e) {
        console.error("Erro ao carregar lotes:", e);
        if (!alive) return;
        setErro("Não foi possível carregar do servidor.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ===== contagem real agrupando animais =====
  const recalcularContagem = async () => {
    const animais = await fetchTodosAnimais();
    const counts = {};
    for (const a of animais) {
      const { id: loteId } = extractLoteFrom(a);
      if (loteId) counts[loteId] = (counts[loteId] || 0) + 1;
    }
    setLotes((prev) => prev.map((l) => ({ ...l, numVacas: counts[l.id] || 0 })));
  };

  // após montar e quando o Plantel avisar mudança
  useEffect(() => {
    recalcularContagem();
    const h = () => recalcularContagem();
    window.addEventListener("animaisAtualizados", h);
    return () => window.removeEventListener("animaisAtualizados", h);
  }, []);

  // ===== Ações =====
  const abrirCadastro = () =>
    setCad({
      open: true,
      index: null,
      lote: {
        id: null,
        nome: "",
        funcao: "Lactação",
        nivelProducao: "",
        tipoTratamento: "",
        motivoDescarte: "",
        descricao: "",
        ativo: true,
        numVacas: 0,
      },
    });

  const abrirEdicao = (i) =>
    setCad({ open: true, index: i, lote: JSON.parse(JSON.stringify(lotes[i])) });

  const salvar = async (loteFinal) => {
    try {
      let saved;
      if (loteFinal.id) {
        const { data } = await api.put(`/api/v1/consumo/lotes/${loteFinal.id}`, loteFinal);
        saved = data;
      } else {
        const { data } = await api.post("/api/v1/consumo/lotes", loteFinal);
        saved = data;
      }
      setLotes((prev) => {
        const arr = [...prev];
        const idx = arr.findIndex((l) => l.id === saved.id);
        if (idx >= 0) arr[idx] = saved;
        else arr.push(saved);
        return arr
          .map((l) => ({ ...l, numVacas: Number(l.numVacas ?? 0) }))
          .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
      });
      setCad({ open: false, index: null, lote: null });
      recalcularContagem();
    } catch (e) {
      console.error("Erro ao salvar lote:", e);
      alert("❌ Não foi possível salvar o lote.");
    }
  };

  const alternarAtivo = async (i) => {
    try {
      const cur = lotes[i];
      if (!cur) return;
      const payload = { ...cur, ativo: !cur.ativo };
      const { data } = await api.put(`/api/v1/consumo/lotes/${cur.id}`, payload);
      setLotes((prev) => {
        const arr = [...prev];
        arr[i] = { ...data, numVacas: prev[i]?.numVacas ?? 0 };
        return arr;
      });
    } catch (e) {
      console.error("Erro ao alternar status:", e);
      alert("❌ Não foi possível alterar o status do lote.");
    }
  };

  const confirmarExclusao = async () => {
    try {
      const item = lotes[excluirIdx];
      if (item?.id) await api.delete(`/api/v1/consumo/lotes/${item.id}`);
      setLotes((prev) => prev.filter((_, i) => i !== excluirIdx));
    } catch (e) {
      console.error("Erro ao excluir lote:", e);
      alert("❌ Não foi possível excluir o lote.");
    } finally {
      setExcluirIdx(null);
      recalcularContagem();
    }
  };

  const colunas = useMemo(
    () => ["Nome", "Nº de Vacas", "Função", "Nível Produtivo", "Status", "Ação"],
    []
  );

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
            onClick={abrirCadastro}
          >
            + Cadastrar Lote
          </button>
          <div className="flex items-center gap-2" />
        </div>

        {erro && (
          <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-2 rounded">
            {erro}
          </div>
        )}

        <table className={tableClasses}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 160 }} />
          </colgroup>
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c}
                  className={`${thBase} ${hoverTH(i, hoverCol)}`}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  style={{ top: STICKY_OFFSET }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-[#1e3a8a] py-6">Carregando…</div>
                </td>
              </tr>
            ) : lotes.length === 0 ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">Nenhum lote cadastrado.</div>
                </td>
              </tr>
            ) : (
              lotes.map((l, i) => (
                <tr key={l.id || i} className={`${rowBase} ${rowAlt} hover:bg-[#eaf5ff]`}>
                  <td className={`${tdClamp} ${hoverTD(0, hoverCol)}`}>{l.nome || "—"}</td>

                  <td className={`${tdClamp} ${hoverTD(1, hoverCol)}`}>
                    <div className="inline-flex items-center gap-2">
                      <span>{typeof l.numVacas === "number" ? l.numVacas : 0}</span>
                      <button
                        title="Informações do lote"
                        className="px-2 py-1 rounded border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                        onClick={() => setInfo(l)}
                      >
                        ℹ️
                      </button>
                    </div>
                  </td>

                  <td className={`${tdClamp} ${hoverTD(2, hoverCol)}`}>{l.funcao || "—"}</td>
                  <td className={`${tdClamp} ${hoverTD(3, hoverCol)}`}>
                    {l.funcao === "Lactação" ? l.nivelProducao || "—" : "—"}
                  </td>

                  <td className={`${tdClamp} ${hoverTD(4, hoverCol)}`}>
                    <span style={{ ...pillBase, ...(l.ativo ? pillOk : pillMuted) }}>
                      {l.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>

                  <td className={`${tdBase} ${hoverTD(5, hoverCol)}`}>
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                        onClick={() => abrirEdicao(i)}
                      >
                        Editar
                      </button>
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50"
                        onClick={() => alternarAtivo(i)}
                      >
                        {l.ativo ? "Inativar" : "Ativar"}
                      </button>
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/20 hover:border-red-600 text-red-700 hover:bg-red-50"
                        onClick={() => setExcluirIdx(i)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* MODAIS */}
        {cad.open && (
          <Modal
            title={cad.index != null ? "✏️ Editar Lote" : "➕ Cadastro de Lote"}
            onClose={() => setCad({ open: false, index: null, lote: null })}
          >
            <CadastroLoteModal
              value={cad.lote}
              onCancel={() => setCad({ open: false, index: null, lote: null })}
              onSave={salvar}
            />
          </Modal>
        )}

        {info && (
          <Modal title={`📋 ${info.nome} — ${info.funcao || "—"}`} onClose={() => setInfo(null)}>
            <InfoLoteModalBody lote={info} />
            <div className="flex justify-end mt-3">
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
                onClick={() => setInfo(null)}
              >
                Fechar
              </button>
            </div>
          </Modal>
        )}

        {excluirIdx !== null && (
          <Modal title="Confirmar exclusão" onClose={() => setExcluirIdx(null)}>
            <div className="text-[14px] text-[#374151]">Deseja realmente excluir este lote?</div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100"
                onClick={() => setExcluirIdx(null)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-red-600 text-white"
                onClick={confirmarExclusao}
              >
                Excluir
              </button>
            </div>
          </Modal>
        )}
      </div>
    </section>
  );
}

/* =================== Modal: Cadastro/Edição =================== */
function CadastroLoteModal({ value, onCancel, onSave }) {
  const funcoes = ["Lactação", "Tratamento", "Descarte", "Secagem", "Pré-parto", "Novilhas", "Outro"];
  const niveis = ["Alta Produção", "Média Produção", "Baixa Produção"];
  const tratamentos = ["Mastite", "Pós-parto", "Outro"];
  const motivos = ["Produção baixa", "Lesão", "Problemas podais", "Outro"];

  const [form, setForm] = useState(value);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-2">
        <Input label="Nome *" value={form.nome} onChange={(v) => set("nome", v)} />
        <SelectRS
          label="Função *"
          value={form.funcao}
          options={funcoes}
          onChange={(v) => set("funcao", v)}
        />
      </div>

      {form.funcao === "Lactação" && (
        <SelectRS
          label="Nível Produtivo *"
          value={form.nivelProducao}
          options={niveis}
          onChange={(v) => set("nivelProducao", v)}
        />
      )}
      {form.funcao === "Tratamento" && (
        <SelectRS
          label="Tipo de Tratamento *"
          value={form.tipoTratamento}
          options={tratamentos}
          onChange={(v) => set("tipoTratamento", v)}
        />
      )}
      {form.funcao === "Descarte" && (
        <SelectRS
          label="Motivo do Descarte *"
          value={form.motivoDescarte}
          options={motivos}
          onChange={(v) => set("motivoDescarte", v)}
        />
      )}

      <Input label="Descrição" value={form.descricao} onChange={(v) => set("descricao", v)} />

      <div className="flex items-center gap-3">
        <span className="text-[12px] font-bold text-[#374151]">Status</span>
        <span style={{ ...pillBase, ...(form.ativo ? pillOk : pillMuted) }}>
          {form.ativo ? "Ativo" : "Inativo"}
        </span>
        <label className="ml-2 inline-flex items-center gap-2">
          <input type="checkbox" checked={!!form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          <span>Ativo</span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button className="px-3 py-2 rounded border border-gray-300 bg-gray-100" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="px-3 py-2 rounded bg-blue-600 text-white"
          onClick={() => {
            if (!form.nome || !form.funcao) return alert("Preencha os campos obrigatórios.");
            if (form.funcao === "Lactação" && !form.nivelProducao) return alert("Informe o nível produtivo.");
            if (form.funcao === "Tratamento" && !form.tipoTratamento) return alert("Informe o tipo de tratamento.");
            if (form.funcao === "Descarte" && !form.motivoDescarte) return alert("Informe o motivo do descarte.");
            onSave(form);
          }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

/* =================== Modal: Info do Lote =================== */
function InfoLoteModalBody({ lote }) {
  const [animais, setAnimais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErro("");
        setLoading(true);
        const all = await fetchTodosAnimais();
        const filtrados = all.filter((a) => extractLoteFrom(a).id === lote.id);
        if (!alive) return;
        setAnimais(ordenarPorNumero(filtrados));
        setActive(0);
      } catch (e) {
        if (!alive) return;
        console.error("Erro ao carregar animais do lote:", e);
        setErro("Não foi possível carregar os animais deste lote.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [lote?.id]);

  // foco + navegação por teclado
  useEffect(() => {
    const el = listRef.current;
    if (el) el.focus();

    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(animais.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const rows = el?.querySelectorAll?.("tr[data-row]");
        const r = rows?.[active];
        if (r) {
          r.classList.add("bg-[#dbeafe]");
          setTimeout(() => r.classList.remove("bg-[#dbeafe]"), 180);
          r.scrollIntoView({ block: "nearest" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, animais.length]);

  const colunas = useMemo(() => ["Nº", "Brinco", "Categoria", "Idade (meses)"], []);

  return (
    <div className="max-h-[70vh] overflow-auto outline-none" tabIndex={0} ref={listRef}>
      {erro && (
        <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-2 rounded">
          {erro}
        </div>
      )}

      <table className={tableClasses}>
        <thead>
          <tr>{colunas.map((c) => <th key={c} className={thBase}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className={tdBase} colSpan={colunas.length}>
                <div className="text-center text-[#1e3a8a] py-6">Carregando…</div>
              </td>
            </tr>
          ) : animais.length === 0 ? (
            <tr>
              <td className={tdBase} colSpan={colunas.length}>
                <div className="text-center text-gray-700 py-6">
                  Nenhum animal associado a este lote.
                  <div className="text-sm text-gray-500 mt-2">
                    Vá em <strong>Plantel → Ações → Mover para Lote</strong> para associar animais.
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            animais.map((a, i) => (
              <tr
                key={a.id || i}
                data-row
                className={`${rowBase} ${rowAlt} ${i === active ? "bg-[#eaf5ff]" : ""}`}
                onMouseEnter={() => setActive(i)}
              >
                <td className={tdClamp}>{a.numero ?? i + 1}</td>
                <td className={tdBase}>{a.brinco ?? "—"}</td>
                <td className={tdBase}>{a.categoria ?? a.classe ?? "—"}</td>
                <td className={tdBase}>{a.idadeMeses ?? idadeMeses(a.nascimento) ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =================== Modal base =================== */
function Modal({ title, children, onClose }) {
  // ESC fecha
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // clique fora fecha
  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header} className="flex items-center justify-between">
          <div style={{ fontWeight: "bold" }}>{title}</div>
          <button className="px-2 text-white/90 hover:text-white" onClick={onClose}>×</button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/* =================== Inputs =================== */
function Input({ label, value, onChange = () => {}, type = "text" }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 bg-white"
      />
    </div>
  );
}

function SelectRS({ label, value, onChange, options = [], placeholder = "Selecione..." }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const valObj = opts.find((o) => o.value === value) || null;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      <Select
        value={valObj}
        onChange={(opt) => onChange(opt?.value ?? "")}
        options={opts}
        placeholder={placeholder}
        isClearable
        styles={rsStyles}
        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      />
    </div>
  );
}
