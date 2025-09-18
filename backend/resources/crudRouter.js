// backend/resources/crudRouter.js (ESM) — CRUD genérico, com logs e ZodError friendly
import express from 'express';

/* =============================================================================
 * Helpers
 * ========================================================================== */

// Extrai userId do token (sem verificar assinatura; mesmo helper dos resources)
function extractUserId(req) {
  const u = req.user || req.auth || {};
  let id = u.id || u.userId || req.userId || u.sub || null;
  if (!id) {
    const auth = req.headers?.authorization || '';
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    try {
      if (token) {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
        );
        id = payload.userId || payload.id || payload.sub || payload.uid || null;
      }
    } catch {}
  }
  return id;
}

// Normaliza respostas de erro (400 validação, 401 escopo, 409 conflito, 500 padrão)
// -> agora detecta ZodError, devolve issues "flatten" e loga no servidor
function respondError(res, err, fallback = 'Erro interno') {
  const isZod =
    err?.name === 'ZodError' ||
    Array.isArray(err?.issues) ||
    typeof err?.flatten === 'function';

  // Logs úteis (no servidor)
  if (isZod) {
    const flat = typeof err.flatten === 'function' ? err.flatten() : null;
    console.error('[VALIDATION] ZodError:', flat
      ? { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors }
      : err.issues || err);
  } else {
    // Log compacto de erros não-Zod
    const code = err?.code ? ` code=${err.code}` : '';
    console.error(`[ERROR] ${err?.message || fallback}${code}`);
    if (process.env.NODE_ENV !== 'production') {
      // Em dev, ajuda ver a stack
      if (err?.stack) console.error(err.stack);
    }
  }

  // Mapeia status
  const status =
    (isZod && 400) ||
    err?.statusCode ||
    err?.status ||
    (err?.code === '23505' ? 409 : 500);

  // Corpo da resposta
  if (isZod) {
    const flat = typeof err.flatten === 'function' ? err.flatten() : null;
    const body = flat
      ? { error: 'ValidationError', fieldErrors: flat.fieldErrors, formErrors: flat.formErrors }
      : { error: 'ValidationError', issues: err.issues };
    return res.status(400).json(body);
  }

  if (status === 401) return res.status(401).json({ error: 'Unauthorized' });
  if (status === 409) return res.status(409).json({ error: 'Conflict', detail: err?.detail || err?.message });

  return res.status(status).json({ error: err?.message || fallback });
}

/* =============================================================================
 * Fábrica de CRUD
 * ========================================================================== */

