// backend/resources/animals.resource.js (ESM)
import express from 'express';
import db from '../dbx.js';
import { z } from '../validate.js';
import { makeValidator } from '../validate.js';
import { makeCrudRouter } from './crudRouter.js';

/* ================= helpers ================= */
function extractUserId(req) {
  const u = req.user || req.auth || {};
  let id = u.id || u.userId || req.userId || u.sub || null;
  if (!id) {
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    try {
      if (token) {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        id = payload.userId || payload.id || payload.sub || payload.uid || null;
      }
    } catch {}
  }
  return id;
}

/* ================= introspecção de colunas ================= */
const TABLE = 'animals';
let COLS = new Set();
try {
  const { rows } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [TABLE]
  );
  COLS = new Set(rows.map(r => r.column_name));
} catch (e) {
  console.warn('[animals.resource] Não foi possível introspectar colunas:', e?.message);
}
const hasCol = (c) => COLS.has(c);

/* ========= colunas de lote/grupo detectadas dinamicamente ========= */
const LOTE_COL       = hasCol('lote_id')     ? 'lote_id'   : (hasCol('grupo_id') ? 'grupo_id'   : null);
const LOTE_NOME_COL  = hasCol('lote_nome')   ? 'lote_nome' : (hasCol('grupo_nome') ? 'grupo_nome' : null);
const HAS_UPDATED_AT = hasCol('updated_at');

/* ================= validação ================= */
// LEITE
const leiteItemSchema = z.object({
  data: z.string().min(10).max(10), // "YYYY-MM-DD"
  manha: z.coerce.number().nonnegative().optional(),
  tarde: z.coerce.number().nonnegative().optional(),
  terceira: z.coerce.number().nonnegative().optional(),
  litros: z.coerce.number().nonnegative().optional(),
  tipo: z.enum(['total', '2', '3']).optional().nullable(),
  lote: z.string().optional().nullable(),
  loteSugerido: z.string().optional().nullable(),
  acaoSugerida: z.enum(['Manter', 'Mover', 'Secar']).optional().nullable(),
  motivoSugestao: z.string().optional().nullable(),
  obs: z.string().optional().nullable(),
});

// CCS
const ccsItemSchema = z.object({
  data: z.string().min(10).max(10),
  valor: z.coerce.number(),
});

// CMT
const cmtResultadoSchema = z.object({ resultado: z.string().max(3) }).partial();
const cmtItemSchema = z.object({
  data: z.string().min(10).max(10),
  cmt: z.object({
    PE: cmtResultadoSchema.optional(),
    PD: cmtResultadoSchema.optional(),
    AE: cmtResultadoSchema.optional(),
    AD: cmtResultadoSchema.optional(),
    TE: cmtResultadoSchema.optional(),
    TD: cmtResultadoSchema.optional(),
  }).passthrough(),
});

// Histórico
const historicoSchema = z.object({
  leite: z.array(leiteItemSchema).optional(),
  ccs: z.array(ccsItemSchema).optional(),
  mastite: z.object({ cmt: z.array(cmtItemSchema).optional() }).partial().optional(),
  // onde guardamos lote caso não haja colunas físicas
  lote: z.object({
    id: z.string().nullable().optional(),
    nome: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  }).partial().optional(),
}).partial().passthrough();

// schema base
const createSchema = z.object({
  numero: z.string().optional(),
  brinco: z.string().optional(),
  nascimento: z.string().optional(), // dd/mm/aaaa
  raca: z.string().optional(),
  estado: z.string().optional().default('vazia'),
  sexo: z.string().optional(),
  categoria: z.string().optional(),
  situacao_produtiva: z.string().optional(),
  situacao_reprodutiva: z.string().optional(),
  pai: z.string().optional(),
  mae: z.string().optional(),
  n_lactacoes: z.coerce.number().int().nonnegative().optional(),
  ultima_ia: z.string().optional(),
  parto: z.string().optional(),
  previsao_parto: z.string().optional(),
  historico: historicoSchema.optional(),
  // aceitos no payload, mas só serão enviados ao DB se existirem as colunas
  lote_id: z.string().nullable().optional(),
  lote_nome: z.string().nullable().optional(),
  grupo_id: z.string().nullable().optional(),
  grupo_nome: z.string().nullable().optional(),
});
const updateSchema = createSchema.partial();

