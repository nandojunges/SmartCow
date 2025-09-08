// backend/resources/crudRouter.js (ESM) — CRUD genérico, seguro p/ login/cadastro
import express from 'express';

// Extrai userId do token (sem verificar assinatura; mesmo helper dos resources)
function extractUserId(req) {
  const u = req.user || req.auth || {};
  let id = u.id || u.userId || req.userId || u.sub || null;
  if (!id) {
    const auth = req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
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
function respondError(res, err, fallback = 'Erro interno') {
  const status =
    err?.statusCode ||
    err?.status ||
    (err?.code === '23505' ? 409 : 500);

  const body = (() => {
    if (status === 400 && err?.details) {
      return { error: 'ValidationError', issues: err.details };
    }
    if (status === 401) return { error: 'Unauthorized' };
    if (status === 409) return { error: 'Conflict', detail: err?.detail || err?.message };
    return { error: err?.message || fallback };
  })();

  return res.status(status).json(body);
}

export function makeCrudRouter(cfg, db) {
  const router = express.Router();
  const q = (text, params) => db.query(text, params);

  const table = cfg.table;
  const idCol = cfg.id || 'id';
  const listFields = cfg.listFields?.length ? cfg.listFields : ['*'];
  const searchFields = cfg.searchFields || [];
  const sortable = new Set([idCol, ...(cfg.sortable || [])]);
  const scope = cfg.scope || null;

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

      const fieldsSql = listFields.map(f => `"${f}"`).join(',');
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

      const sql = `SELECT ${listFields.map(f => `"${f}"`).join(',')}
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
      if (cfg.validateCreate) body = cfg.validateCreate(body); // função pura (Zod)

      const defaults =
        typeof cfg.defaults === 'function'
          ? (cfg.defaults(req) || {})
          : (cfg.defaults || {});
      const record = { ...defaults, ...body };

      // escopo obrigatório (owner_id)
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

      const getSql = `SELECT ${listFields.map(f => `"${f}"`).join(',')}
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
      if (cfg.validateUpdate) body = cfg.validateUpdate(body); // função pura (Zod)

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

      const getSql = `SELECT ${listFields.map(f => `"${f}"`).join(',')}
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
