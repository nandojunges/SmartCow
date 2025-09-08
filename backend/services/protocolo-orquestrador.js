// backend/services/protocolo-orquestrador.js (ESM)
import db from '../dbx.js';

/* ============== helpers comuns ============== */
function toISODateString(s) {
  const v = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error('Data inválida (use YYYY-MM-DD ou DD/MM/AAAA)');
}
async function getCols(table) {
  try {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [table]
    );
    return new Set(rows.map(r => String(r.column_name)));
  } catch { return new Set(); }
}
const pickIdCol = (cols) => (cols.has('id') ? 'id' : (cols.has('uuid') ? 'uuid' : null));
function findCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  const lower = new Set([...cols].map(c => c.toLowerCase()));
  for (const c of candidates) if (lower.has(String(c).toLowerCase())) return c;
  return null;
}

/* ============== tabelas & introspecção ============== */
const T_PROTO = 'repro_protocolo';
const T_EVT   = 'repro_evento';
const T_ANIM  = 'animals';

const PROTO_COLS = await getCols(T_PROTO);
const EVT_COLS   = await getCols(T_EVT);
const ANIM_COLS  = await getCols(T_ANIM);

const HAS_OWNER_PROTO = PROTO_COLS.has('owner_id');
const HAS_OWNER_EVT   = EVT_COLS.has('owner_id');
const HAS_OWNER_ANIM  = ANIM_COLS.has('owner_id');

const HAS_UPD_EVT     = EVT_COLS.has('updated_at');
const HAS_UPD_ANIM    = ANIM_COLS.has('updated_at');
const HAS_CREATED_EVT = EVT_COLS.has('created_at');

const PROTO_ID    = pickIdCol(PROTO_COLS);
const PROTO_NOME  = findCol(PROTO_COLS, ['nome']);
const PROTO_TIPO  = findCol(PROTO_COLS, ['tipo']);
const PROTO_ETAPAS= findCol(PROTO_COLS, ['etapas']);

const EVT_ID       = pickIdCol(EVT_COLS);
const EVT_ANIM_COL = findCol(EVT_COLS, ['animal_id','cow_id']);
const EVT_DATA     = findCol(EVT_COLS, ['data','dia']);
const EVT_TIPO     = findCol(EVT_COLS, ['tipo']);
const EVT_DETALHES = findCol(EVT_COLS, ['detalhes']);
const EVT_RESULT   = findCol(EVT_COLS, ['resultado']);
const EVT_PROTO_ID = findCol(EVT_COLS, ['protocolo_id']);
const EVT_APLIC_ID = findCol(EVT_COLS, ['aplicacao_id']);

const ANIM_ID_COL     = findCol(ANIM_COLS, ['id','animal_id','uuid']);
const ANIM_SIT_REP    = findCol(ANIM_COLS, ['situacao_reprodutiva','sit_reprodutiva','status_reprodutivo','situacao_rep','situacao_repro','estado']);
const ANIM_PROTO_ATUAL= findCol(ANIM_COLS, ['protocolo_id_atual','protocoloAtualId','protocolo_atual_id','protocolo_atual','protocoloAtual','protocolo_ativo','protocoloAtivo']);
const ANIM_APLIC_ATUAL= findCol(ANIM_COLS, ['aplicacao_id_atual','aplicacaoAtualId','aplicacao_atual_id','aplicacao_atual','aplicacaoAtual']);

/* ============== atualiza animal (ponteiros/estado) ============== */
async function atualizarAnimalCampos({ client, animalId, ownerId, situacaoReprodutiva, protocoloAtualId, aplicacaoAtualId }) {
  if (!ANIM_ID_COL) return;
  const runner = client || db;
  const sets = [];
  const params = [];

  if (ANIM_SIT_REP && situacaoReprodutiva) {
    sets.push(`"${ANIM_SIT_REP}" = $${params.length + 1}`);
    params.push(situacaoReprodutiva);
  }
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
  if (HAS_OWNER_ANIM && ownerId) { where.push(`owner_id = $${params.length + 1}`); params.push(ownerId); }

  const sql = `UPDATE "${T_ANIM}" SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`;
  await runner.query(sql, params);
}

