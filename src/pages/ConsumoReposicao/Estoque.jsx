// src/pages/ConsumoReposicao/Estoque.jsx
import React, { useMemo, useState, useEffect } from "react";
import Select from "react-select";
import api from "../../api";

/**
 * ESTOQUE — conectado ao backend
 * - Endpoints: /api/v1/consumo/estoque (GET/POST/PUT/DELETE)
 * - Também mescla Touros (sêmen) vindos de /api/v1/genetica/touros
 *   quando o backend ainda não espelha no estoque.
 * - Itens de touros aparecem como read-only (🔒) e categoria "Reprodução".
 */

const API_BASE = "/api/v1/consumo/estoque";
const API_TOUROS = "/api/v1/genetica/touros";
const STICKY_OFFSET = 48;

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

export default function Estoque({ onCountChange }) {
  const categoriasFixas = [
    { value: "Todos", label: "Todos" },
    { value: "Cozinha", label: "Cozinha" },
    { value: "Higiene e Limpeza", label: "Higiene e Limpeza" },
    { value: "Farmácia", label: "Farmácia" },
    { value: "Reprodução", label: "Reprodução" },
    { value: "Materiais Gerais", label: "Materiais Gerais" },
  ];

  const [minimos, setMinimos] = useState({
    Cozinha: 5,
    "Higiene e Limpeza": 2,
    Farmácia: 2,
    Reprodução: 1,
    "Materiais Gerais": 1,
  });

  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // UI state
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(
    categoriasFixas[0]
  );
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null);
  const [editar, setEditar] = useState({ abrir: false, item: null });
  const [hoverCol, setHoverCol] = useState(null);

  // Carregar (Estoque + Touros) e mesclar
  const carregar = async (categoriaOpt = categoriaSelecionada) => {
    try {
      setLoading(true);
      setErro("");

      const params =
        categoriaOpt?.value && categoriaOpt.value !== "Todos"
          ? { categoria: categoriaOpt.value }
          : undefined;

      const [estoqueRes, tourosRes] = await Promise.allSettled([
        api.get(API_BASE, { params }),
        api.get(API_TOUROS, { params: { limit: 999 } }),
      ]);

      const baseItems = (() => {
        if (estoqueRes.status === "fulfilled") {
          const data = estoqueRes.value?.data;
          return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        }
        return [];
      })();

      const touros = (() => {
        if (tourosRes.status !== "fulfilled") return [];
        const data = tourosRes.value?.data;
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        return items.map((t) => normalizeTouro(t));
      })();

      const merged = mesclarTourosNoEstoque(baseItems, touros);

      setProdutos(merged);
    } catch (e) {
      console.error("Erro ao carregar estoque/touros:", e);
      setErro("Não foi possível carregar o estoque do servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [categoriaSelecionada?.value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onCountChange?.(produtos.length || 0);
  }, [produtos.length, onCountChange]);

  const categorias = useMemo(() => {
    const dinamicas = Array.from(
      new Set(produtos.map((p) => p.categoria).filter(Boolean))
    ).map((c) => ({ value: c, label: c }));
    const baseSet = new Map(categoriasFixas.map((c) => [c.value, c]));
    dinamicas.forEach((c) => baseSet.set(c.value, c));
    return Array.from(baseSet.values());
  }, [produtos]);

  // CRUD
  const handleSalvarNovo = async (novo) => {
    try {
      await api.post(API_BASE, novo);
      await carregar();
      setMostrarCadastro(false);
    } catch (e) {
      console.error("Erro ao salvar produto:", e);
      alert("❌ Não foi possível salvar o produto.");
    }
  };

  const handleSalvarEdicao = async (atualizado) => {
    if (atualizado?.meta?.readOnly) {
      alert("Este item é sincronizado (somente leitura). Edite pelo cadastro de Touros.");
      return;
    }
    try {
      await api.put(`${API_BASE}/${atualizado.id}`, atualizado);
      await carregar();
      setEditar({ abrir: false, item: null });
    } catch (e) {
      console.error("Erro ao editar produto:", e);
      const status = e?.response?.status;
      const detail = e?.response?.data?.error || "Não foi possível atualizar o produto.";
      if (status === 409) {
        alert("🔒 Item sincronizado (read-only). Edite pelo cadastro de Touros.");
      } else {
        alert(`❌ ${detail}`);
      }
    }
  };

  const confirmarExcluir = async () => {
    if (produtoParaExcluir?.meta?.readOnly) {
      alert("Este item é sincronizado (somente leitura). Remova/edite pelo cadastro de Touros.");
      setProdutoParaExcluir(null);
      return;
    }
    try {
      await api.delete(`${API_BASE}/${produtoParaExcluir.id}`);
      setProdutos((prev) => prev.filter((p) => p.id !== produtoParaExcluir.id));
      setProdutoParaExcluir(null);
    } catch (e) {
      console.error("Erro ao excluir produto:", e);
      const status = e?.response?.status;
      const detail = e?.response?.data?.error || "Não foi possível excluir o produto.";
      if (status === 409) {
        alert("🔒 Item sincronizado (read-only). Remova/edite no cadastro de Touros.");
      } else {
        alert(`❌ ${detail}`);
      }
    }
  };

  const produtosFiltrados = useMemo(() => {
    if (categoriaSelecionada?.value === "Todos") return produtos;
    return produtos.filter((p) => p?.categoria === categoriaSelecionada?.value);
  }, [produtos, categoriaSelecionada]);

  const colunas = useMemo(
    () => [
      "Nome Comercial",
      "Categoria",
      "Quantidade",
      "Valor Total",
      "Apresentação",
      "Validade",
      "Alerta Estoque",
      "Alerta Validade",
      "Ação",
    ],
    []
  );

  const abrirEdicao = (p) => {
    if (p?.meta?.readOnly) {
      alert("🔒 Item sincronizado do cadastro de Touros. Para alterar quantidade/preço, edite o touro.");
      return;
    }
    setEditar({ abrir: true, item: p });
  };

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        {/* TOP BAR */}
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a] bg-[#1e3a8a] text-white hover:opacity-95"
              onClick={() => setMostrarCadastro(true)}
            >
              + Novo Produto
            </button>
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100"
              onClick={() => setMostrarAjustes(true)}
            >
              ⚙️ Ajustes
            </button>
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-gray-50"
              onClick={() => carregar()}
              title="Recarregar lista"
            >
              ↻ Recarregar
            </button>
          </div>

          <div className="flex items-center gap-2 min-w-[260px]">
            <label className="text-xs text-gray-500 font-semibold">
              Categoria
            </label>
            <div className="min-w-[200px]">
              <Select
                options={categorias}
                value={categoriaSelecionada}
                onChange={setCategoriaSelecionada}
                classNamePrefix="rs"
                placeholder="Filtrar…"
              />
            </div>
          </div>
        </div>

        {erro && (
          <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-2 rounded">
            {erro}
          </div>
        )}

        {/* TABELA */}
        <table className={tableClasses}>
          <colgroup>
            <col style={{ width: 260 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 160 }} />
          </colgroup>
        <thead>
            <tr>
              {colunas.map((t, i) => (
                <th
                  key={t}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverTH(i, hoverCol)}`}
                  style={{ top: STICKY_OFFSET }}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-[#1e3a8a] py-6">
                    Carregando…
                  </div>
                </td>
              </tr>
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">
                    Nenhum produto cadastrado.
                  </div>
                </td>
              </tr>
            ) : (
              produtosFiltrados.map((p, index) => {
                const estoque = alertaEstoque(p, minimos[p.categoria]);
                const readOnly = !!p?.meta?.readOnly;
                const isSemen = p?.meta?.tipo === "semen";

                // VALIDADE — ajuste para sêmen
                const validadeLabel = isSemen ? "Sem validade" : formatVal(p.validade);
                const validadeStatus = isSemen
                  ? { text: "Não vence", color: "#16a34a" }
                  : alertaValidade(p.validade);

                return (
                  <tr
                    key={p.id || p._virtualId || index}
                    className={`${rowBase} ${rowAlt} hover:bg-[#eaf5ff] ${readOnly ? "opacity-95" : ""}`}
                  >
                    <td className={`${tdClamp} font-semibold ${hoverTD(0, hoverCol)}`}>
                      <div className="flex items-center gap-2">
                        {readOnly && (
                          <span
                            className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300"
                            title="Item sincronizado (somente leitura)"
                          >
                            🔒 sync
                          </span>
                        )}
                        <span>{p.nomeComercial || "—"}</span>
                        {isSemen && (
                          <span
                            className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
                            title="Proveniente do cadastro de Touros"
                          >
                            Sêmen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(1, hoverCol)}`}>
                      {p.categoria || "—"}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(2, hoverCol)}`}>
                      {p.quantidade ?? "—"} {p.unidade || ""}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(3, hoverCol)}`}>
                      {isNum(p.valorTotal) ? formatBRL(p.valorTotal) : "—"}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(4, hoverCol)}`}>
                      {p.apresentacao || (isSemen ? "Sêmen bovino (palheta)" : "—")}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(5, hoverCol)}`}>
                      {validadeLabel}
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(6, hoverCol)}`}>
                      <StatusPill color={estoque.color} label={estoque.text} />
                    </td>
                    <td className={`${tdClamp} text-center ${hoverTD(7, hoverCol)}`}>
                      <StatusPill color={validadeStatus.color} label={validadeStatus.text} />
                    </td>
                    <td className={`${tdBase} text-center ${hoverTD(8, hoverCol)}`}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${readOnly ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"}`}
                          onClick={() => abrirEdicao(p)}
                          title={readOnly ? "Item sincronizado — edite no cadastro de Touros" : "Editar produto"}
                          disabled={readOnly}
                        >
                          Editar
                        </button>
                        <button
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${readOnly ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-red-500/20 hover:border-red-600 text-red-700 hover:bg-red-50"}`}
                          onClick={() => setProdutoParaExcluir(p)}
                          title={readOnly ? "Item sincronizado — remova/edite no cadastro de Touros" : "Excluir produto"}
                          disabled={readOnly}
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
        </table>

        {/* MODAIS */}
        {mostrarCadastro && (
          <Modal onClose={() => setMostrarCadastro(false)} title="Novo Produto">
            <FormProduto onCancel={() => setMostrarCadastro(false)} onSave={handleSalvarNovo} />
          </Modal>
        )}

        {editar.abrir && (
          <Modal onClose={() => setEditar({ abrir: false, item: null })} title="Editar Produto">
            <FormProduto
              initial={editar.item}
              onCancel={() => setEditar({ abrir: false, item: null })}
              onSave={(prod) => handleSalvarEdicao({ ...prod, id: editar.item?.id })}
            />
          </Modal>
        )}

        {mostrarAjustes && (
          <Modal onClose={() => setMostrarAjustes(false)} title="⚙️ Ajustes de Estoque">
            <AjustesForm
              minimos={minimos}
              onChange={setMinimos}
              onFinish={() => setMostrarAjustes(false)}
            />
          </Modal>
        )}

        {produtoParaExcluir && (
          <Modal onClose={() => setProdutoParaExcluir(null)} title="Confirmar exclusão">
            <div className="text-[14px] text-[#374151]">
              {produtoParaExcluir?.meta?.readOnly ? (
                <>
                  O item <b>“{produtoParaExcluir?.nomeComercial}”</b> é <b>sincronizado</b> (somente leitura).<br />
                  Para remover/editar, use o cadastro de <b>Touros</b>.
                </>
              ) : (
                <>
                  Deseja realmente excluir o produto <b>“{produtoParaExcluir?.nomeComercial}”</b>?
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100"
                onClick={() => setProdutoParaExcluir(null)}
              >
                Fechar
              </button>
              {!produtoParaExcluir?.meta?.readOnly && (
                <button className="px-3 py-1.5 rounded-md bg-red-600 text-white" onClick={confirmarExcluir}>
                  Excluir
                </button>
              )}
            </div>
          </Modal>
        )}
      </div>
    </section>
  );
}

/* =================== Mesclagem Estoque + Touros =================== */
function normalizeTouro(t) {
  const adquiridas =
    t.doses_adquiridas ?? t.doses_total ?? t.quantidade ?? t.qtd ?? t.qtd_doses ?? 0;
  const restantes =
    t.doses_restantes ?? t.quantidade ?? t.qtd ?? t.qtd_doses ?? 0;
  const qtd = Number(restantes) || 0;

  const precoDose = Number(t.valor_por_dose ?? t.preco_dose ?? t.valor_dose ?? 0) || 0;
  const volume = Number(t.volume_dose ?? t.dose_ml ?? t.dose_volume ?? 0.25) || 0.25;

  const nome =
    (t.nome || "Touro") + (t.codigo ? ` · ${t.codigo}` : "");

  return {
    _virtualId: `semen-${t.id || t.uuid || nome}`,
    nomeComercial: `Sêmen ${nome}`,
    categoria: "Reprodução",
    quantidade: qtd,
    unidade: "dose",
    precoUnitario: precoDose,
    valorTotal: precoDose > 0 ? round2(precoDose * qtd) : null,
    apresentacao: `Palheta ${volume.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mL`,
    validade: "",

    meta: {
      readOnly: true,
      tipo: "semen",
      origem: "touros",
      touroId: t.id || t.uuid,
      doses_adquiridas: Number(adquiridas) || 0,
      doses_restantes: qtd,
    },
  };
}

function mesclarTourosNoEstoque(estoque, tourosNorm) {
  const temVirtual = new Set(
    (estoque || [])
      .filter((p) => p?.meta?.tipo === "semen" && p?.meta?.touroId)
      .map((p) => String(p.meta.touroId))
  );

  const tourosQueFaltam = tourosNorm.filter((s) => !temVirtual.has(String(s?.meta?.touroId || "")));

  return [...(estoque || []), ...tourosQueFaltam];
}

/* =================== Componentes auxiliares =================== */
function StatusPill({ color = "#6b7280", label = "—" }) {
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
          <button className="px-2 text-white/90 hover:text-white" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/** ===================== Formulário (3 passos) ===================== */
function FormProduto({ initial, onCancel, onSave }) {
  const CATS = [
    { value: "Cozinha", label: "Cozinha" },
    { value: "Higiene e Limpeza", label: "Higiene e Limpeza" },
    { value: "Farmácia", label: "Farmácia" },
    { value: "Reprodução", label: "Reprodução" },
    { value: "Materiais Gerais", label: "Materiais Gerais" },
  ];
  const UN_ESTOQUE = [
    { value: "un", label: "un (unidade)" },
    { value: "dose", label: "dose" },
    { value: "kg", label: "kg" },
    { value: "g", label: "g" },
    { value: "L", label: "L" },
    { value: "mL", label: "mL" },
  ];

  const CLASSES_HORMONIOS = [
    { value: "GnRH", label: "GnRH" },
    { value: "PGF2α", label: "PGF2α" },
    { value: "Estradiol", label: "Estradiol" },
    { value: "Progesterona", label: "Progesterona" },
    { value: "eCG", label: "eCG" },
    { value: "hCG", label: "hCG" },
  ];

  const catInicial = initial?.categoria || "Reprodução";
  const isReproInicial = catInicial === "Reprodução";
  const readOnly = !!initial?.meta?.readOnly;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    nome: initial?.nomeComercial || "",
    categoria: { value: catInicial, label: catInicial },
    apresentacao: initial?.apresentacao || "",
    reproSubtipo:
      isReproInicial
        ? initial?.meta?.reproducao?.subTipo || "dispositivo"
        : null,
    usosPorDispositivo:
      initial?.meta?.reproducao?.dispositivo?.maxUsos || 1,
    classeHormonal:
      initial?.meta?.reproducao?.hormonio?.classe
        ? { value: initial.meta.reproducao.hormonio.classe, label: initial.meta.reproducao.hormonio.classe }
        : null,
    analogosEquivalentes:
      Array.isArray(initial?.meta?.reproducao?.hormonio?.analogos)
        ? initial.meta.reproducao.hormonio.analogos.map((a) => ({
            value: a,
            label: a,
          }))
        : [],

    qtd: initial?.quantidade ?? 1,
    unEstoque:
      UN_ESTOQUE.find((u) => u.value === (initial?.unidade || (isReproInicial ? (initial?.meta?.reproducao?.subTipo === "hormonio" ? "mL" : "un") : "un"))) ||
      UN_ESTOQUE[0],
    detalharEmbalagem: false,
    conteudoPorUnidade: 1,
    unConteudo: UN_ESTOQUE[0],

    modoPreco: "total",
    totalCompra: initial?.valorTotal ?? "",
    precoPorUn: initial?.precoUnitario ?? "",
    validade: initial?.validade || "",
    semValidade: initial ? !initial.validade : false,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const estoqueFinal = useMemo(() => {
    const q = Number(form.qtd || 0);
    if (!form.detalharEmbalagem) return round4(q);
    const fam = mesmaFamilia(form.unConteudo?.value, form.unEstoque?.value);
    if (!fam) return round4(q);
    const base = toBase(Number(form.conteudoPorUnidade || 0), form.unConteudo?.value);
    const fator =
      form.unEstoque?.value === "kg"
        ? 1 / 1000
        : form.unEstoque?.value === "L"
        ? 1 / 1000
        : 1;
    return round4(q * (fam === "igual" ? Number(form.conteudoPorUnidade || 0) : base * fator));
  }, [form.qtd, form.detalharEmbalagem, form.conteudoPorUnidade, form.unConteudo, form.unEstoque]);

  const totalFromUnit =
    isNum(form.precoPorUn) && isNum(estoqueFinal)
      ? round2(Number(form.precoPorUn) * Number(estoqueFinal))
      : null;

  const unitFromTotal =
    isNum(form.totalCompra) && isNum(estoqueFinal) && Number(estoqueFinal) > 0
      ? round4(Number(form.totalCompra) / Number(estoqueFinal))
      : null;

  const passoOK = (n) => {
    if (readOnly) return false;
    if (n === 1) return (form.nome || "").trim() !== "" && !!form.categoria;
    if (n === 2) return isNum(form.qtd) && form.qtd > 0 && !!form.unEstoque;
    if (n === 3) return form.modoPreco === "total" ? isNum(form.totalCompra) : isNum(form.precoPorUn);
    return false;
  };

  const avancar = () => setStep((s) => Math.min(3, s + 1));
  const voltar = () => setStep((s) => Math.max(1, s - 1));

  const salvar = () => {
    const valorTotal =
      form.modoPreco === "total"
        ? Number(form.totalCompra || 0)
        : Number(totalFromUnit || 0);
    const precoUnitario =
      isNum(estoqueFinal) && Number(estoqueFinal) > 0
        ? round4(valorTotal / Number(estoqueFinal))
        : 0;

    const payload = {
      nomeComercial: (form.nome || "").trim(),
      categoria: form.categoria?.value,
      apresentacao: form.apresentacao || "",
      quantidade: Number(estoqueFinal || 0),
      unidade: form.unEstoque?.value,
      validade: form.semValidade ? "" : form.validade,
      valorTotal: round2(valorTotal),
      precoUnitario,

      meta: {
        origemCompra: {
          modoPreco: form.modoPreco,
          totalInformado: form.modoPreco === "total" ? Number(form.totalCompra || 0) : undefined,
          precoPorUnInformado: form.modoPreco === "unit" ? Number(form.precoPorUn || 0) : undefined,
          qtdInformada: Number(form.qtd || 0),
          unEstoque: form.unEstoque?.value,
          detalhouEmbalagem: !!form.detalharEmbalagem,
          conteudoPorUnidade: form.detalharEmbalagem ? Number(form.conteudoPorUnidade || 0) : undefined,
          unConteudo: form.detalharEmbalagem ? form.unConteudo?.value : undefined,
        },
        reproducao:
          form.categoria?.value === "Reprodução"
            ? form.reproSubtipo === "dispositivo"
              ? {
                  subTipo: "dispositivo",
                  dispositivo: { maxUsos: Number(form.usosPorDispositivo || 1) },
                }
              : {
                  subTipo: "hormonio",
                  hormonio: {
                    classe: form.classeHormonal?.value || null,
                    analogos: (form.analogosEquivalentes || []).map((a) => a.value),
                  },
                }
            : undefined,
      },
    };

    onSave(payload);
  };

  const bloqueadoMsg = readOnly
    ? "🔒 Este produto é sincronizado automaticamente a partir do cadastro de Touros. Para alterar quantidade/preço, edite o touro correspondente."
    : null;

  return (
    <div className="flex flex-col gap-4">
      {bloqueadoMsg && (
        <div className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-2 rounded">
          {bloqueadoMsg}
        </div>
      )}
      <Stepper step={step} labels={["Identificação", "Quantidades", "Preço & validade"]} />

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nome Comercial" value={form.nome} onChange={(v) => set("nome", v)} autoFocus disabled={readOnly} />
          <div>
            <Label>Categoria</Label>
            <Select
              isDisabled={readOnly}
              options={[
                { value: "Cozinha", label: "Cozinha" },
                { value: "Higiene e Limpeza", label: "Higiene e Limpeza" },
                { value: "Farmácia", label: "Farmácia" },
                { value: "Reprodução", label: "Reprodução" },
                { value: "Materiais Gerais", label: "Materiais Gerais" },
              ]}
              value={form.categoria}
              onChange={(v) => {
                set("categoria", v);
                if (v?.value !== "Reprodução") set("reproSubtipo", null);
                if (v?.value === "Reprodução" && !form.reproSubtipo) set("reproSubtipo", "dispositivo");
              }}
              classNamePrefix="rs"
            />
          </div>

          <Input
            label="Apresentação"
            value={form.apresentacao}
            onChange={(v) => set("apresentacao", v)}
            placeholder="ex.: Dispositivo P4, Frasco 10 mL, Cartela…"
            className="md:col-span-2"
            disabled={readOnly}
          />

          {form.categoria?.value === "Reprodução" && (
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Subtipo (Reprodução)</Label>
                <div className="flex gap-2">
                  <Chip
                    selected={form.reproSubtipo === "dispositivo"}
                    onClick={() => !readOnly && set("reproSubtipo", "dispositivo")}
                    label="Dispositivo (P4)"
                  />
                  <Chip
                    selected={form.reproSubtipo === "hormonio"}
                    onClick={() => !readOnly && set("reproSubtipo", "hormonio")}
                    label="Hormônio"
                  />
                </div>
              </div>

              {form.reproSubtipo === "dispositivo" && (
                <div>
                  <Label>Usos por dispositivo</Label>
                  <Select
                    isDisabled={readOnly}
                    classNamePrefix="rs"
                    value={{ value: form.usosPorDispositivo, label: `${form.usosPorDispositivo} uso(s)` }}
                    onChange={(v) => set("usosPorDispositivo", v?.value ?? 1)}
                    options={[
                      { value: 1, label: "1 uso" },
                      { value: 2, label: "2 usos" },
                      { value: 3, label: "3 usos" },
                    ]}
                  />
                </div>
              )}

              {form.reproSubtipo === "hormonio" && (
                <>
                  <div>
                    <Label>Classe hormonal</Label>
                    <Select
                      isDisabled={readOnly}
                      classNamePrefix="rs"
                      value={form.classeHormonal}
                      onChange={(v) => set("classeHormonal", v)}
                      options={[
                        { value: "GnRH", label: "GnRH" },
                        { value: "PGF2α", label: "PGF2α" },
                        { value: "Estradiol", label: "Estradiol" },
                        { value: "Progesterona", label: "Progesterona" },
                        { value: "eCG", label: "eCG" },
                        { value: "hCG", label: "hCG" },
                      ]}
                      placeholder="GnRH, PGF2α, Estradiol…"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Análogos equivalentes</Label>
                    <Select
                      isDisabled={readOnly}
                      classNamePrefix="rs"
                      isMulti
                      value={form.analogosEquivalentes}
                      onChange={(v) => set("analogosEquivalentes", v || [])}
                      options={[
                        { value: "GnRH", label: "GnRH" },
                        { value: "PGF2α", label: "PGF2α" },
                        { value: "Estradiol", label: "Estradiol" },
                        { value: "Progesterona", label: "Progesterona" },
                        { value: "eCG", label: "eCG" },
                        { value: "hCG", label: "hCG" },
                      ]}
                      placeholder="Selecione um ou mais…"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Protocolos poderão consumir qualquer análogo marcado.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="md:col-span-2 flex justify-end gap-2 mt-1">
            <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!passoOK(1)}
              onClick={avancar}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <Input
            label="Quantidade"
            type="number"
            value={form.qtd}
            onChange={(v) => set("qtd", v)}
            className="md:col-span-3"
            disabled={readOnly}
          />
          <div className="md:col-span-3">
            <Label>Unidade de estoque (abatimento)</Label>
            <Select
              isDisabled={readOnly}
              classNamePrefix="rs"
              value={form.unEstoque}
              onChange={(v) => set("unEstoque", v)}
              options={[
                { value: "un", label: "un (unidade)" },
                { value: "dose", label: "dose" },
                { value: "kg", label: "kg" },
                { value: "g", label: "g" },
                { value: "L", label: "L" },
                { value: "mL", label: "mL" },
              ]}
            />
          </div>

          <div className="md:col-span-6 flex items-end">
            <button
              type="button"
              className={`px-3 py-2 rounded border ${readOnly ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-300 bg-gray-50"}`}
              onClick={() => !readOnly && set("detalharEmbalagem", !form.detalharEmbalagem)}
              disabled={readOnly}
            >
              {form.detalharEmbalagem ? "Ocultar" : "Detalhar embalagem (opcional)"}
            </button>
          </div>

          {form.detalharEmbalagem && (
            <>
              <Input
                label="Cada unidade contém"
                type="number"
                value={form.conteudoPorUnidade}
                onChange={(v) => set("conteudoPorUnidade", v)}
                className="md:col-span-3"
                disabled={readOnly}
              />
              <div className="md:col-span-3">
                <Label>Unidade do conteúdo</Label>
                <Select
                  isDisabled={readOnly}
                  classNamePrefix="rs"
                  value={form.unConteudo}
                  onChange={(v) => set("unConteudo", v)}
                  options={[
                    { value: "un", label: "un (unidade)" },
                    { value: "dose", label: "dose" },
                    { value: "kg", label: "kg" },
                    { value: "g", label: "g" },
                    { value: "L", label: "L" },
                    { value: "mL", label: "mL" },
                  ]}
                />
              </div>
            </>
          )}

          <ReadOnly
            label="Estoque final (preview)"
            value={
              isNum(estoqueFinal)
                ? `${estoqueFinal} ${form.unEstoque?.value || ""}`
                : "—"
            }
            className="md:col-span-4"
          />
          <ReadOnly
            label="Apresentação"
            value={form.apresentacao || "—"}
            className="md:col-span-4"
          />
          <ReadOnly
            label="Categoria"
            value={form.categoria?.label || "—"}
            className="md:col-span-4"
          />

          <div className="md:col-span-12 flex justify-between gap-2 mt-1">
            <button className="px-4 py-2 rounded border border-gray-300 bg-gray-100" onClick={voltar}>
              Voltar
            </button>
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!passoOK(2)}
              onClick={avancar}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-12">
            <Label>Informar preço</Label>
            <div className="flex gap-4 mt-1">
              <Radio
                name="modoPreco"
                checked={form.modoPreco === "total"}
                onChange={() => !readOnly && set("modoPreco", "total")}
                label="Total da compra (R$)"
                disabled={readOnly}
              />
              <Radio
                name="modoPreco"
                checked={form.modoPreco === "unit"}
                onChange={() => !readOnly && set("modoPreco", "unit")}
                label={`Preço por unidade de estoque (${form.unEstoque?.value})`}
                disabled={readOnly}
              />
            </div>
          </div>

          {form.modoPreco === "total" ? (
            <>
              <Input
                label="Total da compra (R$)"
                type="number"
                value={form.totalCompra}
                onChange={(v) => set("totalCompra", v)}
                className="md:col-span-4"
                disabled={readOnly}
              />
              <ReadOnly
                label={`Preço por ${form.unEstoque?.value} — automático`}
                value={isNum(unitFromTotal) ? String(unitFromTotal) : "—"}
                className="md:col-span-4"
              />
            </>
          ) : (
            <>
              <Input
                label={`Preço por ${form.unEstoque?.value}`}
                type="number"
                value={form.precoPorUn}
                onChange={(v) => set("precoPorUn", v)}
                className="md:col-span-4"
                disabled={readOnly}
              />
              <ReadOnly
                label="Total estimado — automático"
                value={isNum(totalFromUnit) ? String(totalFromUnit) : "—"}
                className="md:col-span-4"
              />
            </>
          )}

          <DateValidityField
            label="Validade"
            value={toInputDate(form.validade)}
            disabled={readOnly || form.semValidade}
            onChangeDate={(v) => set("validade", fromInputDate(v))}
            semValidade={form.semValidade}
            onToggleSemVal={(chk) => set("semValidade", chk)}
            className="md:col-span-4"
          />

          <div className="md:col-span-12 flex justify-between gap-2 mt-1">
            <button className="px-4 py-2 rounded border border-gray-300 bg-gray-100" onClick={voltar}>
              Voltar
            </button>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded border border-gray-300 bg-gray-100" onClick={onCancel}>
                Fechar
              </button>
              {!readOnly && (
                <button
                  className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={!passoOK(3)}
                  onClick={salvar}
                >
                  Salvar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AjustesForm({ minimos, onChange, onFinish }) {
  const cats = ["Cozinha", "Higiene e Limpeza", "Farmácia", "Reprodução", "Materiais Gerais"];
  return (
    <div className="flex flex-col gap-3">
      {cats.map((c) => (
        <div key={c} className="flex items-center gap-3">
          <label className="w-[180px] font-semibold">{c}</label>
          <input
            type="number"
            value={minimos[c] ?? ""}
            onChange={(e) => onChange((prev) => ({ ...prev, [c]: Number(e.target.value || 0) }))}
            className="px-3 py-2 rounded border border-gray-300 bg-white w-[140px]"
            placeholder="mín."
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 mt-2">
        <button className="px-3 py-1.5 rounded-md border border-gray-300 bg-gray-100" onClick={onFinish}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/** ====================== Campos simples / helpers UI ====================== */
function Label({ children }) {
  return <label className="text-[12px] font-bold text-[#374151]">{children}</label>;
}
function Radio({ name, checked, onChange, label, disabled }) {
  return (
    <label className={`flex items-center gap-2 text-[13px] select-none ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  );
}
function Chip({ selected, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border ${
        selected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}
function Input({ label, value, onChange, type = "text", autoFocus, className = "", placeholder, disabled }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label>{label}</Label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 rounded border ${disabled ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed" : "border-gray-300 bg-white"}`}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
function ReadOnly({ label, value, className = "" }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[12px] font-bold text-[#6b7280]">{label}</label>
      <input
        value={value ?? "—"}
        readOnly
        className="w-full px-3 py-2 rounded border border-gray-200 bg-gray-50 text-[#374151]"
      />
    </div>
  );
}
function DateValidityField({ label, value, onChangeDate, semValidade, onToggleSemVal, disabled, className = "" }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={semValidade ? "" : value || ""}
          onChange={(e) => onChangeDate(e.target.value)}
          className={`w-full px-3 py-2 rounded border ${disabled ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed" : "border-gray-300 bg-white"}`}
          disabled={disabled || semValidade}
        />
      </div>
      <label className={`flex items-center gap-2 text-[13px] text-[#374151] mt-1 select-none ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
        <input type="checkbox" checked={!!semValidade} onChange={(e) => onToggleSemVal(e.target.checked)} disabled={disabled} />
        Sem validade (não vence)
      </label>
    </div>
  );
}
function Stepper({ step, labels }) {
  return (
    <div className="flex items-center gap-4 mb-1">
      {labels.map((lab, i) => {
        const idx = i + 1;
        const active = step === idx;
        const done = step > idx;
        return (
          <div key={lab} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                active ? "bg-blue-600 text-white" : done ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
              }`}
            >
              {idx}
            </div>
            <div className={`${active ? "text-gray-900 font-semibold" : "text-gray-500"}`}>{lab}</div>
            {idx !== labels.length && <div className="w-10 h-[2px] bg-gray-200 mx-2" />}
          </div>
        );
      })}
    </div>
  );
}

/* =================== Helpers =================== */
function alertaEstoque(produto, minimo = 1) {
  const qtd = Number(produto?.quantidade || 0);
  if (qtd <= 0) return { text: "Insuficiente", color: "#dc2626" };
  if (qtd <= minimo) return { text: "Estoque baixo", color: "#d97706" };
  return { text: "OK", color: "#16a34a" };
}
function alertaValidade(dateStr) {
  if (!dateStr) return { text: "—", color: "#6b7280" };
  const d = parseDate(dateStr);
  if (!d) return { text: "—", color: "#6b7280" };
  const hoje = stripTime(new Date());
  const dias = Math.ceil((d - hoje) / 86400000);
  if (dias < 0) return { text: "Vencido", color: "#dc2626" };
  if (dias <= 30) return { text: `Vence em ${dias}d`, color: "#d97706" };
  return { text: "OK", color: "#16a34a" };
}
function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/").map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function isNum(n) {
  if (n === "" || n === null || n === undefined) return false;
  const v = Number(n);
  return typeof v === "number" && !Number.isNaN(v);
}
function formatBRL(n) {
  try {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${(Number(n) || 0).toFixed(2)}`;
  }
}
function formatVal(s) {
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt) ? "—" : dt.toLocaleDateString("pt-BR");
  }
  return s;
}
function toInputDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function fromInputDate(s) {
  return s || "";
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}
function mesmaFamilia(a, b) {
  const A = ["kg", "g"];
  const L = ["L", "mL"];
  if (A.includes(a) && A.includes(b)) return "massa";
  if (L.includes(a) && L.includes(b)) return "liq";
  if (a === b) return "igual";
  return null;
}
function toBase(qtd, un) {
  if (!isNum(qtd)) return 0;
  switch (un) {
    case "kg":
      return qtd * 1000;
    case "g":
      return qtd;
    case "L":
      return qtd * 1000;
    case "mL":
      return qtd;
    default:
      return qtd;
  }
}

/* ===== estilos modal ===== */
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
