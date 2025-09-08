// src/pages/ConsumoReposicao/limpeza.jsx
import React, { useMemo, useState, useEffect } from "react";
import api from "../../api";

/** =========================================================
 *  LIMPEZA — CONECTADO AO BACKEND (layout como Secagem/Leite)
 *  - Lista vinda de /api/v1/consumo/limpeza/ciclos
 *  - CRUD de ciclo (POST/PUT/DELETE)
 *  - Produtos/preços/estoque de /api/v1/consumo/estoque
 *  - Cabeçalho sticky, colunas com hover
 * ========================================================= */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPOS = ["Ordenhadeira", "Resfriador", "Tambo", "Outros"];
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

/* ===== helpers ===== */
const formatBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const convToMl = (valor, unidade) => {
  const v = Number(valor) || 0;
  const u = String(unidade || "").toLowerCase();
  return u.startsWith("l") ? v * 1000 : v;
};

const parseCond = (c) => {
  if (!c) return { tipo: "sempre" };
  if (typeof c === "object") return c;
  if (String(c).toLowerCase().includes("manhã")) return { tipo: "manha" };
  if (String(c).toLowerCase().includes("tarde")) return { tipo: "tarde" };
  const m = String(c).match(/a cada\s*(\d+)/i);
  if (m) return { tipo: "cada", intervalo: parseInt(m[1]) };
  return { tipo: "sempre" };
};

const vezesPorDia = (cond, freq) => {
  switch (cond?.tipo) {
    case "cada":
      return (Number(freq) || 1) / Math.max(1, Number(cond.intervalo) || 1);
    case "manha":
    case "tarde":
      return 1;
    default:
      return Number(freq) || 1;
  }
};

