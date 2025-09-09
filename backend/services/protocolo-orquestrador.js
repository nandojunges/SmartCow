// backend/services/protocolo-orquestrador.js (ESM)
import db from "../dbx.js";

/** helpers */
const ISO = (d) => (d instanceof Date ? d.toISOString() : new Date(d || Date.now()).toISOString());
function toISODateString(s) {
  const v = String(s || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error("Data inválida (use YYYY-MM-DD ou DD/MM/AAAA)");
}

async function getCols(table) {
  try {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [table]
    );
    return new Set(rows.map((r) => String(r.column_name)));
  } catch {
    return new Set();
  }
}
const pickIdCol = (cols) => (cols.has("id") ? "id" : cols.has("uuid") ? "uuid" : null);
function findCol(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  const lower = new Set([...cols].map((c) => c.toLowerCase()));
  for (const c of candidates) if (lower.has(String(c).toLowerCase())) return c;
  return null;
}

/** tabelas */
const T_PROTO = "repro_protocolo";
const T_EVT = "repro_evento";
const T_ANIM = "animals";

/** introspecção */
const PROTO_COLS = await getCols(T_PROTO);
const EVT_COLS = await getCols(T_EVT);
const ANIM_COLS = await getCols(T_ANIM);

const HAS_OWNER_PROTO = PROTO_COLS.has("owner_id");
const HAS_OWNER_EVT = EVT_COLS.has("owner_id");
const HAS_OWNER_ANIM = ANIM_COLS.has("owner_id");

const HAS_UPD_EVT = EVT_COLS.has("updated_at");
const HAS_CREATED_EVT = EVT_COLS.has("created_at");
const HAS_UPD_ANIM = ANIM_COLS.has("updated_at");

const PROTO_ID = pickIdCol(PROTO_COLS);
const PROTO_NOME = findCol(PROTO_COLS, ["nome"]);
const PROTO_TIPO = findCol(PROTO_COLS, ["tipo"]);
const PROTO_ETAPAS = findCol(PROTO_COLS, ["etapas"]);

const EVT_ANIM_COL = findCol(EVT_COLS, ["animal_id", "cow_id"]);
const EVT_DATA = findCol(EVT_COLS, ["data", "dia"]);
const EVT_TIPO = findCol(EVT_COLS, ["tipo"]);
const EVT_DETALHES = findCol(EVT_COLS, ["detalhes"]);
const EVT_PROTO_ID = findCol(EVT_COLS, ["protocolo_id"]);
const EVT_APLIC_ID = findCol(EVT_COLS, ["aplicacao_id"]);

const ANIM_ID_COL = findCol(ANIM_COLS, ["id", "animal_id", "uuid"]);
const ANIM_SIT_REP = findCol(ANIM_COLS, [
  "situacao_reprodutiva",
  "sit_reprodutiva",
  "status_reprodutivo",
  "situacao_rep",
  "situacao_repro",
  "estado",
]);
const ANIM_PROTO_ATUAL = findCol(ANIM_COLS, [
  "protocolo_id_atual",
  "protocoloAtualId",
  "protocolo_atual_id",
  "protocolo_atual",
  "protocoloAtual",
  "protocolo_ativo",
  "protocoloAtivo",
]);
const ANIM_APLIC_ATUAL = findCol(ANIM_COLS, [
  "aplicacao_id_atual",
  "aplicacaoAtualId",
  "aplicacao_atual_id",
  "aplicacao_atual",
  "aplicacaoAtual",
]);

