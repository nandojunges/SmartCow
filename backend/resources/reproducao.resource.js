// backend/resources/reproducao.resource.js (ESM)
import express from 'express';
import db from '../dbx.js';
import { z } from '../validate.js';
import { makeValidator } from '../validate.js';
import { makeCrudRouter } from './crudRouter.js';
import { EventEmitter } from 'node:events';

// simple event bus used to notify other modules (best effort)
export const emitter = new EventEmitter();
const emitir = (event, payload) => {
  try { emitter.emit(event, payload); } catch {}
};

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

function toISODateStringStrict(s) {
  const v = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error('Data inválida (use YYYY-MM-DD ou DD/MM/AAAA)');
}

// versão tolerante (não lança)
function toISODateStringSafe(s) {
  try { return toISODateStringStrict(s); } catch { return null; }
}

function ensureISODate(value) {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value)) return ymd(value);
  const s = String(value).trim();
  if (!s) return null;
  const base = s.length >= 10 ? s.slice(0, 10) : s;
  return toISODateStringSafe(base);
}

function isoToBRDate(value) {
  const iso = ensureISODate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const DAY = 86400000;
const addDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate()+n); return d; };
const subDays = (dt, n) => { const d = new Date(dt); d.setDate(d.getDate()-n); return d; };
const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};
const normStr = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

// parser tolerante para datas armazenadas como BR, ISO ou texto solto
function parseDateFlexible(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const s = String(v).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0,10));
    return isNaN(d) ? null : d;
  }
  // DD/MM/AAAA
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    return isNaN(d) ? null : d;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

