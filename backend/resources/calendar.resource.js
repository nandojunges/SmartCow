// backend/resources/calendar.resource.js (ESM)
import db from '../dbx.js';
import express from 'express';
import { z } from '../validate.js';
import { makeValidator } from '../validate.js';
import { makeCrudRouter } from './crudRouter.js';

// Mesmo helper dos animais
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

// Enum de tipos compatível com o seu domínio
const zTipo = z.enum([
  'parto','secagem','preparto','vacina','exame','limpeza',
  'estoque','checkup','dispositivo','hormonio','tratamento','protocolo'
]);

// Esquemas de validação (iguais ao estilo dos animais)
const createSchema = z.object({
  title: z.string().min(1),
  tipo: zTipo,
  start: z.string().min(8),                 // ISO; convertido no SQL com ::timestamptz
  end: z.string().optional().nullable(),
  allDay: z.coerce.boolean().optional().default(true),
  prioridadeVisual: z.coerce.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
});
const updateSchema = createSchema.partial();
const validateCreate = makeValidator(createSchema);
const validateUpdate = makeValidator(updateSchema);

// Config para o CRUD genérico (mesmo padrão dos animais)
const cfg = {
  table: 'calendar_events',
  id: 'id',
  listFields: [
    'id','owner_id','title','tipo','start','end','all_day','prioridade_visual','notes','created_at','updated_at'
  ],
  searchFields: ['title','tipo','notes'],
  sortable: ['start','created_at','title','tipo'],
  validateCreate,
  validateUpdate,
  defaults: () => ({ created_at: new Date().toISOString() }),
  scope: { column: 'owner_id', required: true }, // 🔒 cada usuário só vê o que é dele
};

const router = express.Router();

function toApiRow(r) {
  return {
    id: r.id,
    title: r.title,
    tipo: r.tipo,
    start: r.start,
    end: r.end,
    allDay: r.all_day ?? r.allDay ?? false,
    prioridadeVisual: r.prioridade_visual ?? r.prioridadeVisual ?? true,
    notes: r.notes ?? null,
  };
}

/**
 * Rotas curtas usadas pelo front:
 *   GET    /api/v1/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD[&tipo=...]
 *   POST   /api/v1/calendar/events
 *   PUT    /api/v1/calendar/events/:id
 *   DELETE /api/v1/calendar/events/:id
 *   GET    /api/v1/calendar/auto-events   (stub por enquanto)
 */

// GET /events — lista por intervalo (sem paginação)
router.get('/events', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const start = String(req.query.start || '').slice(0, 10);
    const end   = String(req.query.end   || '').slice(0, 10);
    const tipo  = req.query.tipo ? String(req.query.tipo) : null;

    const params = [uid];
    const where = ['owner_id = $1'];

    if (start && end) {
      params.push(start, end);
      where.push(`start >= $2::date AND start < ($3::date + INTERVAL '1 day')`);
    }
    if (tipo && zTipo.options.includes(tipo)) {
      params.push(tipo);
      where.push(`tipo = $${params.length}`);
    }

    const sql = `
      SELECT id, owner_id, title, tipo, start, "end", all_day, prioridade_visual, notes, created_at, updated_at
        FROM calendar_events
       WHERE ${where.join(' AND ')}
       ORDER BY start ASC
    `;
    const { rows } = await db.query(sql, params);
    res.json(rows.map(toApiRow));
  } catch (e) {
    console.error('GET /calendar/events erro:', e);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// POST /events — cria com owner_id do usuário
router.post('/events', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { title, tipo, start, end = null, allDay = true, prioridadeVisual = true, notes = null } =
      validateCreate(req.body || {});

    const sql = `
      INSERT INTO calendar_events (owner_id, title, tipo, start, "end", all_day, prioridade_visual, notes)
      VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8)
      RETURNING id, owner_id, title, tipo, start, "end", all_day, prioridade_visual, notes, created_at, updated_at
    `;
    const { rows } = await db.query(sql, [uid, title, tipo, start, end, !!allDay, !!prioridadeVisual, notes]);
    res.status(201).json(toApiRow(rows[0]));
  } catch (e) {
    const status = e?.statusCode || 400;
    if (e?.statusCode === 400) return res.status(400).json({ error: 'ValidationError', details: e.details });
    console.error('POST /calendar/events erro:', e);
    res.status(status).json({ error: 'Erro ao criar evento' });
  }
});

// PUT /events/:id — atualiza somente do owner
router.put('/events/:id', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const p = validateUpdate(req.body || {});

    const sql = `
      UPDATE calendar_events
         SET title = COALESCE($3, title),
             tipo  = COALESCE($4, tipo),
             start = COALESCE($5::timestamptz, start),
             "end" = COALESCE($6::timestamptz, "end"),
             all_day = COALESCE($7, all_day),
             prioridade_visual = COALESCE($8, prioridade_visual),
             notes = COALESCE($9, notes),
             updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id, owner_id, title, tipo, start, "end", all_day, prioridade_visual, notes, created_at, updated_at
    `;
    const vals = [
      id, uid,
      p.title ?? null,
      p.tipo ?? null,
      p.start ?? null,
      p.end ?? null,
      typeof p.allDay === 'boolean' ? p.allDay : null,
      typeof p.prioridadeVisual === 'boolean' ? p.prioridadeVisual : null,
      p.notes ?? null,
    ];
    const { rows } = await db.query(sql, vals);
    if (!rows[0]) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(toApiRow(rows[0]));
  } catch (e) {
    const status = e?.statusCode || 400;
    if (e?.statusCode === 400) return res.status(400).json({ error: 'ValidationError', details: e.details });
    console.error('PUT /calendar/events/:id erro:', e);
    res.status(status).json({ error: 'Erro ao atualizar evento' });
  }
});

// DELETE /events/:id — remove somente do owner
router.delete('/events/:id', async (req, res) => {
  try {
    const uid = extractUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    await db.query(`DELETE FROM calendar_events WHERE id = $1 AND owner_id = $2`, [id, uid]);
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /calendar/events/:id erro:', e);
    res.status(400).json({ error: 'Erro ao apagar evento' });
  }
});

// Eventos automáticos — placeholder por enquanto
router.get('/auto-events', async (_req, res) => {
  res.json([]);
});

// CRUD padrão (igual animais)
router.use('/', makeCrudRouter(cfg, db));

export default router;