/** atualizar animals (ponteiros + situação reprodutiva) */
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
    if (protocoloAtualId === null) sets.push(`"${ANIM_PROTO_ATUAL}" = NULL`);
    else {
      sets.push(`"${ANIM_PROTO_ATUAL}" = $${params.length + 1}`);
      params.push(String(protocoloAtualId));
    }
  }
  if (ANIM_APLIC_ATUAL && aplicacaoAtualId !== undefined) {
    if (aplicacaoAtualId === null) sets.push(`"${ANIM_APLIC_ATUAL}" = NULL`);
    else {
      sets.push(`"${ANIM_APLIC_ATUAL}" = $${params.length + 1}`);
      params.push(String(aplicacaoAtualId));
    }
  }
  if (HAS_UPD_ANIM) sets.push(`"updated_at" = NOW()`);
  if (!sets.length) return;

  const where = [`"${ANIM_ID_COL}" = $${params.length + 1}`];
  params.push(animalId);
  if (HAS_OWNER_ANIM && ownerId) {
    where.push(`"owner_id" = $${params.length + 1}`);
    params.push(ownerId);
  }

  const sql = `UPDATE "${T_ANIM}" SET ${sets.join(", ")} WHERE ${where.join(" AND ")}`;
  await runner.query(sql, params);
}

