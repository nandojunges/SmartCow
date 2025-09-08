// backend/resources/milk.resource.js
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const dataDir   = path.join(__dirname, "..", "data");
const storePath = path.join(dataDir, "milk.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readStore() {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
      lots: Array.isArray(parsed.lots) ? parsed.lots : defaultLots(),
    };
  } catch {
    return { measurements: [], lots: defaultLots() };
  }
}

function writeStore(state) {
  ensureDataDir();
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        measurements: state.measurements ?? [],
        lots: state.lots ?? defaultLots(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function defaultLots() {
  return [
    { nome: "Lote 1", funcao: "Lactação" },
    { nome: "Lote 2", funcao: "Lactação" },
    { nome: "Lote 3", funcao: "Lactação" },
    { nome: "Secar",  funcao: "Lactação" },
  ];
}

/* ============ ROTAS ============ */

// GET /api/v1/milk/dates  → ["2025-08-30", ...]
router.get("/dates", (req, res) => {
  const state = readStore();
  const dates = state.measurements.map(m => m.id).sort((a,b) => new Date(a) - new Date(b));
  res.json(dates);
});

// GET /api/v1/milk/measurements?date=YYYY-MM-DD
router.get("/measurements", (req, res) => {
  const date = String(req.query.date || "").slice(0, 10);
  if (!date) return res.status(400).json({ error: "missing date" });

  const state = readStore();
  const found = state.measurements.find(m => m.id === date);
  res.json(found ?? { id: date, tipo: "2", dados: {} });
});

// POST /api/v1/milk/measurements  { id, tipo, dados }
router.post("/measurements", (req, res) => {
  const { id, tipo = "2", dados = {} } = req.body || {};
  const date = String(id || "").slice(0, 10);
  if (!date) return res.status(400).json({ error: "invalid id/date" });

  const state = readStore();
  const idx = state.measurements.findIndex(m => m.id === date);
  const payload = { id: date, tipo: String(tipo || "2"), dados: dados || {} };

  if (idx >= 0) state.measurements[idx] = payload;
  else state.measurements.push(payload);

  writeStore(state);
  res.json({ ok: true, id: date });
});

// GET /api/v1/milk/lots  → [{nome, funcao:'Lactação'}, ...]
router.get("/lots", (req, res) => {
  const state = readStore();
  res.json(state.lots || defaultLots());
});

export default router;