// utils de data bem tolerantes
function parseBR(str) {
  const m = String(str || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function parseISO(str) {
  const m = String(str || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function toISODate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseAnyDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  return s.includes('/') ? parseBR(s) : s.includes('-') ? parseISO(s) : null;
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

// encontra coluna candidata (case-insensitive fallback)
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
  'situacao_reprodutiva','sit_reprodutiva','status_reprodutivo','situacao_rep','situacao_repro','situacaoReprodutiva'
]);
const ANIM_SIT_PROD = findCol(ANIM_COLS, [
  'situacao_produtiva', 'sit_produtiva',
  'situacaoProdutiva', 'status_produtivo', 'estado_produtivo',
  'statusProdutivo', 'produtivo_status'
]);
const ANIM_ESTADO = findCol(ANIM_COLS, ['estado','status']);

const ANIM_ULT_IA = findCol(ANIM_COLS, ['ultima_ia','data_ultima_ia','ultimaIA','ultimaIa']);
const ANIM_IA_ANT = findCol(ANIM_COLS, ['ia_anterior','data_ia_anterior','iaAnterior','ia_anterior_data']);
const ANIM_ULT_PARTO_COL = findCol(ANIM_COLS, ['ultimo_parto','parto','data_ultimo_parto','ultimoParto']);
const ANIM_PARTO_ANT_COL = findCol(ANIM_COLS, ['parto_anterior','penultimo_parto','partoAnterior','parto_anterior_data']);
const ANIM_SECAGEM_ANT_COL = findCol(ANIM_COLS, ['secagem_anterior','ultima_secagem','secagemAnterior','data_secagem_anterior']);
const ANIM_PREV_PARTO     = findCol(ANIM_COLS, ['previsao_parto','prev_parto','previsao_parto_dt','previsaoParto']);
// novas colunas ISO/auxiliares (persistência "fonte da verdade")
const ANIM_PREV_PARTO_ISO = findCol(ANIM_COLS, ['previsao_parto_iso','previsaoPartoISO','prev_parto_iso']);
const ANIM_IA_ANT_REAL    = findCol(ANIM_COLS, ['ia_anterior','iaAnterior']);
const ANIM_PARTO_ANT_REAL = findCol(ANIM_COLS, ['parto_anterior','partoAnterior']);
const ANIM_SECAGEM_ANT    = findCol(ANIM_COLS, ['secagem_anterior','secagemAnterior']);
const ANIM_DECISAO = findCol(ANIM_COLS, ['decisao']);
const ANIM_NUM   = findCol(ANIM_COLS, ['numero','num','number','identificador']);
const ANIM_BRINC = findCol(ANIM_COLS, ['brinco','ear_tag','earTag','brinc']);

// extras para cadastro automático de bezerro
const ANIM_NASC   = findCol(ANIM_COLS, ['nascimento','data_nascimento','nasc','nascimento_dt','birth_date','birth']);
const ANIM_SEXO   = findCol(ANIM_COLS, ['sexo','genero','sex']);
const ANIM_CATEG  = findCol(ANIM_COLS, ['categoria','categoria_animal','tipo']);
const ANIM_RACA   = findCol(ANIM_COLS, ['raca','raça','breed']);
const ANIM_MAE_COL= findCol(ANIM_COLS, ['mae','mae_id','maeId','id_mae','mae_numero','numero_mae','brinco_mae','mae_ref']);

// protocolo/aplicação atuais (se existirem) — ponteiros mantidos pelo orquestrador
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
// usado para “limpar” a decisão de forma explícita (permanência)
const CLEAR_TOKEN = '__CLEAR__';

function _diasEntre(isoA, isoB){
  const a = new Date(isoA), b = new Date(isoB);
  return Math.round((b - a)/86400000);
}
function _dgJanelaValida({ iaData, janela, dgData }){
  const d = _diasEntre(iaData, dgData);
  if (janela === 'DG30') return d >= 28 && d <= 40;
  if (janela === 'DG60') return d >= 56 && d <= 70;
  if (janela === 'DG90') return d >= 84 && d <= 100;
  if (janela === 'DOPPLER') return true;
  return true;
}

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

// verifica se existe diagnóstico positivo entre duas datas
async function hasDgPosBetween(client, animalId, startISO, endISO, ownerId){
  if (!EVT_ANIM_COL || !EVT_TIPO || !EVT_DATA) return false;
  const where=[`"${EVT_ANIM_COL}"=$1`,`"${EVT_TIPO}"='DIAGNOSTICO'`,`"${EVT_DATA}" > $2`,`"${EVT_DATA}" < $3`];
  const params=[animalId,startISO,endISO];
  if (EVT_RESULT){
    where.push(`"${EVT_RESULT}"='prenhe'`);
  } else if (EVT_DETALHES){
    where.push(`COALESCE("${EVT_DETALHES}"->>'resultado','')='prenhe'`);
  }
  if (HAS_OWNER_EVT && ownerId){ where.push(`owner_id=$${params.length+1}`); params.push(ownerId); }
  const sql=`SELECT 1 FROM "${T_EVT}" WHERE ${where.join(' AND ')} LIMIT 1`;
  const { rows } = await (client||db).query(sql, params);
  return rows.length>0;
}

async function getUltimosEventos({ tipo, animalId, ownerId, limit = 1, client }) {
  if (!EVT_ANIM_COL || !EVT_TIPO || !EVT_DATA) return [];
  const where = [`"${EVT_ANIM_COL}" = $1`, `"${EVT_TIPO}" = $2`];
  const params = [animalId, tipo];
  if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $${params.length + 1}`); params.push(ownerId); }
  const sql = `
    SELECT ${EVT_ID ? `"${EVT_ID}" AS id,` : ''} "${EVT_DATA}" AS data
      FROM "${T_EVT}"
     WHERE ${where.join(' AND ')}
  ORDER BY "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', "created_at" DESC' : ''}
     LIMIT ${Math.max(1, Number(limit) || 1)}
  `;
  const { rows } = await (client || db).query(sql, params);
  return rows;
}

async function getAnimalRow(animalId, ownerId) {
  if (!ANIM_ID_COL) return null;
  const fields = [
    `"${ANIM_ID_COL}" AS id`,
    ANIM_SIT_REP && `"${ANIM_SIT_REP}" AS sit_rep`,
    ANIM_SIT_REP && `"${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
    ANIM_PREV_PARTO && `"${ANIM_PREV_PARTO}" AS prev_parto`,
    ANIM_PREV_PARTO && `"${ANIM_PREV_PARTO}" AS "previsaoParto"`,
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
 */
async function atualizarAnimalCampos({
  animalId, ownerId,
  ultimaIA, iaAnterior,
  ultimoParto, partoAnterior,
  secagemAnterior,
  situacaoReprodutiva, situacaoProdutiva, previsaoPartoISO, decisao,
  client
}) {
  if (!ANIM_ID_COL) return;
  const runner = client || db;

  // 1) Se NÃO existir coluna de previsão de parto, gravar no historico.previsoes.parto
  // histórico (fallback) quando não existe coluna previsao_parto_iso ou previsao_parto (texto BR)
  if (!ANIM_PREV_PARTO && !ANIM_PREV_PARTO_ISO && previsaoPartoISO !== undefined && ANIM_COLS.has('historico')) {
    const sel = await runner.query(
      `SELECT historico FROM "${T_ANIM}" WHERE "${ANIM_ID_COL}" = $1 ${HAS_OWNER_ANIM && ownerId ? 'AND owner_id=$2' : ''} LIMIT 1`,
      HAS_OWNER_ANIM && ownerId ? [animalId, ownerId] : [animalId]
    );
    const current = sel.rows[0]?.historico;
    let hist = {};
    if (current && typeof current === 'object') hist = current;
    else if (typeof current === 'string') { try { hist = JSON.parse(current); } catch { hist = {}; } }
    const dt = previsaoPartoISO ? new Date(previsaoPartoISO) : null;
    const dd = dt ? String(dt.getDate()).padStart(2, '0') : null;
    const mm = dt ? String(dt.getMonth() + 1).padStart(2, '0') : null;
    const yyyy = dt ? dt.getFullYear() : null;
    const br = (dt && dd && mm && yyyy) ? `${dd}/${mm}/${yyyy}` : null;
    hist.previsoes = hist.previsoes || {};
    hist.previsoes.parto = previsaoPartoISO ? { iso: previsaoPartoISO, br } : null;
    await runner.query(
      `UPDATE "${T_ANIM}" SET historico = $1 ${HAS_UPD_ANIM ? ', "updated_at"=NOW()' : ''} WHERE "${ANIM_ID_COL}"=$2 ${HAS_OWNER_ANIM && ownerId ? 'AND owner_id=$3' : ''}`,
      HAS_OWNER_ANIM && ownerId ? [JSON.stringify(hist), animalId, ownerId] : [JSON.stringify(hist), animalId]
    );
  }

  // 2) Espelho em historico quando FALTAM colunas dedicadas (animais “novos” sem schema antigo)
  //    Isso garante que IA/DG/Parto/Secagem e situação sejam persistidos mesmo sem colunas.
  if (ANIM_COLS.has('historico')) {
    const needsHist =
      (!ANIM_SIT_REP && situacaoReprodutiva !== undefined) ||
      (!ANIM_SIT_PROD && situacaoProdutiva !== undefined) ||
      (!ANIM_ULT_IA && ultimaIA !== undefined) ||
      (!ANIM_IA_ANT && iaAnterior !== undefined) ||
      (!ANIM_ULT_PARTO_COL && ultimoParto !== undefined) ||
      (!ANIM_PARTO_ANT_COL && partoAnterior !== undefined) ||
      (!ANIM_SECAGEM_ANT_COL && secagemAnterior !== undefined) ||
      (!ANIM_DECISAO && decisao !== undefined);

    if (needsHist) {
      const sel2 = await runner.query(
        `SELECT historico FROM "${T_ANIM}" WHERE "${ANIM_ID_COL}" = $1 ${HAS_OWNER_ANIM && ownerId ? 'AND owner_id=$2' : ''} LIMIT 1`,
        HAS_OWNER_ANIM && ownerId ? [animalId, ownerId] : [animalId]
      );
      let hist2 = sel2.rows[0]?.historico;
      if (!hist2 || typeof hist2 !== 'object') { try { hist2 = JSON.parse(hist2 || '{}'); } catch { hist2 = {}; } }
      hist2.espelho = hist2.espelho || {};
      const put = (k, v) => { if (v !== undefined) hist2.espelho[k] = v; };

      // Situações (texto direto)
      if (!ANIM_SIT_REP)  put('situacaoReprodutiva', situacaoReprodutiva ?? hist2.espelho?.situacaoReprodutiva ?? null);
      if (!ANIM_SIT_PROD && !ANIM_ESTADO) put('situacaoProdutiva', situacaoProdutiva ?? hist2.espelho?.situacaoProdutiva ?? null);

      // Datas (espelhar como BR quando a entrada for ISO válida; null limpa)
      const toBR = (iso) => {
        if (!iso) return null;
        const dt = new Date(iso);
        if (isNaN(dt)) return null;
        const dd = String(dt.getDate()).padStart(2,'0');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const yy = dt.getFullYear();
        return `${dd}/${mm}/${yy}`;
      };

      if (!ANIM_ULT_IA)         put('ultimaIA',       ultimaIA === null ? null : toBR(ultimaIA) ?? hist2.espelho?.ultimaIA);
      if (!ANIM_IA_ANT)         put('iaAnterior',     iaAnterior === null ? null : toBR(iaAnterior) ?? hist2.espelho?.iaAnterior);
      if (!ANIM_ULT_PARTO_COL)  put('ultimoParto',    ultimoParto === null ? null : toBR(ultimoParto) ?? hist2.espelho?.ultimoParto);
      if (!ANIM_PARTO_ANT_COL)  put('partoAnterior',  partoAnterior === null ? null : toBR(partoAnterior) ?? hist2.espelho?.partoAnterior);
      if (!ANIM_SECAGEM_ANT_COL)put('secagemAnterior',secagemAnterior === null ? null : toBR(secagemAnterior) ?? hist2.espelho?.secagemAnterior);
      if (!ANIM_DECISAO) {
        if (decisao === null || String(decisao).trim()==='') put('decisao', null);
        else if (decisao !== undefined) put('decisao', String(decisao));
      }

      await runner.query(
        `UPDATE "${T_ANIM}" SET historico = $1 ${HAS_UPD_ANIM ? ', "updated_at"=NOW()' : ''} WHERE "${ANIM_ID_COL}"=$2 ${HAS_OWNER_ANIM && ownerId ? 'AND owner_id=$3' : ''}`,
        HAS_OWNER_ANIM && ownerId ? [JSON.stringify(hist2), animalId, ownerId] : [JSON.stringify(hist2), animalId]
      );
    }
  }

  const sets = [];
  const params = [];

  if (ANIM_ULT_IA && ultimaIA !== undefined) {
    if (ultimaIA === null) {
      sets.push(`"${ANIM_ULT_IA}" = NULL`);
    } else {
      const br = isoToBRDate(ultimaIA);
      if (br) {
        sets.push(`"${ANIM_ULT_IA}" = $${params.length + 1}`);
        params.push(br);
      } else {
        sets.push(`"${ANIM_ULT_IA}" = NULL`);
      }
    }
  }

  if (ANIM_IA_ANT && iaAnterior !== undefined) {
    // manter compatibilidade antiga: coluna que armazena BR
    if (iaAnterior === null) {
      sets.push(`"${ANIM_IA_ANT}" = NULL`);
    } else {
      const br = isoToBRDate(iaAnterior);
      if (br) {
        sets.push(`"${ANIM_IA_ANT}" = $${params.length + 1}`);
        params.push(br);
      } else {
        sets.push(`"${ANIM_IA_ANT}" = NULL`);
      }
    }
  }
  // coluna ISO real da IA anterior (se existir)
  if (ANIM_IA_ANT_REAL && iaAnterior !== undefined) {
    if (iaAnterior === null) sets.push(`"${ANIM_IA_ANT_REAL}" = NULL`);
    else { sets.push(`"${ANIM_IA_ANT_REAL}" = $${params.length + 1}`); params.push(ensureISODate(iaAnterior)); }
  }

  // Atualiza a coluna de situação reprodutiva. Se não existir coluna
  // dedicada (ANIM_SIT_REP), usa a coluna "estado" como fallback.
  if (situacaoReprodutiva) {
    if (ANIM_SIT_REP) {
      sets.push(`"${ANIM_SIT_REP}" = $${params.length + 1}`);
      params.push(situacaoReprodutiva);
    } else if (ANIM_ESTADO) {
      sets.push(`"${ANIM_ESTADO}" = $${params.length + 1}`);
      params.push(situacaoReprodutiva);
    }
  }

  if (ANIM_ULT_PARTO_COL && ultimoParto !== undefined) {
    if (ultimoParto === null) {
      sets.push(`"${ANIM_ULT_PARTO_COL}" = NULL`);
    } else {
      const br = isoToBRDate(ultimoParto);
      if (br) {
        sets.push(`"${ANIM_ULT_PARTO_COL}" = $${params.length + 1}`);
        params.push(br);
      } else {
        sets.push(`"${ANIM_ULT_PARTO_COL}" = NULL`);
      }
    }
  }

  if (ANIM_PARTO_ANT_COL && partoAnterior !== undefined) {
    if (partoAnterior === null) {
      sets.push(`"${ANIM_PARTO_ANT_COL}" = NULL`);
    } else {
      const br = isoToBRDate(partoAnterior);
      if (br) {
        sets.push(`"${ANIM_PARTO_ANT_COL}" = $${params.length + 1}`);
        params.push(br);
      } else {
        sets.push(`"${ANIM_PARTO_ANT_COL}" = NULL`);
      }
    }
  }
  // coluna ISO real do parto anterior (se existir)
  if (ANIM_PARTO_ANT_REAL && partoAnterior !== undefined) {
    if (partoAnterior === null) sets.push(`"${ANIM_PARTO_ANT_REAL}" = NULL`);
    else { sets.push(`"${ANIM_PARTO_ANT_REAL}" = $${params.length + 1}`); params.push(ensureISODate(partoAnterior)); }
  }

  if ((ANIM_SECAGEM_ANT_COL || ANIM_SECAGEM_ANT) && secagemAnterior !== undefined) {
    if (secagemAnterior === null) {
      if (ANIM_SECAGEM_ANT_COL) sets.push(`"${ANIM_SECAGEM_ANT_COL}" = NULL`);
      if (ANIM_SECAGEM_ANT)     sets.push(`"${ANIM_SECAGEM_ANT}" = NULL`);
    } else {
      const br = isoToBRDate(secagemAnterior);
      if (ANIM_SECAGEM_ANT_COL) {
        if (br) { sets.push(`"${ANIM_SECAGEM_ANT_COL}" = $${params.length + 1}`); params.push(br); }
        else { sets.push(`"${ANIM_SECAGEM_ANT_COL}" = NULL`); }
      }
      if (ANIM_SECAGEM_ANT) {
        sets.push(`"${ANIM_SECAGEM_ANT}" = $${params.length + 1}`);
        params.push(ensureISODate(secagemAnterior));
      }
    }
  }

  // produtiva: coluna dedicada OU fallback "estado"
  if (situacaoProdutiva !== undefined) {
    if (ANIM_SIT_PROD) {
      sets.push(`"${ANIM_SIT_PROD}" = $${params.length + 1}`);
      params.push(situacaoProdutiva);
    } else if (ANIM_ESTADO) {
      sets.push(`"${ANIM_ESTADO}" = $${params.length + 1}`);
      params.push(situacaoProdutiva);
    }
  }

  // previsao_parto (BR) compat + previsao_parto_iso (ISO) como fonte da verdade
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
  if (ANIM_PREV_PARTO_ISO && previsaoPartoISO !== undefined) {
    if (previsaoPartoISO === null) {
      sets.push(`"${ANIM_PREV_PARTO_ISO}" = NULL`);
    } else {
      sets.push(`"${ANIM_PREV_PARTO_ISO}" = $${params.length + 1}`);
      params.push(ensureISODate(previsaoPartoISO));
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

  const whereWithOwner = [`"${ANIM_ID_COL}" = $${params.length + 1}`];
  const paramsWithOwner = params.slice();
  paramsWithOwner.push(animalId);
  if (HAS_OWNER_ANIM && ownerId) { whereWithOwner.push(`"owner_id" = $${paramsWithOwner.length + 1}`); paramsWithOwner.push(ownerId); }

  const sql1 = `UPDATE "${T_ANIM}" SET ${sets.join(', ')} WHERE ${whereWithOwner.join(' AND ')}`;
  const r1 = await runner.query(sql1, paramsWithOwner);

  if ((r1.rowCount || 0) === 0 && HAS_OWNER_ANIM && ownerId) {
    const whereNoOwner = [`"${ANIM_ID_COL}" = $${params.length + 1}`];
    const paramsNoOwner = params.slice();
    paramsNoOwner.push(animalId);
    const sql2 = `UPDATE "${T_ANIM}" SET ${sets.join(', ')} WHERE ${whereNoOwner.join(' AND ')}`;
    await runner.query(sql2, paramsNoOwner);
  }
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

// Inserção genérica de evento reprodutivo
async function inserirEvento({ client = db, ownerId, animal_id, dataISO, tipo, detalhes = {}, resultado = null, protocolo_id = null, aplicacao_id = null }) {
  const cols = [];
  const vals = [];
  const placeholders = [];
  let idx = 1;
  if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); vals.push(animal_id); placeholders.push(`$${idx++}`); }
  if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     vals.push(dataISO); placeholders.push(`$${idx++}`); }
  if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     vals.push(tipo); placeholders.push(`$${idx++}`); }
  if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); vals.push(JSON.stringify(detalhes || {})); placeholders.push(`$${idx++}`); }
  if (EVT_RESULT && resultado !== null)   { cols.push(`"${EVT_RESULT}"`);   vals.push(resultado); placeholders.push(`$${idx++}`); }
  if (EVT_PROTO_ID && protocolo_id !== null) { cols.push(`"${EVT_PROTO_ID}"`); vals.push(protocolo_id); placeholders.push(`$${idx++}`); }
  if (EVT_APLIC_ID && aplicacao_id !== null) { cols.push(`"${EVT_APLIC_ID}"`); vals.push(aplicacao_id); placeholders.push(`$${idx++}`); }
  if (HAS_OWNER_EVT && ownerId) { cols.push('owner_id'); vals.push(ownerId); placeholders.push(`$${idx++}`); }
  const sql = `INSERT INTO "${T_EVT}" (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING ${EVT_ID?`"${EVT_ID}" AS id,`:''} ${EVT_DATA?`"${EVT_DATA}" AS data`:'*'};`;
  const { rows } = await (client || db).query(sql, vals);
  emitir('protocolosAtivosAtualizados');
  emitir('registroReprodutivoAtualizado');
  emitir('atualizarCalendario');
  emitir('tarefasAtualizadas');
  return rows[0] || {};
}

