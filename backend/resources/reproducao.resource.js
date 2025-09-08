// backend/resources/reproducao.resource.js (ESM) — IA com baixa de dose, sync de animal e decisão persistente
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
const ISO = (d) => (d instanceof Date ? d.toISOString() : new Date(d || Date.now()).toISOString());

function toISODateString(s) {
  const v = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error('Data inválida (use YYYY-MM-DD ou DD/MM/AAAA)');
}

/* ================= introspecção dinâmica ================= */
async function getCols(table) {
  try {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [table]
    );
    return new Set(rows.map(r => String(r.column_name)));
  } catch {
    return new Set();
  }
}
const pickIdCol = (cols) => (cols.has('id') ? 'id' : (cols.has('uuid') ? 'uuid' : null));

// util: encontra a primeira coluna candidata (case-sensitive, depois case-insensitive)
function findCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  const lower = new Set([...cols].map(c => c.toLowerCase()));
  for (const c of candidates) if (lower.has(String(c).toLowerCase())) return c;
  return null;
}

const T_PROTO = 'repro_protocolo';
const T_EVT   = 'repro_evento';
const T_ANIM  = 'animals';
const T_INSEM = 'repro_inseminador';
const T_TOURO = 'genetica_touro';

const PROTO_COLS = await getCols(T_PROTO);
const EVT_COLS   = await getCols(T_EVT);
const ANIM_COLS  = await getCols(T_ANIM);
const INSEM_COLS = await getCols(T_INSEM);
const TOURO_COLS = await getCols(T_TOURO);

const HAS_OWNER_PROTO = PROTO_COLS.has('owner_id');
const HAS_OWNER_EVT   = EVT_COLS.has('owner_id');
const HAS_OWNER_ANIM  = ANIM_COLS.has('owner_id');
const HAS_OWNER_INSEM = INSEM_COLS.has('owner_id');
const HAS_OWNER_TOURO = TOURO_COLS.has('owner_id');

const HAS_UPD_PROTO   = PROTO_COLS.has('updated_at');
const HAS_UPD_EVT     = EVT_COLS.has('updated_at');
const HAS_UPD_ANIM    = ANIM_COLS.has('updated_at');
const HAS_UPD_INSEM   = INSEM_COLS.has('updated_at');
const HAS_UPD_TOURO   = TOURO_COLS.has('updated_at');

const HAS_CREATED_PROTO = PROTO_COLS.has('created_at');
const HAS_CREATED_EVT   = EVT_COLS.has('created_at');
const HAS_CREATED_INSEM = INSEM_COLS.has('created_at');
const HAS_CREATED_ANIM  = ANIM_COLS.has('created_at');

// animals (campos opcionais)
const ANIM_ID_COL = findCol(ANIM_COLS, ['id','animal_id','uuid']);
const ANIM_SIT_REP = findCol(ANIM_COLS, [
  'situacao_reprodutiva','sit_reprodutiva','status_reprodutivo','situacao_rep','situacao_repro','estado'
]);
const ANIM_ULT_IA = findCol(ANIM_COLS, [
  'ultima_ia','data_ultima_ia','ultimaIA','ultimaIa'
]);
const ANIM_PREV_PARTO = findCol(ANIM_COLS, [
  'previsao_parto','prev_parto','previsao_parto_dt','previsaoParto'
]);
const ANIM_DECISAO = findCol(ANIM_COLS, ['decisao']);
const ANIM_NUM   = findCol(ANIM_COLS, ['numero','num','number','identificador']);
const ANIM_BRINC = findCol(ANIM_COLS, ['brinco','ear_tag','earTag','brinc']);

// >>> NOVOS: protocolo/aplicação atuais (se existirem)
const ANIM_PROTO_ATUAL = findCol(ANIM_COLS, [
  'protocolo_id_atual','protocoloAtualId','protocolo_atual_id',
  'protocolo_atual','protocoloAtual','protocolo_ativo','protocoloAtivo'
]);
const ANIM_APLIC_ATUAL = findCol(ANIM_COLS, [
  'aplicacao_id_atual','aplicacaoAtualId','aplicacao_atual_id',
  'aplicacao_atual','aplicacaoAtual'
]);

// eventos
const EVT_ID          = pickIdCol(EVT_COLS);
const EVT_ANIM_COL    = findCol(EVT_COLS, ['animal_id','cow_id']);
const EVT_DATA        = findCol(EVT_COLS, ['data','dia']);
const EVT_TIPO        = findCol(EVT_COLS, ['tipo']);
const EVT_DETALHES    = findCol(EVT_COLS, ['detalhes']);
const EVT_RESULT      = findCol(EVT_COLS, ['resultado']);
const EVT_PROTO_ID    = findCol(EVT_COLS, ['protocolo_id']);
const EVT_APLIC_ID    = findCol(EVT_COLS, ['aplicacao_id']);

// touros (novo/legado)
const TOURO_ID     = pickIdCol(TOURO_COLS);
const TOURO_D_ADQ  = findCol(TOURO_COLS, ['doses_adquiridas']);
const TOURO_D_REST = findCol(TOURO_COLS, ['doses_restantes']);
const TOURO_QTD    = findCol(TOURO_COLS, ['quantidade']);
const TOURO_REST_COL = TOURO_D_REST || TOURO_QTD;
const STOCK_ENABLED  = !!(T_TOURO && TOURO_ID && TOURO_REST_COL);

/* ================= zod ================= */
const etapaSchema = z.object({
  dia: z.coerce.number().int().min(0),
  hormonio: z.string().optional().nullable(),
  acao: z.string().optional().nullable(),
  dose: z.string().optional().nullable(),
  via: z.string().optional().nullable(),
  obs: z.string().optional().nullable(),
}).passthrough();

const protocoloCreateSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  etapas: z.array(etapaSchema).min(1),
  ativo: z.boolean().optional(),
});
const protocoloUpdateSchema = protocoloCreateSchema.partial();

const tipoEventoEnum = z.enum(['IA','DIAGNOSTICO','PARTO','PROTOCOLO_ETAPA','TRATAMENTO','DECISAO']);