/** Serviço: aplicar protocolo (transacional) */
async function aplicarProtocoloTx({ protocoloId, animais, dataInicio, ownerId, detalhesComuns }) {
  let client;
  try {
    client = await db.connect();
    await client.query("BEGIN");

    // carrega protocolo
    const whereP = [`"${PROTO_ID}" = $1`];
    const paramsP = [protocoloId];
    if (HAS_OWNER_PROTO && ownerId) {
      whereP.push(`owner_id = $2`);
      paramsP.push(ownerId);
    }
    const sqlP = `SELECT * FROM "${T_PROTO}" WHERE ${whereP.join(" AND ")} LIMIT 1`;
    const { rows: pr } = await client.query(sqlP, paramsP);
    const proto = pr[0];
    if (!proto) throw new Error("Protocolo não encontrado");

    // etapas
    let etapas = PROTO_ETAPAS ? proto[PROTO_ETAPAS] : [];
    if (typeof etapas === "string") {
      try {
        etapas = JSON.parse(etapas);
      } catch {
        etapas = [];
      }
    }
    if (!Array.isArray(etapas) || !etapas.length) throw new Error("Protocolo sem etapas");

    // tipo -> label de situação
    const tipoProto = String((PROTO_TIPO && proto[PROTO_TIPO]) || "").toUpperCase();
    const sitLabel = tipoProto === "IATF" ? "IATF" : "Pré-sincronização";

    // gera aplicacao_id (se houver coluna)
    let aplicacao_id = null;
    if (EVT_APLIC_ID) {
      const { rows: r } = await client.query(`SELECT gen_random_uuid() AS id`);
      aplicacao_id = r[0]?.id || null;
    }

    const inicioISO = toISODateString(dataInicio);
    const inicio = new Date(inicioISO);
    const created = [];

    for (const animalId of animais) {
      // Limpa etapas futuras do mesmo animal a partir do novo início
      if (EVT_TIPO && EVT_DATA && EVT_ANIM_COL) {
        const whereDel = [
          `"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`,
          `"${EVT_ANIM_COL}" = $1`,
          `"${EVT_DATA}" >= $2`,
        ];
        const paramsDel = [animalId, inicioISO];
        if (HAS_OWNER_EVT && ownerId) {
          whereDel.push(`owner_id = $3`);
          paramsDel.push(ownerId);
        }
        await client.query(`DELETE FROM "${T_EVT}" WHERE ${whereDel.join(" AND ")}`, paramsDel);
      }

      // insere novas etapas
      for (const e of etapas) {
        const d = new Date(inicio);
        d.setDate(d.getDate() + Number(e?.dia || 0));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const dataEtapa = `${yyyy}-${mm}-${dd}`;

        const detalhes = {
          ...(detalhesComuns || {}),
          ...(e || {}),
          origem_protocolo: PROTO_NOME ? proto[PROTO_NOME] || null : null,
        };

        const cols = [];
        const vals = [];
        const params = [];
        if (EVT_ANIM_COL) {
          cols.push(`"${EVT_ANIM_COL}"`);
          params.push(animalId);
          vals.push(`$${params.length}`);
        }
        if (EVT_DATA) {
          cols.push(`"${EVT_DATA}"`);
          params.push(dataEtapa);
          vals.push(`$${params.length}`);
        }
        if (EVT_TIPO) {
          cols.push(`"${EVT_TIPO}"`);
          params.push("PROTOCOLO_ETAPA");
          vals.push(`$${params.length}`);
        }
        if (EVT_DETALHES) {
          cols.push(`"${EVT_DETALHES}"`);
          params.push(JSON.stringify(detalhes));
          vals.push(`$${params.length}::jsonb`);
        }
        if (EVT_PROTO_ID) {
          cols.push(`"${EVT_PROTO_ID}"`);
          params.push(protocoloId);
          vals.push(`$${params.length}`);
        }
        if (EVT_APLIC_ID && aplicacao_id) {
          cols.push(`"${EVT_APLIC_ID}"`);
          params.push(aplicacao_id);
          vals.push(`$${params.length}`);
        }
        if (HAS_OWNER_EVT && ownerId) {
          cols.push("owner_id");
          params.push(ownerId);
          vals.push(`$${params.length}`);
        }
        if (HAS_UPD_EVT) {
          cols.push("updated_at");
          vals.push("NOW()");
        }
        if (HAS_CREATED_EVT) {
          cols.push("created_at");
          vals.push("NOW()");
        }

        const sql = `INSERT INTO "${T_EVT}" (${cols.join(", ")}) VALUES (${vals.join(", ")}) RETURNING *`;
        const { rows } = await client.query(sql, params);
        created.push(rows[0]);
      }

      // atualiza ponteiros do animal
      await atualizarAnimalCampos({
        client,
        animalId,
        ownerId,
        situacaoReprodutiva: ANIM_SIT_REP ? sitLabel : null,
        protocoloAtualId: ANIM_PROTO_ATUAL ? protocoloId : undefined,
        aplicacaoAtualId: ANIM_APLIC_ATUAL ? aplicacao_id : undefined,
      });
    }

    await client.query("COMMIT");
    return { aplicacao_id, eventos: created };
  } catch (e) {
    try {
      await client?.query?.("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client?.release?.();
  }
}

/** Serviço: encerrar aplicação (deleta etapas + limpa ponteiros) */
async function encerrarAplicacaoTx({ aplicacaoId, ownerId }) {
  if (!EVT_APLIC_ID) throw new Error("Tabela de eventos não possui aplicacao_id");

  // animais afetados
  const paramsSel = [aplicacaoId];
  let selSQL = `SELECT DISTINCT "${EVT_ANIM_COL}" AS animal_id FROM "${T_EVT}" WHERE "${EVT_APLIC_ID}" = $1`;
  if (HAS_OWNER_EVT && ownerId) {
    selSQL += ` AND owner_id = $2`;
    paramsSel.push(ownerId);
  }
  const { rows: afetados } = await db.query(selSQL, paramsSel);

  // deletar eventos
  const where = [`"${EVT_APLIC_ID}" = $1`];
  const params = [aplicacaoId];
  if (HAS_OWNER_EVT && ownerId) {
    where.push(`owner_id = $2`);
    params.push(ownerId);
  }
  await db.query(`DELETE FROM "${T_EVT}" WHERE ${where.join(" AND ")}`, params);

  // limpar ponteiros
  if ((ANIM_PROTO_ATUAL || ANIM_APLIC_ATUAL) && afetados.length) {
    for (const r of afetados) {
      await atualizarAnimalCampos({
        animalId: r.animal_id,
        ownerId,
        protocoloAtualId: ANIM_PROTO_ATUAL ? null : undefined,
        aplicacaoAtualId: ANIM_APLIC_ATUAL ? null : undefined,
      });
    }
  }

  return { ok: true, animais_afetados: afetados.length };
}

/** Serviço: coletar vínculos de um protocolo (com status=ATIVO/ref_date) */
async function coletarVinculos({ protocoloId, ownerId, status, ref_date }) {
  // carrega protocolo p/ obter último dia (max etapa.dia)
  const whereP = [`"${PROTO_ID}" = $1`];
  const paramsP = [protocoloId];
  if (HAS_OWNER_PROTO && ownerId) {
    whereP.push(`owner_id = $2`);
    paramsP.push(ownerId);
  }
  const sqlP = `SELECT * FROM "${T_PROTO}" WHERE ${whereP.join(" AND ")} LIMIT 1`;
  const { rows: pr } = await db.query(sqlP, paramsP);
  const proto = pr[0];
  if (!proto) throw new Error("Protocolo não encontrado");

  let etapas = PROTO_ETAPAS ? proto[PROTO_ETAPAS] : [];
  if (typeof etapas === "string") {
    try {
      etapas = JSON.parse(etapas);
    } catch {
      etapas = [];
    }
  }
  const ultimoDia = Array.isArray(etapas)
    ? etapas.reduce((mx, e) => {
        const d = Number(e?.dia ?? 0);
        return Number.isFinite(d) ? Math.max(mx, d) : mx;
      }, 0)
    : 0;

  if (!EVT_ANIM_COL || !EVT_DATA || !EVT_TIPO || !EVT_PROTO_ID)
    return { items: [], meta: { ultimoDia, ref_date: null } };

  const params = [protocoloId];
  const whereEvt = [`"${EVT_TIPO}" = 'PROTOCOLO_ETAPA'`, `"${EVT_PROTO_ID}" = $1`];
  if (HAS_OWNER_EVT && ownerId) {
    params.push(ownerId);
    whereEvt.push(`owner_id = $${params.length}`);
  }

  let appsSQL = `
    WITH apps AS (
      SELECT "${EVT_ANIM_COL}" AS animal_id, MIN("${EVT_DATA}") AS data_inicio
        FROM "${T_EVT}"
       WHERE ${whereEvt.join(" AND ")}
       GROUP BY "${EVT_ANIM_COL}"
    )
    SELECT apps.animal_id, apps.data_inicio
  `;
  if (ANIM_ID_COL) {
    const ANIM_NUM = findCol(ANIM_COLS, ["numero", "num", "number", "identificador"]);
    const ANIM_BRINC = findCol(ANIM_COLS, ["brinco", "ear_tag", "earTag", "brinc"]);
    appsSQL += `,
           ${ANIM_NUM ? `a."${ANIM_NUM}" AS numero` : "NULL AS numero"},
           ${ANIM_BRINC ? `a."${ANIM_BRINC}" AS brinco` : "NULL AS brinco"}
      FROM apps
 LEFT JOIN "${T_ANIM}" a ON a."${ANIM_ID_COL}" = apps.animal_id
     ${HAS_OWNER_ANIM && ownerId ? `AND a.owner_id = $${(params.push(ownerId), params.length)}` : ""}
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

  const wantsAtivo = String(status || "").toUpperCase() === "ATIVO";
  const refISO = (() => {
    const q = String(ref_date || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  const items = rows
    .map((r) => ({
      animal_id: r.animal_id,
      numero: r.numero ?? null,
      brinco: r.brinco ?? null,
      data_inicio: r.data_inicio,
    }))
    .filter((it) => {
      if (!wantsAtivo) return true;
      if (!it?.data_inicio) return false;
      const di = new Date(it.data_inicio);
      const fim = new Date(di);
      fim.setDate(fim.getDate() + (Number.isFinite(ultimoDia) ? ultimoDia : 0));
      return new Date(refISO) <= fim;
    });

  return { items, meta: { ultimoDia, ref_date: refISO } };
}

export default {
  aplicarProtocoloTx,
  encerrarAplicacaoTx,
  coletarVinculos, // lista animais vinculados a um protocolo
};
