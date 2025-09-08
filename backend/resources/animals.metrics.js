// backend/resources/animals.metrics.js (ESM)
import express from 'express';
import db from '../dbx.js';

const router = express.Router();

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

async function getCols(table) {
  try {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [table]
    );
    return new Set(rows.map(r => r.column_name));
  } catch (e) {
    console.warn(`[animals.metrics] Falha ao introspectar ${table}:`, e?.message);
    return new Set();
  }
}

/** Monta expressão SQL que tenta converter a coluna de parto para DATE.
 * Aceita tipos DATE nativos, 'YYYY-MM-DD' e 'DD/MM/YYYY'. */
function partoDateExpr(col) {
  // Lado SQL: se for DATE já vai funcionar; se for TEXT, tentamos padrões comuns.
  // Usamos NULLIF para ignorar string vazia.
  return `
    CASE
      WHEN NULLIF("${col}"::text,'') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN to_date("${col}"::text,'YYYY-MM-DD')
      WHEN NULLIF("${col}"::text,'') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
        THEN to_date("${col}"::text,'DD/MM/YYYY')
      ELSE NULLIF("${col}"::date, NULL)
    END
  `;
}

/* ================= rota ================= */
// GET /api/v1/animals/metrics?days=30
router.get('/', async (req, res) => {
  try {
    const days = Math.max(parseInt(req.query.days || '30', 10), 1);

    // introspecção dinâmica
    const cols = await getCols('animals');
    if (!cols.size) {
      return res.status(500).json({ error: 'SchemaError', detail: 'Tabela "animals" não encontrada.' });
    }

    // multi-tenant (se houver owner_id)
    const HAS_OWNER = cols.has('owner_id');
    const uid = extractUserId(req);
    const baseWhere = [];
    const baseParams = [];
    if (HAS_OWNER) {
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      baseWhere.push(`owner_id = $1`);
      baseParams.push(uid);
    }
    const whereSQL = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';

    // -------- total de animais
    const total = (await db.query(
      `SELECT COUNT(*)::int AS c FROM animals ${whereSQL}`,
      baseParams
    )).rows[0].c;

    // -------- lactação ativas (tenta 'estado'; senão 'situacao_reprodutiva'; senão 0)
    let lactacao_ativas = 0;
    if (cols.has('estado')) {
      const sql = `SELECT COUNT(*)::int AS c FROM animals ${whereSQL}${whereSQL ? ' AND' : ' WHERE'} estado = 'lactacao'`;
      lactacao_ativas = (await db.query(sql, baseParams)).rows[0].c;
    } else if (cols.has('situacao_reprodutiva')) {
      const sql = `SELECT COUNT(*)::int AS c FROM animals ${whereSQL}${whereSQL ? ' AND' : ' WHERE'} situacao_reprodutiva = 'lactacao'`;
      lactacao_ativas = (await db.query(sql, baseParams)).rows[0].c;
    }

    // -------- média de DEL (days in milk) a partir da última data de parto
    // tenta colunas conhecidas em ordem
    const partoCols = ['parto', 'data_parto', 'ultimo_parto'].filter(c => cols.has(c));
    let media_del = 0;
    if (partoCols.length) {
      const pcol = partoCols[0];
      const pExpr = partoDateExpr(pcol);
      // subselect para evitar aplicar a expressão duas vezes
      const sql = `
        WITH base AS (
          SELECT ${pExpr} AS dt_parto
          FROM animals
          ${whereSQL}
        )
        SELECT COALESCE(ROUND(AVG( (current_date - dt_parto) )), 0)::int AS del
        FROM base
        WHERE dt_parto IS NOT NULL
      `;
      media_del = (await db.query(sql, baseParams)).rows[0].del || 0;
    }

    // -------- cadastrados nos últimos N dias
    const createdCols = ['created_at', 'dt_cadastro', 'data_cadastro'].filter(c => cols.has(c));
    let cadastrados_nd = 0;
    if (createdCols.length) {
      const ccol = createdCols[0];
      const sql = `
        SELECT COUNT(*)::int AS c
        FROM animals
        ${whereSQL}
        ${whereSQL ? ' AND' : ' WHERE'} "${ccol}" >= now() - ($${baseParams.length + 1} || ' days')::interval
      `;
      const params = HAS_OWNER ? [uid, days] : [days];
      cadastrados_nd = (await db.query(sql, params)).rows[0].c;
    }

    // -------- top 10 por raça (ou breed)
    const racaCol = cols.has('raca') ? 'raca' : (cols.has('breed') ? 'breed' : null);
    let por_raca = [];
    if (racaCol) {
      const sql = `
        SELECT COALESCE("${racaCol}", '(sem raça)') AS raca, COUNT(*)::int AS qtd
        FROM animals
        ${whereSQL}
        GROUP BY 1
        ORDER BY qtd DESC
        LIMIT 10
      `;
      por_raca = (await db.query(sql, baseParams)).rows;
    }

    return res.json({
      cards: {
        total_animais: total,
        lactacao_ativas,
        media_del,
        cadastrados_ultimos_dias: { dias: days, total: cadastrados_nd },
      },
      tables: { por_raca },
      // opcional para debug:
      // debug: { cols: Array.from(cols), owner_scoped: HAS_OWNER }
    });
  } catch (e) {
    console.error('[animals.metrics] falhou:', e);
    res.status(500).json({ error: 'InternalError', detail: e?.message || 'unknown' });
  }
});

export default router;