const eventoBaseSchema = z.object({
  animal_id: z.string().min(1),
  data: z.string().min(10).max(10),
  tipo: tipoEventoEnum,
  detalhes: z.record(z.any()).optional(),
  protocolo_id: z.string().optional().nullable(),
  aplicacao_id: z.string().optional().nullable(),
});
const eventoCreateSchema = eventoBaseSchema.extend({
  resultado: z.enum(['prenhe','vazia','indeterminado']).optional().nullable(),
});
const eventoUpdateSchema = eventoCreateSchema.partial();

/* ========= reprodução helpers ========= */
const DIAS_GESTACAO = 283;

function calculaPrevisaoParto({ dataIA, dataDiagnostico, diasGestacao }) {
  try {
    if (dataIA) {
      const d = new Date(dataIA);
      d.setDate(d.getDate() + DIAS_GESTACAO);
      return d;
    }
    if (dataDiagnostico && Number.isFinite(+diasGestacao)) {
      const d = new Date(dataDiagnostico);
      const rest = Math.max(0, DIAS_GESTACAO - Number(diasGestacao));
      d.setDate(d.getDate() + rest);
      return d;
    }
  } catch {}
  return null;
}

async function getUltimaIA(animalId, ownerId) {
  if (!EVT_ANIM_COL || !EVT_TIPO || !EVT_DATA) return null;
  const where = [`"${EVT_ANIM_COL}" = $1`, `"${EVT_TIPO}" = 'IA'`];
  const params = [animalId];
  if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $${params.length + 1}`); params.push(ownerId); }
  const sql = `
    SELECT "${EVT_DATA}" AS data
    FROM "${T_EVT}"
    WHERE ${where.join(' AND ')}
    ORDER BY "${EVT_DATA}" DESC
    LIMIT 1;
  `;
  const { rows } = await db.query(sql, params);
  return rows[0]?.data || null;
}

/**
 * Atualiza campos do animal.
 * Aceita previsaoPartoISO === null para limpar a coluna (SET NULL).
 * >>> ajustado: aceita decisao vazia/null para limpar coluna.
 * >>> agora aceita client opcional para uso em transações.
 * >>> NOVO: aceita protocoloAtualId / aplicacaoAtualId (limpa se null e coluna existir)
 */
async function atualizarAnimalCampos({
  animalId, ownerId,
  ultimaIA, situacaoReprodutiva, previsaoPartoISO, decisao,
  protocoloAtualId, aplicacaoAtualId,
  client
}) {
  if (!ANIM_ID_COL) return; // sem coluna ID em animals — evita SQL inválido
  const runner = client || db; // precisa expor .query

  const sets = [];
  const params = [];

  if (ANIM_ULT_IA && ultimaIA) {
    sets.push(`"${ANIM_ULT_IA}" = $${params.length + 1}`);
    const [y, m, d] = toISODateString(ultimaIA).split('-');
    params.push(`${d}/${m}/${y}`); // DD/MM/YYYY
  }

  if (ANIM_SIT_REP && situacaoReprodutiva) {
    sets.push(`"${ANIM_SIT_REP}" = $${params.length + 1}`);
    params.push(situacaoReprodutiva);
  }

  if (ANIM_PREV_PARTO && previsaoPartoISO !== undefined) {
    if (previsaoPartoISO === null) {
      sets.push(`"${ANIM_PREV_PARTO}" = NULL`);
    } else {
      const dt = new Date(previsaoPartoISO);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      sets.push(`"${ANIM_PREV_PARTO}" = $${params.length + 1}`);
      params.push(`${dd}/${mm}/${yyyy}`); // DD/MM/YYYY
    }
  }

  // <<< ajuste de limpeza
  if (ANIM_DECISAO && decisao !== undefined) {
    if (decisao === null || String(decisao).trim() === '') {
      sets.push(`"${ANIM_DECISAO}" = NULL`);
    } else {
      sets.push(`"${ANIM_DECISAO}" = $${params.length + 1}`);
      params.push(String(decisao));
    }
  }

  // <<< NOVO: protocolo/aplicação atuais
  if (ANIM_PROTO_ATUAL && protocoloAtualId !== undefined) {
    if (protocoloAtualId === null) {
      sets.push(`"${ANIM_PROTO_ATUAL}" = NULL`);
    } else {
      sets.push(`"${ANIM_PROTO_ATUAL}" = $${params.length + 1}`);
      params.push(String(protocoloAtualId));
    }
  }
  if (ANIM_APLIC_ATUAL && aplicacaoAtualId !== undefined) {
    if (aplicacaoAtualId === null) {
      sets.push(`"${ANIM_APLIC_ATUAL}" = NULL`);
    } else {
      sets.push(`"${ANIM_APLIC_ATUAL}" = $${params.length + 1}`);
      params.push(String(aplicacaoAtualId));
    }
  }

  if (HAS_UPD_ANIM) sets.push(`"updated_at" = NOW()`);
  if (!sets.length) return;

  const where = [`"${ANIM_ID_COL}" = $${params.length + 1}`];
  params.push(animalId);
  if (HAS_OWNER_ANIM && ownerId) { where.push(`"owner_id" = $${params.length + 1}`); params.push(ownerId); }

  const sql = `UPDATE "${T_ANIM}" SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`;
  await runner.query(sql, params);
}

/* ========= estoque de touro ========= */
async function consumirDoseTouroTx({ client, touroId, ownerId }) {
  if (!STOCK_ENABLED) return;
  const where = [`"${TOURO_ID}" = $1`];
  const params = [touroId];
  if (HAS_OWNER_TOURO && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }

  const sel = `SELECT "${TOURO_REST_COL}" AS dr FROM "${T_TOURO}" WHERE ${where.join(' AND ')} FOR UPDATE`;
  const r1 = await client.query(sel, params);
  if (!r1.rows.length) throw new Error('Touro não encontrado');
  const dr = Number(r1.rows[0].dr ?? 0);
  if (dr <= 0) throw new Error('Sem doses restantes para este touro');

  const upd = `
    UPDATE "${T_TOURO}"
       SET "${TOURO_REST_COL}" = "${TOURO_REST_COL}" - 1
           ${HAS_UPD_TOURO ? ', "updated_at" = NOW()' : ''}
     WHERE ${where.join(' AND ')}
  `;
  await client.query(upd, params);
}

async function consumirDoseTouroBestEffort({ touroId, ownerId }) {
  if (!STOCK_ENABLED || !touroId) return;
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    await consumirDoseTouroTx({ client, touroId, ownerId });
    await client.query('COMMIT');
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    console.warn('[reproducao] consumo de dose (best effort) falhou:', e?.message);
  } finally {
    client?.release?.();
  }
}

/* =================== Router =================== */
const router = express.Router();

/* =================== Protocolos CRUD =================== */
const PROTO_ID = pickIdCol(PROTO_COLS);
const PROTO_NOME = PROTO_COLS.has('nome') ? 'nome' : null;
const PROTO_DESC = PROTO_COLS.has('descricao') ? 'descricao' : null;
const PROTO_TIPO = PROTO_COLS.has('tipo') ? 'tipo' : null;
const PROTO_ETAPAS = PROTO_COLS.has('etapas') ? 'etapas' : null;
const PROTO_ATIVO = PROTO_COLS.has('ativo') ? 'ativo' : null;

const protoListFields = [
  PROTO_ID, PROTO_NOME, PROTO_DESC, PROTO_TIPO, PROTO_ETAPAS, PROTO_ATIVO,
  HAS_CREATED_PROTO && 'created_at', HAS_UPD_PROTO && 'updated_at',
].filter(Boolean);
const protoSearchFields = [PROTO_NOME, PROTO_DESC, PROTO_TIPO].filter(Boolean);
const protoSortable = [PROTO_NOME, PROTO_TIPO, HAS_CREATED_PROTO && 'created_at', HAS_UPD_PROTO && 'updated_at'].filter(Boolean);

function pickDefaultSort() {
  if (HAS_CREATED_PROTO) return 'created_at';
  if (PROTO_NOME) return PROTO_NOME;
  if (PROTO_ID) return PROTO_ID;
  return null;
}

router.get('/protocolos', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER_PROTO && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const limit = Math.max(parseInt(req.query.limit || '100', 10), 1);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const q = String(req.query.q || '').trim();

    const requestedSort = String(req.query.sort || '').trim();
    const allowedSort = new Set([PROTO_ID, ...protoSortable].filter(Boolean));
    const sort = allowedSort.has(requestedSort) ? requestedSort : pickDefaultSort();

    const orderParam = String(req.query.order || '').toUpperCase();
    const order = orderParam === 'ASC' || orderParam === 'DESC'
      ? orderParam
      : (sort === 'created_at' ? 'DESC' : 'ASC');

    const selectList = protoListFields.length ? protoListFields.map(f => `"${f}"`).join(', ') : '*';

    const where = [];
    const params = [];
    if (HAS_OWNER_PROTO) { where.push(`owner_id = $${params.length + 1}`); params.push(uid); }
    if (q && protoSearchFields.length) {
      const ors = protoSearchFields.map(f => `"${f}" ILIKE $${params.length + 1}`);
      params.push(`%${q}%`);
      where.push(`(${ors.join(' OR ')})`);
    }

    const parts = [
      `SELECT ${selectList} FROM "${T_PROTO}"`,
      where.length ? `WHERE ${where.join(' AND ')}` : '',
      sort ? `ORDER BY "${sort}" ${order}` : '',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`,
    ].filter(Boolean);

    params.push(limit, offset);
    const { rows } = await db.query(parts.join('\n'), params);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