/* ================= CRUD config dinâmico ================= */
const candidatesList = [
  'id','owner_id','numero','brinco','raca','estado','sexo','categoria',
  'situacao_produtiva','situacao_reprodutiva',
  'n_lactacoes','pai','mae','nascimento','ultima_ia','parto','previsao_parto',
  'lote_id','lote_nome','grupo_id','grupo_nome',
  'historico','created_at','updated_at',
];
const listFields = candidatesList.filter(hasCol);

const candidatesSearch = ['numero','brinco','raca','estado','pai','mae','situacao_produtiva','situacao_reprodutiva'];
const searchFields = candidatesSearch.filter(hasCol);

const candidatesSortable = [
  'numero','brinco','raca','estado','sexo','categoria',
  'situacao_produtiva','situacao_reprodutiva',
  'n_lactacoes','nascimento','ultima_ia','parto','previsao_parto',
  'lote_id','grupo_id','created_at','updated_at',
];
const sortable = candidatesSortable.filter(hasCol);

const ORDER_COL = hasCol('created_at') ? 'created_at' : (hasCol('id') ? 'id' : listFields[0] || 'id');
const HAS_OWNER = hasCol('owner_id');
const HAS_PREVISAO = hasCol('previsao_parto');

const cfg = {
  table: TABLE,
  id: 'id',
  listFields,
  searchFields,
  sortable,
  validateCreate: makeValidator(createSchema),
  validateUpdate: makeValidator(updateSchema),
  defaults: () => (hasCol('created_at') ? { created_at: new Date().toISOString() } : {}),
  ...(HAS_OWNER ? { scope: { column: 'owner_id', required: true } } : {}),
};

const router = express.Router();

/* =========== Sanitização + mapeamento inteligente de LOTE =========== */
const ALLOWED_KEYS = new Set([
  'numero','brinco','nascimento','raca','estado','sexo','categoria',
  'situacao_produtiva','situacao_reprodutiva',
  'pai','mae','n_lactacoes','ultima_ia','parto','previsao_parto','historico',
  // aceitamos no payload para mapear:
  'lote_id','lote_nome','grupo_id','grupo_nome',
  'current_lote_id','current_lote_nome',
]);

router.use((req, _res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

  // 🚫 não mexer no payload do endpoint dedicado de lote
  const p = req.path || req.originalUrl || '';
  if (req.method === 'PUT' && /\/lote\/?$/.test(p)) return next();

  const b = req.body ?? {};
  const clean = {};

  // leite/ccs/cmt legado -> historico
  if (Array.isArray(b.leite)) {
    clean.historico = clean.historico || {};
    clean.historico.leite = b.leite;
  }
  if (Array.isArray(b.ccs)) {
    clean.historico = clean.historico || {};
    clean.historico.ccs = b.ccs;
  }
  if (Array.isArray(b.cmt)) {
    clean.historico = clean.historico || {};
    clean.historico.mastite = { ...(clean.historico.mastite || {}), cmt: b.cmt };
  }
  if (b.mastite && typeof b.mastite === 'object' && Array.isArray(b.mastite.cmt)) {
    clean.historico = clean.historico || {};
    clean.historico.mastite = { ...(clean.historico.mastite || {}), cmt: b.mastite.cmt };
  }
  if (b.historico && typeof b.historico === 'object') {
    clean.historico = { ...(clean.historico || {}), ...b.historico };
  }

  // copia apenas chaves permitidas inicialmente
  for (const k of Object.keys(b)) {
    if (ALLOWED_KEYS.has(k)) {
      clean[k] = k === 'historico' ? (clean.historico || b.historico) : b[k];
    }
  }

  // 🎯 Mapeia payload de LOTE
  const lote_id_in   = b.lote_id ?? b.grupo_id ?? b.current_lote_id ?? null;
  const lote_nome_in = b.lote_nome ?? b.grupo_nome ?? b.current_lote_nome ?? null;
  const temLoteNoPayload = lote_id_in !== null || lote_nome_in !== null;

  if (temLoteNoPayload) {
    if (LOTE_COL) {
      clean[LOTE_COL] = lote_id_in;
      if (LOTE_NOME_COL) clean[LOTE_NOME_COL] = lote_nome_in;
      delete clean.lote_id; delete clean.lote_nome;
      delete clean.grupo_id; delete clean.grupo_nome;
      delete clean.current_lote_id; delete clean.current_lote_nome;
    } else {
      const nowIso = new Date().toISOString();
      clean.historico = {
        ...(clean.historico || {}),
        lote: {
          ...(clean.historico?.lote || {}),
          id: lote_id_in ?? null,
          nome: lote_nome_in ?? null,
          updated_at: nowIso,
        },
      };
      delete clean.lote_id; delete clean.lote_nome;
      delete clean.grupo_id; delete clean.grupo_nome;
      delete clean.current_lote_id; delete clean.current_lote_nome;
    }
  }

  // 🔐 Filtro final
  const finalClean = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === 'historico' || hasCol(k)) finalClean[k] = v;
  }

  req.body = finalClean;
  next();
});

