// backend/resources/animals.resource.js
import express from 'express';
import db from '../dbx.js';
import { z } from '../validate.js';
import { makeValidator } from '../validate.js';
import { makeCrudRouter } from './crudRouter.js';

/* ================ helpers ================ */
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
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

// Converte "R$ 1.234,56" -> 1234.56 (number) ou null
function parseCurrencyBRL(input) {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const s = String(input).trim();
  if (!s) return null;
  const cleaned = s.replace(/[^0-9,.-]/g, '');
  if (cleaned.includes(',')) {
    const asDot = cleaned.replace(/\./g, '').replace(',', '.');
    const n = Number(asDot);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 'dd/mm/aaaa' -> 'yyyy-mm-dd' (ou null se inválido)
function toISODate(d) {
  if (!d || typeof d !== 'string') return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function ensureHistoricoObject(current) {
  if (current && typeof current === 'object') return current;
  const parsed = safeJSON(current);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function pushIntoHistoricoMeta(historico, kv) {
  const h = ensureHistoricoObject(historico);
  const meta = (h.meta && typeof h.meta === 'object') ? h.meta : {};
  Object.assign(meta, kv);
  h.meta = meta;
  return h;
}

/* ========== introspecção de colunas ========== */
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

const LOTE_COL        = hasCol('lote_id')     ? 'lote_id'   : (hasCol('grupo_id') ? 'grupo_id'   : null);
const LOTE_NOME_COL   = hasCol('lote_nome')   ? 'lote_nome' : (hasCol('grupo_nome') ? 'grupo_nome' : null);
const HAS_OWNER       = hasCol('owner_id');
const HAS_UPDATED_AT  = hasCol('updated_at');
const VALOR_SAIDA_COL = hasCol('valor_saida') ? 'valor_saida' : (hasCol('valor_venda') ? 'valor_venda' : null);
const ORDER_COL       = hasCol('created_at') ? 'created_at' : (hasCol('id') ? 'id' : 'id');

/* ========== validações mínimas ========== */
const historicoSchema = z.object({}).passthrough().optional();

const createSchema = z.object({
  numero: z.string().optional(),
  brinco: z.string().optional(),
  nascimento: z.string().optional(), // dd/mm/aaaa (normalizamos p/ ISO se coluna existir)
  sexo: z.string().optional(),
  raca: z.string().optional(),
  categoria: z.string().optional(),
  estado: z.string().optional(),
  situacao_produtiva: z.string().optional(),
  situacao_reprodutiva: z.string().optional(),
  pai: z.string().optional(),
  mae: z.string().optional(),
  n_lactacoes: z.coerce.number().int().nonnegative().optional(),

  // datas + aliases
  ultima_ia: z.string().optional(),
  ultimaIa: z.string().optional(),
  parto: z.string().optional(),
  ultimo_parto: z.string().optional(),
  previsao_parto: z.string().optional(),
  previsaoParto: z.string().optional(),
  previsao_parto_iso: z.string().optional(),
  previsaoPartoISO: z.string().optional(),

  // origem — aceitamos mesmo sem coluna (vai pro historico.origem)
  origem: z.string().optional(),
  valor_compra: z.union([z.string(), z.number()]).optional(),

  historico: historicoSchema,

  // lote/grupo
  lote_id: z.string().nullable().optional(),
  lote_nome: z.string().nullable().optional(),
  grupo_id: z.string().nullable().optional(),
  grupo_nome: z.string().nullable().optional(),
}).passthrough();

const updateSchema = createSchema.partial();

const candidatesList = [
  'id','owner_id','numero','brinco','raca','estado','sexo','categoria',
  'situacao_produtiva','situacao_reprodutiva',
  'n_lactacoes','pai','mae','nascimento','ultima_ia','parto','ultimo_parto','previsao_parto','previsao_parto_iso',
  'lote_id','lote_nome','grupo_id','grupo_nome',
  'origem','valor_compra',
  'status','tipo_saida','motivo_saida','observacao_saida','data_saida','valor_saida','valor_venda',
  'historico','created_at','updated_at'
];
const listFields = candidatesList.filter(hasCol);

const candidatesSearch = ['numero','brinco','raca','estado','pai','mae','situacao_produtiva','situacao_reprodutiva'];
const searchFields = candidatesSearch.filter(hasCol);

const candidatesSortable = [
  'numero','brinco','raca','estado','sexo','categoria',
  'situacao_produtiva','situacao_reprodutiva',
  'n_lactacoes','nascimento','ultima_ia','parto','ultimo_parto','previsao_parto','previsao_parto_iso',
  'lote_id','grupo_id','created_at','updated_at',
];
const sortable = candidatesSortable.filter(hasCol);

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

/* ===== Bloqueia rotas antigas de reprodução ===== */
for (const path of ['/secagem','/parto','/preparto','/pre-parto','/diagnostico','/dg','/ia','/protocolo','/clinica','/leite','/ccs','/cmt','/views']) {
  router.all(path, (_req, res) => res.status(410).json({ error:'Gone', message:'Endpoints de reprodução foram movidos para /api/v1/reproducao/*' }));
}

/* ===== DEBUG: schema/cols que o backend enxerga ===== */
router.get('/__schema', (_req, res) => {
  try {
    res.json({
      table: TABLE,
      columns: Array.from(COLS),
      has: {
        owner: HAS_OWNER,
        updated_at: HAS_UPDATED_AT,
        lote_col: LOTE_COL,
        lote_nome_col: LOTE_NOME_COL,
        valor_saida_col: VALOR_SAIDA_COL,
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'debug_failed', detail: e?.message || 'unknown' });
  }
});

/* ===== Sanitização + mapeamento dinâmico de LOTE ===== */
const ALLOWED_KEYS = new Set([
  'numero','brinco','nascimento','sexo','raca','categoria',
  'estado','situacao_produtiva','situacao_reprodutiva',
  'pai','mae','n_lactacoes',
  'ultima_ia','ultimaIa',
  'parto','ultimo_parto',
  'previsao_parto','previsaoParto','previsao_parto_iso','previsaoPartoISO',
  'origem','valor_compra',
  'historico',
  'lote_id','lote_nome','grupo_id','grupo_nome',
  'status','tipo_saida','motivo_saida','observacao_saida','data_saida','valor_saida','valor_venda',
]);

const aliasMap = (body) => {
  const out = { ...body };
  if (out.ultimaIa != null && out.ultima_ia == null) out.ultima_ia = out.ultimaIa;
  if (out.ultimo_parto != null && out.parto == null) out.parto = out.ultimo_parto;
  if (out.parto != null && out.ultimo_parto == null) out.ultimo_parto = out.parto;
  if (out.previsaoParto != null && out.previsao_parto == null) out.previsao_parto = out.previsaoParto;
  if (out.previsaoPartoISO != null && out.previsao_parto_iso == null) out.previsao_parto_iso = out.previsaoPartoISO;
  return out;
};

function normalizeDatesToISO(obj) {
  const o = { ...obj };
  if (hasCol('nascimento')         && typeof o.nascimento === 'string')         o.nascimento         = toISODate(o.nascimento)         || o.nascimento;
  if (hasCol('ultima_ia')          && typeof o.ultima_ia === 'string')          o.ultima_ia          = toISODate(o.ultima_ia)          || o.ultima_ia;
  if (hasCol('parto')              && typeof o.parto === 'string')              o.parto              = toISODate(o.parto)              || o.parto;
  if (hasCol('ultimo_parto')       && typeof o.ultimo_parto === 'string')       o.ultimo_parto       = toISODate(o.ultimo_parto)       || o.ultimo_parto;
  if (hasCol('previsao_parto')     && typeof o.previsao_parto === 'string')     o.previsao_parto     = toISODate(o.previsao_parto)     || o.previsao_parto;
  if (hasCol('previsao_parto_iso') && typeof o.previsao_parto_iso === 'string') {
    const iso = toISODate(o.previsao_parto_iso) || o.previsao_parto_iso;
    o.previsao_parto_iso = iso;
  }
  return o;
}

router.use((req, res, next) => {
  if (!['POST','PUT','PATCH'].includes(req.method)) return next();
  const path = req.path || req.originalUrl || '';

  // não interferir nos endpoints dedicados
  if ((req.method === 'PUT'  && /\/lote\/?$/.test(path)) ||
      (req.method === 'POST' && /\/saida\/?$/.test(path)) ||
      (req.method === 'POST' && /\/reativar\/?$/.test(path))) {
    return next();
  }

  const bIn = req.body ?? {};

  // 1) filtra por allowed keys
  const bAllowed = {};
  for (const k of Object.keys(bIn)) {
    if (ALLOWED_KEYS.has(k)) bAllowed[k] = bIn[k];
  }

  // 2) aliases
  let clean = aliasMap(bAllowed);

  // 3) mapeia lote dinamicamente
  const lote_id_in   = clean.lote_id   ?? clean.grupo_id   ?? null;
  const lote_nome_in = clean.lote_nome ?? clean.grupo_nome ?? null;
  const temLote = lote_id_in !== null || lote_nome_in !== null;

  if (temLote) {
    if (LOTE_COL) {
      clean[LOTE_COL] = lote_id_in;
      if (LOTE_NOME_COL) clean[LOTE_NOME_COL] = lote_nome_in;
      delete clean.lote_id; delete clean.lote_nome; delete clean.grupo_id; delete clean.grupo_nome;
    } else {
      // só persiste em historico se a coluna existir
      if (hasCol('historico')) {
        const hist = (typeof clean.historico === 'object' && clean.historico) ? clean.historico : (safeJSON(clean.historico) || {});
        clean.historico = {
          ...(hist || {}),
          lote: { ...(hist?.lote || {}), id: lote_id_in ?? null, nome: lote_nome_in ?? null, updated_at: new Date().toISOString() },
        };
      }
      delete clean.lote_id; delete clean.lote_nome; delete clean.grupo_id; delete clean.grupo_nome;
    }
  }

  // 4) normaliza datas BR -> ISO para colunas existentes
  clean = normalizeDatesToISO(clean);

  // 5) origem/valor_compra: mantém em colunas se existirem; se não, guarda em historico.origem
  if (!hasCol('origem') || !hasCol('valor_compra')) {
    if (hasCol('historico')) {
      const hist = (typeof clean.historico === 'object' && clean.historico) ? clean.historico : (safeJSON(clean.historico) || {});
      if (clean.origem != null || clean.valor_compra != null) {
        const valorNum = parseCurrencyBRL(clean.valor_compra);
        hist.origem = {
          tipo: clean.origem ?? hist?.origem?.tipo ?? null,
          valor_compra: valorNum ?? hist?.origem?.valor_compra ?? null,
          at: new Date().toISOString(),
        };
      }
      clean.historico = hist;
    }
    if (!hasCol('origem')) delete clean.origem;
    if (!hasCol('valor_compra')) delete clean.valor_compra;
  } else {
    // se existirem, normaliza o valor
    if (clean.valor_compra != null) clean.valor_compra = parseCurrencyBRL(clean.valor_compra);
  }

  // 5.1) Fallback: allowed keys sem coluna -> historico.meta
  const maybeDateKeys = new Set([
    'nascimento','ultima_ia','parto','ultimo_parto','previsao_parto','previsao_parto_iso'
  ]);
  let histMeta = clean.historico;
  const metaToPush = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === 'historico') continue;
    if (!hasCol(k) && ALLOWED_KEYS.has(k)) {
      metaToPush[k] = v;
      if (maybeDateKeys.has(k) && typeof v === 'string') {
        const iso = toISODate(v);
        if (iso) {
          const isoKey = k.endsWith('_iso') ? k : (k + 'ISO');
          metaToPush[isoKey] = iso;
        }
      }
      delete clean[k];
    }
  }
  if (Object.keys(metaToPush).length) {
    histMeta = pushIntoHistoricoMeta(histMeta, metaToPush);
  }
  if (histMeta) clean.historico = histMeta;

  // 6) mantém apenas colunas válidas (historico é livre)
  const finalClean = {};
  for (const [k, v] of Object.entries(clean)) {
    if (hasCol(k) || (k === 'historico' && hasCol('historico'))) {
      finalClean[k] = v;
    }
  }

  // 6.1) injeta owner_id no POST quando a tabela possui owner e o usuário está autenticado
  if (req.method === 'POST' && HAS_OWNER) {
    const uid = extractUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    finalClean.owner_id = uid;
  }

  if (HAS_UPDATED_AT) finalClean.updated_at = new Date().toISOString();

  // 7) se nada sobrou, 400 com dicas
  if (!Object.keys(finalClean).length) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Nenhum campo válido após sanitização. Verifique nomes de colunas e aliases.',
      tips: {
        presentesNoBody: Object.keys(bIn),
        aceitosAntesDeFiltrar: Object.keys(bAllowed),
        aposAliasesELoteEDatas: Object.keys(clean),
        finalCleanKeys: Object.keys(finalClean),
        colunasDaTabela: Array.from(COLS),
        historicoSuportado: hasCol('historico'),
        lembrete: 'Os campos precisam existir como coluna; `historico` só é aceito se houver coluna `historico`.'
      }
    });
  }

  req.body = finalClean;
  next();
});