router.post('/protocolos', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER_PROTO && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = protocoloCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
    const p = parsed.data;

    const cols = [], vals = [], params = [];
    if (PROTO_NOME) { cols.push(`"${PROTO_NOME}"`); params.push(p.nome); vals.push(`$${params.length}`); }
    if (PROTO_DESC) { cols.push(`"${PROTO_DESC}"`); params.push(p.descricao ?? null); vals.push(`$${params.length}`); }
    if (PROTO_TIPO) { cols.push(`"${PROTO_TIPO}"`); params.push(String(p.tipo || '').toUpperCase()); vals.push(`$${params.length}`); }
    if (PROTO_ETAPAS) { cols.push(`"${PROTO_ETAPAS}"`); params.push(JSON.stringify(p.etapas)); vals.push(`$${params.length}::jsonb`); }
    if (PROTO_ATIVO) { cols.push(`"${PROTO_ATIVO}"`); params.push(p.ativo ?? true); vals.push(`$${params.length}`); }
    if (HAS_OWNER_PROTO) { cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
    if (HAS_CREATED_PROTO) { cols.push('created_at'); vals.push('NOW()'); }
    if (HAS_UPD_PROTO) { cols.push('updated_at'); vals.push('NOW()'); }

    const returning = [PROTO_ID, PROTO_NOME, PROTO_DESC, PROTO_TIPO, PROTO_ETAPAS, PROTO_ATIVO, HAS_CREATED_PROTO && 'created_at', HAS_UPD_PROTO && 'updated_at']
      .filter(Boolean).map(f => `"${f}"`).join(', ');

    const sql = `INSERT INTO "${T_PROTO}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${returning};`;
    const { rows } = await db.query(sql, params);
    res.json(rows[0] || {});
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

router.put('/protocolos/:id', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER_PROTO && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = protocoloUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
    const p = parsed.data;
    if (!Object.keys(p).length) return res.json({});

    const sets = [], params = [];
    if (PROTO_NOME && p.nome !== undefined) { params.push(p.nome); sets.push(`"${PROTO_NOME}" = $${params.length}`); }
    if (PROTO_DESC && p.descricao !== undefined) { params.push(p.descricao ?? null); sets.push(`"${PROTO_DESC}" = $${params.length}`); }
    if (PROTO_TIPO && p.tipo !== undefined) { params.push(String(p.tipo || '').toUpperCase()); sets.push(`"${PROTO_TIPO}" = $${params.length}`); }
    if (PROTO_ETAPAS && p.etapas !== undefined) { params.push(JSON.stringify(p.etapas)); sets.push(`"${PROTO_ETAPAS}" = $${params.length}::jsonb`); }
    if (PROTO_ATIVO && p.ativo !== undefined) { params.push(!!p.ativo); sets.push(`"${PROTO_ATIVO}" = $${params.length}`); }
    if (HAS_UPD_PROTO) sets.push(`"updated_at" = NOW()`);

    params.push(req.params.id);
    const where = [`"${PROTO_ID}" = $${params.length}`];
    if (HAS_OWNER_PROTO) { params.push(uid); where.push(`owner_id = $${params.length}`); }

    const returning = [PROTO_ID, PROTO_NOME, PROTO_DESC, PROTO_TIPO, PROTO_ETAPAS, PROTO_ATIVO, HAS_CREATED_PROTO && 'created_at', HAS_UPD_PROTO && 'updated_at']
      .filter(Boolean).map(f => `"${f}"`).join(', ');

    const sql = `UPDATE "${T_PROTO}" SET ${sets.join(', ')} WHERE ${where.join(' AND ')} RETURNING ${returning};`;
    const { rows } = await db.query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

router.delete('/protocolos/:id', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER_PROTO && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const params = [req.params.id];
    const where = [`"${pickIdCol(PROTO_COLS)}" = $1`];
    if (HAS_OWNER_PROTO) { params.push(uid); where.push(`owner_id = $2`); }

    const sql = `DELETE FROM "${T_PROTO}" WHERE ${where.join(' AND ')}`;
    const r = await db.query(sql, params);
    res.json({ ok: true, deleted: r.rowCount || 0 });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

/* =================== Eventos CRUD base (makeCrudRouter) =================== */
const evtListFields = [
  EVT_ID, EVT_ANIM_COL, EVT_DATA, EVT_TIPO, EVT_DETALHES, EVT_RESULT, EVT_PROTO_ID, EVT_APLIC_ID,
  HAS_CREATED_EVT && 'created_at', HAS_UPD_EVT && 'updated_at',
].filter(Boolean);
const evtSearchFields = [EVT_TIPO].filter(Boolean);
const evtSortable = [EVT_DATA, EVT_TIPO, HAS_CREATED_EVT && 'created_at', HAS_UPD_EVT && 'updated_at'].filter(Boolean);

const evtCfg = {
  table: T_EVT,
  id: EVT_ID || 'id',
  listFields: evtListFields,
  searchFields: evtSearchFields,
  sortable: evtSortable,
  validateCreate: makeValidator(eventoCreateSchema),
  validateUpdate: makeValidator(eventoUpdateSchema),
  defaults: () => (HAS_CREATED_EVT ? { created_at: ISO() } : {}),
  ...(HAS_OWNER_EVT ? { scope: { column: 'owner_id', required: true } } : {}),
};

/* =================== Views =================== */
router.get('/eventos/animal/:animalId', async (req, res) => {
  if (!EVT_ANIM_COL || !EVT_DATA) return res.json({ items: [] });
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const { animalId } = req.params || {};
  const where = [`"${EVT_ANIM_COL}" = $1`];
  const params = [animalId];
  if (HAS_OWNER_EVT) { where.push(`owner_id = $2`); params.push(uid); }

  const sql = `
    SELECT ${evtListFields.length ? evtListFields.map(f => `"${f}"`).join(', ') : '*'}
    FROM "${T_EVT}"
    WHERE ${where.join(' AND ')}
    ORDER BY "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', "created_at" DESC' : ''}
  `;
  const { rows } = await db.query(sql, params);
  res.json({ items: rows });
});

/* =================== NOVA VIEW: etapas de protocolo por período =================== */
router.get('/protocolos/aplicacoes', async (req, res) => {
  try {
    if (!EVT_DATA || !EVT_TIPO) return res.json({ items: [] });
    const uid = extractUserId(req);
    if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const startQ = String(req.query.start || '').trim();
    const endQ   = String(req.query.end   || '').trim();
    if (!startQ && !endQ) return res.status(400).json({ error: 'MissingPeriod', detail: 'Informe start e/ou end' });

    const startISO = startQ ? toISODateString(startQ) : null;
    const endISO   = endQ   ? toISODateString(endQ)   : null;
    const protocoloId = String(req.query.protocoloId || req.query.protocolo_id || '').trim();

    const where = [`"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`];
    const params = [];

    if (startISO && endISO) { where.push(`"${EVT_DATA}" BETWEEN $${params.length+1} AND $${params.length+2}`); params.push(startISO, endISO); }
    else if (startISO)      { where.push(`"${EVT_DATA}" >= $${params.length+1}`); params.push(startISO); }
    else                    { where.push(`"${EVT_DATA}" <= $${params.length+1}`); params.push(endISO); }

    if (EVT_PROTO_ID && protocoloId) { where.push(`"${EVT_PROTO_ID}" = $${params.length+1}`); params.push(protocoloId); }
    if (HAS_OWNER_EVT && uid)        { where.push(`owner_id = $${params.length+1}`); params.push(uid); }

    const selectList = evtListFields.length ? evtListFields.map(f => `"${f}"`).join(', ') : '*';
    const sql = `SELECT ${selectList} FROM "${T_EVT}" WHERE ${where.join(' AND ')} ORDER BY "${EVT_DATA}" ASC ${HAS_CREATED_EVT ? ', "created_at" ASC' : ''}`;
    const { rows } = await db.query(sql, params);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

/* =================== IA: transação + baixa de dose =================== */
router.post('/ia', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = eventoCreateSchema.safeParse({ ...req.body, tipo: 'IA' });
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;
  const touroId = ev?.detalhes?.touro_id || ev?.detalhes?.touroId || null;

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    if (touroId) {
      await consumirDoseTouroTx({ client, touroId, ownerId: uid });
    }

    const cols = [], vals = [], params = [];
    if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
    if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(toISODateString(ev.data)); vals.push(`$${params.length}`); }
    if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('IA'); vals.push(`$${params.length}`); }
    if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(ev.detalhes || {})); vals.push(`$${params.length}::jsonb`); }
    if (EVT_PROTO_ID && ev.protocolo_id) { cols.push(`"${EVT_PROTO_ID}"`); params.push(ev.protocolo_id); vals.push(`$${params.length}`); }
    if (HAS_OWNER_EVT) { cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
    if (HAS_UPD_EVT)   { cols.push('updated_at'); vals.push('NOW()'); }
    if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

    const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
    const { rows } = await client.query(sql, params);
    const novo = rows[0] || {};

    await atualizarAnimalCampos({
      animalId: ev.animal_id,
      ownerId: uid,
      ultimaIA: toISODateString(ev.data),
      situacaoReprodutiva: ANIM_SIT_REP ? 'inseminada' : null,
      client,
    });

    await client.query('COMMIT');
    res.json(novo);
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    res.status(400).json({ error: 'IAError', detail: e?.message || 'Falha ao lançar IA' });
  } finally {
    client?.release?.();
  }
});

/* =================== Diagnóstico / Parto =================== */
router.post('/diagnostico', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const base = { ...req.body, tipo: 'DIAGNOSTICO' };
  const parsed = eventoCreateSchema.extend({ resultado: z.enum(['prenhe','vazia','indeterminado']) }).safeParse(base);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  const cols = [], vals = [], params = [];
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(toISODateString(ev.data)); vals.push(`$${params.length}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('DIAGNOSTICO'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(ev.detalhes || {})); vals.push(`$${params.length}::jsonb`); }
  if (EVT_RESULT)   { cols.push(`"${EVT_RESULT}"`);   params.push(ev.resultado); vals.push(`$${params.length}`); }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
  const { rows } = await db.query(sql, params);
  const novo = rows[0] || {};

  if (ANIM_SIT_REP) {
    if (ev.resultado === 'prenhe') {
      const ultimaIA = await getUltimaIA(ev.animal_id, uid);
      const dias_gestacao = ev?.detalhes?.dias_gestacao;
      const prev = calculaPrevisaoParto({
        dataIA: ultimaIA,
        dataDiagnostico: toISODateString(ev.data),
        diasGestacao: dias_gestacao
      });
      await atualizarAnimalCampos({
        animalId: ev.animal_id, ownerId: uid, situacaoReprodutiva: 'prenhe',
        previsaoPartoISO: prev ? prev.toISOString() : null,
      });
    } else if (ev.resultado === 'vazia') {
      await atualizarAnimalCampos({
        animalId: ev.animal_id,
        ownerId: uid,
        situacaoReprodutiva: 'vazia',
        previsaoPartoISO: null,
      });
    } else {
      await atualizarAnimalCampos({ animalId: ev.animal_id, ownerId: uid, situacaoReprodutiva: 'aguardando_diagnostico' });
    }
  }
  res.json(novo);
});

router.post('/parto', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = eventoCreateSchema.safeParse({ ...req.body, tipo: 'PARTO' });
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  const cols = [], vals = [], params = [];
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(toISODateString(ev.data)); vals.push(`$${params.length}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('PARTO'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(ev.detalhes || {})); vals.push(`$${params.length}::jsonb`); }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
  const { rows } = await db.query(sql, params);
  const novo = rows[0] || {};

  await atualizarAnimalCampos({
    animalId: ev.animal_id,
    ownerId: uid,
    situacaoReprodutiva: ANIM_SIT_REP ? 'pos-parto' : null,
    previsaoPartoISO: null,
  });
  res.json(novo);
});

/* =================== “Decisão” da Visão Geral =================== */
/* >>> Ajustada para aceitar vazio e limpar a coluna em animals */
router.post('/decisao', async (req, res) => {
  const uid = extractUserId(req);
  const schema = z.object({
    animal_id: z.string().min(1),
    decisao: z.string().optional().nullable(), // pode ser vazio/null para limpar
    data: z.string().min(10).max(10).optional(), // default = hoje
  });
  const p = schema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'ValidationError', issues: p.error.issues });
  const { animal_id, data } = p.data;

  const raw = p.data.decisao;
  const dec = raw == null ? null : String(raw).trim();
  const isClear = dec === null || dec === '';

  // 1) grava/limpa na tabela animals
  await atualizarAnimalCampos({ animalId: animal_id, ownerId: uid, decisao: isClear ? null : dec });

  // 2) registra evento DECISAO (mantém histórico, inclusive da limpeza)
  const cols = [], vals = [], params = [];
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(toISODateString(data || new Date().toISOString().slice(0,10))); vals.push(`$${params.length}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('DECISAO'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES) {
    const detalhes = isClear ? { decisao: null, cleared: true } : { decisao: dec };
    cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(detalhes)); vals.push(`$${params.length}::jsonb`);
  }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
  const { rows } = await db.query(sql, params);
  res.json(rows[0] || { ok: true });
});

/* ============ Últimas decisões por animal (para o front pré-selecionar) ============ */
router.post('/decisoes/ultimas', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const schema = z.object({ ids: z.array(z.string().min(1)).min(1) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
    const ids = parsed.data.ids;

    if (!EVT_TIPO || !EVT_DETALHES || !EVT_DATA || !EVT_ANIM_COL) {
      return res.json({ items: [] });
    }

    const ph = ids.map((_,i)=>`$${i+1}`).join(',');
    const params = [...ids];

    let where = [`"${EVT_TIPO}" = 'DECISAO'`, `"${EVT_ANIM_COL}" IN (${ph})`];
    if (HAS_OWNER_EVT) { params.push(uid); where.push(`owner_id = $${params.length}`); }

    const sql = `
      SELECT DISTINCT ON ("${EVT_ANIM_COL}")
             "${EVT_ANIM_COL}" AS animal_id,
             ${EVT_DETALHES ? `"${EVT_DETALHES}"->>'decisao'` : `NULL`} AS decisao,
             "${EVT_DATA}" AS data
        FROM "${T_EVT}"
       WHERE ${where.join(' AND ')}
    ORDER BY "${EVT_ANIM_COL}", "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', created_at DESC' : ''};
    `;
    const { rows } = await db.query(sql, params);
    res.json({ items: rows.map(r => ({ animal_id: r.animal_id, decisao: r.decisao })) });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

/* =================== Aplicar protocolo / deletar aplicação =================== */
router.post('/aplicar-protocolo', async (req, res) => {
  const uid = extractUserId(req);
  if ((HAS_OWNER_EVT || HAS_OWNER_PROTO) && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const bodySchema = z.object({
    protocolo_id: z.string().min(1),
    animais: z.array(z.string().min(1)).min(1),
    data_inicio: z.string().min(10).max(10),
    detalhes_comuns: z.record(z.any()).optional(),
  });
  const p = bodySchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'ValidationError', issues: p.error.issues });
  const { protocolo_id, animais, data_inicio, detalhes_comuns } = p.data;

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const whereP = [`"${pickIdCol(PROTO_COLS)}" = $1`];
    const paramsP = [protocolo_id];
    if (HAS_OWNER_PROTO) { whereP.push(`owner_id = $2`); paramsP.push(uid); }
    const sqlP = `SELECT * FROM "${T_PROTO}" WHERE ${whereP.join(' AND ')} LIMIT 1`;
    const { rows: pr } = await client.query(sqlP, paramsP);
    const proto = pr[0];
    if (!proto) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Protocolo não encontrado' }); }

    let etapas = proto[findCol(PROTO_COLS, ['etapas'])] || [];
    if (typeof etapas === 'string') { try { etapas = JSON.parse(etapas); } catch { etapas = []; } }
    if (!Array.isArray(etapas) || !etapas.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Protocolo sem etapas' }); }

    // status do animal conforme tipo do protocolo
    const tipoProto = String(proto[findCol(PROTO_COLS, ['tipo'])] || '').toUpperCase();
    const sitReprodLabel = (tipoProto === 'IATF') ? 'IATF' : 'Pré-sincronização';

    const { rows: app } = await client.query(`SELECT gen_random_uuid() AS id`);
    const aplicacao_id = app[0]?.id;

    const inicioISO = toISODateString(data_inicio);
    const inicio = new Date(inicioISO);
    const created = [];

    for (const animalId of animais) {
      // --- (a) Limpa QUALQUER etapa futura de protocolo desse animal a partir do novo início
      if (EVT_TIPO && EVT_DATA && EVT_ANIM_COL) {
        const whereDel = [
          `"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`,
          `"${EVT_ANIM_COL}" = $1`,
          `"${EVT_DATA}" >= $2`,
        ];
        const paramsDel = [animalId, inicioISO];
        if (HAS_OWNER_EVT && uid) { whereDel.push(`owner_id = $3`); paramsDel.push(uid); }
        const delSQL = `DELETE FROM "${T_EVT}" WHERE ${whereDel.join(' AND ')}`;
        await client.query(delSQL, paramsDel);
      }

      // --- cria as novas etapas
      for (const e of etapas) {
        const d = new Date(inicio);
        d.setDate(d.getDate() + Number(e.dia || 0));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dataEtapa = `${yyyy}-${mm}-${dd}`;

        const detalhes = { ...(detalhes_comuns || {}), ...(e || {}), origem_protocolo: proto[findCol(PROTO_COLS, ['nome'])] || null };

        const cols = [], vals = [], params = [];
        if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(animalId); vals.push(`$${params.length}`); }
        if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(dataEtapa); vals.push(`$${params.length}`); }
        if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('PROTOCOLO_ETAPA'); vals.push(`$${params.length}`); }
        if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(detalhes)); vals.push(`$${params.length}::jsonb`); }
        if (EVT_PROTO_ID) { cols.push(`"${EVT_PROTO_ID}"`); params.push(protocolo_id); vals.push(`$${params.length}`); }
        if (EVT_APLIC_ID) { cols.push(`"${EVT_APLIC_ID}"`); params.push(aplicacao_id); vals.push(`$${params.length}`); }
        if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
        if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
        if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

        const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
        const { rows } = await client.query(sql, params);
        created.push(rows[0]);
      }

      // --- (b) Atualiza o animal com o protocolo/aplicação atuais
      await atualizarAnimalCampos({
        animalId,
        ownerId: uid,
        situacaoReprodutiva: ANIM_SIT_REP ? sitReprodLabel : null,
        protocoloAtualId: ANIM_PROTO_ATUAL ? protocolo_id : undefined,
        aplicacaoAtualId: ANIM_APLIC_ATUAL ? aplicacao_id : undefined,
        client,
      });
    }

    await client.query('COMMIT');
    res.json({ aplicacao_id, eventos: created });
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  } finally {
    client?.release?.();
  }
});