/* ==================== Componente principal ==================== */
export default function Limpeza({ onCountChange }) {
  // mapas vindos da API
  const [precoPorML, setPrecoPorML] = useState({});
  const [estoqueML, setEstoqueML] = useState({});

  // ciclos da API
  const [ciclos, setCiclos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // UI
  const [hoverCol, setHoverCol] = useState(null);
  const [modal, setModal] = useState({ open: false, index: null, ciclo: null });
  const [planoDe, setPlanoDe] = useState(null);
  const [excluirIdx, setExcluirIdx] = useState(null);

  // ===== carregamento inicial (produtos + ciclos) =====
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErro("");

        // 1) produtos/estoque/preço
        const { data: prodResp } = await api.get("/api/v1/consumo/estoque");
        const items = Array.isArray(prodResp?.items) ? prodResp.items : [];

        const priceMap = {};
        const stockMap = {};

        items.forEach((p) => {
          const nome = p?.nomeComercial || p?.nome;
          if (!nome) return;

          const unidade = String(p?.unidade || "").toLowerCase();
          const qtd = Number(p?.quantidade || 0);
          const precoUnit = Number(p?.precoUnitario || 0);

          // heurística simples: líquidos em L → dividir por 1000 para chegar em mL
          const stockMl =
            unidade.startsWith("l") ? qtd * 1000 : unidade.includes("ml") ? qtd : 0;

          // idem para preço (R$/L -> R$/mL). Se já vier em R$/mL, deixe como está.
          const priceMl =
            unidade.startsWith("l")
              ? precoUnit / 1000
              : unidade.includes("ml")
              ? precoUnit
              : 0;

          stockMap[nome] = stockMl;
          priceMap[nome] = priceMl;
        });

        if (!alive) return;
        setPrecoPorML(priceMap);
        setEstoqueML(stockMap);

        // 2) ciclos
        const { data: ciclosResp } = await api.get("/api/v1/consumo/limpeza/ciclos");
        if (!alive) return;
        const list = Array.isArray(ciclosResp?.items)
          ? ciclosResp.items
          : Array.isArray(ciclosResp)
          ? ciclosResp
          : [];
        list.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        setCiclos(list);
      } catch (e) {
        console.error("Erro ao carregar Limpeza:", e);
        if (!alive) return;
        setErro("Não foi possível carregar do servidor.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // atualiza o número do chip na aba
  useEffect(() => {
    onCountChange?.(ciclos.length || 0);
  }, [ciclos.length, onCountChange]);

  // ===== Ações =====
  const abrirCadastro = () =>
    setModal({
      open: true,
      index: null,
      ciclo: {
        id: null,
        nome: "",
        tipo: "",
        diasSemana: [],
        frequencia: 1,
        etapas: [
          {
            produto: "",
            quantidade: "",
            unidade: "mL",
            condicao: { tipo: "sempre" },
            complementar: false,
          },
        ],
      },
    });

  const abrirEdicao = (i) =>
    setModal({ open: true, index: i, ciclo: JSON.parse(JSON.stringify(ciclos[i])) });

  const salvar = async (cicloFinal) => {
    try {
      let saved;
      if (cicloFinal.id) {
        const { data } = await api.put(
          `/api/v1/consumo/limpeza/ciclos/${cicloFinal.id}`,
          cicloFinal
        );
        saved = data;
      } else {
        const { data } = await api.post(
          "/api/v1/consumo/limpeza/ciclos",
          cicloFinal
        );
        saved = data;
      }
      setCiclos((prev) => {
        const list = [...prev];
        const idx = list.findIndex((c) => c.id === saved.id);
        if (idx >= 0) list[idx] = saved;
        else list.push(saved);
        return list.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
      });
      setModal({ open: false, index: null, ciclo: null });
    } catch (e) {
      console.error("Erro ao salvar ciclo:", e);
      alert("❌ Não foi possível salvar o ciclo.");
    }
  };

  const confirmarExclusao = async () => {
    try {
      const item = ciclos[excluirIdx];
      if (item?.id) {
        await api.delete(`/api/v1/consumo/limpeza/ciclos/${item.id}`);
      }
      setCiclos((prev) => prev.filter((_, i) => i !== excluirIdx));
    } catch (e) {
      console.error("Erro ao excluir ciclo:", e);
      alert("❌ Não foi possível excluir o ciclo.");
    } finally {
      setExcluirIdx(null);
    }
  };

  // ===== cálculos visuais =====
  const custoDiario = (c) => {
    const freq = Number(c.frequencia) || 1;
    const dia = (c.etapas || []).reduce((acc, e) => {
      const cond = parseCond(e.condicao);
      const vezes = vezesPorDia(cond, freq);
      const ml = convToMl(e.quantidade, e.unidade);
      const preco = precoPorML[e.produto] ?? 0;
      return acc + ml * vezes * preco;
    }, 0);
    return dia ? formatBRL(dia) : "—";
  };

  const duracaoEstimada = (c) => {
    const freq = Number(c.frequencia) || 1;
    let minDias = Infinity;
    (c.etapas || []).forEach((e) => {
      const cond = parseCond(e.condicao);
      const vezes = vezesPorDia(cond, freq);
      const mlDia = convToMl(e.quantidade, e.unidade) * vezes;
      const estoque = estoqueML[e.produto] ?? 0;
      if (mlDia > 0) minDias = Math.min(minDias, estoque / mlDia);
    });
    if (!isFinite(minDias) || minDias === Infinity) return "—";
    const d = Math.floor(minDias);
    return `${d} dia${d !== 1 ? "s" : ""}`;
  };

  const colunas = [
    "Nome do ciclo",
    "Tipo",
    "Frequência",
    "Dias da semana",
    "Duração estimada",
    "Custo diário",
    "Etapas",
    "Ação",
  ];

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        {/* barra de ações (sem título visível) */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
            onClick={abrirCadastro}
          >
            + Cadastrar ciclo
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
            <col style={{ width: 120 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 320 }} />
            <col style={{ width: 160 }} />
          </colgroup>
          <thead>
            <tr>
              {colunas.map((h, i) => (
                <th
                  key={h}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverTH(i, hoverCol)}`}
                  style={{ top: STICKY_OFFSET }}
                >
                  {h}
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
            ) : ciclos.length === 0 ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">
                    Nenhum ciclo cadastrado.
                  </div>
                </td>
              </tr>
            ) : (
              ciclos.map((c, i) => (
                <tr key={c.id || i} className={`${rowBase} ${rowAlt} hover:bg-[#eaf5ff]`}>
                  <td className={`${tdClamp} ${hoverTD(0, hoverCol)}`}>{c.nome || "—"}</td>
                  <td className={`${tdClamp} text-center ${hoverTD(1, hoverCol)}`}>{c.tipo || "—"}</td>
                  <td className={`${tdClamp} text-center ${hoverTD(2, hoverCol)}`}>
                    {c.frequencia ? `${c.frequencia}x/dia` : "—"}
                  </td>
                  <td className={`${tdClamp} text-center ${hoverTD(3, hoverCol)}`}>
                    {(c.diasSemana || []).map((d) => DIAS[d]).join(", ") || "—"}
                  </td>
                  <td className={`${tdClamp} text-center ${hoverTD(4, hoverCol)}`}>
                    <StatusPill label={duracaoEstimada(c)} color="#1e40af" />
                  </td>
                  <td className={`${tdClamp} text-center ${hoverTD(5, hoverCol)}`}>
                    <StatusPill label={custoDiario(c)} color="#16a34a" />
                  </td>
                  <td
                    className={`${tdClamp} ${hoverTD(6, hoverCol)}`}
                    title={(c.etapas || [])
                      .map((e) => `${e.produto} - ${e.quantidade} ${e.unidade}`)
                      .join(" | ")}
                  >
                    {(c.etapas || [])
                      .map((e) => `${e.produto} - ${e.quantidade} ${e.unidade}`)
                      .join(", ")}
                  </td>
                  <td className={`${tdBase} text-center ${hoverTD(7, hoverCol)}`}>
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                        onClick={() => abrirEdicao(i)}
                      >
                        Editar
                      </button>
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-500/20 hover:border-red-600 text-red-700 hover:bg-red-50"
                        onClick={() => setExcluirIdx(i)}
                      >
                        Excluir
                      </button>
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50"
                        onClick={() => setPlanoDe(c)}
                      >
                        Ver plano
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* MODAIS */}
        {modal.open && (
          <Modal
            title="🧼 Cadastro de Ciclo"
            onClose={() => setModal({ open: false, index: null, ciclo: null })}
          >
            <CadastroCicloModal
              value={modal.ciclo}
              onCancel={() => setModal({ open: false, index: null, ciclo: null })}
              onSave={salvar}
              tipos={TIPOS}
              produtos={Object.keys(precoPorML)}
            />
          </Modal>
        )}

        {planoDe && (
          <Modal title="Plano de Limpeza" onClose={() => setPlanoDe(null)}>
            <PlanoSemanal ciclo={planoDe} />
            <div className="flex justify-end mt-3">
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
                onClick={() => setPlanoDe(null)}
              >
                Fechar
              </button>
            </div>
          </Modal>
        )}

        {excluirIdx !== null && (
          <Modal title="Confirmar exclusão" onClose={() => setExcluirIdx(null)}>
            <div className="text-[14px] text-[#374151]">Deseja realmente excluir este ciclo?</div>
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

/* =================== Parciais/Modais =================== */
function CadastroCicloModal({ value, onCancel, onSave, tipos = [], produtos = [] }) {
  const [form, setForm] = useState(value);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDia = (d) =>
    set(
      "diasSemana",
      form.diasSemana.includes(d)
        ? form.diasSemana.filter((x) => x !== d)
        : [...form.diasSemana, d]
    );

  const setEtapa = (i, campo, val) => {
    const arr = [...form.etapas];
    arr[i] = { ...arr[i], [campo]: campo === "quantidade" ? Number(val) : val };
    set("etapas", arr);
  };
  const addEtapa = () =>
    set("etapas", [
      ...form.etapas,
      { produto: "", quantidade: "", unidade: "mL", condicao: { tipo: "sempre" }, complementar: false },
    ]);
  const rmEtapa = (i) => set("etapas", form.etapas.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-3">
      <Input label="Nome do ciclo *" value={form.nome} onChange={(v) => set("nome", v)} />
      <SelectInline
        label="Tipo do ciclo *"
        value={form.tipo}
        onChange={(v) => set("tipo", v)}
        options={tipos}
      />

      <div>
        <div className="text-[12px] font-bold text-[#374151] mb-1">Dias da semana *</div>
        <div className="flex gap-2 flex-wrap">
          {DIAS.map((d, idx) => (
            <label key={d} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.diasSemana.includes(idx)}
                onChange={() => toggleDia(idx)}
              />
              <span>{d}</span>
            </label>
          ))}
        </div>
      </div>

      <SelectInline
        label="Frequência por dia *"
        value={String(form.frequencia)}
        onChange={(v) => set("frequencia", Number(v))}
        options={["1", "2", "3"]}
      />

      <div className="text-[14px] font-extrabold mt-1 text-[#111827]">Etapas de limpeza</div>

      {form.etapas.map((e, i) => (
        <div key={i} className="border border-[#e5e7eb] rounded-xl p-3 bg-white">
          <div className="font-bold mb-2">Etapa {i + 1}</div>

          <SelectInline
            label="Produto *"
            value={e.produto}
            onChange={(v) => setEtapa(i, "produto", v)}
            options={produtos}
          />

          <div className="flex gap-2">
            <Input
              label="Quantidade *"
              type="number"
              value={e.quantidade}
              onChange={(v) => setEtapa(i, "quantidade", v)}
              style={{ flex: 1 }}
            />
            <SelectInline
              label="Unidade"
              value={e.unidade}
              onChange={(v) => setEtapa(i, "unidade", v)}
              options={["mL", "litros"]}
              style={{ width: 160 }}
            />
          </div>

          <div className="flex gap-2">
            <SelectInline
              label="Condição"
              value={e.condicao?.tipo || "sempre"}
              onChange={(v) =>
                setEtapa(i, "condicao", {
                  tipo: v,
                  intervalo: v === "cada" ? e.condicao?.intervalo || 2 : undefined,
                })
              }
              options={["sempre", "cada", "manha", "tarde"]}
              style={{ flex: 1 }}
            />
            {e.condicao?.tipo === "cada" && (
              <Input
                label="Intervalo (ordenhas)"
                type="number"
                value={e.condicao?.intervalo || 2}
                onChange={(v) =>
                  setEtapa(i, "condicao", { tipo: "cada", intervalo: Number(v || 1) })
                }
                style={{ width: 220 }}
              />
            )}
          </div>

          <label className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={!!e.complementar}
              onChange={(ev) => setEtapa(i, "complementar", ev.target.checked)}
            />
            <span>Etapa complementar (aplicada após outra na mesma ordenha)</span>
          </label>

          {form.etapas.length > 1 && (
            <div className="mt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100"
                onClick={() => rmEtapa(i)}
              >
                Remover etapa
              </button>
            </div>
          )}
        </div>
      ))}

      <button className="px-3 py-1.5 rounded-md bg-blue-600 text-white w-max" onClick={addEtapa}>
        + Etapa de limpeza
      </button>

      <div className="flex justify-end gap-2">
        <button className="px-4 py-2 rounded border border-gray-300 bg-gray-100" onClick={onCancel}>
          Cancelar
        </button>
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={() => onSave(form)}>
          Salvar
        </button>
      </div>
    </div>
  );
}

function PlanoSemanal({ ciclo }) {
  const freq = Number(ciclo.frequencia) || 1;
  const etapas = ciclo.etapas || [];
  const blocos = [];

  for (let d = 0; d < 7; d++) {
    if (!ciclo.diasSemana?.includes(d)) continue;
    const execs = [];
    for (let exec = 0; exec < freq; exec++) {
      const horario = freq === 1 ? "" : exec === 0 ? "Manhã" : exec === 1 ? "Tarde" : `Ordenha ${exec + 1}`;
      const itens = [];
      let ultimaCondBase = null;
      etapas.forEach((e) => {
        const cond = parseCond(e.condicao);
        let aplicar = true;
        if (cond.tipo === "cada") aplicar = (exec + 1) % (cond.intervalo || 1) === 0;
        else if (cond.tipo === "manha") aplicar = horario === "Manhã";
        else if (cond.tipo === "tarde") aplicar = horario === "Tarde";
        if (!aplicar) return;
        let texto = `${e.quantidade} ${e.unidade} ${e.produto}`;
        if (cond.tipo === "cada") texto += ` (a cada ${cond.intervalo} ordenhas)`;
        if (
          e.complementar &&
          ultimaCondBase &&
          cond.tipo === ultimaCondBase.tipo &&
          (cond.intervalo || 0) === (ultimaCondBase.intervalo || 0)
        ) {
          itens.push(texto);
        } else {
          itens.push(texto);
          if (!e.complementar) ultimaCondBase = cond;
        }
      });
      if (itens.length) execs.push({ horario, itens });
    }
    if (execs.length) blocos.push({ dia: DIAS[d], execs });
  }

  return (
    <div className="flex flex-col gap-3">
      {blocos.map((b) => (
        <div key={b.dia} className="border border-dashed border-[#d1d5db] rounded-xl p-3 bg-white">
          <div className="font-extrabold mb-1">📅 {b.dia}</div>
          {b.execs.map((ex, i) => (
            <div key={i} className="ml-2">
              {ex.horario && <div className="font-bold">{ex.horario}:</div>}
              <ul className="mt-1 mb-2 list-disc ml-4">
                {ex.itens.map((t, k) => (
                  <li key={k}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* =================== UI mini components =================== */
function StatusPill({ label = "—", color = "#6b7280" }) {
  return (
    <span className="inline-flex items-center justify-center gap-2 font-bold">
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          display: "inline-block",
        }}
      />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: "bold" }}>{title}</div>
          <button className="px-2 text-white/90 hover:text-white" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded border border-gray-300 bg-white"
      />
    </div>
  );
}

function SelectInline({ label, value, onChange, options = [], placeholder = "Selecione...", style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <label className="text-[12px] font-bold text-[#374151]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 bg-white"
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

/* ===== estilos do modal ===== */
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