/* ======= helpers adicionais para pré-parto/parto/bezerros ======= */
async function lastPrePartoBefore(client, animalId, dateISO, ownerId) {
  if (!EVT_ANIM_COL || !EVT_TIPO || !EVT_DATA) return null;
  const where = [
    `"${EVT_ANIM_COL}" = $1`,
    `"${EVT_TIPO}" = 'PRE_PARTO'`,
    `"${EVT_DATA}" <= $2`
  ];
  const params = [animalId, dateISO];
  if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $${params.length + 1}`); params.push(ownerId); }
  const sql = `
    SELECT ${EVT_ID ? `"${EVT_ID}" AS id,` : ''} "${EVT_DATA}" AS data
           ${EVT_DETALHES ? `, "${EVT_DETALHES}" AS detalhes` : ''}
      FROM "${T_EVT}"
     WHERE ${where.join(' AND ')}
  ORDER BY "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', "created_at" DESC' : ''} LIMIT 1`;
  const { rows } = await (client || db).query(sql, params);
  return rows[0] || null;
}

async function getAnimalBasic(animalId, ownerId) {
  if (!ANIM_ID_COL) return {};
  const fields = [
    `"${ANIM_ID_COL}" AS id`,
    ANIM_NUM   && `"${ANIM_NUM}" AS numero`,
    ANIM_BRINC && `"${ANIM_BRINC}" AS brinco`,
    ANIM_RACA  && `"${ANIM_RACA}" AS raca`
  ].filter(Boolean).join(', ');
  const params = [animalId];
  const where = [`"${ANIM_ID_COL}" = $1`];
  if (HAS_OWNER_ANIM && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }
  const sql = `SELECT ${fields} FROM "${T_ANIM}" WHERE ${where.join(' AND ')} LIMIT 1`;
  const { rows } = await db.query(sql, params);
  return rows[0] || {};
}

async function getNextNumeroTx(client, ownerId) {
  if (!ANIM_NUM) return null;
  await client.query(`LOCK TABLE "${T_ANIM}" IN SHARE ROW EXCLUSIVE MODE`);
  const where = [];
  const params = [];
  if (HAS_OWNER_ANIM && ownerId) { where.push(`a.owner_id = $1`); params.push(ownerId); }
  const sql = `
    SELECT COALESCE(
      MAX(NULLIF(regexp_replace(COALESCE(a."${ANIM_NUM}", ''), '\\D', '', 'g'), '')::int),
      0
    ) AS maxnum
      FROM "${T_ANIM}" a
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  const { rows } = await client.query(sql, params);
  const next = Number(rows?.[0]?.maxnum || 0) + 1;
  return String(next);
}

async function createAnimalTx({ client, ownerId, data }) {
  // data: { numero?, brinco?, nascimentoISO?, sexo?, categoria?, raca?, maeRef? }
  const cols = [], vals = [], params = [];
  const hist = {};
  const meta = {};

  if (ANIM_NUM && data.numero !== undefined) {
    cols.push(`"${ANIM_NUM}"`);
    params.push(data.numero);
    vals.push(`$${params.length}`);
  } else if (!ANIM_NUM && data.numero != null) {
    meta.numero = data.numero;
  }

  if (ANIM_BRINC) {
    cols.push(`"${ANIM_BRINC}"`);
    params.push(data.brinco ?? null);
    vals.push(`$${params.length}`);
  } else if (data.brinco != null) {
    meta.brinco = data.brinco;
  }

  if (ANIM_NASC && data.nascimentoISO) {
    cols.push(`"${ANIM_NASC}"`);
    params.push(data.nascimentoISO);
    vals.push(`$${params.length}`);
  } else if (!ANIM_NASC && data.nascimentoISO) {
    const dt = new Date(data.nascimentoISO);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    meta.nascimento = `${dd}/${mm}/${yyyy}`;
    meta.nascimentoISO = data.nascimentoISO;
  }

  if (ANIM_SEXO && data.sexo) {
    cols.push(`"${ANIM_SEXO}"`);
    params.push(data.sexo);
    vals.push(`$${params.length}`);
  } else if (!ANIM_SEXO && data.sexo) {
    meta.sexo = data.sexo;
  }

  if (ANIM_CATEG && data.categoria) {
    cols.push(`"${ANIM_CATEG}"`);
    params.push(data.categoria);
    vals.push(`$${params.length}`);
  } else if (!ANIM_CATEG && data.categoria) {
    meta.categoria = data.categoria;
  }

  if (ANIM_RACA && data.raca) {
    cols.push(`"${ANIM_RACA}"`);
    params.push(data.raca);
    vals.push(`$${params.length}`);
  } else if (!ANIM_RACA && data.raca) {
    meta.raca = data.raca;
  }

  if (ANIM_MAE_COL && data.maeRef !== undefined) {
    cols.push(`"${ANIM_MAE_COL}"`);
    params.push(data.maeRef);
    vals.push(`$${params.length}`);
  } else if (!ANIM_MAE_COL && data.maeRef !== undefined) {
    meta.maeRef = data.maeRef;
  }

  if (Object.keys(meta).length) {
    hist.meta = meta;
    hist.origem = { tipo: 'nascimento', via: 'parto', at: new Date().toISOString() };
  }

  if (Object.keys(hist).length && ANIM_COLS.has('historico')) {
    cols.push('"historico"');
    params.push(JSON.stringify(hist));
    vals.push(`$${params.length}::jsonb`);
  }

  if (HAS_OWNER_ANIM && ownerId) {
    cols.push('owner_id');
    params.push(ownerId);
    vals.push(`$${params.length}`);
  }
  if (HAS_CREATED_ANIM) { cols.push('created_at'); vals.push('NOW()'); }
  if (HAS_UPD_ANIM) { cols.push('updated_at'); vals.push('NOW()'); }

  const returning = [
    ANIM_ID_COL && `"${ANIM_ID_COL}" AS id`,
    ANIM_NUM    && `"${ANIM_NUM}" AS numero`,
    ANIM_BRINC  && `"${ANIM_BRINC}" AS brinco`
  ].filter(Boolean).join(', ') || '*';

  const sql = `INSERT INTO "${T_ANIM}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${returning}`;
  const { rows } = await client.query(sql, params);
  return rows[0] || {};
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

/**
 * POST /aplicar-protocolo
 * payload tolerante:
 * {
 *   animal_id|animalId, data|data_inicio|dataBase (opcional, default hoje),
 *   protocolo_id|protocoloId|protocolo.id,
 *   parent_aplicacao_id|aplicacao_id|aplicacaoId (opcional),
 *   etapas?: [ { dia, data?, ... } ]  // se não vier, carrega do protocolo.etapas
 *   tipo?: string,
 *   detalhes?: {}
 * }
 */
router.post('/aplicar-protocolo', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const b = req.body || {};

    // aceita snakeCase e camelCase
    const animal_id = String(
      b.animal_id ?? b.animalId ?? b.cow_id ?? b.cowId ?? ''
    ).trim();

    const protocolo_id = String(
      b.protocolo_id ?? b.protocoloId ?? b?.protocolo?.id ?? b.id_protocolo ?? ''
    ).trim();

    const tipo = b.tipo || null;
    const parent_aplicacao_id = b.parent_aplicacao_id ?? b.parentAplicacaoId ?? null;
    const detalhes = b.detalhes || {};

    // etapas pode vir em b.etapas ou b.protocolo.etapas
    const etapasIn = Array.isArray(b.etapas) ? b.etapas
                    : Array.isArray(b?.protocolo?.etapas) ? b.protocolo.etapas
                    : [];

    if (!animal_id || !protocolo_id) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'animal_id/animalId e protocolo_id/protocoloId são obrigatórios'
      });
    }

    // data base: aceita várias chaves, senão hoje
    const baseISO = toISODateStringSafe(
      b.data ?? b.data_base ?? b.dataBase ?? b.data_inicio ?? b.dataInicio
    ) || ymd(new Date());

    const baseDet = {
      ...detalhes,
      origem_protocolo: String(protocolo_id),
      tipo: tipo || 'IATF',
      parent_aplicacao_id
    };

    // garante pelo menos 1 etapa
    const etapas = etapasIn.length ? etapasIn : [{ data: baseISO }];

    const created = [];
    for (const e of etapas) {
      // resolve data da etapa:
      // - e.data (ISO ou DD/MM/AAAA)
      // - ou offset (e.dia / e.day / e.offset_dias)
      // - senão usa base
      let whenISO = null;

      if (e.data) {
        try { whenISO = toISODateStringStrict(e.data); } catch {}
      }
      if (!whenISO) {
        const off = Number(
          e.dia ?? e.day ?? e.offset_dias ?? e.offsetDias
        );
        if (Number.isFinite(off)) {
          const d = new Date(baseISO);
          d.setDate(d.getDate() + off);
          whenISO = ymd(d);
        } else {
          whenISO = baseISO;
        }
      }

      const det = { ...baseDet, ...e };
      if (det.dia != null) det.dia = Number(det.dia) || 0;

      const cols = [], vals = [], params = [];
      if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(animal_id); vals.push(`$${params.length}`); }
      if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(whenISO);   vals.push(`$${params.length}`); }
      if (EVT_TIPO)     { cols.push(`"${EVT_TIPO}"`);     params.push('PROTOCOLO_ETAPA'); vals.push(`$${params.length}`); }
      if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(det)); vals.push(`$${params.length}`); } // <- sem ::jsonb
      if (EVT_PROTO_ID) { cols.push(`"${EVT_PROTO_ID}"`); params.push(protocolo_id); vals.push(`$${params.length}`); }
      if (EVT_APLIC_ID) { cols.push(`"${EVT_APLIC_ID}"`); params.push(parent_aplicacao_id); vals.push(`$${params.length}`); }
      if (HAS_OWNER_EVT){ cols.push('owner_id');           params.push(uid);        vals.push(`$${params.length}`); }
      if (HAS_UPD_EVT)  { cols.push('updated_at');         vals.push('NOW()'); }
      if (HAS_CREATED_EVT){ cols.push('created_at');       vals.push('NOW()'); }

      const returning = evtListFields.length
        ? evtListFields.map(f => `"${f}"`).join(', ')
        : '*';

      const sql = `INSERT INTO "${T_EVT}" (${cols.join(',')})
                   VALUES (${vals.join(',')})
                   RETURNING ${returning};`;
      const { rows } = await db.query(sql, params);
      created.push(rows[0] || {});
    }

    emitir('protocolosAtivosAtualizados', { animal_id });
    emitir('registroReprodutivoAtualizado', { animal_id });
    emitir('atualizarCalendario', { animal_id });
    emitir('tarefasAtualizadas', { animal_id });

    return res.status(201).json({ etapas: created });
  } catch (err) {
    console.warn('[aplicar-protocolo] erro:', err?.message || err);
    return res.status(400).json({ error: 'BadRequest', detail: String(err?.message || err) });
  }
});