/* =========== AIRBAG: deep-merge de historico em PUT/PATCH =========== */
function normalizeHistorico(val) {
  if (!val) return {};
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return {}; } }
  return (val && typeof val === 'object') ? val : {};
}
function isDateArray(arr) {
  return Array.isArray(arr) && arr.every(x => x && typeof x === 'object' && 'data' in x);
}
function mergeByDateArray(oldArr = [], newArr = []) {
  const map = new Map();
  for (const item of oldArr) if (item?.data) map.set(item.data, { ...item });
  for (const item of newArr) {
    if (!item?.data) continue;
    const prev = map.get(item.data) || {};
    map.set(item.data, { ...prev, ...item });
  }
  const out = [...map.values()];
  out.sort((a, b) => new Date(a.data) - new Date(b.data));
  return out;
}
function deepMerge(a, b) {
  if (b == null) return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (isDateArray(a) || isDateArray(b)) return mergeByDateArray(a, b);
    return b;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const res = { ...a };
    for (const k of Object.keys(b)) res[k] = (k in a) ? deepMerge(a[k], b[k]) : b[k];
    return res;
  }
  return b;
}

router.use('/:id', async (req, res, next) => {
  if (!['PUT', 'PATCH'].includes(req.method)) return next();
  // 🚫 não interferir no PUT /:id/lote
  const p = req.path || req.originalUrl || '';
  if (req.method === 'PUT' && /\/lote\/?$/.test(p)) return next();

  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return next();

    const row = await db.query(
      `SELECT historico FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${HAS_OWNER ? 'AND "owner_id" = $2' : ''} LIMIT 1`,
      HAS_OWNER ? [id, uid] : [id]
    );
    const atual = normalizeHistorico(row.rows[0]?.historico);
    const incoming = normalizeHistorico(req.body?.historico);

    if (Array.isArray(req.body?.leite)) incoming.leite = mergeByDateArray(atual.leite, req.body.leite);
    if (Array.isArray(req.body?.ccs))   incoming.ccs   = mergeByDateArray(atual.ccs, req.body.ccs);
    if (Array.isArray(req.body?.cmt)) {
      const mast = atual.mastite || {};
      const novo = { ...(incoming.mastite || {}) };
      novo.cmt = mergeByDateArray(mast.cmt, req.body.cmt);
      incoming.mastite = novo;
    }

    const merged = deepMerge(atual, incoming);
    req.body = { ...req.body, historico: merged };

    return next();
  } catch (e) {
    console.error('AIRBAG merge historico falhou:', e);
    return next();
  }
});