export function makeCrudRouter(cfg, db) {
  const router = express.Router();
  const q = (text, params) => db.query(text, params);

  const table = cfg.table;
  const idCol = cfg.id || 'id';
  const listFields = Array.isArray(cfg.listFields) && cfg.listFields.length ? cfg.listFields : ['*'];
  const searchFields = cfg.searchFields || [];
  const sortable = new Set([idCol, ...(cfg.sortable || [])]);
  const scope = cfg.scope || null; // { column?: 'owner_id', required?: true }

  function applyScope(where, params, req) {
    if (!scope) return;
    const col = scope.column || 'owner_id';
    const required = !!scope.required;
    const uid = extractUserId(req);
    if (required && !uid) {
      const e = new Error('Unauthorized');
      e.statusCode = 401;
      throw e;
    }
    if (uid) {
      where.push(`"${col}" = $${params.length + 1}`);
      params.push(uid);
    }
  }

  function formatField(field) {
    if (field == null) return null;
    if (typeof field === 'string') {
      const trimmed = field.trim();
      if (!trimmed) return null;
      if (trimmed === '*') return '*';
      if (/[\s()]/.test(trimmed) || trimmed.includes('"')) return trimmed;
      return `"${trimmed}"`;
    }
    if (Array.isArray(field)) {
      const base = formatField(field[0]);
      if (!base) return null;
      const alias = field[1];
      return alias ? `${base} AS "${alias}"` : base;
    }
    if (typeof field === 'object') {
      const alias = field.alias ?? field.as ?? null;
      if (field.raw != null) {
        const base = typeof field.raw === 'string' ? field.raw.trim() : String(field.raw);
        if (!base) return null;
        return alias ? `${base} AS "${alias}"` : base;
      }
      const expr = field.column ?? field.col ?? field.expr ?? field.expression;
      if (expr == null) return null;
      const base = typeof expr === 'string'
        ? ((/[\s()]/.test(expr) || expr.includes('"')) ? expr : '"' + expr + '"')
        : String(expr);
      return alias ? `${base} AS "${alias}"` : base;
    }
    return null;
  }

  function buildFieldsSql() {
    if (!listFields.length) return '*';
    if (listFields.some(f => typeof f === 'string' && f.trim() === '*')) return '*';
    const formatted = listFields.map(formatField).filter(Boolean);
    return formatted.length ? formatted.join(',') : '*';
  }

  // LIST
  router.get('/', async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10), 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 200);
      const offset = (page - 1) * limit;
      const qterm = String(req.query.q || '').trim();

      let sort = String(req.query.sort || 'created_at');
      let order = String(req.query.order || 'desc').toLowerCase();
      if (!sortable.has(sort)) sort = idCol;
      if (!['asc', 'desc'].includes(order)) order = 'desc';

      const fieldsSql = buildFieldsSql();

      const where = [];
      const params = [];

      if (qterm && searchFields.length) {
        const likeParts = searchFields.map((f) => {
          params.push(`%${qterm}%`);
          return `LOWER("${f}") LIKE LOWER($${params.length})`;
        });
        where.push(`(${likeParts.join(' OR ')})`);
      }

      applyScope(where, params, req);

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sqlItems = `
        SELECT ${fieldsSql}
        FROM "${table}"
        ${whereSql}
        ORDER BY "${sort}" ${order}
        LIMIT ${limit} OFFSET ${offset}
      `;
      const sqlCount = `
        SELECT COUNT(*)::int AS total
        FROM "${table}"
        ${whereSql}
      `;

      const [items, count] = await Promise.all([q(sqlItems, params), q(sqlCount, params)]);
      const total = count.rows?.[0]?.total || 0;
      const pages = Math.max(1, Math.ceil(total / limit));
      res.json({ items: items.rows || [], page, limit, total, pages, sort, order, q: qterm });
    } catch (err) {
      return respondError(res, err, 'Erro ao listar');
    }
  });

  // GET by id
  router.get('/:id', async (req, res) => {
    try {
      const where = [`"${idCol}" = $1`];
      const params = [req.params.id];
      applyScope(where, params, req);

      const fieldsSql = buildFieldsSql();

      const sql = `SELECT ${fieldsSql}
                   FROM "${table}"
                   WHERE ${where.join(' AND ')}
                   LIMIT 1`;
      const r = await q(sql, params);
      const item = r.rows?.[0] || null;
      if (!item) return res.status(404).json({ error: 'Não encontrado' });
      res.json(item);
    } catch (err) {
      return respondError(res, err, 'Erro ao buscar');
    }
  });

  // CREATE
  router.post('/', async (req, res) => {
    try {
      let body = req.body || {};

      // Validação (Zod) com resposta amigável
      if (typeof cfg.validateCreate === 'function') {
        try {
          body = cfg.validateCreate(body); // função pura (deve retornar objeto "limpo")
        } catch (e) {
          return respondError(res, e, 'Erro de validação');
        }
      }

      const defaults =
        typeof cfg.defaults === 'function'
          ? (cfg.defaults(req) || {})
          : (cfg.defaults || {});
      const record = { ...defaults, ...body };

      // Escopo obrigatório (ex.: owner_id)
      if (scope?.required) {
        const col = scope.column || 'owner_id';
        const uid = extractUserId(req);
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });
        record[col] = uid;
      }

      const cols = Object.keys(record);
      if (!cols.length) return res.status(400).json({ error: 'Corpo vazio' });

      const values = cols.map((_, i) => `$${i + 1}`);
      const params = cols.map(k => record[k]);

      const sql = `
        INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')})
        VALUES (${values.join(',')})
        RETURNING "${idCol}"
      `;
      const r = await q(sql, params);
      const newId = r.rows?.[0]?.[idCol];

      const fieldsSql = buildFieldsSql();

      const getSql = `SELECT ${fieldsSql}
                      FROM "${table}"
                      WHERE "${idCol}" = $1
                      LIMIT 1`;
      const g = await q(getSql, [newId]);
      res.status(201).json(g.rows?.[0] || { [idCol]: newId });
    } catch (err) {
      console.error('CREATE error:', err);
      return respondError(res, err, 'Erro ao criar');
    }
  });

  // UPDATE
  router.put('/:id', async (req, res) => {
    try {
      let body = req.body || {};

      // Validação (Zod) com resposta amigável
      if (typeof cfg.validateUpdate === 'function') {
        try {
          body = cfg.validateUpdate(body); // função pura (pode ser parcial)
        } catch (e) {
          return respondError(res, e, 'Erro de validação');
        }
      }

      const keys = Object.keys(body).filter(k => k !== idCol);
      if (!keys.length) return res.status(400).json({ error: 'Nada para atualizar' });

      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`);
      const params = keys.map(k => body[k]);

      let where = `"${idCol}" = $${params.length + 1}`;
      params.push(req.params.id);

      if (scope) {
        const col = scope.column || 'owner_id';
        const uid = extractUserId(req);
        if (scope.required && !uid) return res.status(401).json({ error: 'Unauthorized' });
        if (uid) {
          where += ` AND "${col}" = $${params.length + 1}`;
          params.push(uid);
        }
      }

      const sql = `UPDATE "${table}" SET ${sets.join(', ')} WHERE ${where} RETURNING "${idCol}"`;
      const r = await q(sql, params);
      if (!r.rowCount) return res.status(404).json({ error: 'Não encontrado' });

      const fieldsSql = buildFieldsSql();

      const getSql = `SELECT ${fieldsSql}
                      FROM "${table}"
                      WHERE "${idCol}" = $1
                      LIMIT 1`;
      const g = await q(getSql, [req.params.id]);
      res.json(g.rows?.[0] || { ok: true });
    } catch (err) {
      console.error('UPDATE error:', err);
      return respondError(res, err, 'Erro ao atualizar');
    }
  });

  // DELETE (hard)
  router.delete('/:id', async (req, res) => {
    try {
      const params = [req.params.id];
      let where = `"${idCol}" = $1`;

      if (scope) {
        const col = scope.column || 'owner_id';
        const uid = extractUserId(req);
        if (scope.required && !uid) return res.status(401).json({ error: 'Unauthorized' });
        if (uid) {
          where += ` AND "${col}" = $${params.length + 1}`;
          params.push(uid);
        }
      }

      const sql = `DELETE FROM "${table}" WHERE ${where} RETURNING "${idCol}"`;
      const r = await q(sql, params);
      if (!r.rowCount) return res.status(404).json({ error: 'Não encontrado' });
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE error:', err);
      return respondError(res, err, 'Erro ao excluir');
    }
  });

  return router;
}

export default makeCrudRouter;
