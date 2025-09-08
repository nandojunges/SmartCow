// backend/resources/settings.resource.js (ESM)
import express from 'express';
import db from '../dbx.js';
import { z } from '../validate.js';
import { makeValidator } from '../validate.js';

const router = express.Router();

// Identificador do dono (tenant/usuário)
function extractOwnerId(req) {
  const u = req.user || req.auth || {};
  return (
    u.produtorId || u.tenantId || u.producerId || u.ownerId ||
    u.id || u.userId || u.sub || req.userId || null
  );
}

// GET /api/v1/settings/:key
router.get('/:key', async (req, res) => {
  const ownerId = extractOwnerId(req);
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
  const { rows } = await db.query(
    'SELECT value_json FROM settings WHERE owner_id = $1 AND key = $2 LIMIT 1',
    [ownerId, req.params.key]
  );
  res.json({ key: req.params.key, value: rows[0]?.value_json ?? null });
});

// PUT /api/v1/settings/:key  { value: ... }
router.put(
  '/:key',
  makeValidator(z.object({ value: z.any() })),
  async (req, res) => {
    const ownerId = extractOwnerId(req);
    if (!ownerId) return res.status(401).json({ error: 'unauthorized' });

    await db.query(
      `
      INSERT INTO settings (owner_id, key, value_json)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (owner_id, key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
      `,
      [ownerId, req.params.key, JSON.stringify(req.body.value ?? null)]
    );
    res.json({ ok: true });
  }
);

// (Opcional) GET /api/v1/settings -> lista tudo do owner
router.get('/', async (req, res) => {
  const ownerId = extractOwnerId(req);
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
  const { rows } = await db.query(
    'SELECT key, value_json FROM settings WHERE owner_id = $1',
    [ownerId]
  );
  res.json({ items: rows });
});

/* ======= extras (opcional): bulk ======= */
// GET /api/v1/settings/many?keys=chave1,chave2
router.get('/many/list', async (req, res) => {
  const ownerId = extractOwnerId(req);
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
  const keys = String(req.query.keys || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!keys.length) return res.json({ items: [] });
  const { rows } = await db.query(
    `SELECT key, value_json FROM settings WHERE owner_id = $1 AND key = ANY($2)`,
    [ownerId, keys]
  );
  res.json({ items: rows });
});

// PUT /api/v1/settings/bulk  { values: { chave1: any, chave2: any } }
router.put(
  '/bulk',
  makeValidator(z.object({ values: z.record(z.any()) })),
  async (req, res) => {
    const ownerId = extractOwnerId(req);
    if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
    const entries = Object.entries(req.body.values || {});
    const sql = `
      INSERT INTO settings (owner_id, key, value_json)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (owner_id, key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
    `;
    for (const [key, value] of entries) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(sql, [ownerId, key, JSON.stringify(value ?? null)]);
    }
    res.json({ ok: true, count: entries.length });
  }
);

export default router;
