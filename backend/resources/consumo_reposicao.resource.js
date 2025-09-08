// Resource ÚNICO para a aba Consumo & Reposição
// - Persistência em JSON local (sem banco; plug-and-play)
// - Endpoints:
//   /api/v1/consumo/estoque
//   /api/v1/consumo/lotes
//   /api/v1/consumo/lotacao (novo: mapa animal <-> lote)
//   /api/v1/consumo/lotes/:id/animais (novo: animais de um lote)
//   /api/v1/consumo/dietas
//   /api/v1/consumo/limpeza/ciclos (+ /plano/:id)
//   /api/v1/consumo/sanitario/manejos (+ /:id/registro)
//   /api/v1/consumo/sanitario/exames
// + Sync sêmen (touros) -> estoque: /api/v1/consumo/estoque/sync/semen
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import db from "../dbx.js"; // <- usado para enriquecer /lotes/:id/animais

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const dataDir   = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "consumo_reposicao.json");

/* ===================== Store helpers ===================== */
function ensureDataDir(){ fs.mkdirSync(dataDir, { recursive: true }); }

function defaults(){
  return {
    produtos: [],         // {id,nomeComercial,categoria,quantidade,unidade,valorTotal,apresentacao,validade,precoUnitario,meta?}
    lotes: [
      { id: randomUUID(), nome:"Lactação 1", funcao:"Lactação", nivelProducao:"Alta Produção", ativo:true, numVacas:0 },
      { id: randomUUID(), nome:"Lactação 2", funcao:"Lactação", nivelProducao:"Média Produção", ativo:true, numVacas:0 },
    ],
    // 👇 novo: mapa animalId -> { loteId, loteNome, updatedAt }
    lotacoes: {},
    dietas: [],           // {id,lote,numVacas,data,ingredientes:[{produtoId|produto, quantidade}]}
    ciclos: [             // Limpeza (ciclos)
      {
        id: randomUUID(),
        nome: "Ordenha L1",
        tipo: "Ordenhadeira",
        diasSemana: [1,2,3,4,5,6],
        frequencia: 2,
        etapas: [
          { produto: "Detergente alcalino", quantidade: 300, unidade: "mL", condicao: { tipo: "sempre" }, complementar: false },
          { produto: "Sanitizante", quantidade: 200, unidade: "mL", condicao: { tipo: "manha" }, complementar: true },
        ],
      },
    ],
    manejos: [           // Calendário sanitário (manejos)
      {
        id: randomUUID(),
        categoria: "Bezerra",
        tipo: "Vacina",
        produto: "Brucelose B19",
        frequencia: "365",
        idade: "90 dias",
        via: "Subcutânea",
        dose: "2",
        dataInicial: "2025-08-01",
        proximaAplicacao: "2026-08-01",
        ultimaAplicacao: "2025-08-01",
      },
    ],
    exames: [],          // {id,tipo,abrangencia,status,validadeCertificado,certificado,dataUltimo,comprovante,animal}
  };
}

function readStore(){
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw);
    const base = defaults();
    return {
      produtos: Array.isArray(parsed.produtos) ? parsed.produtos : base.produtos,
      lotes: Array.isArray(parsed.lotes) ? parsed.lotes : base.lotes,
      lotacoes: (parsed.lotacoes && typeof parsed.lotacoes === "object") ? parsed.lotacoes : base.lotacoes,
      dietas: Array.isArray(parsed.dietas) ? parsed.dietas : base.dietas,
      ciclos: Array.isArray(parsed.ciclos) ? parsed.ciclos : base.ciclos,
      manejos: Array.isArray(parsed.manejos) ? parsed.manejos : base.manejos,
      exames: Array.isArray(parsed.exames) ? parsed.exames : base.exames,
    };
  } catch {
    return defaults();
  }
}

function writeStore(state){
  ensureDataDir();
  const payload = {
    produtos: state.produtos ?? [],
    lotes:    state.lotes    ?? [],
    lotacoes: state.lotacoes ?? {},
    dietas:   state.dietas   ?? [],
    ciclos:   state.ciclos   ?? [],
    manejos:  state.manejos  ?? [],
    exames:   state.exames   ?? [],
  };
  fs.writeFileSync(storePath, JSON.stringify(payload, null, 2), "utf8");
}