/* ===== Helpers de lote ===== */
function materializeLote(row) {
  if (!row || typeof row !== 'object') return { lote_id: null, lote_nome: null, source: 'none' };
  if (LOTE_COL && row[LOTE_COL] !== undefined) {
    return { lote_id: row[LOTE_COL] ?? null, lote_nome: LOTE_NOME_COL ? (row[LOTE_NOME_COL] ?? null) : null, source: 'column' };
  }
  const hist = row.historico && typeof row.historico === 'object'
    ? row.historico
    : (typeof row.historico === 'string' ? (safeJSON(row.historico) || {}) : {});
  if (hist?.lote && typeof hist.lote === 'object') {
    return { lote_id: hist.lote.id ?? null, lote_nome: hist.lote.nome ?? null, source: 'historico' };
  }
  return { lote_id: null, lote_nome: null, source: 'none' };
}

/* ===== PUT /animals/:id/lote ===== */
router.put('/:id/lote', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    const b = req.body || {};
    const lote_id   = b.lote_id ?? b.grupo_id ?? b.current_lote_id ?? null;
    const lote_nome = b.lote_nome ?? b.grupo_nome ?? b.current_lote_nome ?? null;

    const finish = (row) => {
      const out = row || {};
      const mat = materializeLote(out);
      out.current_lote_id = mat.lote_id;
      out.current_lote_nome = mat.lote_nome;
      return res.json(out);
    };

    if (LOTE_COL) {
      const sets = [`"${LOTE_COL}" = $${HAS_OWNER ? 3 : 2}`];
      const params = HAS_OWNER ? [id, uid, lote_id] : [id, lote_id];
      if (LOTE_NOME_COL) { sets.push(`"${LOTE_NOME_COL}" = $${params.length + 1}`); params.push(lote_nome); }
      if (HAS_UPDATED_AT) sets.push(`"updated_at" = NOW()`);
      const whereOwner = HAS_OWNER ? `AND "owner_id" = $2` : '';
      const sql = `UPDATE "${cfg.table}" SET ${sets.join(', ')} WHERE "${cfg.id}" = $1 ${whereOwner} RETURNING *;`;
      const { rows } = await db.query(sql, params);
      if (!rows.length) return res.status(404).json({ error: 'NotFound' });
      return finish(rows[0]);
    }

    const whereOwnerSel = HAS_OWNER ? 'AND "owner_id" = $2' : '';
    const paramsSel = HAS_OWNER ? [id, uid] : [id];
    const sel = await db.query(`SELECT * FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${whereOwnerSel} LIMIT 1`, paramsSel);
    if (!sel.rows.length) return res.status(404).json({ error: 'NotFound' });
    const row = sel.rows[0];

    let historico = row.historico;
    if (!historico || typeof historico !== 'object') historico = safeJSON(historico || '{}') || {};
    historico.lote = { ...(historico.lote || {}), id: lote_id ?? null, nome: lote_nome ?? null, updated_at: new Date().toISOString() };

    const whereOwnerUpd = HAS_OWNER ? 'AND "owner_id" = $3' : '';
    const paramsUpd = HAS_OWNER ? [historico, id, uid] : [historico, id];
    const upd = await db.query(
      `UPDATE "${cfg.table}" SET historico = $1 ${HAS_UPDATED_AT ? ', "updated_at" = NOW()' : ''} WHERE "${cfg.id}" = $2 ${whereOwnerUpd} RETURNING *`,
      paramsUpd
    );
    return finish(upd.rows[0] || {});
  } catch (e) {
    console.error('PUT /animals/:id/lote falhou:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Falha ao atualizar lote' });
  }
});

