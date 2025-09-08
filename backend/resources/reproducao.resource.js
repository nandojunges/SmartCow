// backend/resources/reproducao.resource.js (ESM) — IA, DG com validação, Parto, Pré-parto, Secagem, Decisão, CRUD de eventos e protocolo
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
const ANIM_SIT_PROD = findCol(ANIM_COLS, ['situacao_produtiva','sit_produtiva']);
const ANIM_ULT_IA = findCol(ANIM_COLS, ['ultima_ia','data_ultima_ia','ultimaIA','ultimaIa']);
const ANIM_PREV_PARTO = findCol(ANIM_COLS, ['previsao_parto','prev_parto','previsao_parto_dt','previsaoParto']);
const ANIM_DECISAO = findCol(ANIM_COLS, ['decisao']);
const ANIM_NUM   = findCol(ANIM_COLS, ['numero','num','number','identificador']);
const ANIM_BRINC = findCol(ANIM_COLS, ['brinco','ear_tag','earTag','brinc']);

// protocolo/aplicação atuais (se existirem)
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
// Inclui novos tipos: SECAGEM, PRE_PARTO, PERDA_REPRODUTIVA
const tipoEventoEnum = z.enum([
  'IA','DIAGNOSTICO','PARTO','PRE_PARTO','SECAGEM','PERDA_REPRODUTIVA',
  'PROTOCOLO_ETAPA','TRATAMENTO','DECISAO'
]);

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
const RULES = { DG30:{min:28,max:40}, DG60:{min:56,max:70} };

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

async function lastIaBefore(client, animalId, dateISO, ownerId){
  if (!EVT_ANIM_COL || !EVT_TIPO || !EVT_DATA) return null;
  const where=[`"${EVT_ANIM_COL}"=$1`,`"${EVT_TIPO}"='IA'`,`"${EVT_DATA}" <= $2`];
  const params=[animalId, dateISO];
  if (HAS_OWNER_EVT && ownerId){ where.push(`owner_id=$${params.length+1}`); params.push(ownerId); }
  const sql=`
    SELECT ${EVT_ID?`"${EVT_ID}" AS id,`:''} "${EVT_DATA}" AS data
      FROM "${T_EVT}"
     WHERE ${where.join(' AND ')}
  ORDER BY "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', "created_at" DESC' : ''} LIMIT 1`;
  const { rows } = await (client||db).query(sql, params);
  return rows[0] || null;
}

async function getAnimalRow(animalId, ownerId) {
  if (!ANIM_ID_COL) return null;
  const fields = [
    `"${ANIM_ID_COL}" AS id`,
    ANIM_SIT_REP && `"${ANIM_SIT_REP}" AS sit_rep`,
    ANIM_PREV_PARTO && `"${ANIM_PREV_PARTO}" AS prev_parto`,
  ].filter(Boolean).join(', ');
  const params = [animalId];
  const where = [`"${ANIM_ID_COL}" = $1`];
  if (HAS_OWNER_ANIM && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }
  const sql = `SELECT ${fields || '"'+ANIM_ID_COL+'" AS id'} FROM "${T_ANIM}" WHERE ${where.join(' AND ')} LIMIT 1`;
  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}

/**
 * Atualiza campos do animal (derivados).
 * Aceita previsaoPartoISO === null para limpar (SET NULL).
 * Aceita situacaoProdutiva (se a tabela tiver coluna).
 * Ponteiros de protocolo/aplicação são ignorados aqui (ficam no orquestrador).
 */