/* =================== CALENDÁRIO UNIFICADO =================== */
router.get('/calendario', async (req, res) => {
  try {
    const ownerId = extractUserId(req);

    // tolerante a ausência/erro de start/end
    const hoje = new Date();
    const startQ = toISODateStringSafe(req.query.start);
    const endQ   = toISODateStringSafe(req.query.end);
    const start = startQ || ymd(subDays(hoje, 5));
    const end   = endQ   || ymd(addDays(hoje, 60));

    const prepartoOffset = Number.isFinite(+req.query.preparto_offset_days) ? +req.query.preparto_offset_days : 21;
    const secagemOffset  = Number.isFinite(+req.query.secagem_offset_days)  ? +req.query.secagem_offset_days  : 60;

    const itens = [];

    // 1) eventos reais
    const paramsEvt = HAS_OWNER_EVT ? [start, end, ownerId] : [start, end];
    const { rows: evs } = await db.query(`
      SELECT ${EVT_ID ? `"${EVT_ID}" AS id,` : ''}
             "${EVT_DATA}" AS data,
             "${EVT_TIPO}" AS tipo,
             "${EVT_DETALHES}" AS detalhes
             ${EVT_ANIM_COL ? `, "${EVT_ANIM_COL}" AS animal_id` : ''}
             ${EVT_PROTO_ID ? `, "${EVT_PROTO_ID}" AS protocolo_id` : ''}
             ${EVT_APLIC_ID ? `, "${EVT_APLIC_ID}" AS aplicacao_id` : ''}
        FROM "${T_EVT}"
       WHERE "${EVT_DATA}" >= $1 AND "${EVT_DATA}" < $2
       ${HAS_OWNER_EVT ? 'AND owner_id = $3' : ''}
    `, paramsEvt);

    for (const r of evs) {
      if (r.tipo === 'TRATAMENTO' && Array.isArray(r.detalhes?.protocolo)) {
        const baseDate = new Date(r.data);
        r.detalhes.protocolo.forEach((et, idx) => {
          const dt = new Date(baseDate);
          dt.setDate(dt.getDate() + Number(et?.dia || 0));
          const iso = ymd(dt);
          if (iso >= start && iso < end) {
            itens.push({
              id: `${r.id}_${idx}`,
              start: iso,
              end: iso,
              tipo: 'TRATAMENTO',
              title: et?.acao || et?.medicamento || r.detalhes?.enfermidade || 'Tratamento',
              origem: 'real',
              animal_id: r.animal_id || null,
              protocolo_id: r.protocolo_id || null,
              aplicacao_id: r.aplicacao_id || null,
              detalhes: { ...r.detalhes, ...et },
            });
          }
        });
      } else {
        itens.push({
          id: r.id,
          start: r.data,
          end: r.data,
          tipo: r.tipo,
          title: r.detalhes?.acao || r.detalhes?.hormonio || r.detalhes?.titulo || r.tipo,
          origem: 'real',
          animal_id: r.animal_id || null,
          protocolo_id: r.protocolo_id || null,
          aplicacao_id: r.aplicacao_id || null,
          detalhes: r.detalhes || {},
        });
      }
    }

    // 2) previsões de DG a partir de IA
    const paramsIa = HAS_OWNER_EVT ? [ownerId] : [];
    const { rows: ias } = await db.query(`
      SELECT ${EVT_ID ? `"${EVT_ID}" AS id,` : ''} "${EVT_ANIM_COL}" AS animal_id, "${EVT_DATA}" AS data
        FROM "${T_EVT}" WHERE "${EVT_TIPO}"='IA'
        ${HAS_OWNER_EVT ? 'AND owner_id = $1' : ''}
    `, paramsIa);
    for (const ia of ias) {
      const base = new Date(ia.data);
      const mk = (off, tipo, label) => {
        const d = new Date(base);
        d.setDate(d.getDate() + off);
        const iso = ymd(d);
        if (iso >= start && iso < end) {
          itens.push({ id: `${tipo}-${ia.animal_id}-${iso}`, start: iso, end: iso, tipo, title: label, origem: 'prev', animal_id: ia.animal_id });
        }
      };
      mk(30, 'PREV_DG30', 'DG30');
      mk(60, 'PREV_DG60', 'DG60');
    }

    // 3) previsões de pré-parto, parto e SECAGEM_PREVISTA (fallback via ultima_ia se não houver previsao_parto)
    {
      const paramsAnim = [];
      const where = [];

      if (HAS_OWNER_ANIM && ownerId) { where.push(`a.owner_id = $${paramsAnim.length + 1}`); paramsAnim.push(ownerId); }

      const fields = [
        `a."${ANIM_ID_COL}" AS id`,
        ANIM_PREV_PARTO && `a."${ANIM_PREV_PARTO}" AS prev_parto`,
        ANIM_PREV_PARTO && `a."${ANIM_PREV_PARTO}" AS "previsaoParto"`,
        ANIM_SIT_REP && `a."${ANIM_SIT_REP}" AS sit_rep`,
        ANIM_SIT_REP && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
        ANIM_SIT_PROD && `a."${ANIM_SIT_PROD}" AS sit_prod`,
        ANIM_SIT_PROD && `a."${ANIM_SIT_PROD}" AS "situacaoProdutiva"`,
        ANIM_ESTADO && `a."${ANIM_ESTADO}" AS estado`,
        ANIM_ULT_IA && `a."${ANIM_ULT_IA}" AS ultima_ia`,
        ANIM_ULT_IA && `a."${ANIM_ULT_IA}" AS "ultimaIa"`,
      ].filter(Boolean).join(', ');

      if (ANIM_PREV_PARTO && ANIM_SIT_REP) {
        where.push(`(a."${ANIM_PREV_PARTO}" IS NOT NULL OR LOWER(COALESCE(a."${ANIM_SIT_REP}",''))='prenhe')`);
      } else if (ANIM_PREV_PARTO) {
        where.push(`a."${ANIM_PREV_PARTO}" IS NOT NULL`);
      } else if (ANIM_SIT_REP) {
        where.push(`LOWER(COALESCE(a."${ANIM_SIT_REP}",''))='prenhe'`);
      }

      const sql = `
        SELECT ${fields}
          FROM "${T_ANIM}" a
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      `;
      const { rows: prenhes } = await db.query(sql, paramsAnim);

      for (const a of prenhes) {
        // decidir data de parto: prev_parto (se houver) OU ultima_ia + 283 (se sit_rep ~ prenhe)
        const prevPartoRaw = a.previsaoParto ?? a.prev_parto;
        let parto = parseDateFlexible(prevPartoRaw);
        const sitRepRaw = a.situacaoReprodutiva ?? a.sit_rep;
        const isPrenhe = normStr(sitRepRaw).includes('pren');

        const ultimaIaRaw = a.ultimaIa ?? a.ultima_ia;
        if (!parto && isPrenhe && ultimaIaRaw) {
          const ui = parseDateFlexible(ultimaIaRaw);
          if (ui) { const d = new Date(ui); d.setDate(d.getDate() + DIAS_GESTACAO); parto = d; }
        }
        if (!parto) continue;

        const addItem = (d, tipo, title) => {
          const iso = ymd(d);
          if (iso >= start && iso < end) {
            itens.push({ id: `${tipo}-${a.id}-${iso}`, start: iso, end: iso, tipo, title, origem: 'prev', animal_id: a.id });
          }
        };

        addItem(new Date(parto), 'PARTO_PREVISTO', 'Parto previsto');
        addItem(subDays(parto, prepartoOffset), 'PRE_PARTO_INICIO', 'Início pré-parto');

        const sitProd = normStr((a.situacaoProdutiva ?? a.sit_prod ?? a.estado) || '');
        const isLact = sitProd.includes('lact');
        if (isPrenhe && isLact) {
          addItem(subDays(parto, secagemOffset), 'SECAGEM_PREVISTA', 'Secagem prevista');
        }
      }
    }

    return res.json({ ok: true, itens });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message || 'Falha no feed de calendário' });
  }
});