/* ===== POST /animals/:id/saida ===== */
const saidaSchema = z.object({
  tipo_saida: z.string().min(1),
  motivo_saida: z.string().optional(),
  observacao_saida: z.string().optional(),
  data_saida: z.string().optional(), // dd/mm/aaaa
  valor_saida: z.union([z.number(), z.string()]).optional(),
  valor_venda: z.union([z.number(), z.string()]).optional(),
  valor: z.union([z.number(), z.string()]).optional(),
});

router.post('/:id/saida', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    const parsed = saidaSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const b = parsed.data;

    const dataISO = toISODate(b.data_saida);
    const rawValor = b.valor_saida ?? b.valor_venda ?? b.valor ?? null;
    const valorNum = parseCurrencyBRL(rawValor);

    const whereOwner = HAS_OWNER ? 'AND "owner_id" = $2' : '';
    const paramsWhere = HAS_OWNER ? [id, uid] : [id];
    const sel = await db.query(
      `SELECT * FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${whereOwner} LIMIT 1`,
      paramsWhere
    );
    if (!sel.rows.length) return res.status(404).json({ error: 'NotFound' });
    const row = sel.rows[0];

    let i = paramsWhere.length;
    const sets = [];
    const values = [];
    const pushSet = (col, val) => { sets.push(`"${col}" = $${++i}`); values.push(val); };

    if (hasCol('status'))           pushSet('status', 'inativo');
    if (hasCol('tipo_saida'))       pushSet('tipo_saida', b.tipo_saida);
    if (hasCol('motivo_saida'))     pushSet('motivo_saida', b.motivo_saida ?? null);
    if (hasCol('observacao_saida')) pushSet('observacao_saida', b.observacao_saida ?? null);
    if (hasCol('data_saida'))       pushSet('data_saida', dataISO ?? null);
    if (VALOR_SAIDA_COL && valorNum != null) pushSet(VALOR_SAIDA_COL, valorNum);
    if (HAS_UPDATED_AT)             pushSet('updated_at', new Date().toISOString());

    if (hasCol('historico')) {
      let historico = row.historico;
      if (!historico || typeof historico !== 'object') historico = safeJSON(historico || '{}') || {};
      const arr = Array.isArray(historico.saidas) ? [...historico.saidas] : [];
      arr.push({
        data: b.data_saida ?? null,
        dataISO: dataISO ?? null,
        tipo: b.tipo_saida,
        motivo: b.motivo_saida ?? null,
        obs: b.observacao_saida ?? null,
        valor: valorNum ?? null,
        at: new Date().toISOString(),
      });
      historico.saidas = arr;
      pushSet('historico', historico);
    }

    if (!sets.length) {
      return res.status(200).json({ ok: true, message: 'Saída registrada (sem colunas dedicadas no schema)' });
    }

    const sql = `
      UPDATE "${cfg.table}"
      SET ${sets.join(', ')}
      WHERE "${cfg.id}" = $1 ${whereOwner}
      RETURNING *`;
    const { rows: upd } = await db.query(sql, [...paramsWhere, ...values]);
    return res.json(upd[0] || {});
  } catch (e) {
    console.error('POST /animals/:id/saida falhou:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Falha ao registrar saída' });
  }
});