/* ============== núcleo: aplicar protocolo (TX) ============== */
async function _carregarProtocolo(client, { protocoloId, ownerId }) {
  const where = [`"${PROTO_ID}" = $1`];
  const params = [protocoloId];
  if (HAS_OWNER_PROTO && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }
  const sql = `SELECT * FROM "${T_PROTO}" WHERE ${where.join(' AND ')} LIMIT 1`;
  const { rows } = await client.query(sql, params);
  const proto = rows[0];
  if (!proto) throw new Error('Protocolo não encontrado');
  let etapas = proto[PROTO_ETAPAS] || [];
  if (typeof etapas === 'string') { try { etapas = JSON.parse(etapas); } catch { etapas = []; } }
  if (!Array.isArray(etapas) || !etapas.length) throw new Error('Protocolo sem etapas');
  const nome = PROTO_NOME ? (proto[PROTO_NOME] || null) : null;
  const tipo = (PROTO_TIPO ? String(proto[PROTO_TIPO] || '') : '').toUpperCase();
  return { etapas, nome, tipo };
}

function _calcSitReprod(tipoProto) {
  return (tipoProto === 'IATF') ? 'IATF' : 'Pré-sincronização';
}

async function aplicarProtocoloTx(client, {
  protocoloId, animais, dataInicio, detalhesComuns, ownerId,
}) {
  if (!EVT_TIPO || !EVT_DATA || !EVT_ANIM_COL) throw new Error('Tabela de eventos incompleta');

  const { etapas, nome, tipo } = await _carregarProtocolo(client, { protocoloId, ownerId });
  const sitReprod = _calcSitReprod(tipo);

  // gera aplicacao_id no banco (pgcrypto)
  const { rows: r } = await client.query(`SELECT gen_random_uuid() AS id`);
  const aplicacao_id = r[0]?.id;

  const inicioISO = toISODateString(dataInicio);
  const inicio = new Date(inicioISO);
  const created = [];

  for (const animalId of animais) {
    // limpa etapas futuras a partir do início
    {
      const where = [
        `"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`,
        `"${EVT_ANIM_COL}" = $1`,
        `"${EVT_DATA}" >= $2`,
      ];
      const ps = [animalId, inicioISO];
      if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $3`); ps.push(ownerId); }
      await client.query(`DELETE FROM "${T_EVT}" WHERE ${where.join(' AND ')}`, ps);
    }

    // cria novas etapas
    for (const e of etapas) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + Number(e?.dia || 0));
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dataEtapa = `${yyyy}-${mm}-${dd}`;

      const detalhes = { ...(detalhesComuns || {}), ...(e || {}), origem_protocolo: nome };

      const cols = [], vals = [], params = [];
      cols.push(`"${EVT_ANIM_COL}"`); params.push(animalId); vals.push(`$${params.length}`);
      cols.push(`"${EVT_DATA}"`);     params.push(dataEtapa); vals.push(`$${params.length}`);
      cols.push(`"${EVT_TIPO}"`);     params.push('PROTOCOLO_ETAPA'); vals.push(`$${params.length}`);
      if (EVT_DETALHES) { cols.push(`"${EVT_DETALHES}"`); params.push(JSON.stringify(detalhes)); vals.push(`$${params.length}::jsonb`); }
      if (EVT_PROTO_ID) { cols.push(`"${EVT_PROTO_ID}"`); params.push(protocoloId); vals.push(`$${params.length}`); }
      if (EVT_APLIC_ID) { cols.push(`"${EVT_APLIC_ID}"`); params.push(aplicacao_id); vals.push(`$${params.length}`); }
      if (HAS_OWNER_EVT){ cols.push('owner_id'); params.push(ownerId); vals.push(`$${params.length}`); }
      if (HAS_UPD_EVT)  { cols.push('updated_at'); vals.push('NOW()'); }
      if (HAS_CREATED_EVT) { cols.push('created_at'); vals.push('NOW()'); }

      const sql = `INSERT INTO "${T_EVT}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`;
      const { rows } = await client.query(sql, params);
      created.push(rows[0]);
    }

    // atualiza ponteiros e status no animal
    await atualizarAnimalCampos({
      client, animalId, ownerId,
      situacaoReprodutiva: ANIM_SIT_REP ? sitReprod : undefined,
      protocoloAtualId: ANIM_PROTO_ATUAL ? protocoloId : undefined,
      aplicacaoAtualId: ANIM_APLIC_ATUAL ? aplicacao_id : undefined,
    });
  }

  return { aplicacao_id, eventos: created };
}