router.get('/eventos/animal/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT * FROM ${T_EVT} WHERE ${EVT_ANIM_COL}=$1 ORDER BY ${EVT_DATA} ASC, ${HAS_CREATED_EVT ? 'created_at':'id'} ASC`,
    [id]
  );
  const out = rows.map(r => ({ ...r, _detalhes: r[EVT_DETALHES] || {} }));
  const ias = out.filter(e => e[EVT_TIPO]==='IA');
  for (let i=0;i<ias.length-1;i++){
    const a = ias[i], b = ias[i+1];
    const gap = _diasEntre(a[EVT_DATA], b[EVT_DATA]);
    if (gap >= 18 && gap <= 25){
      const temDGPos = out.some(ev => ev[EVT_TIPO]==='DIAGNOSTICO'
        && (ev[EVT_RESULT]==='prenhe' || ev._detalhes?.resultado==='prenhe')
        && ev[EVT_DATA] >= a[EVT_DATA] && ev[EVT_DATA] <= b[EVT_DATA]);
      if (!temDGPos){
        a._detalhes = { ...(a._detalhes||{}), retorno_cio:true, ia_negativa_por_retorno:true, resultado:'negativo' };
      }
    }
  }
  const eventos = out.map(r => ({
    id: r[EVT_ID], animal_id: r[EVT_ANIM_COL], data: r[EVT_DATA], tipo: r[EVT_TIPO],
    detalhes: r._detalhes, resultado: r[EVT_RESULT], protocolo_id: r[EVT_PROTO_ID], aplicacao_id: r[EVT_APLIC_ID],
    tipo_humano: r[EVT_TIPO],
    janela_dg: r._detalhes?.janela, ia_ref_data: r._detalhes?.ia_ref_data,
    origem_protocolo: r._detalhes?.origem_protocolo, parent_aplicacao_id: r._detalhes?.parent_aplicacao_id
  }));
  res.json(eventos);
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
    const dataISO = toISODateStringStrict(ev.data);
    const iaAnterior = await lastIaBefore(client, ev.animal_id, dataISO, uid);

    if (touroId) {
      await consumirDoseTouroTx({ client, touroId, ownerId: uid });
    }

    const cols = [], vals = [], params = [];
    if (EVT_ANIM_COL) { cols.push(`"${EVT_ANIM_COL}"`); params.push(ev.animal_id); vals.push(`$${params.length}`); }
    if (EVT_DATA)     { cols.push(`"${EVT_DATA}"`);     params.push(dataISO); vals.push(`$${params.length}`); }
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
      ultimaIA: dataISO,
      iaAnterior: iaAnterior?.data ?? null,
      situacaoReprodutiva: ANIM_SIT_REP ? 'inseminada' : null,
      client,
    });

    // retorno de cio
    if (iaAnterior) {
      const diff = _diasEntre(iaAnterior.data, dataISO);
      if (diff >= 18 && diff <= 25) {
        const dgPos = await hasDgPosBetween(client, ev.animal_id, iaAnterior.data, dataISO, uid);
        if (!dgPos && EVT_ID && EVT_DETALHES) {
          let set = `"${EVT_DETALHES}" = COALESCE("${EVT_DETALHES}",'{}'::jsonb) || '{"resultado":"negativo"}'::jsonb`;
          if (EVT_RESULT) set += `, "${EVT_RESULT}"='vazia'`;
          await client.query(`UPDATE "${T_EVT}" SET ${set} WHERE "${EVT_ID}"=$1`, [iaAnterior.id]);
        }
      }
    }

    await client.query('COMMIT');
    emitir('protocolosAtivosAtualizados');
    emitir('registroReprodutivoAtualizado');
    emitir('atualizarCalendario');
    emitir('tarefasAtualizadas');
    res.json(novo);
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    res.status(400).json({ error: 'IAError', detail: e?.message || 'Falha ao lançar IA' });
  } finally {
    client?.release?.();
  }
});