// recalcula numVacas de cada lote com base em lotacoes
function recomputeNumVacas(state){
  (state.lotes || []).forEach(l => l.numVacas = 0);
  const counts = {};
  for (const aid in (state.lotacoes || {})) {
    const lId = state.lotacoes[aid]?.loteId;
    if (!lId) continue;
    counts[lId] = (counts[lId] || 0) + 1;
  }
  (state.lotes || []).forEach(l => { l.numVacas = counts[l.id] || 0; });
}

/* ===================== Utilitários ===================== */
function isNum(n){ return typeof n === "number" && !Number.isNaN(n); }
function parseISOorBR(d){
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd,mm,yy] = d.split("/").map(Number);
    return new Date(yy, mm-1, dd);
  }
  const dt = new Date(d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function isoDate(dt){ const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,"0"), d=String(dt.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; }
function convToMl(valor, unidade){
  const v = Number(valor)||0;
  const u = String(unidade||"").toLowerCase();
  if (u.startsWith("l")) return v * 1000;
  return v; // já é mL
}
function parseCond(c){
  if (!c) return { tipo:"sempre" };
  if (typeof c === "object") return c;
  const s = String(c).toLowerCase();
  if (s.includes("manhã")) return { tipo:"manha" };
  if (s.includes("tarde")) return { tipo:"tarde" };
  const m = s.match(/a cada\s*(\d+)/i);
  if (m) return { tipo:"cada", intervalo: parseInt(m[1]) };
  return { tipo:"sempre" };
}
function vezesPorDia(cond, freq){
  switch (cond?.tipo) {
    case "cada":  return (Number(freq)||1) / Math.max(1, Number(cond.intervalo)||1);
    case "manha":
    case "tarde": return 1;
    default:      return Number(freq)||1;
  }
}
function precoProdutoKg(produtos, ref){
  // ref pode ser id OU nomeComercial
  const p = produtos.find(x => x.id === ref) || produtos.find(x => (x.nomeComercial||"") === ref);
  const n = Number(p?.precoUnitario ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ===================== SEMEN / SYNC HELPERS ===================== */
// Sempre o mesmo SKU por touro: garante idempotência no JSON
function skuSemen(touroId) {
  return `semen:${touroId}`;
}

// Faz o upsert de 1 touro no estoque em memória (state) e retorna o item
function upsertSemenFromTouro(state, touro) {
  if (!touro || !touro.id) return null;

  const qtd = Math.max(0, Number(touro.doses_restantes || 0));
  const unit = Math.max(0, Number(touro.valor_por_dose || 0));
  const total = +(qtd * unit).toFixed(2);
  const sku = skuSemen(touro.id);

  state.produtos = Array.isArray(state.produtos) ? state.produtos : [];

  // procura por SKU
  const idx = state.produtos.findIndex(
    (p) => p?.meta?.sku === sku
  );

  const base = {
    nomeComercial: touro.nome || "Sêmen",
    categoria: "Reprodução",
    apresentacao: "Sêmen bovino (palheta)",
    unidade: "dose",
    validade: "", // não controlamos validade aqui
    meta: {
      tipo: "semen",
      origem: "touros",
      touroId: String(touro.id),
      sku,
      readOnly: true,
    },
  };

  if (idx >= 0) {
    // UPDATE
    state.produtos[idx] = {
      ...state.produtos[idx],
      ...base,
      quantidade: qtd,
      precoUnitario: unit,
      valorTotal: total,
      updatedAt: new Date().toISOString(),
    };
    return state.produtos[idx];
  } else {
    // INSERT
    const item = {
      id: randomUUID(),
      ...base,
      quantidade: qtd,
      precoUnitario: unit,
      valorTotal: total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.produtos.push(item);
    return item;
  }
}

/* ===================== ESTOQUE ===================== */
// GET /api/v1/consumo/estoque?categoria=&q=
router.get("/estoque", (req, res) => {
  try {
    const { categoria, q } = req.query || {};
    const state = readStore();

    let items = Array.isArray(state.produtos) ? state.produtos.filter(Boolean) : [];

    if (categoria && categoria !== "Todos") {
      const cat = String(categoria);
      items = items.filter(p => String(p?.categoria ?? "") === cat);
    }

    if (q) {
      const s = String(q).toLowerCase();
      items = items.filter(p => (p?.nomeComercial ?? "").toLowerCase().includes(s));
    }

    return res.json({ items });
  } catch (e) {
    console.error("GET /consumo/estoque falhou:", e);
    return res.status(500).json({ error: "Falha ao listar estoque" });
  }
});

// POST /api/v1/consumo/estoque
router.post("/estoque", (req, res) => {
  try {
    const state = readStore();
    const b = req.body || {};
    const item = {
      id: randomUUID(),
      nomeComercial: b.nomeComercial || "",
      categoria: b.categoria || "",
      quantidade: Number(b.quantidade || 0),
      unidade: b.unidade || "un",
      valorTotal: Number(b.valorTotal || 0),
      apresentacao: b.apresentacao || "",
      validade: b.validade || "", // YYYY-MM-DD
      precoUnitario: isNum(b.precoUnitario) ? Number(b.precoUnitario) : null,
      meta: (b.meta && typeof b.meta === "object") ? b.meta : undefined, // <- aceita meta
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.produtos = Array.isArray(state.produtos) ? state.produtos : [];
    state.produtos.push(item);
    writeStore(state);
    return res.status(201).json(item);
  } catch (e) {
    console.error("POST /consumo/estoque falhou:", e);
    return res.status(500).json({ error: "Falha ao salvar produto" });
  }
});

// PUT /api/v1/consumo/estoque/:id
router.put("/estoque/:id", (req, res) => {
  try {
    const { id } = req.params;
    const state = readStore();
    const idx = (state.produtos || []).findIndex(p => p.id === id);
    if (idx < 0) return res.status(404).json({ error: "not found" });

    const current = state.produtos[idx];
    if (current?.meta?.readOnly) {
      return res.status(409).json({ error: "Item de estoque sincronizado (read-only) — edite pelo cadastro de Touros." });
    }

    const b = req.body || {};
    state.produtos[idx] = {
      ...current,
      nomeComercial: b.nomeComercial ?? current.nomeComercial,
      categoria: b.categoria ?? current.categoria,
      quantidade: Number(b.quantidade ?? current.quantidade),
      unidade: b.unidade ?? current.unidade,
      valorTotal: Number(b.valorTotal ?? current.valorTotal),
      apresentacao: b.apresentacao ?? current.apresentacao,
      validade: b.validade ?? current.validade,
      precoUnitario: isNum(b.precoUnitario)
        ? Number(b.precoUnitario)
        : (current.precoUnitario ?? null),
      // preserva meta existente (não permitir override aqui)
      meta: (current.meta && typeof current.meta === "object") ? current.meta : undefined,
      id,
      updatedAt: new Date().toISOString(),
    };

    writeStore(state);
    return res.json(state.produtos[idx]);
  } catch (e) {
    console.error("PUT /consumo/estoque/:id falhou:", e);
    return res.status(500).json({ error: "Falha ao atualizar produto" });
  }
});

// DELETE /api/v1/consumo/estoque/:id
router.delete("/estoque/:id", (req, res) => {
  try {
    const { id } = req.params;
    const state = readStore();
    const item = (state.produtos || []).find(p => p.id === id);
    if (!item) return res.status(404).json({ error: "not found" });

    if (item?.meta?.readOnly) {
      return res.status(409).json({ error: "Item de estoque sincronizado (read-only) — remova/edite pelo cadastro de Touros." });
    }

    state.produtos = (state.produtos || []).filter(p => p.id !== id);
    writeStore(state);
    return res.status(204).end();
  } catch (e) {
    console.error("DELETE /consumo/estoque/:id falhou:", e);
    return res.status(500).json({ error: "Falha ao excluir produto" });
  }
});

/* ====== SYNC SÊMEN (Touros -> Estoque) ====== */
// POST /api/v1/consumo/estoque/sync/semen
// Body pode ser:
//  { touro: { id, nome, valor_por_dose, doses_restantes } }
//  ou  { touros: [ ... ] }
router.post("/estoque/sync/semen", (req, res) => {
  try {
    const state = readStore();
    const { touro, touros } = req.body || {};

    const list = Array.isArray(touros) ? touros : (touro ? [touro] : []);
    if (!list.length) return res.status(400).json({ error: "Informe 'touro' ou 'touros'." });

    const result = [];
    list.forEach(t => {
      const saved = upsertSemenFromTouro(state, t);
      if (saved) result.push(saved);
    });

    writeStore(state);
    return res.json({ items: result });
  } catch (e) {
    console.error("POST /consumo/estoque/sync/semen falhou:", e);
    return res.status(500).json({ error: "Falha ao sincronizar estoque de sêmen" });
  }
});

// DELETE /api/v1/consumo/estoque/sync/semen/:touroId
router.delete("/estoque/sync/semen/:touroId", (req, res) => {
  try {
    const { touroId } = req.params;
    const state = readStore();
    const sku = skuSemen(touroId);
    const before = (state.produtos || []).length;
    state.produtos = (state.produtos || []).filter(p => p?.meta?.sku !== sku);
    if (state.produtos.length === before) return res.status(404).json({ error: "not found" });
    writeStore(state);
    res.status(204).end();
  } catch (e) {
    console.error("DELETE /consumo/estoque/sync/semen/:touroId falhou:", e);
    return res.status(500).json({ error: "Falha ao remover item de sêmen" });
  }
});

/* ===================== LOTES ===================== */
// GET /api/v1/consumo/lotes
router.get("/lotes", (_req, res) => {
  const state = readStore();
  // mantém numVacas sempre coerente com o mapa de lotações
  recomputeNumVacas(state);
  res.json({ items: state.lotes });
});

// POST /api/v1/consumo/lotes
router.post("/lotes", (req, res) => {
  const state = readStore();
  const b = req.body || {};
  const item = {
    id: randomUUID(),
    nome: b.nome || "",
    funcao: b.funcao || "",
    nivelProducao: b.nivelProducao || "",
    tipoTratamento: b.tipoTratamento || "",
    motivoDescarte: b.motivoDescarte || "",
    descricao: b.descricao || "",
    ativo: Boolean(b.ativo ?? true),
    numVacas: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.lotes.push(item);
  writeStore(state);
  res.status(201).json(item);
});

// PUT /api/v1/consumo/lotes/:id
router.put("/lotes/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const idx = state.lotes.findIndex(l => l.id === id);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  state.lotes[idx] = { ...state.lotes[idx], ...req.body, id, updatedAt: new Date().toISOString() };
  writeStore(state);
  res.json(state.lotes[idx]);
});

// DELETE /api/v1/consumo/lotes/:id
router.delete("/lotes/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const before = state.lotes.length;
  state.lotes = state.lotes.filter(l => l.id !== id);
  if (state.lotes.length === before) return res.status(404).json({ error: "not found" });

  // limpa vínculos desse lote no mapa
  const map = state.lotacoes || {};
  for (const aid of Object.keys(map)) {
    if (map[aid]?.loteId === id) delete map[aid];
  }
  state.lotacoes = map;

  writeStore(state);
  res.status(204).end();
});

/* ===================== LOTAÇÕES (animal <-> lote) ===================== */
// GET /api/v1/consumo/lotacao  -> mapa completo { animalId: {loteId,loteNome,updatedAt} }
router.get("/lotacao", (_req, res) => {
  const state = readStore();
  res.json({ map: state.lotacoes || {} });
});

// GET /api/v1/consumo/lotacao/:animalId
router.get("/lotacao/:animalId", (req, res) => {
  const state = readStore();
  const item = (state.lotacoes || {})[req.params.animalId] || null;
  return res.json(item);
});

// PUT /api/v1/consumo/lotacao/:animalId  { loteId?: string|null }
router.put("/lotacao/:animalId", (req, res) => {
  const { animalId } = req.params;
  const { loteId = null } = req.body || {};
  const state = readStore();

  // resolve nome do lote (se existir)
  const nome = loteId ? (state.lotes || []).find(l => l.id === loteId)?.nome || null : null;

  state.lotacoes = state.lotacoes || {};
  if (loteId) {
    state.lotacoes[animalId] = { loteId, loteNome: nome, updatedAt: new Date().toISOString() };
  } else {
    delete state.lotacoes[animalId]; // remove vínculo
  }

  recomputeNumVacas(state);
  writeStore(state);

  return res.json(state.lotacoes[animalId] || null);
});

// GET /api/v1/consumo/lotes/:id/animais
// - Tenta retornar os ANIMAIS completos (via DB) quando possível.
// - Se falhar, devolve lista básica com { id }.
router.get("/lotes/:id/animais", async (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const map = state.lotacoes || {};

  const animalIds = Object.keys(map).filter(aid => map[aid]?.loteId === id);
  if (animalIds.length === 0) return res.json({ items: [] });

  try {
    const params = animalIds.map((_, i) => `$${i+1}`).join(",");
    const { rows } = await db.query(
      `SELECT id, numero, brinco, raca, estado, sexo, categoria, n_lactacoes, nascimento, ultima_ia, parto, previsao_parto
       FROM animals WHERE id IN (${params})`,
      animalIds
    );
    return res.json({ items: rows || [] });
  } catch (e) {
    console.warn("[/consumo/lotes/:id/animais] fallback ids-only:", e?.message);
    return res.json({ items: animalIds.map(id => ({ id })) });
  }
});

/* ===================== DIETAS ===================== */
// GET /api/v1/consumo/dietas  (já retorna custos calculados)
router.get("/dietas", (_req, res) => {
  const state = readStore();
  const { dietas, produtos } = state;

  const items = dietas
    .slice()
    .sort((a,b) => new Date(b.data||0) - new Date(a.data||0))
    .map(d => {
      const total = (d.ingredientes||[]).reduce((acc, ing) => {
        const preco = precoProdutoKg(produtos, ing.produtoId || ing.produto);
        return acc + (Number(preco) * Number(ing.quantidade || 0) * Number(d.numVacas || 0));
      }, 0);
      const porVaca = Number(d.numVacas||0) ? total / Number(d.numVacas||0) : 0;
      return { ...d, custoTotal: total, custoVacaDia: porVaca };
    });

  res.json({ items });
});

// POST /api/v1/consumo/dietas
router.post("/dietas", (req, res) => {
  const state = readStore();
  const b = req.body || {};
  if (!b.numVacas || !(b.ingredientes||[]).length) {
    return res.status(400).json({ error: "numVacas e ingredientes são obrigatórios" });
  }
  const item = {
    id: randomUUID(),
    lote: b.lote || "", // ou guarde loteId se preferir
    numVacas: Number(b.numVacas || 0),
    data: b.data || new Date().toISOString(),
    ingredientes: (b.ingredientes||[]).map(ing => ({
      produtoId: ing.produtoId,           // se vier
      produto:   ing.produto,             // ou nome
      quantidade: Number(ing.quantidade || 0), // kg/vaca/dia
    })),
  };
  state.dietas.push(item);
  writeStore(state);
  res.status(201).json(item);
});

// PUT /api/v1/consumo/dietas/:id
router.put("/dietas/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const idx = state.dietas.findIndex(d => d.id === id);
  if (idx < 0) return res.status(404).json({ error: "not found" });

  const b = req.body || {};
  state.dietas[idx] = {
    ...state.dietas[idx],
    lote: b.lote ?? state.dietas[idx].lote,
    numVacas: Number(b.numVacas ?? state.dietas[idx].numVacas),
    data: b.data || state.dietas[idx].data,
    ingredientes: Array.isArray(b.ingredientes)
      ? b.ingredientes.map(ing => ({
          produtoId: ing.produtoId,
          produto: ing.produto,
          quantidade: Number(ing.quantidade || 0),
        }))
      : state.dietas[idx].ingredientes,
  };
  writeStore(state);
  res.json(state.dietas[idx]);
});

// DELETE /api/v1/consumo/dietas/:id
router.delete("/dietas/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const before = state.dietas.length;
  state.dietas = state.dietas.filter(d => d.id !== id);
  if (state.dietas.length === before) return res.status(404).json({ error: "not found" });
  writeStore(state);
  res.status(204).end();
});

/* ===================== LIMPEZA (Ciclos) ===================== */
// GET /api/v1/consumo/limpeza/ciclos  (pode calcular custo/estimativas on-the-fly)
router.get("/limpeza/ciclos", (_req, res) => {
  const state = readStore();
  const { ciclos, produtos } = state;

  const items = ciclos.slice().sort((a,b)=> (a.nome||"").localeCompare(b.nome||""))
    .map(c => {
      const freq = Number(c.frequencia)||1;
      // custo diário
      const custo = (c.etapas||[]).reduce((acc,e)=>{
        const cond = parseCond(e.condicao);
        const vezes = vezesPorDia(cond, freq);
        const ml    = convToMl(e.quantidade, e.unidade);
        // preço por mL: se precoUnitario é R$/L, dividir por 1000
        const prod  = produtos.find(p => p.id === e.produto || p.nomeComercial === e.produto);
        const pL    = Number(prod?.precoUnitario || 0); // R$/L ou R$/kg conforme seu cadastro
        const porML = pL > 0 ? (String((prod?.unidade||"").toLowerCase()).startsWith("l") ? pL/1000 : pL/1000) : 0;
        return acc + (ml * vezes * porML);
      }, 0);

      // duração estimada (dias) baseado no gargalo de estoque
      let minDias = Infinity;
      (c.etapas||[]).forEach(e=>{
        const cond = parseCond(e.condicao);
        const vezes = vezesPorDia(cond, freq);
        const mlDia = convToMl(e.quantidade, e.unidade) * vezes;
        const prod  = produtos.find(p => p.id === e.produto || p.nomeComercial === e.produto);
        const estoqueML = prod
          ? (String((prod.unidade||"").toLowerCase()).startsWith("l")
              ? Number(prod.quantidade||0) * 1000
              : Number(prod.quantidade||0) * 1000) // ajuste caso use outras unidades
          : 0;
        if (mlDia > 0) minDias = Math.min(minDias, estoqueML / mlDia);
      });
      const duracao = Number.isFinite(minDias) ? Math.max(0, Math.floor(minDias)) : null;

      return { ...c, custoDiario: custo, duracaoEstimadaDias: duracao };
    });

  res.json({ items });
});

// POST /api/v1/consumo/limpeza/ciclos
router.post("/limpeza/ciclos", (req, res) => {
  const state = readStore();
  const b = req.body || {};
  const item = {
    id: randomUUID(),
    nome: b.nome || "",
    tipo: b.tipo || "",
    diasSemana: Array.isArray(b.diasSemana) ? b.diasSemana : [],
    frequencia: Number(b.frequencia || 1),
    etapas: Array.isArray(b.etapas) ? b.etapas.map(e => ({
      produto: e.produto, // pode ser id ou nome
      quantidade: Number(e.quantidade || 0),
      unidade: e.unidade || "mL",
      condicao: e.condicao || { tipo:"sempre" },
      complementar: Boolean(e.complementar),
    })) : [],
  };
  state.ciclos.push(item);
  writeStore(state);
  res.status(201).json(item);
});

// PUT /api/v1/consumo/limpeza/ciclos/:id
router.put("/limpeza/ciclos/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const idx = state.ciclos.findIndex(c => c.id === id);
  if (idx < 0) return res.status(404).json({ error: "not found" });

  const b = req.body || {};
  state.ciclos[idx] = {
    ...state.ciclos[idx],
    nome: b.nome ?? state.ciclos[idx].nome,
    tipo: b.tipo ?? state.ciclos[idx].tipo,
    diasSemana: Array.isArray(b.diasSemana) ? b.diasSemana : state.ciclos[idx].diasSemana,
    frequencia: Number(b.frequencia ?? state.ciclos[idx].frequencia),
    etapas: Array.isArray(b.etapas)
      ? b.etapas.map(e => ({
          produto: e.produto,
          quantidade: Number(e.quantidade || 0),
          unidade: e.unidade || "mL",
          condicao: e.condicao || { tipo:"sempre" },
          complementar: Boolean(e.complementar),
        }))
      : state.ciclos[idx].etapas,
  };
  writeStore(state);
  res.json(state.ciclos[idx]);
});

// DELETE /api/v1/consumo/limpeza/ciclos/:id
router.delete("/limpeza/ciclos/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const before = state.ciclos.length;
  state.ciclos = state.ciclos.filter(c => c.id !== id);
  if (state.ciclos.length === before) return res.status(404).json({ error: "not found" });
  writeStore(state);
  res.status(204).end();
});