router.delete('/aplicacao/:aplicacaoId', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  if (!EVT_APLIC_ID) return res.status(400).json({ error: 'Tabela de eventos não possui aplicacao_id' });

  // animais afetados por essa aplicação
  const paramsSel = [req.params.aplicacaoId];
  let selSQL = `SELECT DISTINCT "${EVT_ANIM_COL}" AS animal_id FROM "${T_EVT}" WHERE "${EVT_APLIC_ID}" = $1`;
  if (HAS_OWNER_EVT) { selSQL += ` AND owner_id = $2`; paramsSel.push(uid); }
  const { rows: afetados } = await db.query(selSQL, paramsSel);

  // deleta eventos dessa aplicação
  const where = [`"${EVT_APLIC_ID}" = $1`];
  const params = [req.params.aplicacaoId];
  if (HAS_OWNER_EVT) { where.push(`owner_id = $2`); params.push(uid); }
  const sql = `DELETE FROM "${T_EVT}" WHERE ${where.join(' AND ')}`;
  await db.query(sql, params);

  // limpa protocolo/aplicação atual dos animais afetados (simples)
  if ((ANIM_PROTO_ATUAL || ANIM_APLIC_ATUAL) && afetados.length) {
    for (const r of afetados) {
      await atualizarAnimalCampos({
        animalId: r.animal_id,
        ownerId: uid,
        protocoloAtualId: ANIM_PROTO_ATUAL ? null : undefined,
        aplicacaoAtualId: ANIM_APLIC_ATUAL ? null : undefined,
      });
    }
  }

  res.json({ ok: true, animais_afetados: afetados.length });
});