/* =================== Diagnóstico =================== */
router.post('/diagnostico', async (req, res) => {
  const ownerId = extractUserId(req);
  if (HAS_OWNER_EVT && !ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const animalId = body.animal_id ?? body.animalId ?? body.id_animal;
  if (!animalId) return res.status(400).json({ detail: 'animal_id obrigatório.' });

  const rawDate = body.dataISO ?? body.data ?? null;
  let dataISO;
  try {
    dataISO = rawDate ? toISODateStringStrict(rawDate) : ymd(new Date());
  } catch (err) {
    return res.status(422).json({ detail: err?.message || 'Data inválida (use YYYY-MM-DD ou DD/MM/AAAA).' });
  }

  const resultadoRaw = String(body.resultado ?? body.status ?? '').trim().toLowerCase();
  let resultado = 'indeterminado';
  if (['prenhe', 'prenha'].includes(resultadoRaw)) resultado = 'prenhe';
  else if (['vazia', 'negativo', 'vazio'].includes(resultadoRaw)) resultado = 'vazia';
  else if (['indeterminado', 'nao vista', 'não vista', 'nao-vista', 'não-vista', 'nao_vista'].includes(resultadoRaw)) resultado = 'indeterminado';

  let detalhes = {};
  const detalhesBody = body.detalhes;
  if (detalhesBody && typeof detalhesBody === 'object' && !Array.isArray(detalhesBody)) {
    detalhes = { ...detalhesBody };
  } else if (typeof detalhesBody === 'string') {
    try { detalhes = JSON.parse(detalhesBody); }
    catch { detalhes = { observacao: detalhesBody }; }
  }
  if (!EVT_RESULT) {
    if (detalhes?.resultado == null) detalhes = { ...detalhes, resultado };
    else detalhes = { ...detalhes, resultado: String(detalhes.resultado).toLowerCase() };
  } else if (detalhes && detalhes.resultado == null) {
    detalhes = { ...detalhes, resultado };
  }

  if (!EVT_ANIM_COL || !EVT_DATA || !EVT_TIPO) {
    return res.status(500).json({ detail: 'Configuração da tabela de eventos indisponível para diagnóstico.' });
  }

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const cols = [];
    const vals = [];
    const params = [];

    cols.push(`"${EVT_ANIM_COL}"`); params.push(animalId); vals.push(`$${params.length}`);
    cols.push(`"${EVT_DATA}"`);     params.push(dataISO);   vals.push(`$${params.length}`);
    cols.push(`"${EVT_TIPO}"`);     params.push('DIAGNOSTICO'); vals.push(`$${params.length}`);
    if (EVT_DETALHES) {
      params.push(JSON.stringify(detalhes || {}));
      vals.push(`$${params.length}::jsonb`);
      cols.push(`"${EVT_DETALHES}"`);
    }
    if (EVT_RESULT) {
      params.push(resultado);
      vals.push(`$${params.length}`);
      cols.push(`"${EVT_RESULT}"`);
    }
    if (HAS_OWNER_EVT && ownerId) {
      params.push(ownerId);
      vals.push(`$${params.length}`);
      cols.push('owner_id');
    }
    if (HAS_UPD_EVT)   { cols.push('updated_at'); vals.push('NOW()'); }
    if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

    const returning = evtListFields.length
      ? evtListFields.map(f => `"${f}"`).join(', ')
      : '*';
    const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${returning};`;
    await client.query(sql, params);

    const camposAnimal = { animalId, ownerId, client };
    if (resultado === 'prenhe') {
      const iaAnterior = await lastIaBefore(client, animalId, dataISO, ownerId);
      if (iaAnterior?.data) {
        const dtIA = parseAnyDate(iaAnterior.data);
        if (dtIA) {
          const prev = addDays(dtIA, DIAS_GESTACAO);
          camposAnimal.previsaoPartoISO = ymd(prev); // gravaremos ISO (e BR compat)
        }
      }
      camposAnimal.situacaoReprodutiva = 'Prenhe';
    } else if (resultado === 'vazia') {
      camposAnimal.situacaoReprodutiva = 'Vazia';
      camposAnimal.previsaoPartoISO = null; // limpar previsão ao marcar vazia
    }

    await atualizarAnimalCampos(camposAnimal).catch(() => {});

    let situacaoFinal = camposAnimal.situacaoReprodutiva ?? null;
    let previsaoPartoFinal = camposAnimal.previsaoPartoISO ?? null;

    if (ANIM_ID_COL && (ANIM_SIT_REP || ANIM_PREV_PARTO)) {
      const camposSel = [];
      if (ANIM_SIT_REP) camposSel.push(`"${ANIM_SIT_REP}" AS __sit__`);
      if (ANIM_PREV_PARTO) camposSel.push(`"${ANIM_PREV_PARTO}" AS __prev__`);
      if (camposSel.length) {
        const where = [`"${ANIM_ID_COL}" = $1`];
        const paramsSel = [animalId];
        if (HAS_OWNER_ANIM && ownerId) { where.push(`"owner_id" = $${paramsSel.length + 1}`); paramsSel.push(ownerId); }
        try {
          const sqlSel = `SELECT ${camposSel.join(', ')} FROM "${T_ANIM}" WHERE ${where.join(' AND ')} LIMIT 1`;
          const { rows: animalRows } = await client.query(sqlSel, paramsSel);
          const animalFinal = animalRows?.[0] || {};
          if (ANIM_SIT_REP && animalFinal.__sit__ != null) {
            situacaoFinal = animalFinal.__sit__;
          }
          if (ANIM_PREV_PARTO) {
            if (animalFinal.__prev__ == null) {
              previsaoPartoFinal = null;
            } else {
              const iso = ensureISODate(animalFinal.__prev__);
              if (iso) previsaoPartoFinal = iso;
            }
          }
        } catch (err) {
          console.warn('[POST /reproducao/diagnostico] falha ao ler estado final:', err?.message);
        }
      }
    }

    if (typeof situacaoFinal === 'string' && situacaoFinal) {
      const norm = normStr(situacaoFinal).trim();
      if (norm === 'prenhe' || norm === 'prenha') situacaoFinal = 'Prenhe';
      else if (norm === 'vazia' || norm === 'vazio') situacaoFinal = 'Vazia';
    }

    // Se a coluna específica não foi atualizada (por exemplo, animais recém criados),
    // utilize os valores calculados no backend para refletir o diagnóstico informado.
    if (!situacaoFinal) {
      if (resultado === 'prenhe') situacaoFinal = 'Prenhe';
      else if (resultado === 'vazia') situacaoFinal = 'Vazia';
    }
    if (!previsaoPartoFinal && camposAnimal.previsaoPartoISO) {
      previsaoPartoFinal = camposAnimal.previsaoPartoISO;
    }

    await client.query('COMMIT');

    emitir('protocolosAtivosAtualizados');
    emitir('registroReprodutivoAtualizado');
    emitir('atualizarCalendario');
    emitir('tarefasAtualizadas');

    return res.status(201).json({
      ok: true,
      resultado,
      situacaoReprodutiva: situacaoFinal,
      previsaoParto: previsaoPartoFinal ?? null,
      situacao_reprodutiva: situacaoFinal,
      previsao_parto: previsaoPartoFinal ?? null,
    });
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    console.error('[POST /reproducao/diagnostico] erro:', e);
    return res.status(500).json({ detail: 'Falha ao salvar diagnóstico.' });
  } finally {
    client?.release?.();
  }
});

/* =================== PRÉ-PARTO =================== */
router.post('/pre-parto', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = eventoCreateSchema.safeParse({ ...req.body, tipo: 'PRE_PARTO' });
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  try {
    const dataISO = toISODateStringStrict(ev.data);
    const det = { ...(ev.detalhes || {}) };
    if (det.dias_param != null) det.dias_param = Number(det.dias_param) || null;
    det.inicio_preparto = true;

    const item = await inserirEvento({
      ownerId: uid,
      animal_id: ev.animal_id,
      dataISO,
      tipo: 'PRE_PARTO',
      detalhes: det,
      protocolo_id: ev.protocolo_id ?? null,
      aplicacao_id: ev.aplicacao_id ?? null,
    });

    await atualizarAnimalCampos({
      animalId: ev.animal_id,
      ownerId: uid,
      situacaoReprodutiva: ANIM_SIT_REP ? 'pre-parto' : undefined,
    }).catch(()=>{});

    emitir('protocolosAtivosAtualizados');
    emitir('registroReprodutivoAtualizado');
    emitir('atualizarCalendario');
    emitir('tarefasAtualizadas');

    res.json(item);
  } catch (e) {
    res.status(400).json({ error: 'InternalError', detail: e?.message || 'Falha ao registrar início de pré-parto' });
  }
});

/* =================== PARTO =================== */
router.post('/parto', async (req, res) => {
  const ownerId = extractUserId(req);
  if (HAS_OWNER_EVT && !ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = eventoCreateSchema.safeParse({ ...req.body, tipo: 'PARTO' });
  if (!parsed.success) return res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
  const ev = parsed.data;

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const dataISO = toISODateStringStrict(ev.data);
    const prevPartos = await getUltimosEventos({ client, ownerId, animalId: ev.animal_id, tipo: 'PARTO', limit: 1 });
    const partoAnteriorISO = prevPartos?.[0]?.data ?? null;

    // 1) agrega info do pré-parto (dias decorridos)
    const preIni = await lastPrePartoBefore(client, ev.animal_id, dataISO, ownerId);
    const det = { ...(ev.detalhes || {}) };
    if (preIni) {
      const diasDecorridos = Math.max(0, _diasEntre(preIni.data, dataISO));
      det.preparto_inicio_data     = preIni.data;
      det.preparto_param_dias      = (preIni.detalhes && (preIni.detalhes.dias_param ?? preIni.detalhes.diasParam)) ?? null;
      det.preparto_dias_decorridos = diasDecorridos;
      det.preparto_encerrado_em    = dataISO;
    }

    // 2) persiste PARTO
    const parto = await inserirEvento({
      client, ownerId,
      animal_id: ev.animal_id,
      dataISO,
      tipo: 'PARTO',
      detalhes: det,
      resultado: ev.resultado ?? null,
      protocolo_id: ev.protocolo_id ?? null,
      aplicacao_id: ev.aplicacao_id ?? null,
    });

    // 3) atualiza situação da mãe
    await atualizarAnimalCampos({
      animalId: ev.animal_id,
      ownerId,
      ultimoParto: dataISO,
      partoAnterior: partoAnteriorISO,
      situacaoReprodutiva: ANIM_SIT_REP ? 'puerpera' : null,
      previsaoPartoISO: null,
      client,
    });

    // 4) criar bezerros (opcional)
    const bezerros = Array.isArray(req.body?.bezerros) ? req.body.bezerros
                     : Array.isArray(det?.bezerros) ? det.bezerros
                     : [];

    const mae = await getAnimalBasic(ev.animal_id, ownerId);
    const createdCalves = [];

    for (const b of bezerros) {
      const sexo = String(b?.sexo || 'femea').toLowerCase() === 'macho' ? 'macho' : 'femea';
      const categoria = sexo === 'macho' ? 'Bezerro' : 'Bezerra';

      // número: usa o enviado ou gera o próximo
      let numero = b?.numero;
      if (!numero && ANIM_NUM) {
        numero = await getNextNumeroTx(client, ownerId);
      }

      // referência da mãe: id se a coluna parecer *_id, senão número/brinco/ID
      let maeRef = null;
      if (ANIM_MAE_COL) {
        const colLower = ANIM_MAE_COL.toLowerCase();
        if (colLower.includes('id')) maeRef = ev.animal_id;
        else maeRef = mae.numero || mae.brinco || ev.animal_id;
      }

      const nascISO = dataISO;
      const calf = await createAnimalTx({
        client, ownerId,
        data: {
          numero,
          brinco: b?.brinco ?? null,
          nascimentoISO: nascISO,
          sexo,
          categoria,
          raca: mae?.raca || null,
          maeRef
        }
      });
      createdCalves.push(calf);
    }

    await client.query('COMMIT');

    emitir('registroReprodutivoAtualizado');
    emitir('atualizarCalendario');
    emitir('tarefasAtualizadas');

    res.json({
      id: parto.id,
      data: parto.data,
      tipo: 'PARTO',
      detalhes: det,
      bezerros_criados: createdCalves
    });
  } catch (e) {
    try { await client?.query('ROLLBACK'); } catch {}
    res.status(400).json({ error: 'InternalError', detail: e?.message || 'Falha ao registrar parto' });
  } finally {
    client?.release?.();
  }
});

/* =================== SECAGEM =================== */
/**
 * GET /api/v1/reproducao/secagem/candidatas
 * - lactantes + prenhas
 * - dataSecagemPrevista = (previsao_parto OU ultima_ia+283) - antec (default 60)
 * - filtra janela [start, end] (default hoje-5 .. hoje+60)
 */
router.get('/secagem/candidatas', async (req, res) => {
  try {
    if (!ANIM_ID_COL) return res.json({ items: [], events: [], params: {} });
    const uid = extractUserId(req);
    if (HAS_OWNER_ANIM && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const hoje = new Date();
    const startQ = toISODateStringSafe(req.query.start);
    const endQ   = toISODateStringSafe(req.query.end);
    const start = startQ || ymd(subDays(hoje, 5));
    const end   = endQ   || ymd(addDays(hoje, 60));
    const antec = Number.isFinite(+req.query.antec) ? +req.query.antec
                  : Number.isFinite(+req.query.secagem_offset_days) ? +req.query.secagem_offset_days
                  : 60;

    const params = [];
    const where = [];
    if (HAS_OWNER_ANIM && uid) { where.push(`a.owner_id = $1`); params.push(uid); }

    const fields = [
      `a."${ANIM_ID_COL}" AS id`,
      ANIM_NUM   && `a."${ANIM_NUM}" AS numero`,
      ANIM_BRINC && `a."${ANIM_BRINC}" AS brinco`,
      ANIM_SIT_REP  && `a."${ANIM_SIT_REP}" AS sit_rep`,
      ANIM_SIT_REP  && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
      ANIM_SIT_PROD && `a."${ANIM_SIT_PROD}" AS sit_prod`,
      ANIM_SIT_PROD && `a."${ANIM_SIT_PROD}" AS "situacaoProdutiva"`,
      ANIM_ESTADO   && `a."${ANIM_ESTADO}" AS estado`,
      ANIM_PREV_PARTO && `a."${ANIM_PREV_PARTO}" AS prev_parto`,
      ANIM_PREV_PARTO && `a."${ANIM_PREV_PARTO}" AS "previsaoParto"`,
      ANIM_ULT_IA && `a."${ANIM_ULT_IA}" AS ultima_ia`,
      ANIM_ULT_IA && `a."${ANIM_ULT_IA}" AS "ultimaIa"`,
    ].filter(Boolean).join(', ');

    if (ANIM_SIT_REP) {
      where.push(`LOWER(COALESCE(a."${ANIM_SIT_REP}",''))='prenhe'`);
    }
    const sql = `
      SELECT ${fields}
        FROM "${T_ANIM}" a
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    `;
    const { rows } = await db.query(sql, params);

    const items = [];
    const events = [];

    for (const r of rows) {
      const sitRepVal = r.situacaoReprodutiva ?? r.sit_rep ?? null;
      const sitRep = normStr(sitRepVal || '');
      const sitProdVal = r.situacaoProdutiva ?? r.sit_prod ?? r.estado ?? null;
      const sitProd = normStr(sitProdVal || '');
      const isPrenhe = sitRep.includes('pren');
      const isLact   = sitProd.includes('lact');

      // parto via prev_parto ou fallback em ultima_ia + 283
      let ppISO = toISODateStringSafe(r.previsaoParto ?? r.prev_parto);
      const ultimaIaVal = r.ultimaIa ?? r.ultima_ia;
      if (!ppISO && isPrenhe && ultimaIaVal) {
        const ui = parseDateFlexible(ultimaIaVal);
        if (ui) { const d = new Date(ui); d.setDate(d.getDate() + DIAS_GESTACAO); ppISO = ymd(d); }
      }
      if (!isPrenhe || !isLact || !ppISO) continue;

      const pp = new Date(ppISO);
      const dtSec = subDays(pp, antec);
      const secISO = ymd(dtSec);

      if (secISO >= start && secISO <= end) {
        items.push({
          id: r.id,
          numero: r.numero || null,
          brinco: r.brinco || null,
          situacaoReprodutiva: sitRepVal,
          situacaoProdutiva: sitProdVal,
          previsaoParto: ppISO,
          dataSecagemPrevista: secISO,
        });
        events.push({
          tipo: 'SECAGEM_PREVISTA',
          start: secISO,
          end:   secISO,
          animal_id: r.id,
          title: `Secagem prevista • Nº ${r.numero || r.brinco || r.id}`,
        });
      }
    }

    res.json({ items, events, params: { start, end, antec } });
  } catch (err) {
    console.error('[GET /reproducao/secagem/candidatas] error', err);
    res.status(500).json({ error: 'erro_interno' });
  }
});

/**
 * POST /api/v1/reproducao/secagem
 */
router.post('/secagem', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error:'Unauthorized' });

  const p = eventoCreateSchema.safeParse({ ...req.body, tipo:'SECAGEM' });
  if (!p.success) return res.status(400).json({ error:'ValidationError', issues:p.error.issues });
  const ev = p.data;

  try {
    const dataISO = toISODateStringStrict(ev.data);

    // calcular dias_antes_parto
    let dias_antes_parto = null;
    if (ANIM_PREV_PARTO) {
      const { rows: arows } = await db.query(
        `SELECT "${ANIM_PREV_PARTO}" AS prev_parto, "${ANIM_PREV_PARTO}" AS "previsaoParto" FROM "${T_ANIM}" WHERE "${ANIM_ID_COL}"=$1 ${HAS_OWNER_ANIM && uid ? 'AND owner_id=$2':''} LIMIT 1`,
        HAS_OWNER_ANIM && uid ? [ev.animal_id, uid] : [ev.animal_id]
      );
      const ppISO = toISODateStringSafe(arows?.[0]?.previsaoParto ?? arows?.[0]?.prev_parto);
      if (ppISO) {
        const dSec = new Date(dataISO);
        const dPP  = new Date(ppISO);
        dias_antes_parto = Math.round((dPP - dSec)/DAY);
      }
    }

    const detalhes = { ...(ev.detalhes || {}) };
    if (dias_antes_parto != null) detalhes.dias_antes_parto = dias_antes_parto;

    const item = await inserirEvento({
      ownerId: uid,
      animal_id: ev.animal_id,
      dataISO,
      tipo: 'SECAGEM',
      detalhes,
      resultado: ev.resultado ?? null,
      protocolo_id: ev.protocolo_id ?? null,
      aplicacao_id: ev.aplicacao_id ?? null,
    });

    await atualizarAnimalCampos({
      animalId: ev.animal_id,
      ownerId: uid,
      secagemAnterior: dataISO,
      situacaoProdutiva: 'seca'
    }).catch(()=>{});
    emitir('registroReprodutivoAtualizado');
    emitir('atualizarCalendario');
    emitir('tarefasAtualizadas');
    res.json({ id: item.id, data: item.data, tipo: 'SECAGEM' });
  } catch (e) {
    res.status(400).json({ error:'InternalError', detail: e?.message || 'Falha ao registrar secagem' });
  }
});

/* =================== TRATAMENTO =================== */
router.post('/tratamento', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const p = eventoCreateSchema.safeParse({ ...req.body, tipo: 'TRATAMENTO' });
  if (!p.success) return res.status(400).json({ error: 'ValidationError', issues: p.error.issues });
  const ev = p.data;

  try {
    const item = await inserirEvento({
      ownerId: uid,
      animal_id: ev.animal_id,
      dataISO: toISODateStringStrict(ev.data),
      tipo: 'TRATAMENTO',
      detalhes: ev.detalhes || {},
      resultado: ev.resultado ?? null,
      protocolo_id: ev.protocolo_id ?? null,
      aplicacao_id: ev.aplicacao_id ?? null,
    });
    res.json({ id: item.id, data: item.data, tipo: 'TRATAMENTO' });
  } catch (e) {
    res.status(400).json({ error: 'InternalError', detail: e?.message || 'Falha ao registrar tratamento' });
  }
});

/* =================== “Decisão” (permanência + clear token) =================== */
router.post('/decisao', async (req, res) => {
  const uid = extractUserId(req);
  if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

  const schema = z.object({
    animal_id: z.string().min(1),
    decisao: z.string().optional().nullable(),       // pode vir vazio, texto, ou "__CLEAR__"
    data: z.string().min(10).max(10).optional(),     // YYYY-MM-DD ou DD/MM/AAAA
  });

  const p = schema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'ValidationError', issues: p.error.issues });

  const animalId = p.data.animal_id;
  const raw = p.data.decisao;
  const clean = raw == null ? null : String(raw).trim();
  const isClear = clean === null || clean === '' || clean === CLEAR_TOKEN;
  const dataISO = toISODateStringSafe(p.data.data) || ymd(new Date());

  try {
    // 1) registra evento DECISAO (mantém histórico)
    const detalhes = EVT_DETALHES
      ? { decisao: isClear ? CLEAR_TOKEN : clean, cleared: isClear || undefined }
      : {};

    await inserirEvento({
      ownerId: uid,
      animal_id: animalId,
      dataISO,
      tipo: 'DECISAO',
      detalhes,
      // fallback para bases que usam "resultado" ao invés de detalhes
      resultado: (!EVT_DETALHES && EVT_RESULT) ? (isClear ? CLEAR_TOKEN : clean) : null,
    });

    // 2) espelha no animals.decisao (permanência)
    await atualizarAnimalCampos({
      animalId,
      ownerId: uid,
      decisao: isClear ? null : clean,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
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
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS sit_rep`,
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
      ANIM_SIT_PROD  && `a."${ANIM_SIT_PROD}" AS sit_prod`,
      ANIM_SIT_PROD  && `a."${ANIM_SIT_PROD}" AS "situacaoProdutiva"`,
      ANIM_ESTADO    && `a."${ANIM_ESTADO}" AS "estado"`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS ultima_ia`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS "ultimaIa"`,
      ANIM_PREV_PARTO&& `a."${ANIM_PREV_PARTO}" AS prev_parto`,
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
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS sit_rep`,
      ANIM_SIT_REP   && `a."${ANIM_SIT_REP}" AS "situacaoReprodutiva"`,
      ANIM_SIT_PROD  && `a."${ANIM_SIT_PROD}" AS sit_prod`,
      ANIM_SIT_PROD  && `a."${ANIM_SIT_PROD}" AS "situacaoProdutiva"`,
      ANIM_ESTADO    && `a."${ANIM_ESTADO}" AS "estado"`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS ultima_ia`,
      ANIM_ULT_IA    && `a."${ANIM_ULT_IA}" AS "ultimaIa"`,
      ANIM_PREV_PARTO&& `a."${ANIM_PREV_PARTO}" AS prev_parto`,
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
        const eventAnimalId = (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id;
        const eventDataISO = ensureISODate((EVT_DATA && e[EVT_DATA]) || req.body?.data);

        if (tipo === 'DIAGNOSTICO' && ANIM_SIT_REP) {
          if (resultado === 'prenhe') {
            const ultimaIA = await getUltimaIA(eventAnimalId, uid);
            const prev = calculaPrevisaoParto({ dataIA: ultimaIA });
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              situacaoReprodutiva: 'prenhe',
              previsaoPartoISO: prev ? prev.toISOString() : null,
            });
          } else if (resultado === 'vazia') {
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              situacaoReprodutiva: 'vazia',
              previsaoPartoISO: null,
            });
          }
        }

        if (tipo === 'IA') {
          if (eventAnimalId && eventDataISO) {
            let ultima = eventDataISO;
            let anterior = null;
            if (ANIM_ULT_IA || ANIM_IA_ANT) {
              const ias = await getUltimosEventos({ tipo: 'IA', animalId: eventAnimalId, ownerId: uid, limit: 2 });
              if (ias.length > 0) ultima = ensureISODate(ias[0]?.data) || ultima;
              if (ias.length > 1) anterior = ensureISODate(ias[1]?.data) || null;
            }
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              ultimaIA: ultima,
              iaAnterior: anterior,
              situacaoReprodutiva: ANIM_SIT_REP ? 'inseminada' : null,
            });
          } else if (ANIM_SIT_REP && eventAnimalId) {
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              situacaoReprodutiva: 'inseminada',
            });
          }
          const detalhes = ((EVT_DETALHES && e[EVT_DETALHES]) || req.body?.detalhes || {});
          const touroId = detalhes?.touro_id || detalhes?.touroId || null;
          if (touroId) await consumirDoseTouroBestEffort({ touroId, ownerId: uid });
        }

        if (tipo === 'PARTO') {
          if (eventAnimalId && eventDataISO) {
            let ultimo = eventDataISO;
            let anterior = null;
            if (ANIM_ULT_PARTO_COL || ANIM_PARTO_ANT_COL) {
              const partos = await getUltimosEventos({ tipo: 'PARTO', animalId: eventAnimalId, ownerId: uid, limit: 2 });
              if (partos.length > 0) ultimo = ensureISODate(partos[0]?.data) || ultimo;
              if (partos.length > 1) anterior = ensureISODate(partos[1]?.data) || null;
            }
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              ultimoParto: ultimo,
              partoAnterior: anterior,
              situacaoReprodutiva: ANIM_SIT_REP ? 'puerpera' : null,
              previsaoPartoISO: null,
            });
          } else if (ANIM_SIT_REP && eventAnimalId) {
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              situacaoReprodutiva: 'puerpera',
              previsaoPartoISO: null,
            });
          }
        }
        if (tipo === 'SECAGEM') {
          if (eventAnimalId && eventDataISO) {
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              secagemAnterior: eventDataISO,
              situacaoProdutiva: 'seca',
            }).catch(()=>{});
          } else {
            await atualizarAnimalCampos({
              animalId: eventAnimalId,
              ownerId: uid,
              situacaoProdutiva: 'seca',
            }).catch(()=>{});
          }
        }
        // >>> permanência via /eventos também (quando DECISAO é criada pela rota genérica)
        if (tipo === 'DECISAO') {
          let decisaoVal = null;
          if (EVT_DETALHES && e[EVT_DETALHES]) {
            const d = e[EVT_DETALHES];
            // aceita cleared:true, decisao:"__CLEAR__", vazio/null
            const raw = (d && (d.decisao ?? d.DECISAO ?? null));
            const s = raw == null ? null : String(raw).trim();
            const cleared = !!d?.cleared || s === CLEAR_TOKEN || s === '';
            decisaoVal = cleared ? null : s;
          } else if (EVT_RESULT && e[EVT_RESULT]) {
            const s = String(e[EVT_RESULT] ?? '').trim();
            decisaoVal = (!s || s === CLEAR_TOKEN) ? null : s;
          } else if (req.body?.decisao !== undefined) {
            const s = String(req.body.decisao ?? '').trim();
            decisaoVal = (!s || s === CLEAR_TOKEN) ? null : s;
          }
          await atualizarAnimalCampos({
            animalId: (EVT_ANIM_COL && e[EVT_ANIM_COL]) || req.body?.animal_id,
            ownerId: uid,
            decisao: decisaoVal,
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

/* =================== Integração com o ORQUESTRADOR =================== */
try {
  const { default: protocoloRouter } = await import('./protocolo.resource.js');
  router.use(protocoloRouter);
  console.log('[reproducao] ✅ Orquestrador (protocolo.resource) montado dentro de /api/v1/reproducao');
} catch (err) {
  console.warn('[reproducao] ⚠️ Orquestrador indisponível:', err?.message || err);
}

/* =================== Decisões — últimas (compat: ids[] e contrato antigo) =================== */
async function handlerUltimasDecisoes(req, res) {
  try {
    if (!EVT_TIPO || !EVT_DATA || !EVT_ANIM_COL) {
      return res.status(501).json({ error: 'NotAvailable', detail: 'Tabela de eventos sem colunas esperadas (tipo/data/animal_id).' });
    }

    const uid = extractUserId(req);
    if (HAS_OWNER_EVT && !uid) return res.status(401).json({ error: 'Unauthorized' });

    const fromBody = req.method === 'POST' ? (req.body || {}) : {};
    const limitRaw = fromBody.limit ?? req.query.limit ?? 20;
    const diasRaw  = fromBody.dias  ?? req.query.dias  ?? null;
    const animalId = fromBody.animal_id ?? req.query.animal_id ?? null;
    const idsReq   = Array.isArray(fromBody.ids) ? fromBody.ids.filter(Boolean) : [];

    // --- MODO 1: compat c/ front: POST { ids: [...] } -> retornar decisão atual por animal,
    // respeitando "clear" (não retrocede para decisão antiga)
    if (idsReq.length) {
      // 1) lê animals
      const base = [];
      const ph  = idsReq.map((_,i)=>`$${i+1}`).join(',');
      base.push(...idsReq);

      const fieldsAnimal = [
        `"${ANIM_ID_COL}" AS id`,
        ANIM_NUM   && `"${ANIM_NUM}" AS numero`,
        ANIM_BRINC && `"${ANIM_BRINC}" AS brinco`,
        ANIM_DECISAO && `"${ANIM_DECISAO}" AS decisao`,
      ].filter(Boolean).join(', ');

      const whereA = [`"${ANIM_ID_COL}" IN (${ph})`];
      if (HAS_OWNER_ANIM && uid) { whereA.push(`owner_id = $${base.length + 1}`); base.push(uid); }

      const sqlA = `SELECT ${fieldsAnimal} FROM "${T_ANIM}" WHERE ${whereA.join(' AND ')}`;
      const { rows: arows } = await db.query(sqlA, base);

      const byId = new Map();
      for (const r of arows) {
        byId.set(String(r.id), {
          animal_id: r.id,
          numero: r.numero || null,
          brinco: r.brinco || null,
          decisao: (r.decisao == null || String(r.decisao).trim() === '') ? null : String(r.decisao).trim(),
          origem: 'animal',
          data: null,
          _explicit_clear: false,
        });
      }

      // 2) último evento DECISAO por animal (respeitando clear)
      const paramsE = [];
      const whereE = [`"${EVT_TIPO}"='DECISAO'`];
      whereE.push(`"${EVT_ANIM_COL}" IN (${idsReq.map((_,i)=>`$${i+1}`).join(',')})`);
      paramsE.push(...idsReq);
      if (HAS_OWNER_EVT && uid) { whereE.push(`owner_id=$${paramsE.length+1}`); paramsE.push(uid); }
      const orderE = `ORDER BY "${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', "created_at" DESC' : ''}`;

      const fieldsE = [
        `"${EVT_ANIM_COL}" AS animal_id`,
        `"${EVT_DATA}" AS data`,
        EVT_DETALHES && `"${EVT_DETALHES}" AS detalhes`,
        EVT_RESULT && `"${EVT_RESULT}" AS resultado`,
      ].filter(Boolean).join(', ');

      const sqlE = `SELECT ${fieldsE} FROM "${T_EVT}" WHERE ${whereE.join(' AND ')} ${orderE}`;
      const { rows: erows } = await db.query(sqlE, paramsE);

      for (const ev of erows) {
        const key = String(ev.animal_id);
        const existing = byId.get(key) || { animal_id: ev.animal_id, numero: null, brinco: null, decisao: null, origem:'none', data:null, _explicit_clear:false };

        // se já ficou travado por clear, não sustitui mais
        if (existing._explicit_clear) continue;
        // se já temos uma decisão não-vazia vinda do animals, mantém
        if (existing.decisao) continue;

        let dec = null;
        let cleared = false;
        if (EVT_DETALHES && ev.detalhes) {
          const v = ev.detalhes?.decisao ?? null;
          const s = v == null ? null : String(v).trim();
          dec = (!s || s === CLEAR_TOKEN) ? null : s;
          cleared = !!ev.detalhes?.cleared || s === CLEAR_TOKEN || s === '';
        } else if (EVT_RESULT) {
          const s = String(ev.resultado ?? '').trim();
          dec = (!s || s === CLEAR_TOKEN) ? null : s;
          cleared = (s === CLEAR_TOKEN || s === '');
        }

        byId.set(key, {
          ...existing,
          decisao: dec,
          origem: dec ? 'evento' : existing.origem,
          data: ev.data || existing.data,
          _explicit_clear: cleared || existing._explicit_clear,
        });
      }

      const items = idsReq.map(id => {
        const k = String(id);
        return byId.get(k) || { animal_id: id, numero: null, brinco: null, decisao: null, origem: 'none', data: null };
      });

      return res.json({ items });
    }

    // --- MODO 2: contrato antigo
    let limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 200) limit = 200;

    let dias = diasRaw == null ? null : parseInt(diasRaw, 10);
    if (!Number.isFinite(dias) || dias <= 0) dias = null;

    const where = [`e."${EVT_TIPO}" = 'DECISAO'`];
    const params = [];

    if (animalId) {
      params.push(animalId);
      where.push(`e."${EVT_ANIM_COL}" = $${params.length}`);
    }

    if (dias && dias > 0) {
      where.push(`e."${EVT_DATA}" >= (CURRENT_DATE - INTERVAL '${dias} days')`);
    }

    if (HAS_OWNER_EVT && uid) {
      params.push(uid);
      where.push(`e.owner_id = $${params.length}`);
    }

    const selectFields = [
      EVT_ID && `e."${EVT_ID}" AS id`,
      `e."${EVT_ANIM_COL}" AS animal_id`,
      `e."${EVT_DATA}" AS data`,
      EVT_DETALHES && `e."${EVT_DETALHES}" AS detalhes`,
      EVT_RESULT && `e."${EVT_RESULT}" AS resultado`,
      HAS_CREATED_EVT && `e."created_at"`,
      HAS_UPD_EVT && `e."updated_at"`,
      ANIM_NUM && `a."${ANIM_NUM}" AS numero`,
      ANIM_BRINC && `a."${ANIM_BRINC}" AS brinco`,
    ].filter(Boolean).join(', ');

    const joinAnimal = ANIM_ID_COL
      ? `LEFT JOIN "${T_ANIM}" a ON a."${ANIM_ID_COL}" = e."${EVT_ANIM_COL}"`
      : '';

    const sql = `
      SELECT ${selectFields}
        FROM "${T_EVT}" e
        ${joinAnimal}
       WHERE ${where.join(' AND ')}
    ORDER BY e."${EVT_DATA}" DESC ${HAS_CREATED_EVT ? ', e."created_at" DESC' : ''}
       LIMIT ${limit};
    `;

    const { rows } = await db.query(sql, params);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
}

router.post('/decisoes/ultimas', handlerUltimasDecisoes);
router.get('/decisoes/ultimas', handlerUltimasDecisoes);

export default router;