/* ===== helper: materializa lote (coluna ou historico) ===== */
function materializeLote(row) {
  if (!row || typeof row !== 'object') return { lote_id: null, lote_nome: null, source: 'none' };

  if (LOTE_COL && row[LOTE_COL] !== undefined) {
    return {
      lote_id: row[LOTE_COL] ?? null,
      lote_nome: LOTE_NOME_COL ? (row[LOTE_NOME_COL] ?? null) : null,
      source: 'column',
    };
  }
  const hist = row.historico && typeof row.historico === 'object'
    ? row.historico
    : (typeof row.historico === 'string' ? (safeJSON(row.historico) || {}) : {});
  if (hist?.lote && typeof hist.lote === 'object') {
    return {
      lote_id: hist.lote.id ?? null,
      lote_nome: hist.lote.nome ?? null,
      source: 'historico',
    };
  }
  return { lote_id: null, lote_nome: null, source: 'none' };
}
function safeJSON(s){ try { return JSON.parse(s); } catch { return null; } }

/* =========== VIEWS especiais (pré-parto, secagem, parto) =========== */
router.get('/', async (req, res, next) => {
  const { view } = req.query || {};
  if (!view) return next();

  if (!HAS_PREVISAO) {
    return res.json({ items: [], page: 1, limit: 20, total: 0, pages: 1, sort: ORDER_COL, order: 'desc', q: '' });
  }

  const uid = extractUserId(req);
  if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 200);
  const offset = (page - 1) * limit;
  const days = Math.max(parseInt(req.query.days || '0', 10), 0);

  const prev = `to_date(NULLIF(previsao_parto,''),'DD/MM/YYYY')`;

  const where = [];
  const params = [];

  if (HAS_OWNER) {
    params.push(extractUserId(req));
    where.push(`owner_id = $${params.length}`);
  }

  if (view === 'preparto') {
    where.push(`${prev} >= current_date`);
    params.push(days || 30);
    where.push(`${prev} <= current_date + make_interval(days => $${params.length})`);
  } else if (view === 'secagem') {
    params.push(days || 60);
    const p = `$${params.length}`;
    where.push(`current_date >= (${prev} - make_interval(days => ${p}))`);
    where.push(`current_date < ${prev}`);
  } else if (view === 'parto') {
    where.push(`${prev} >= current_date`);
    params.push(days || 1);
    where.push(`${prev} <= current_date + make_interval(days => $${params.length})`);
  } else {
    return next();
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const fields = listFields.map((f) => `"${f}"`).join(',');

  const sqlItems = `
    SELECT ${fields}
    FROM "${cfg.table}"
    ${whereSql}
    ORDER BY "${ORDER_COL}" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const sqlCount = `
    SELECT COUNT(*)::int AS total
    FROM "${cfg.table}"
    ${whereSql}
  `;

  const [rows, count] = await Promise.all([db.query(sqlItems, params), db.query(sqlCount, params)]);
  const total = count.rows[0]?.total || 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  return res.json({ items: rows.rows, page, limit, total, pages, sort: ORDER_COL, order: 'desc', q: '' });
});

/* =========== Endpoint dedicado de LOTE (robusto com fallback) =========== */
router.put('/:id/lote', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    // Normaliza payload aceitando várias chaves; '' => null
    const b = req.body || {};
    const rawId   = b.lote_id ?? b.grupo_id ?? b.current_lote_id ?? b.loteId ?? b.grupoId ?? null;
    const rawNome = b.lote_nome ?? b.grupo_nome ?? b.current_lote_nome ?? b.loteNome ?? b.grupoNome ?? null;
    const lote_id   = (rawId === '' ? null : rawId);
    const lote_nome = (rawNome === '' ? null : rawNome);

    const finish = (row) => {
      const out = row || {};
      const mat = materializeLote(out);
      out.current_lote_id = mat.lote_id;
      out.current_lote_nome = mat.lote_nome;
      return res.json(out);
    };

    // 1) Tentar gravar na(s) coluna(s) física(s), se existir(em)
    if (LOTE_COL) {
      try {
        const sets = [`"${LOTE_COL}" = $${HAS_OWNER ? 3 : 2}`];
        const params = HAS_OWNER ? [id, uid, lote_id] : [id, lote_id];
        if (LOTE_NOME_COL) { sets.push(`"${LOTE_NOME_COL}" = $${params.length + 1}`); params.push(lote_nome); }
        if (HAS_UPDATED_AT) sets.push(`"updated_at" = NOW()`);

        const whereOwner = HAS_OWNER ? `AND "owner_id" = $2` : '';
        const sql = `UPDATE "${cfg.table}" SET ${sets.join(', ')} WHERE "${cfg.id}" = $1 ${whereOwner} RETURNING *;`;
        const { rows } = await db.query(sql, params);
        if (!rows.length) return res.status(404).json({ error: 'NotFound' });
        return finish(rows[0]);
      } catch (e) {
        console.warn('[animals.resource] Falha em coluna de lote; caindo para historico.lote:', e?.message);
        // segue para fallback
      }
    }

    // 2) Fallback: persistir em historico.lote
    const whereOwner2 = HAS_OWNER ? 'AND "owner_id" = $2' : '';
    const params2 = HAS_OWNER ? [id, uid] : [id];
    const sel = await db.query(`SELECT * FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${whereOwner2} LIMIT 1`, params2);
    if (!sel.rows.length) return res.status(404).json({ error: 'NotFound' });
    const row = sel.rows[0];

    // Tenta via JSON do Node...
    let historico = row.historico;
    if (!historico || typeof historico !== 'object') {
      try { historico = JSON.parse(historico || '{}'); } catch { historico = {}; }
    }
    historico.lote = { ...(historico.lote || {}), id: lote_id ?? null, nome: lote_nome ?? null, updated_at: new Date().toISOString() };

    try {
      const upd = await db.query(
        `UPDATE "${cfg.table}" SET historico = $1 ${HAS_UPDATED_AT ? ', "updated_at" = NOW()' : ''} WHERE "${cfg.id}" = $2 ${whereOwner2} RETURNING *`,
        HAS_OWNER ? [historico, id, uid] : [historico, id]
      );
      return finish(upd.rows[0] || {});
    } catch (e1) {
      // ...e, se ainda assim falhar, força via SQL JSONB (quando a coluna for json/jsonb)
      try {
        const upd2 = await db.query(
          `
          UPDATE "${cfg.table}"
          SET historico = COALESCE(historico, '{}'::jsonb) ||
            jsonb_build_object('lote', jsonb_build_object('id', $3::text, 'nome', $4::text, 'updated_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
            ${HAS_UPDATED_AT ? ', "updated_at" = NOW()' : ''}
          WHERE "${cfg.id}" = $1 ${whereOwner2}
          RETURNING *;
          `,
          HAS_OWNER ? [id, uid, lote_id, lote_nome] : [id, lote_id, lote_nome]
        );
        return finish(upd2.rows[0] || {});
      } catch (e2) {
        console.error('Falha no fallback historico.lote:', e1?.message, ' // SQL JSONB:', e2?.message);
        return res.status(500).json({ error: 'Falha ao atualizar lote' });
      }
    }
  } catch (e) {
    console.error('PUT /animals/:id/lote falhou:', e);
    return res.status(500).json({ error: 'Falha ao atualizar lote' });
  }
});

router.get('/:id/lote', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    const whereOwner = HAS_OWNER ? 'AND "owner_id" = $2' : '';
    const params = HAS_OWNER ? [id, uid] : [id];

    const { rows } = await db.query(
      `SELECT * FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${whereOwner} LIMIT 1`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });

    const mat = materializeLote(rows[0]);
    return res.json(mat);
  } catch (e) {
    console.error('GET /animals/:id/lote falhou:', e);
    return res.status(500).json({ error: 'Falha ao ler lote' });
  }
});

/* =========== Salvar LEITE (merge por data) =========== */
router.post('/:id/leite', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params || {};
  if (!id) return res.status(400).json({ error: 'missing id' });

  const parsed = leiteItemSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const med = { ...parsed.data };

  if (med.litros == null) {
    const m = Number(med.manha || 0);
    const t = Number(med.tarde || 0);
    const c = Number(med.terceira || 0);
    const total = med.tipo === '3' ? m + t + c : med.tipo === 'total' ? Number(med.litros || 0) : m + t;
    med.litros = Number((isFinite(total) ? total : 0).toFixed(1));
  }

  const row = await db.query(
    `SELECT historico FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${HAS_OWNER ? 'AND "owner_id" = $2' : ''} LIMIT 1`,
    HAS_OWNER ? [id, uid] : [id]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'NotFound' });

  let historico = row.rows[0].historico;
  if (!historico || typeof historico !== 'object') {
    try { historico = JSON.parse(historico || '{}'); } catch { historico = {}; }
  }

  const arr = Array.isArray(historico.leite) ? [...historico.leite] : [];
  const ix = arr.findIndex((x) => x && x.data === med.data);
  if (ix >= 0) arr[ix] = { ...arr[ix], ...med };
  else arr.push(med);
  historico.leite = arr;

  await db.query(
    `UPDATE "${cfg.table}" SET historico = $1 WHERE "${cfg.id}" = $2 ${HAS_OWNER ? 'AND "owner_id" = $3' : ''}`,
    HAS_OWNER ? [historico, id, uid] : [historico, id]
  );

  return res.json({ ok: true, leite: historico.leite });
});

/* =========== Salvar CCS (merge por data) =========== */
router.post('/:id/ccs', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params || {};
  const parsed = ccsItemSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const item = parsed.data;

  const row = await db.query(
    `SELECT historico FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${HAS_OWNER ? 'AND "owner_id" = $2' : ''} LIMIT 1`,
    HAS_OWNER ? [id, uid] : [id]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'NotFound' });

  let historico = row.rows[0].historico;
  if (!historico || typeof historico !== 'object') {
    try { historico = JSON.parse(historico || '{}'); } catch { historico = {}; }
  }

  const arr = Array.isArray(historico.ccs) ? [...historico.ccs] : [];
  const ix = arr.findIndex((x) => x && x.data === item.data);
  if (ix >= 0) arr[ix] = { ...arr[ix], ...item };
  else arr.push(item);
  historico.ccs = arr;

  await db.query(
    `UPDATE "${cfg.table}" SET historico = $1 WHERE "${cfg.id}" = $2 ${HAS_OWNER ? 'AND "owner_id" = $3' : ''}`,
    HAS_OWNER ? [historico, id, uid] : [historico, id]
  );

  return res.json({ ok: true, ccs: historico.ccs });
});

/* =========== Salvar CMT (merge por data) =========== */
router.post('/:id/cmt', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params || {};
  const parsed = cmtItemSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const item = parsed.data;

  const row = await db.query(
    `SELECT historico FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${HAS_OWNER ? 'AND "owner_id" = $2' : ''} LIMIT 1`,
    HAS_OWNER ? [id, uid] : [id]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'NotFound' });

  let historico = row.rows[0].historico;
  if (!historico || typeof historico !== 'object') {
    try { historico = JSON.parse(historico || '{}'); } catch { historico = {}; }
  }

  const mastite = typeof historico.mastite === 'object' && historico.mastite ? { ...historico.mastite } : {};
  const arr = Array.isArray(mastite.cmt) ? [...mastite.cmt] : [];
  const ix = arr.findIndex((x) => x && x.data === item.data);
  if (ix >= 0) arr[ix] = { ...arr[ix], ...item };
  else arr.push(item);
  mastite.cmt = arr;
  historico.mastite = mastite;

  await db.query(
    `UPDATE "${cfg.table}" SET historico = $1 WHERE "${cfg.id}" = $2 ${HAS_OWNER ? 'AND "owner_id" = $3' : ''}`,
    HAS_OWNER ? [historico, id, uid] : [historico, id]
  );

  return res.json({ ok: true, cmt: mastite.cmt });
});

/* =========== CRUD padrão (lista/ler/criar/atualizar/deletar) =========== */
router.use('/', makeCrudRouter(cfg, db));
export default router;