/* ===== POST /animals/:id/reativar ===== */
router.post('/:id/reativar', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (HAS_OWNER && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'missing id' });

    const whereOwner = HAS_OWNER ? 'AND "owner_id" = $2' : '';
    const paramsSel = HAS_OWNER ? [id, uid] : [id];

    const sel = await db.query(`SELECT * FROM "${cfg.table}" WHERE "${cfg.id}" = $1 ${whereOwner} LIMIT 1`, paramsSel);
    if (!sel.rows.length) return res.status(404).json({ error: 'NotFound' });
    const row = sel.rows[0];

    let i = paramsSel.length;
    const sets = [];
    const values = [];
    const pushSet = (col, val) => { sets.push(`"${col}" = $${++i}`); values.push(val); };

    if (hasCol('status'))            pushSet('status', 'ativo');
    if (hasCol('tipo_saida'))        pushSet('tipo_saida', null);
    if (hasCol('motivo_saida'))      pushSet('motivo_saida', null);
    if (hasCol('observacao_saida'))  pushSet('observacao_saida', null);
    if (hasCol('data_saida'))        pushSet('data_saida', null);
    if (hasCol('valor_saida'))       pushSet('valor_saida', null);
    if (hasCol('valor_venda'))       pushSet('valor_venda', null);
    if (HAS_UPDATED_AT)              pushSet('updated_at', new Date().toISOString());

    if (hasCol('historico')) {
      let historico = row.historico;
      if (!historico || typeof historico !== 'object') historico = safeJSON(historico || '{}') || {};
      if (Array.isArray(historico.saidas) && historico.saidas.length > 0) {
        historico.saidas = historico.saidas.slice(0, -1);
      }
      const reats = Array.isArray(historico.reativacoes) ? historico.reativacoes : [];
      reats.push({ at: new Date().toISOString() });
      historico.reativacoes = reats;
      pushSet('historico', historico);
    }

    if (!sets.length) {
      return res.status(200).json({ ok: true, message: 'Reativação concluída (sem colunas dedicadas no schema)' });
    }

    const sql = `
      UPDATE "${cfg.table}"
      SET ${sets.join(', ')}
      WHERE "${cfg.id}" = $1 ${whereOwner}
      RETURNING *`;
    const paramsUpd = [...paramsSel, ...values];
    const { rows: upd } = await db.query(sql, paramsUpd);
    return res.json(upd[0] || {});
  } catch (e) {
    console.error('POST /animals/:id/reativar falhou:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Falha ao reativar animal' });
  }
});

/* ===== CRUD padrão ===== */
router.use('/', makeCrudRouter(cfg, db));

export default router;