/* =================== Vacas vinculadas a um protocolo =================== */
/**
 * GET /api/v1/reproducao/protocolos/:id/vinculos
 * Query:
 *  - status=ATIVO (opcional; se enviado, retorna somente as vacas cujo período (início..último dia) ainda não passou)
 *  - ref_date=YYYY-MM-DD (opcional; default = hoje)
 *
 * Resposta: { items: [{ animal_id, numero, brinco, data_inicio }], meta: { ultimoDia, ref_date } }
 */
async function coletarVinculos(req, res, protocoloIdFromParam) {
  const uid = extractUserId(req);
  if ((HAS_OWNER_PROTO || HAS_OWNER_EVT) && !uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const protocoloId = String(protocoloIdFromParam || req.params.id || req.query.protocoloId || '');
  if (!protocoloId) return res.json({ items: [] });

  // 1) Carrega o protocolo para descobrir o último dia
  const whereP = [`"${pickIdCol(PROTO_COLS)}" = $1`];
  const paramsP = [protocoloId];
  if (HAS_OWNER_PROTO) { whereP.push(`owner_id = $2`); paramsP.push(uid); }

  const sqlP = `SELECT * FROM "${T_PROTO}" WHERE ${whereP.join(' AND ')} LIMIT 1`;
  const { rows: pr } = await db.query(sqlP, paramsP);
  const proto = pr[0];
  if (!proto) return res.status(404).json({ error: 'Protocolo não encontrado' });

  let etapas = proto[findCol(PROTO_COLS, ['etapas'])] || [];
  if (typeof etapas === 'string') { try { etapas = JSON.parse(etapas); } catch { etapas = []; } }
  const ultimoDia = Array.isArray(etapas)
    ? etapas.reduce((mx, e) => {
        const d = Number(e?.dia ?? 0);
        return Number.isFinite(d) ? Math.max(mx, d) : mx;
      }, 0)
    : 0;

  if (!EVT_ANIM_COL || !EVT_DATA || !EVT_TIPO || !EVT_PROTO_ID) {
    return res.json({ items: [], meta: { ultimoDia } });
  }

  // 2) Subconsulta com a 1ª data por animal para este protocolo
  const params = [protocoloId];
  const whereEvt = [
    `"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`,
    `"${EVT_PROTO_ID}" = $1`,
  ];
  if (HAS_OWNER_EVT) { params.push(uid); whereEvt.push(`owner_id = $${params.length}`); }

  let appsSQL = `
    WITH apps AS (
      SELECT "${EVT_ANIM_COL}" AS animal_id, MIN("${EVT_DATA}") AS data_inicio
        FROM "${T_EVT}"
       WHERE ${whereEvt.join(' AND ')}
       GROUP BY "${EVT_ANIM_COL}"
    )
    SELECT apps.animal_id,
           apps.data_inicio
  `;
  if (ANIM_ID_COL) {
    appsSQL += `,
           ${ANIM_NUM   ? `a."${ANIM_NUM}"   AS numero`  : 'NULL AS numero'},
           ${ANIM_BRINC ? `a."${ANIM_BRINC}" AS brinco`  : 'NULL AS brinco'}
      FROM apps
      LEFT JOIN "${T_ANIM}" a
             ON a."${ANIM_ID_COL}" = apps.animal_id
            ${HAS_OWNER_ANIM && uid ? `AND a.owner_id = $${(params.push(uid), params.length)}` : ''}
    `;
  } else {
    appsSQL += `,
           NULL AS numero,
           NULL AS brinco
      FROM apps
    `;
  }
  appsSQL += ` ORDER BY apps.data_inicio DESC;`;

  const { rows } = await db.query(appsSQL, params);

  // 3) Filtro status=ATIVO (data_inicio + ultimoDia >= ref_date)
  const wantsAtivo = String(req.query.status || '').toUpperCase() === 'ATIVO';
  const refISO = (() => {
    const q = String(req.query.ref_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  const items = rows
    .map(r => ({
      animal_id: r.animal_id,
      numero: r.numero ?? null,
      brinco: r.brinco ?? null,
      data_inicio: r.data_inicio, // YYYY-MM-DD
    }))
    .filter(it => {
      if (!wantsAtivo) return true;
      if (!it?.data_inicio) return false;
      const di = new Date(it.data_inicio);
      const fim = new Date(di);
      fim.setDate(fim.getDate() + (Number.isFinite(ultimoDia) ? ultimoDia : 0));
      return new Date(refISO) <= fim;
    });

  return res.json({ items, meta: { ultimoDia, ref_date: refISO } });
}

router.get('/protocolos/:id/vinculos', (req, res) => coletarVinculos(req, res, req.params.id));

/* ==== ALIASES DE COMPATIBILIDADE (evitam 404 até atualizar o front) ==== */
// /protocolos/:id/animais  -> mesma resposta de /protocolos/:id/vinculos
router.get('/protocolos/:id/animais', (req, res) => coletarVinculos(req, res, req.params.id));
// /aplicacoes?protocoloId=... -> usa o mesmo coletor
router.get('/aplicacoes', (req, res) => coletarVinculos(req, res, req.query.protocoloId));

/* ========== ANIMAIS (views de leitura para o calendário / compat com front) ========== */

// GET /api/v1/reproducao/animais?limit=1000&ids=a,b,c&numeros=3,4
router.get('/animais', async (req, res) => {
  try {
    if (!ANIM_ID_COL) return res.json({ items: [] }); // sem PK em animals
    const uid = extractUserId(req);
    if (HAS_OWNER_ANIM && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const limitParam = Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1);
    const limit = Math.min(limitParam, 5000);

    const ids = String(req.query.ids || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const numeros = String(req.query.numeros || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const where = [];
    const params = [];

    if (ids.length) {
      const base = params.length;
      const ph = ids.map((_, i) => `$${base + i + 1}`).join(',');
      where.push(`a."${ANIM_ID_COL}" IN (${ph})`);
      params.push(...ids);
    }
    if (ANIM_NUM && numeros.length) {
      const base = params.length;
      const ph = numeros.map((_, i) => `$${base + i + 1}`).join(',');
      where.push(`a."${ANIM_NUM}" IN (${ph})`);
      params.push(...numeros);
    }
    if (HAS_OWNER_ANIM && uid) {
      where.push(`a.owner_id = $${params.length + 1}`);
      params.push(uid);
    }

    const fields = [
      `a."${ANIM_ID_COL}" AS id`,
      ANIM_NUM   && `a."${ANIM_NUM}" AS "numero"`,
      ANIM_BRINC && `a."${ANIM_BRINC}" AS "brinco"`,
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS "ultimaIA"`,
      ANIM_PREV_PARTO&& `a."${ANIM_PREV_PARTO}" AS "previsaoParto"`,
      ANIM_DECISAO   && `a."${ANIM_DECISAO}" AS "decisao"`,
      // >>> EXPOR protocolo/aplicação atuais com vários aliases conhecidos pelo front
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocolo_atual"`,
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocolo_id_atual"`,
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocoloAtual"`,
      ANIM_APLIC_ATUAL && `a."${ANIM_APLIC_ATUAL}" AS "aplicacao_atual"`,
      ANIM_APLIC_ATUAL && `a."${ANIM_APLIC_ATUAL}" AS "aplicacao_id_atual"`,
      HAS_UPD_ANIM   && `a."updated_at"`,
      HAS_CREATED_ANIM && `a."created_at"`,
    ].filter(Boolean);

    const sql = `
      SELECT ${fields.join(', ')}
        FROM "${T_ANIM}" a
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const { rows } = await db.query(sql, params);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

// GET /api/v1/reproducao/animais/:id
router.get('/animais/:id', async (req, res) => {
  try {
    if (!ANIM_ID_COL) return res.status(404).json({ error: 'NotFound' });
    const uid = extractUserId(req);
    if (HAS_OWNER_ANIM && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const where = [`a."${ANIM_ID_COL}" = $1`];
    const params = [req.params.id];
    if (HAS_OWNER_ANIM && uid) { where.push(`a.owner_id = $2`); params.push(uid); }

    const fields = [
      `a."${ANIM_ID_COL}" AS id`,
      ANIM_NUM   && `a."${ANIM_NUM}" AS "numero"`,
      ANIM_BRINC && `a."${ANIM_BRINC}" AS "brinco"`,
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS "ultimaIA"`,
      ANIM_PREV_PARTO&& `a."${ANIM_PREV_PARTO}" AS "previsaoParto"`,
      ANIM_DECISAO   && `a."${ANIM_DECISAO}" AS "decisao"`,
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocolo_atual"`,
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocolo_id_atual"`,
      ANIM_PROTO_ATUAL && `a."${ANIM_PROTO_ATUAL}" AS "protocoloAtual"`,
      ANIM_APLIC_ATUAL && `a."${ANIM_APLIC_ATUAL}" AS "aplicacao_atual"`,
      ANIM_APLIC_ATUAL && `a."${ANIM_APLIC_ATUAL}" AS "aplicacao_id_atual"`,
      HAS_UPD_ANIM   && `a."updated_at"`,
      HAS_CREATED_ANIM && `a."created_at"`,
    ].filter(Boolean);

    const sql = `
      SELECT ${fields.join(', ')}
        FROM "${T_ANIM}" a
       WHERE ${where.join(' AND ')}
       LIMIT 1
    `;
    const { rows } = await db.query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

/* =================== Intercept: sync animal + best-effort estoque =================== */
router.use('/eventos', async (req, res, next) => {
  const end = res.end;
  const uid = extractUserId(req);
  res.end = async function intercept(chunk, encoding, cb) {
    try {
      if (['PUT','PATCH','POST'].includes(req.method)) {
        let body = null;
        try { body = JSON.parse(chunk?.toString?.() || '{}'); } catch {}
        const e = body || {};
        const tipo = (EVT_TIPO && e[EVT_TIPO]) || req.body?.tipo;
        const resultado = (EVT_RESULT && e[EVT_RESULT]) ?? req.body?.resultado;

        if (tipo === 'DIAGNOSTICO' && ANIM_SIT_REP) {
          if (resultado === 'prenhe') {
            const ultimaIA = await getUltimaIA((EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id, uid);
            const dias_gestacao = ((EVT_DETALHES && e[EVT_DETALHES]) || req.body?.detalhes || {})?.diasGestacao || ((EVT_DETALHES && e[EVT_DETALHES]) || req.body?.detalhes || {})?.dias_gestacao;
            const prev = calculaPrevisaoParto({
              dataIA: ultimaIA,
              dataDiagnostico: toISODateString((EVT_DATA && e[EVT_DATA]) || req.body?.data),
              diasGestacao: dias_gestacao
            });
            await atualizarAnimalCampos({
              animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
              ownerId: uid,
              situacaoReprodutiva: 'prenhe',
              previsaoPartoISO: prev ? prev.toISOString() : null,
            });
          } else if (resultado === 'vazia') {
            await atualizarAnimalCampos({
              animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
              ownerId: uid,
              situacaoReprodutiva: 'vazia',
              previsaoPartoISO: null,
            });
          }
        }

        if (tipo === 'IA') {
          if (ANIM_ULT_IA) {
            await atualizarAnimalCampos({
              animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
              ownerId: uid,
              ultimaIA: toISODateString((EVT_DATA && e[EVT_DATA]) || req.body?.data),
              situacaoReprodutiva: ANIM_SIT_REP ? 'inseminada' : null,
            });
          }
          const detalhes = ((EVT_DETALHES && e[EVT_DETALHES]) || req.body?.detalhes || {});
          const touroId = detalhes?.touro_id || detalhes?.touroId || null;
          if (touroId) await consumirDoseTouroBestEffort({ touroId, ownerId: uid });
        }

        if (tipo === 'PARTO' && ANIM_SIT_REP) {
          await atualizarAnimalCampos({
            animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
            ownerId: uid,
            situacaoReprodutiva: 'pos-parto',
            previsaoPartoISO: null,
          });
        }
      }
    } catch (e) {
      console.warn('[reproducao] Intercept falhou:', e?.message);
    }
    return end.call(this, chunk, encoding, cb);
  };
  next();
}, makeCrudRouter(evtCfg, db));

/* =================== INSEMINADORES =================== */
const INSEM_ID   = pickIdCol(INSEM_COLS) || 'id';
const INSEM_NOME = INSEM_COLS.has('nome') ? 'nome' : null;
const INSEM_REG  = INSEM_COLS.has('registro') ? 'registro' : null;
const INSEM_ATV  = INSEM_COLS.has('ativo') ? 'ativo' : null;

const inseminadorCreateSchema = z.object({
  nome: z.string().min(2),
  registro: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
});
const inseminadorUpdateSchema = inseminadorCreateSchema.partial();

const insemListFields = [
  INSEM_ID, INSEM_NOME, INSEM_REG, INSEM_ATV,
  HAS_CREATED_INSEM && 'created_at',
  HAS_UPD_INSEM && 'updated_at',
].filter(Boolean);

const insemSearchFields = [INSEM_NOME, INSEM_REG].filter(Boolean);

const insemSortable = [INSEM_NOME, HAS_CREATED_INSEM && 'created_at', HAS_UPD_INSEM && 'updated_at'].filter(Boolean);

const insemCfg = {
  table: T_INSEM,
  id: INSEM_ID,
  listFields: insemListFields,
  searchFields: insemSearchFields,
  sortable: insemSortable,
  validateCreate: makeValidator(inseminadorCreateSchema),
  validateUpdate: makeValidator(inseminadorUpdateSchema),
  ...(HAS_OWNER_INSEM ? { scope: { column: 'owner_id', required: true } } : {}),
  defaults: () => (HAS_CREATED_INSEM ? { created_at: ISO() } : {}),
};

router.use('/inseminadores', makeCrudRouter(insemCfg, db));

export default router;