async function atualizarAnimalCampos({
  animalId, ownerId,
  ultimaIA, situacaoReprodutiva, situacaoProdutiva, previsaoPartoISO, decisao,
  client
}) {
  if (!ANIM_ID_COL) return;
  const runner = client || db;

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

  if (ANIM_SIT_PROD && situacaoProdutiva !== undefined) {
    sets.push(`"${ANIM_SIT_PROD}" = $${params.length + 1}`);
    params.push(situacaoProdutiva);
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
      params.push(`${dd}/${mm}/${yyyy}`);
    }
  }

  if (ANIM_DECISAO && decisao !== undefined) {
    if (decisao === null || String(decisao).trim() === '') {
      sets.push(`"${ANIM_DECISAO}" = NULL`);
    } else {
      sets.push(`"${ANIM_DECISAO}" = $${params.length + 1}`);
      params.push(String(decisao));
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

/* =================== Protocolos CRUD (permanece aqui) =================== */
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

    const parsed = z.object({
      nome: z.string().optional(),
      descricao: z.string().optional().nullable(),
      tipo: z.string().optional().nullable(),
      etapas: z.array(z.any()).optional(),
      ativo: z.boolean().optional(),
    }).safeParse(req.body || {});
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

/* =================== Diagnóstico (com pareamento/janela e perda reprodutiva) =================== */
router.post('/diagnostico', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const base = { ...req.body, tipo: 'DIAGNOSTICO' };
  const parsed = eventoCreateSchema.extend({ resultado: z.enum(['prenhe','vazia','indeterminado']) }).safeParse(base);
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  const dxISO = toISODateString(ev.data);
  const iaRef = await lastIaBefore(null, ev.animal_id, dxISO, uid);
  if (!iaRef) return res.status(422).json({ error:'NoIA', detail:'Não existe IA anterior para parear o diagnóstico.' });

  const diff = Math.floor((new Date(dxISO) - new Date(iaRef.data)) / 86400000);
  let janela = null;
  if (diff >= RULES.DG30.min && diff <= RULES.DG30.max) janela='DG30';
  else if (diff >= RULES.DG60.min && diff <= RULES.DG60.max) janela='DG60';
  else return res.status(422).json({ error:'JanelaInvalida', detail:`DG com ${diff} dias da IA. Esperado 28–40 (DG30) ou 56–70 (DG60).` });

  const detalhes = { ...(ev.detalhes||{}), janela, ia_ref_data: iaRef.data, ia_ref_id: iaRef.id || null };

  const cols = [], vals = [], params = [];
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(dxISO); vals.push(`$${params.length}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('DIAGNOSTICO'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(detalhes)); vals.push(`$${params.length}::jsonb`); }
  if (EVT_RESULT)   { cols.push(`"${EVT_RESULT}"`);   params.push(ev.resultado); vals.push(`$${params.length}`); }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT){ cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
  const { rows } = await db.query(sql, params);
  const novo = rows[0] || {};

  // Atualizações derivadas
  const animalRow = await getAnimalRow(ev.animal_id, uid);
  if (ANIM_SIT_REP) {
    if (ev.resultado === 'prenhe') {
      const prev = calculaPrevisaoParto({ dataIA: iaRef.data });
      await atualizarAnimalCampos({
        animalId: ev.animal_id, ownerId: uid, situacaoReprodutiva: 'prenhe',
        previsaoPartoISO: prev ? prev.toISOString() : null,
      });
    } else if (ev.resultado === 'vazia') {
      // Se antes estava 'prenhe', registra perda reprodutiva
      const estavaPrenhe = String(animalRow?.sit_rep || '').toLowerCase() === 'prenhe';
      if (estavaPrenhe) {
        const detLoss = { causa: 'perda_embrião_suspeita', ia_ref_data: iaRef.data, janela };
        const c2 = [], v2 = [], p2 = [];
        if (EVT_ANIM_COL) { c2.push(`"${EVT_ANIM_COL}"`); p2.push(ev.animal_id); v2.push(`$${p2.length}`); }
        if (EVT_DATA)     { c2.push(`"${EVT_DATA}"`);     p2.push(dxISO); v2.push(`$${p2.length}`); }
        if (EVT_TIPO)     { c2.push(`"${EVT_TIPO}"`);     p2.push('PERDA_REPRODUTIVA'); v2.push(`$${p2.length}`); }
        if (EVT_DETALHES) { c2.push(`"${EVT_DETALHES}"`); p2.push(JSON.stringify(detLoss)); v2.push(`$${p2.length}::jsonb`); }
        if (HAS_OWNER_EVT){ c2.push('owner_id'); p2.push(uid); v2.push(`$${p2.length}`); }
        if (HAS_UPD_EVT)  { c2.push('updated_at'); v2.push('NOW()'); }
        if (HAS_CREATED_EVT){ c2.push('created_at'); v2.push('NOW()'); }
        await db.query(`INSERT INTO "${T_EVT}" (${c2.join(', ')}) VALUES (${v2.join(', ')})`, p2);
      }

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

/* =================== PRÉ-PARTO =================== */
router.post('/pre-parto', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = eventoCreateSchema.safeParse({ ...req.body, tipo: 'PRE_PARTO' });
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  const cols = [], vals = [], params = [];
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(toISODateString(ev.data)); vals.push(`$${params.length}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('PRE_PARTO'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(ev.detalhes || {})); vals.push(`$${params.length}::jsonb`); }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT){ cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${evtListFields.length ? evtListFields.map(f=>`"${f}"`).join(', ') : '*'};`;
  const { rows } = await db.query(sql, params);
  const novo = rows[0] || {};

  // opcional: marcar status reprodutivo auxiliar
  await atualizarAnimalCampos({
    animalId: ev.animal_id,
    ownerId: uid,
    situacaoReprodutiva: ANIM_SIT_REP ? 'pre-parto' : undefined,
  }).catch(()=>{});

  res.json(novo);
});

/* =================== PARTO =================== */
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
  if (HAS_CREATED_EVT){ cols.push('created_at'); vals.push('NOW()'); }

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

/* =================== SECAGEM =================== */
router.post('/secagem', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error:'Unauthorized' });

  const p = eventoCreateSchema.safeParse({ ...req.body, tipo:'SECAGEM' });
  if (!p.success) return res.status(400).json({ error:'ValidationError', issues:p.error.issues });
  const ev = p.data;

  const cols=[], vals=[], params=[];
  if (EVT_ANIM_COL){ cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
  if (EVT_DATA){ cols.push(`"${EVT_DATA}"`); params.push(toISODateString(ev.data)); vals.push(`$${params.length}`); }
  if (EVT_TIPO){ cols.push(`"${EVT_TIPO}"`); params.push('SECAGEM'); vals.push(`$${params.length}`); }
  if (EVT_DETALHES){ cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(ev.detalhes||{})); vals.push(`$${params.length}::jsonb`); }
  if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(uid); vals.push(`$${params.length}`); }
  if (HAS_UPD_EVT){ cols.push('updated_at'); vals.push('NOW()'); }
  if (HAS_CREATED_EVT){ cols.push('created_at'); vals.push('NOW()'); }

  const sql = `INSERT INTO "${T_EVT}" (${cols.join(',')}) VALUES (${vals.join(',')}) RETURNING ${evtListFields.map(f=>`"${f}"`).join(', ')}`;
  const { rows } = await db.query(sql, params);

  // opcional: atualiza situação produtiva
  await atualizarAnimalCampos({ animalId: ev.animal_id, ownerId: uid, situacaoProdutiva: 'seca' }).catch(()=>{});

  res.json(rows[0] || {});
});

/* =================== “Decisão” =================== */
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

  // 2) registra evento DECISAO
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

/* ========== ANIMAIS (views de leitura p/ calendário/front) ========== */

// GET /api/v1/reproducao/animais?limit=1000&ids=a,b,c&numeros=3,4
router.get('/animais', async (req, res) => {
  try {
    if (!ANIM_ID_COL) return res.json({ items: [] });
    const uid = extractUserId(req);
    if (HAS_OWNER_ANIM && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const limitParam = Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1);
    const limit = Math.min(limitParam, 5000);

    const ids = String(req.query.ids || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    const numeros = String(req.query.numeros || '')
      .split(',').map(s => s.trim()).filter(Boolean);

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
            const prev = calculaPrevisaoParto({ dataIA: ultimaIA });
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
        if (tipo === 'SECAGEM' && ANIM_SIT_PROD) {
          await atualizarAnimalCampos({
            animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
            ownerId: uid,
            situacaoProdutiva: 'seca',
          }).catch(()=>{});
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