// GET /api/v1/consumo/limpeza/plano/:id  (gera plano semanal do ciclo)
router.get("/limpeza/plano/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const c = state.ciclos.find(x => x.id === id);
  if (!c) return res.status(404).json({ error: "not found" });

  const freq = Number(c.frequencia)||1;
  const blocos = [];
  const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  for (let d = 0; d < 7; d++) {
    if (!c.diasSemana?.includes(d)) continue;
    const execs = [];
    for (let exec = 0; exec < freq; exec++) {
      const horario = freq === 1 ? "" : exec === 0 ? "Manhã" : exec === 1 ? "Tarde" : `Ordenha ${exec+1}`;
      const itens = [];
      let ultimaCondBase = null;
      (c.etapas||[]).forEach(e=>{
        const cond = parseCond(e.condicao);
        let aplicar = true;
        if (cond.tipo === "cada") aplicar = (exec+1) % (cond.intervalo || 1) === 0;
        else if (cond.tipo === "manha") aplicar = horario === "Manhã";
        else if (cond.tipo === "tarde") aplicar = horario === "Tarde";
        if (!aplicar) return;
        let texto = `${e.quantidade} ${e.unidade} ${e.produto}`;
        if (cond.tipo === "cada") texto += ` (a cada ${cond.intervalo} ordenhas)`;
        if (e.complementar && ultimaCondBase &&
            cond.tipo === ultimaCondBase.tipo &&
            (cond.intervalo||0) === (ultimaCondBase.intervalo||0)) {
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

  res.json({ cicloId: id, plano: blocos });
});

/* ===================== CALENDÁRIO SANITÁRIO ===================== */
// GET /api/v1/consumo/sanitario/manejos
router.get("/sanitario/manejos", (_req, res) => {
  const state = readStore();
  res.json({ items: state.manejos });
});

// POST /api/v1/consumo/sanitario/manejos
router.post("/sanitario/manejos", (req, res) => {
  const state = readStore();
  const b = req.body || {};
  const item = {
    id: randomUUID(),
    categoria: b.categoria || "",
    tipo: b.tipo || "",
    produto: b.produto || "",
    frequencia: b.frequencia || "",
    idade: b.idade || "",
    via: b.via || "",
    dose: b.dose || "",
    dataInicial: b.dataInicial || "",
    proximaAplicacao: b.proximaAplicacao || "",
    ultimaAplicacao: b.ultimaAplicacao || "",
    observacoes: b.observacoes || "",
  };
  state.manejos.push(item);
  writeStore(state);
  res.status(201).json(item);
});

// PUT /api/v1/consumo/sanitario/manejos/:id
router.put("/sanitario/manejos/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const idx = state.manejos.findIndex(m => m.id === id);
  if (idx < 0) return res.status(404).json({ error: "not found" });
  state.manejos[idx] = { ...state.manejos[idx], ...req.body, id };
  writeStore(state);
  res.json(state.manejos[idx]);
});

// DELETE /api/v1/consumo/sanitario/manejos/:id
router.delete("/sanitario/manejos/:id", (req, res) => {
  const { id } = req.params;
  const state = readStore();
  const before = state.manejos.length;
  state.manejos = state.manejos.filter(m => m.id !== id);
  if (state.manejos.length === before) return res.status(404).json({ error: "not found" });
  writeStore(state);
  res.status(204).end();
});

// POST /api/v1/consumo/sanitario/manejos/:id/registro  { data, observacoes }
router.post("/sanitario/manejos/:id/registro", (req, res) => {
  const { id } = req.params;
  const { data, observacoes = "" } = req.body || {};
  const state = readStore();
  const idx = state.manejos.findIndex(m => m.id === id);
  if (idx < 0) return res.status(404).json({ error: "not found" });

  const reg = { ...state.manejos[idx] };
  reg.ultimaAplicacao = data;
  const dias = parseInt(reg.frequencia);
  if (!Number.isNaN(dias) && data) {
    const d = parseISOorBR(data);
    d.setDate(d.getDate() + dias);
    reg.proximaAplicacao = isoDate(d);
  }
  reg.observacoes = observacoes;
  state.manejos[idx] = reg;
  writeStore(state);
  res.json(reg);
});

/* ======= Exames sanitários (opcional — usado pelo modal “Exames”) ======= */
// GET /api/v1/consumo/sanitario/exames
router.get("/sanitario/exames", (_req,res) => {
  const state = readStore();
  res.json({ items: state.exames });
});

// POST /api/v1/consumo/sanitario/exames
router.post("/sanitario/exames", (req,res) => {
  const state = readStore();
  const b = req.body || {};
  const item = {
    id: randomUUID(),
    tipo: b.tipo || "",
    outroTipo: b.outroTipo || "",
    abrangencia: b.abrangencia || "",
    status: b.status || "Propriedade Não Certificada",
    validadeCertificado: b.validadeCertificado || "",
    certificado: b.certificado || null, // base64 opcional
    dataUltimo: b.dataUltimo || "",
    comprovante: b.comprovante || null,  // base64 opcional
    animal: b.animal || "",
  };
  state.exames.push(item);
  writeStore(state);
  res.status(201).json(item);
});

export default router;
