// backend/resources/genetica.resource.js  (ESM)
import express from "express";
import db from "../dbx.js";
import { z } from "../validate.js";

const router = express.Router();

const T_TOURO = "genetica_touro";
const UUID_RX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/* ================= helpers ================= */
const _colsCache = new Map();
async function hasColumn(table, column) {
  const key = `${table}::${column}`;
  if (_colsCache.has(key)) return _colsCache.get(key);
  const { rows } = await db.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
      LIMIT 1
    `,
    [table, column]
  );
  const ok = !!rows?.length;
  _colsCache.set(key, ok);
  return ok;
}
function intNN(v, def = 0) {
  const n = Number(String(v ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function normalizeRow(row, hasStockNew, hasQuantidade) {
  // garante que o front sempre receba doses_* mesmo no legado
  const r = { ...row };
  const adq = hasStockNew ? r.doses_adquiridas : (hasQuantidade ? r.quantidade : 0);
  const rest = hasStockNew ? r.doses_restantes  : (hasQuantidade ? r.quantidade : 0);
  r.doses_adquiridas = intNN(adq, 0);
  r.doses_restantes  = intNN(rest, 0);
  return r;
}

/* ====== column discovery on boot ====== */
const HAS_UPDATED_AT   = await hasColumn(T_TOURO, "updated_at");
const HAS_DQ_ADQ       = await hasColumn(T_TOURO, "doses_adquiridas");
const HAS_DQ_RES       = await hasColumn(T_TOURO, "doses_restantes");
const HAS_QUANTIDADE   = await hasColumn(T_TOURO, "quantidade");
const HAS_STOCK_NEW    = HAS_DQ_ADQ && HAS_DQ_RES;

/* small helper for SET updated_at */
const setUpdatedSQL = HAS_UPDATED_AT ? ", updated_at = NOW()" : "";

/* ===========================
   GET /touros
   =========================== */
router.get("/touros", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const q = (req.query.q ?? "").toString().trim();

    const where = [];
    const params = [];

    if (q) {
      const i1 = params.push(`%${q}%`);
      const i2 = params.push(`%${q}%`);
      const i3 = params.push(`%${q}%`);
      where.push(
        `(COALESCE(nome,'') ILIKE $${i1} OR COALESCE(codigo,'') ILIKE $${i2} OR COALESCE(marca,'') ILIKE $${i3})`
      );
    }

    const iLimit = params.push(limit);
    const iOffset = params.push(offset);

    const sql = `
      SELECT *
      FROM ${T_TOURO}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY COALESCE(nome,'') ASC, id ASC
      LIMIT $${iLimit} OFFSET $${iOffset}
    `;
    const { rows } = await db.query(sql, params);
    return res.json(rows.map(r => normalizeRow(r, HAS_STOCK_NEW, HAS_QUANTIDADE)));
  } catch (err) {
    console.error("[genetica.resource] GET /touros:", err?.message, err);
    next(err);
  }
});

/* ===========================
   GET /touros/:id
   =========================== */
router.get("/touros/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RX.test(id)) {
      return res.status(400).json({ error: "BadId", message: "ID inválido" });
    }
    const { rows } = await db.query(`SELECT * FROM ${T_TOURO} WHERE id=$1 LIMIT 1`, [id]);
    if (!rows?.length) return res.status(404).json({ error: "NotFound" });
    return res.json(normalizeRow(rows[0], HAS_STOCK_NEW, HAS_QUANTIDADE));
  } catch (err) {
    console.error("[genetica.resource] GET /touros/:id:", err?.message, err);
    next(err);
  }
});

/* ===========================
   POST /touros
   - se doses_restantes vier vazio, espelha doses_adquiridas
   - se não há colunas novas, persiste em "quantidade"
   =========================== */
router.post("/touros", async (req, res, next) => {
  try {
    const raw = req.body || {};
    const nome  = String(raw.nome ?? "").trim();
    if (!nome) return res.status(400).json({ error: "ValidationError", detail: "Nome é obrigatório." });

    const codigo = String(raw.codigo ?? "").trim() || null;
    const ativo  = !!raw.ativo;
    const volume = numOrNull(raw.volume_dose);
    const marca  = String(raw.marca ?? "").trim() || null;
    const valor  = numOrNull(raw.valor_por_dose);

    const adqIn  = intNN(raw.doses_adquiridas, 0);
    const restIn = (raw.doses_restantes === "" || raw.doses_restantes == null) ? adqIn : intNN(raw.doses_restantes, 0);

    let cols = ["nome","codigo","ativo","volume_dose","marca","valor_por_dose"];
    let placeholders = ["$1","$2","$3","$4","$5","$6"];
    let values = [nome, codigo, ativo, volume, marca, valor];

    if (HAS_STOCK_NEW) {
      cols.push("doses_adquiridas","doses_restantes");
      placeholders.push("$7","$8");
      values.push(adqIn, restIn);
    } else if (HAS_QUANTIDADE) {
      cols.push("quantidade");
      placeholders.push("$7");
      values.push(restIn); // legado: usa quantidade como "restantes"
    }

    const sql = `
      INSERT INTO ${T_TOURO} (${cols.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *
    `;
    const { rows } = await db.query(sql, values);
    return res.status(201).json(normalizeRow(rows[0], HAS_STOCK_NEW, HAS_QUANTIDADE));
  } catch (err) {
    console.error("[genetica.resource] POST /touros:", err?.message, err);
    next(err);
  }
});

/* ===========================
   PUT /touros/:id  — com ajuste por Δ
   Regras:
   - Se vier doses_adquiridas e doses_restantes estiver em branco/ausente:
       restantes := restantes_atual + (nova_adquiridas - adquiridas_atual)
   - Se vier doses_restantes explícito e igual ao valor atual, e adquiridas mudou → aplicar Δ
   - Se vier doses_restantes explícito e diferente do atual → respeitar o informado
   - Compatível com modelo novo (doses_*) e legado (quantidade)
   =========================== */
router.put("/touros/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RX.test(id)) {
      return res.status(400).json({ error: "BadId", message: "ID inválido" });
    }

    // 1) Carrega estado atual (para calcular Δ)
    const curQ = await db.query(`SELECT * FROM ${T_TOURO} WHERE id=$1 LIMIT 1`, [id]);
    if (!curQ.rows?.length) return res.status(404).json({ error: "NotFound" });
    const currentRaw = curQ.rows[0];
    const current = normalizeRow(currentRaw, HAS_STOCK_NEW, HAS_QUANTIDADE);
    const curAdq  = current.doses_adquiridas ?? 0;
    const curRes  = current.doses_restantes  ?? 0;

    const raw = req.body || {};
    const sets = [];
    const params = [];
    let idx = 0;
    const pushSet = (col, val) => { params.push(val); sets.push(`${col} = $${++idx}`); };

    // campos "comuns"
    if (raw.nome !== undefined) {
      const v = String(raw.nome ?? "").trim(); if (v) pushSet("nome", v);
    }
    if (raw.codigo !== undefined) {
      const v = String(raw.codigo ?? "").trim(); pushSet("codigo", v || null);
    }
    if (raw.ativo !== undefined) pushSet("ativo", !!raw.ativo);
    if (raw.volume_dose !== undefined) { const n = numOrNull(raw.volume_dose); if (n !== null) pushSet("volume_dose", n); }
    if (raw.marca !== undefined) { const v = String(raw.marca ?? "").trim(); pushSet("marca", v || null); }
    if (raw.valor_por_dose !== undefined) { const n = numOrNull(raw.valor_por_dose); if (n !== null) pushSet("valor_por_dose", n); }

    // ===== estoque (com Δ quando apropriado) =====
    const hasAdqInBody     = raw.doses_adquiridas !== undefined;
    const adqNew           = hasAdqInBody ? intNN(raw.doses_adquiridas, 0) : curAdq;
    const restBlankLike    = raw.doses_restantes === "" || raw.doses_restantes == null;
    const hasRestInBody    = raw.doses_restantes !== undefined;
    const restNewExplicit  = hasRestInBody && !restBlankLike ? intNN(raw.doses_restantes, 0) : null;

    // grava adquiridas se veio (modelo novo)
    if (hasAdqInBody && HAS_STOCK_NEW) pushSet("doses_adquiridas", adqNew);

    const adqChanged = hasAdqInBody && adqNew !== curAdq;

    if (HAS_STOCK_NEW) {
      if (!hasRestInBody || restBlankLike) {
        if (adqChanged) {
          const newRest = Math.max(0, curRes + (adqNew - curAdq));
          pushSet("doses_restantes", newRest);
        }
      } else {
        if (adqChanged && restNewExplicit === curRes) {
          const newRest = Math.max(0, curRes + (adqNew - curAdq));
          pushSet("doses_restantes", newRest);
        } else {
          pushSet("doses_restantes", restNewExplicit);
        }
      }
    } else if (HAS_QUANTIDADE) {
      if (!hasRestInBody || restBlankLike) {
        if (adqChanged) {
          const newRest = Math.max(0, curRes + (adqNew - curAdq));
          pushSet("quantidade", newRest);
        }
      } else {
        if (adqChanged && restNewExplicit === curRes) {
          const newRest = Math.max(0, curRes + (adqNew - curAdq));
          pushSet("quantidade", newRest);
        } else {
          pushSet("quantidade", restNewExplicit);
        }
      }
    }

    if (HAS_UPDATED_AT) pushSet("updated_at", new Date());

    if (!sets.length) {
      // sem mudanças: devolve estado atual normalizado
      return res.json(normalizeRow(currentRaw, HAS_STOCK_NEW, HAS_QUANTIDADE));
    }

    params.push(id);
    const sql = `
      UPDATE ${T_TOURO}
      SET ${sets.join(", ")}
      WHERE id = $${++idx}
      RETURNING *
    `;
    const { rows } = await db.query(sql, params);
    return res.json(normalizeRow(rows[0], HAS_STOCK_NEW, HAS_QUANTIDADE));
  } catch (err) {
    console.error("[genetica.resource] PUT /touros/:id:", err?.message, err);
    next(err);
  }
});

/* ===========================
   POST /touros/:id/compra  { qtd:int>=1 }
   Soma adquiridas + restantes (ou quantidade no legado)
   =========================== */
router.post("/touros/:id/compra", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RX.test(id)) {
      return res.status(400).json({ error: "BadId", message: "ID inválido" });
    }
    const schema = z.object({ qtd: z.coerce.number().int().min(1) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "ValidationError", issues: parsed.error.issues });
    }
    const add = parsed.data.qtd;

    let sql, params;
    if (HAS_STOCK_NEW) {
      sql = `
        UPDATE ${T_TOURO}
        SET
          doses_adquiridas = COALESCE(doses_adquiridas, 0) + $1,
          doses_restantes  = COALESCE(doses_restantes,  0) + $1
          ${setUpdatedSQL}
        WHERE id = $2
        RETURNING *
      `;
      params = [add, id];
    } else if (HAS_QUANTIDADE) {
      sql = `
        UPDATE ${T_TOURO}
        SET quantidade = COALESCE(quantidade, 0) + $1
          ${setUpdatedSQL}
        WHERE id = $2
        RETURNING *
      `;
      params = [add, id];
    } else {
      return res.status(500).json({ error: "SchemaError", detail: "Tabela não possui colunas de estoque." });
    }

    const { rows } = await db.query(sql, params);
    if (!rows?.length) return res.status(404).json({ error: "NotFound" });
    return res.json(normalizeRow(rows[0], HAS_STOCK_NEW, HAS_QUANTIDADE));
  } catch (err) {
    console.error("[genetica.resource] POST /touros/:id/compra:", err?.message, err);
    next(err);
  }
});

/* ===========================
   DELETE /touros/:id
   =========================== */
router.delete("/touros/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RX.test(id)) {
      return res.status(400).json({ error: "BadId", message: "ID inválido" });
    }
    const { rowCount } = await db.query(`DELETE FROM ${T_TOURO} WHERE id=$1`, [id]);
    if (!rowCount) return res.status(404).json({ error: "NotFound" });
    return res.status(204).end();
  } catch (err) {
    console.error("[genetica.resource] DELETE /touros/:id:", err?.message, err);
    next(err);
  }
});

export default router;
