// src/pages/ConsumoReposicao/dieta.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import api from "../../api";

/** =========================================================
 * DIETA — CONECTADA AO BACKEND
 * - Lista:   GET /api/v1/consumo/dietas
 * - Criar:   POST /api/v1/consumo/dietas
 * - Editar:  PUT  /api/v1/consumo/dietas/:id
 * - Excluir: DELETE /api/v1/consumo/dietas/:id
 * - Aux: produtos (preços)  GET /api/v1/consumo/estoque  (categoria=cozinha)
 * - Aux: lotes (nº vacas)   GET /api/v1/consumo/lotes  +  /api/v1/animals (contagem real)
 * ========================================================= */

const STICKY_OFFSET = 48;

/* ===== estilos (iguais Limpeza/Secagem) ===== */
const tableClasses =
  "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase =
  "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap cursor-default";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs transition-colors";
const rowAlt = "even:bg-[#f7f7f8]";
const hoverTH = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");
const hoverTD = (i, hc) => (i === hc ? "bg-[rgba(33,150,243,0.08)]" : "");

/* ================= helpers compartilhados ================= */
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
  try {
    const { data } = await api.get("/api/v1/animals", { params: { page: 1, limit: 2000 } });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  } catch {
    return [];
  }
}

/* =================== Componente principal =================== */
export default function Dieta({ onCountChange }) {
  // mapas vindos do backend
  const [PRECOS, setPRECOS] = useState({}); // {nomeComercial: precoUnitario (R$/kg)} — apenas categoria cozinha
  const [LOTES, setLOTES] = useState({});   // {nome: numVacas} — contados pelos animais

  const [dietas, setDietas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [hoverCol, setHoverCol] = useState(null);
  const [modal, setModal] = useState({ open: false, index: null, dieta: null });
  const [excluir, setExcluir] = useState({ open: false, index: null });

  // carregar produtos (cozinha), lotes+contagem e dietas
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErro("");

        // === PRODUTOS (apenas categoria "cozinha") ===
        // aceitamos vários nomes/campos (categoria, grupo, setor)
        const { data: prodResp } = await api.get("/api/v1/consumo/estoque");
        const precoMap = {};
        const itemsProd = Array.isArray(prodResp?.items) ? prodResp.items : [];
        const isCozinha = (p) => {
          const c =
            (p?.categoria ||
              p?.categoriaNome ||
              p?.grupo ||
              p?.setor ||
              "")
              .toString()
              .toLowerCase();
          return c.includes("cozinha");
        };
        itemsProd
          .filter(isCozinha)
          .forEach((p) => {
            const nome = p?.nomeComercial || p?.nome;
            const preco = Number(p?.precoUnitario || 0);
            if (nome) precoMap[nome] = preco; // assumimos R$/kg
          });
        if (!alive) return;
        setPRECOS(precoMap);

        // === LOTES (map por nome) + CONTAGEM REAL (via /animals) ===
        const { data: lotesResp } = await api.get("/api/v1/consumo/lotes");
        const lotesArr = Array.isArray(lotesResp?.items) ? lotesResp.items : [];
        // inicia mapa nomes
        const nomePorId = {};
        const lotesMap = {};
        lotesArr.forEach((l) => {
          if (l?.id) nomePorId[l.id] = l.nome || null;
          if (l?.nome) lotesMap[l.nome] = 0;
        });
        // conta animais
        const animais = await fetchTodosAnimais();
        for (const a of animais) {
          const { id: lid, nome } = extractLoteFrom(a);
          const nomeFinal = nome || nomePorId[lid || ""] || null;
          if (nomeFinal != null) {
            lotesMap[nomeFinal] = (lotesMap[nomeFinal] || 0) + 1;
          }
        }
        if (!alive) return;
        setLOTES(lotesMap);

        // === DIETAS ===
        const { data: dietasResp } = await api.get("/api/v1/consumo/dietas");
        const list = Array.isArray(dietasResp?.items) ? dietasResp.items : [];
        const withCalc = list.map((d) =>
          d.custoTotal == null || d.custoVacaDia == null ? withCosts(d, precoMap) : d
        );
        withCalc.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
        if (!alive) return;
        setDietas(withCalc);
      } catch (e) {
        console.error("Erro ao carregar Dietas:", e);
        if (!alive) return;
        setErro("Não foi possível carregar do servidor.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // quando o Plantel/Lotes mudarem, recalcule nº de vacas dos lotes
    const h = async () => {
      const { data: lotesResp } = await api.get("/api/v1/consumo/lotes");
      const lotesArr = Array.isArray(lotesResp?.items) ? lotesResp.items : [];
      const nomePorId = {};
      const lotesMap = {};
      lotesArr.forEach((l) => {
        if (l?.id) nomePorId[l.id] = l.nome || null;
        if (l?.nome) lotesMap[l.nome] = 0;
      });
      const animais = await fetchTodosAnimais();
      for (const a of animais) {
        const { id: lid, nome } = extractLoteFrom(a);
        const nomeFinal = nome || nomePorId[lid || ""] || null;
        if (nomeFinal != null) lotesMap[nomeFinal] = (lotesMap[nomeFinal] || 0) + 1;
      }
      setLOTES(lotesMap);
    };
    window.addEventListener("animaisAtualizados", h);

    return () => {
      alive = false;
      window.removeEventListener("animaisAtualizados", h);
    };
  }, []);

  // chip da aba
  useEffect(() => onCountChange?.(dietas.length), [dietas.length, onCountChange]);

  const abrirNovo = () =>
    setModal({
      open: true,
      index: null,
      dieta: {
        id: null,
        lote: "",
        numVacas: 0,
        ingredientes: [{ produto: "", quantidade: "" }],
        data: new Date().toISOString(),
        custoTotal: 0,
        custoVacaDia: 0,
      },
    });

  const abrirEditar = (idx) =>
    setModal({
      open: true,
      index: idx,
      dieta: JSON.parse(JSON.stringify(dietas[idx])),
    });

  const salvar = async (dietaFinal) => {
    try {
      let saved;
      if (dietaFinal.id) {
        const { data } = await api.put(
          `/api/v1/consumo/dietas/${dietaFinal.id}`,
          dietaPayload(dietaFinal)
        );
        saved = data;
      } else {
        const { data } = await api.post(
          "/api/v1/consumo/dietas",
          dietaPayload(dietaFinal)
        );
        saved = data;
      }
      const calculado = withCosts(saved, PRECOS);
      setDietas((prev) => {
        const list = [...prev];
        const idx = list.findIndex((d) => d.id === calculado.id);
        if (idx >= 0) list[idx] = calculado;
        else list.push(calculado);
        list.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
        return list;
      });
      setModal({ open: false, index: null, dieta: null });
    } catch (e) {
      console.error("Erro ao salvar dieta:", e);
      alert("❌ Não foi possível salvar a dieta.");
    }
  };

  const confirmarExclusao = async () => {
    try {
      const item = dietas[excluir.index];
      if (item?.id) await api.delete(`/api/v1/consumo/dietas/${item.id}`);
      setDietas((prev) => prev.filter((_, i) => i !== excluir.index));
    } catch (e) {
      console.error("Erro ao excluir dieta:", e);
      alert("❌ Não foi possível excluir a dieta.");
    } finally {
      setExcluir({ open: false, index: null });
    }
  };

  const colunas = useMemo(
    () => [
      "Lote",
      "Nº de Vacas",
      "Custo Total",
      "Custo Vaca/dia",
      "Custo Vaca/mês",
      "Data",
      "Ação",
    ],
    []
  );

  const totais = useMemo(() => {
    const vacas = dietas.reduce((acc, d) => acc + Number(d.numVacas || 0), 0);
    const total = dietas.reduce((acc, d) => acc + Number(d.custoTotal || 0), 0);
    return {
      vacas,
      total,
      porVacaDia: vacas ? total / vacas : 0,
      porVacaMes: vacas ? (total / vacas) * 30 : 0,
    };
  }, [dietas]);

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        {/* barra de ações */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
            onClick={abrirNovo}
          >
            + Nova Dieta
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
            <col style={{ width: 180 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverTH(i, hoverCol)}`}
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
            ) : dietas.length === 0 ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">
                    Nenhuma dieta cadastrada.
                  </div>
                </td>
              </tr>
            ) : (
              dietas.map((d, idx) => {
                const itensTooltip = tooltipIngredientes(d);
                return (
                  <tr key={d.id || idx} className={`${rowBase} ${rowAlt} hover:bg-[#eaf5ff]`}>
                    <td className={`${tdClamp} ${hoverTD(0, hoverCol)}`} title={itensTooltip}>
                      {d.lote || "—"}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(1, hoverCol)}`}>
                      {d.numVacas || "—"}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(2, hoverCol)}`}>
                      {formatBRL(d.custoTotal)}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(3, hoverCol)}`}>
                      {formatBRL(d.custoVacaDia)}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(4, hoverCol)}`}>
                      {formatBRL((d.custoVacaDia || 0) * 30)}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(5, hoverCol)}`}>
                      {formatDateBR(d.data)}
                    </td>
                    <td className={`${tdBase} text-center ${hoverTD(6, hoverCol)}`}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                          onClick={() => abrirEditar(idx)}
                        >
                          Editar
                        </button>
                        <button
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/20 hover:border-red-600 text-red-700 hover:bg-red-50"
                          onClick={() => setExcluir({ open: true, index: idx })}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

        <tfoot>
            <tr className="bg-[#f6f8ff]">
              <td className={`${tdBase} font-bold`}>Totais</td>
              <td className={`${tdBase} text-center`}>{totais.vacas}</td>
              <td className={`${tdBase} text-center`}>{formatBRL(totais.total)}</td>
              <td className={`${tdBase} text-center`}>{formatBRL(totais.porVacaDia)}</td>
              <td className={`${tdBase} text-center`}>{formatBRL(totais.porVacaMes)}</td>
              <td className={tdBase} colSpan={2}></td>
            </tr>
          </tfoot>
        </table>

        {/* MODAIS */}
        {modal.open && (
          <Modal
            title="🥣 Cadastro de Dieta"
            onClose={() => setModal({ open: false, index: null, dieta: null })}
          >
            <CadastroDietaModal
              value={modal.dieta}
              precos={PRECOS}
              lotes={LOTES}
              onCancel={() => setModal({ open: false, index: null, dieta: null })}
              onSave={salvar}
            />
          </Modal>
        )}

        {excluir.open && (
          <Modal title="Confirmar exclusão" onClose={() => setExcluir({ open: false, index: null })}>
            <div className="text-[14px] text-[#374151]">Deseja realmente excluir esta dieta?</div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100"
                onClick={() => setExcluir({ open: false, index: null })}
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

/* =================== Modal de Cadastro/Edição =================== */
function CadastroDietaModal({ value, onCancel, onSave, precos = {}, lotes = {} }) {
  const PRODUTOS = Object.keys(precos);
  const LOTES = Object.keys(lotes);
  const [form, setForm] = useState(value);
  const wrapRef = useRef(null);   // para navegação ↑/↓/Enter

  const set = (k, v) => setForm((f) => withCosts({ ...f, [k]: v }, precos));
  const setIng = (idx, campo, val) => {
    const arr = [...form.ingredientes];
    arr[idx] = { ...arr[idx], [campo]: campo === "quantidade" ? num(val) : val };
    set("ingredientes", arr);
  };
  const addIng = () =>
    set("ingredientes", [...form.ingredientes, { produto: "", quantidade: "" }]);
  const rmIng = (idx) =>
    set("ingredientes", form.ingredientes.filter((_, i) => i !== idx));

  // foco inicial e navegação por teclado
  useEffect(() => {
    const el = wrapRef.current;
    // ESC fecha (evento no componente Modal também pega, mas deixo aqui por garantia)
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel?.(); return; }
      // setas navegam entre as linhas (campo Qtd)
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const inputs = el?.querySelectorAll?.('input[data-role="qty"]') || [];
        if (!inputs.length) return;
        const active = Array.from(inputs).findIndex((n) => n === document.activeElement);
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.max(0, Math.min(inputs.length - 1, (active >= 0 ? active + dir : 0)));
        inputs[next]?.focus();
        e.preventDefault();
      }
      // Enter adiciona ingrediente quando estiver em alguma linha
      if (e.key === "Enter") {
        const insideQty = (document.activeElement?.getAttribute?.("data-role") || "") === "qty";
        const insideProd = (document.activeElement?.getAttribute?.("data-role") || "") === "prod";
        if (insideQty || insideProd) {
          e.preventDefault();
          addIng();
          // foca nova linha (produto)
          requestAnimationFrame(() => {
            const lastProd = el?.querySelectorAll?.('select[data-role="prod"]');
            lastProd?.[lastProd.length - 1]?.focus();
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    // foco no 1º select
    requestAnimationFrame(() => {
      const first = el?.querySelector?.('select[data-role="lote"]');
      first?.focus?.();
    });
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, form.ingredientes.length]);

  return (
    <div className="flex flex-col gap-3" ref={wrapRef}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SelectInline
          label="Lote *"
          value={form.lote}
          options={LOTES}
          onChange={(v) => set("lote", v) || set("numVacas", lotes[v] || 0)}
          data-role="lote"
        />
        <Input label="Nº de Vacas" value={form.numVacas} readOnly />
        <Input
          label="Data"
          type="date"
          value={toInputDate(form.data)}
          onChange={(v) => set("data", fromInputDate(v))}
        />
      </div>

      {/* Cabeçalho da lista de ingredientes */}
      <div className="flex gap-2 font-semibold text-[#374151] mt-1">
        <div className="flex-1">Ingrediente</div>
        <div className="w-[130px] text-center">Qtd (kg/vaca)</div>
        <div className="w-[140px] text-center">Preço unit. (R$)</div>
        <div className="w-[140px] text-center">Parcial (R$)</div>
        <div className="w-[36px]" />
      </div>

      {form.ingredientes.map((ing, idx) => {
        const preco = ing.produto ? precos[ing.produto] ?? 0 : 0;
        const parcial =
          Number(form.numVacas || 0) * Number(ing.quantidade || 0) * preco;
        return (
          <div key={idx} className="flex items-center gap-2">
            <SelectInline
              hideLabel
              value={ing.produto}
              options={PRODUTOS}
              placeholder="Ingrediente"
              onChange={(v) => setIng(idx, "produto", v)}
              className="flex-1"
              data-role="prod"
            />
            <Input
              hideLabel
              type="number"
              placeholder="kg/vaca"
              value={ing.quantidade}
              onChange={(v) => setIng(idx, "quantidade", v)}
              className="w-[130px]"
              data-role="qty"
            />
            <div className="w-[140px] text-center font-bold text-[#111827]">
              {preco ? formatBRL(preco) : "—"}
            </div>
            <div className="w-[140px] text-center font-bold text-[#111827]">
              {parcial ? formatBRL(parcial) : "—"}
            </div>
            <button
              className="w-8 h-8 rounded-md bg-red-600 text-white font-black"
              onClick={() => rmIng(idx)}
              title="Remover ingrediente"
            >
              ×
            </button>
          </div>
        );
      })}

      <button
        className="self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#1e3a8a] text-white"
        onClick={addIng}
        title="Atalho: Enter em uma linha também adiciona"
      >
        + Ingrediente
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
        <Kpi label="Custo Total" value={formatBRL(form.custoTotal)} />
        <Kpi label="Custo Vaca/dia" value={formatBRL(form.custoVacaDia)} />
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <button
          className="px-4 py-2 rounded border border-gray-300 bg-gray-100"
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={() => {
            if (!form.lote) return alert("Selecione um lote.");
            onSave(form);
          }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

/* =================== Componentes simples =================== */
function Modal({ title, children, onClose }) {
  // ESC para fechar
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // clique fora fecha
  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: "bold" }}>{title}</div>
          <button
            className="px-2 text-white/90 hover:text-white"
            onClick={onClose}
            title="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}
function Input({
  label,
  value,
  onChange = () => {},
  type = "text",
  placeholder,
  readOnly = false,
  hideLabel = false,
  className = "",
  ...rest
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {!hideLabel && (
        <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      )}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3 py-2 rounded border ${
          readOnly ? "bg-gray-100" : "bg-white"
        } border-gray-300`}
        {...rest}
      />
    </div>
  );
}
function SelectInline({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Selecione...",
  hideLabel = false,
  className = "",
  ...rest
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {!hideLabel && (
        <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 bg-white"
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
function Kpi({ label, value }) {
  return (
    <div className="border border-[#e5e7eb] rounded-md p-3 bg-white">
      <div className="text-xs text-gray-600 font-bold">{label}</div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}

/* =================== Helpers =================== */
function dietaPayload(d) {
  return {
    lote: d.lote || "",
    numVacas: Number(d.numVacas || 0),
    data: d.data || new Date().toISOString(),
    ingredientes: (d.ingredientes || []).map((ing) => ({
      produtoId: ing.produtoId,   // opcional
      produto: ing.produto,       // nome
      quantidade: Number(ing.quantidade || 0), // kg/vaca/dia
    })),
  };
}
function withCosts(d, prices) {
  const numVacas = Number(d.numVacas || 0);
  const tot = (d.ingredientes || []).reduce((acc, ing) => {
    const preco = prices[ing.produto] ?? 0;
    const qv = Number(ing.quantidade || 0);
    return acc + preco * qv * numVacas;
  }, 0);
  return { ...d, custoTotal: tot, custoVacaDia: numVacas ? tot / numVacas : 0 };
}
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function formatBRL(n) {
  try {
    return (Number(n) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return `R$ ${(Number(n) || 0).toFixed(2)}`;
  }
}
function formatDateBR(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR");
}
function toInputDate(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d)) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function fromInputDate(s) {
  return s ? new Date(s + "T00:00:00").toISOString() : "";
}
function tooltipIngredientes(d) {
  const itens = (d.ingredientes || [])
    .map((ing) => `- ${ing.produto}: ${ing.quantidade} kg`)
    .join("\n");
  return `Ingredientes:\n${itens}`;
}

/* ===== estilos modal (iguais aos outros) ===== */
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
  padding: "0.8rem 1rem",
  fontWeight: "bold",
  fontSize: "1.05rem",
};