async function aplicarProtocolo({ protocoloId, animais, dataInicio, detalhesComuns, ownerId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await aplicarProtocoloTx(client, { protocoloId, animais, dataInicio, detalhesComuns, ownerId });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/* ============== encerrar aplicação ============== */
async function encerrarAplicacaoTx(client, { aplicacaoId, ownerId }) {
  if (!EVT_APLIC_ID) throw new Error('Tabela de eventos não possui aplicacao_id');

  // animais afetados
  const paramsSel = [aplicacaoId];
  let selSQL = `SELECT DISTINCT "${EVT_ANIM_COL}" AS animal_id FROM "${T_EVT}" WHERE "${EVT_APLIC_ID}" = $1`;
  if (HAS_OWNER_EVT && ownerId) { selSQL += ` AND owner_id = $2`; paramsSel.push(ownerId); }
  const { rows: afetados } = await client.query(selSQL, paramsSel);

  // apaga eventos
  const where = [`"${EVT_APLIC_ID}" = $1`];
  const params = [aplicacaoId];
  if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }
  await client.query(`DELETE FROM "${T_EVT}" WHERE ${where.join(' AND ')}`, params);

  // limpa ponteiros
  if ((ANIM_PROTO_ATUAL || ANIM_APLIC_ATUAL) && afetados.length) {
    for (const r of afetados) {
      await atualizarAnimalCampos({
        client, animalId: r.animal_id, ownerId,
        protocoloAtualId: ANIM_PROTO_ATUAL ? null : undefined,
        aplicacaoAtualId: ANIM_APLIC_ATUAL ? null : undefined,
      });
    }
  }
  return { ok: true, animais_afetados: afetados.length };
}

async function encerrarAplicacao({ aplicacaoId, ownerId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await encerrarAplicacaoTx(client, { aplicacaoId, ownerId });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/* ============== obter aplicação ativa (inferida) ============== */
async function obterAplicacaoAtiva({ animalId, refDateISO, ownerId }) {
  if (!EVT_ANIM_COL || !EVT_DATA || !EVT_TIPO) return null;
  const refISO = refDateISO ? toISODateString(refDateISO) : toISODateString(new Date().toISOString().slice(0,10));
  const params = [animalId];
  const where = [
    `"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`,
    `"${EVT_ANIM_COL}" = $1`,
  ];
  if (HAS_OWNER_EVT && ownerId) { where.push(`owner_id = $2`); params.push(ownerId); }

  const sql = `
    SELECT ${EVT_APLIC_ID ? `"${EVT_APLIC_ID}"` : 'NULL'} AS aplicacao_id,
           MIN("${EVT_DATA}") AS inicio,
           MAX("${EVT_DATA}") AS fim
      FROM "${T_EVT}"
     WHERE ${where.join(' AND ')}
  ${EVT_APLIC_ID ? ` GROUP BY "${EVT_APLIC_ID}"` : ''}
     ORDER BY MAX("${EVT_DATA}") DESC
     LIMIT 5
  `;
  const { rows } = await db.query(sql, params);
  const ref = new Date(refISO);
  for (const r of rows) {
    const fim = new Date(r.fim);
    const ini = new Date(r.inicio);
    if (ref >= ini && ref <= fim) return { aplicacao_id: r.aplicacao_id || null, inicio: r.inicio, fim: r.fim };
  }
  return null;
}

/* ============== vinculações por protocolo (mesmo shape do seu endpoint) ============== */
async function coletarVinculos({ protocoloId, status, refDateISO, ownerId }) {
  if (!protocoloId || !EVT_TIPO || !EVT_DATA || !EVT_PROTO_ID || !EVT_ANIM_COL) return { items: [], meta: { ultimoDia: 0, ref_date: null } };

  // carrega protocolo p/ descobrir último dia
  const client = await db.connect();
  try {
    const { etapas } = await _carregarProtocolo(client, { protocoloId, ownerId });
    const ultimoDia = etapas.reduce((mx, e) => {
      const d = Number(e?.dia ?? 0);
      return Number.isFinite(d) ? Math.max(mx, d) : mx;
    }, 0);

    const params = [protocoloId];
    const whereEvt = [`"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`, `"${EVT_PROTO_ID}" = $1`];
    if (HAS_OWNER_EVT && ownerId) { whereEvt.push(`owner_id = $2`); params.push(ownerId); }

    const sql = `
      WITH apps AS (
        SELECT "${EVT_ANIM_COL}" AS animal_id, MIN("${EVT_DATA}") AS data_inicio
          FROM "${T_EVT}"
         WHERE ${whereEvt.join(' AND ')}
         GROUP BY "${EVT_ANIM_COL}"
      )
      SELECT apps.animal_id, apps.data_inicio
        FROM apps
      ORDER BY apps.data_inicio DESC
    `;
    const { rows } = await client.query(sql, params);

    const refISO = refDateISO ? toISODateString(refDateISO) : new Date().toISOString().slice(0,10);
    const wantsAtivo = String(status || '').toUpperCase() === 'ATIVO';

    const items = rows.filter(it => {
      if (!wantsAtivo) return true;
      const di = new Date(it.data_inicio);
      const fim = new Date(di);
      fim.setDate(fim.getDate() + (Number.isFinite(ultimoDia) ? ultimoDia : 0));
      return new Date(refISO) <= fim;
    });

    return { items, meta: { ultimoDia, ref_date: refISO } };
  } finally {
    client.release();
  }
}

/* ============== listar etapas por período (calendário) ============== */
async function listarEtapasPorPeriodo({ startISO, endISO, protocoloId, ownerId }) {
  if (!EVT_DATA || !EVT_TIPO) return { items: [] };
  const where = [`"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`];
  const params = [];
  if (startISO && endISO) { where.push(`"${EVT_DATA}" BETWEEN $${params.length+1} AND $${params.length+2}`); params.push(startISO, endISO); }
  else if (startISO)      { where.push(`"${EVT_DATA}" >= $${params.length+1}`); params.push(startISO); }
  else if (endISO)        { where.push(`"${EVT_DATA}" <= $${params.length+1}`); params.push(endISO); }
  if (EVT_PROTO_ID && protocoloId) { where.push(`"${EVT_PROTO_ID}" = $${params.length+1}`); params.push(protocoloId); }
  if (HAS_OWNER_EVT && ownerId)    { where.push(`owner_id = $${params.length+1}`); params.push(ownerId); }

  const sql = `SELECT * FROM "${T_EVT}" WHERE ${where.join(' AND ')} ORDER BY "${EVT_DATA}" ASC ${HAS_CREATED_EVT ? ', "created_at" ASC' : ''}`;
  const { rows } = await db.query(sql, params);
  return { items: rows };
}

export {
  aplicarProtocoloTx,
  aplicarProtocolo,
  encerrarAplicacaoTx,
  encerrarAplicacao,
  obterAplicacaoAtiva,
  coletarVinculos,
  listarEtapasPorPeriodo,
  toISODateString, // útil se quiser reaproveitar
};
