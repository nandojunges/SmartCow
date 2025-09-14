// backend/server.js (ESM)
import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ensureTables } from "./bootstrapResources.js";
import { initDB } from "./db.js";

import authRoutes from "./routes/auth.js";
import { tenantContext } from "./middleware/tenantContext.js";
import { backupOnWrite } from "./middleware/backupOnWrite.js";
import animalsResource from "./resources/animals.resource.js";
import productsResource from "./resources/products.resource.js";
import animalsMetrics from "./resources/animals.metrics.js";
import productsMetrics from "./resources/products.metrics.js";
import calendarResource from "./resources/calendar.resource.js"; // 👈 mantém antes do catch-all
import milkResource from "./resources/milk.resource.js";       // 👈 NOVO
import consumoResource from "./resources/consumo_reposicao.resource.js"; // 👈 Consumo & Reposição
import reproducaoResource from "./resources/reproducao.resource.js"; // 👈 NOVO (Reprodução)
// ⚠️ NÃO importar protocolo.resource.js aqui — ele é montado dentro de reproducao.resource.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// env
const envBackend = path.join(__dirname, ".env");
const envRoot = path.join(__dirname, "..", ".env");
dotenv.config({ path: envBackend });
dotenv.config({ path: envRoot });

const mask = (v) => (v ? "set" : "missing");
if (process.env.LOG_ENV_PATH === "true") {
  console.log("ENV paths tried:", { backendEnv: envBackend, rootEnv: envRoot });
}
console.log("SMTP CONFIG =>", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  EMAIL_REMETENTE: mask(process.env.EMAIL_REMETENTE),
  EMAIL_SENHA_APP: mask(process.env.EMAIL_SENHA_APP),
});

const BACKUP_ENABLED = process.env.BACKUP_ENABLED === "true";
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// DB/migrations
try {
  await initDB();
  console.log("✅ DB pronto (migrations aplicadas).");
} catch (err) {
  console.error("❌ Falha ao inicializar DB:", err);
  process.exit(1);
}

// recursos auxiliares (tabelas auxiliares, se houver)
ensureTables().catch(err => {
  console.error("Falha ao criar tabelas de recursos:", err);
});

// Middlewares condicionais
if (BACKUP_ENABLED) {
  app.use(tenantContext);
  app.use(backupOnWrite);
}

// logger de /api/auth/*
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (!/^\/api\/auth(\/|$)/.test(req.originalUrl)) return;
    console.log(JSON.stringify({
      tag: "AUTH",
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    }));
  });
  next();
});

// Health & ping
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    backupEnabled: BACKUP_ENABLED,
    smtp: {
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT || null,
      secure: process.env.SMTP_SECURE || null,
      EMAIL_REMETENTE: mask(process.env.EMAIL_REMETENTE),
      EMAIL_SENHA_APP: mask(process.env.EMAIL_SENHA_APP),
    },
  });
});
app.get("/api/ping", (_req, res) => res.json({ ok: true }));

// estáticos (dados exportados etc.)
app.use("/api/data", express.static(path.join(__dirname, "data")));
fs.mkdirSync(path.join(__dirname, "dadosExcluidos"), { recursive: true });

// rotas de autenticação
app.use("/api/auth", authRoutes);

// métricas
app.use("/api/v1/animals/metrics", animalsMetrics);
app.use("/api/v1/products/metrics", productsMetrics);

// recursos principais
// --- Compat: aliases de Reposição/Lotes para o front antigo ---
// /api/v1/reposicao/*  -> usa o mesmo router de consumo
app.use("/api/v1/reposicao", consumoResource);
// /api/v1/lots -> reescreve para /lotes no router de consumo
app.use("/api/v1/lots", (req, res, next) => {
  req.url = "/lotes" + (req.url || "");
  return consumoResource(req, res, next);
});

// --- Compat: normalizador do payload de medição de leite ---
// Algumas UIs mandam data em DD/MM/YYYY e números com vírgula; também podem
// usar chaves diferentes (volume/litros, ccs/celulas_somaticas).
function normalizeDateCompat(s) {
  if (!s) return s;
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;                // YYYY-MM-DD
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);            // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return v;
}
function toNumberCompat(x) {
  if (x == null || x === "") return x;
  const n = Number(String(x).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : x;
}
app.post("/api/v1/animals/:id/leite", (req, _res, next) => {
  try {
    const b = req.body ?? {};
    const nb = { ...b };
    // id do animal vindo da rota
    if (!nb.animal_id) nb.animal_id = req.params?.id;
    // normaliza data
    const hojeISO = new Date().toISOString().slice(0, 10);
    nb.data = normalizeDateCompat(b.data || b.dt || b.dia || hojeISO);
    // default de turno, se faltar
    let turno = nb.turno ?? nb.ordenha ?? nb.turnoOrdenha ?? nb.milking;
    if (turno == null || turno === "") turno = "manha";
    // aceita 1/2/3, M/T/N, strings variadas
    const t = String(turno).toLowerCase();
    if (["1","m","manhã","manha","morning"].includes(t)) turno = "manha";
    else if (["2","t","tarde","afternoon"].includes(t)) turno = "tarde";
    else if (["3","n","noite","night"].includes(t)) turno = "noite";
    nb.turno = turno;
    // tipo padrão (alguns validadores exigem)
    if (!nb.tipo) nb.tipo = "medicao";
    // números comuns com vírgula/ponto
    for (const k of [
      "litros","volume","quantidade",
      "gordura","proteina","lactose","ureia",
      "ccs","solidos","sólidos","caseina","sng"
    ]) {
      if (k in nb) nb[k] = toNumberCompat(nb[k]);
    }
    // sinônimos
    if (nb.litros == null) {
      if (nb.volume != null) nb.litros = nb.volume;
      else if (nb.quantidade != null) nb.litros = toNumberCompat(nb.quantidade);
      else if (nb.producao != null) nb.litros = toNumberCompat(nb.producao);
    }
    if (nb.ccs == null && nb.celulas_somaticas != null) {
      nb.ccs = toNumberCompat(nb.celulas_somaticas);
    }
    req.body = nb;
  } catch {}
  next();
});

app.use("/api/v1/animals", animalsResource);
app.use("/api/v1/products", productsResource);
app.use("/api/v1/calendar", calendarResource);
app.use("/api/v1/milk", milkResource);
app.use("/api/v1/consumo", consumoResource);
app.use("/api/v1/reproducao", reproducaoResource);

// ========================
// Protocolo (orquestrador) — import dinâmico
// ========================
try {
  const { default: protocoloOrquestrador } = await import("./resources/protocolo.resource.js");
  if (protocoloOrquestrador) {
    // pode compartilhar o mesmo prefixo de reprodução — são subrotas diferentes
    app.use("/api/v1/reproducao", protocoloOrquestrador);
    console.log("✅ Orquestrador de protocolo montado em /api/v1/reproducao");
  } else {
    console.warn("⚠️ protocolo.resource export default vazio; rota não montada.");
  }
} catch (err) {
  console.warn("⚠️ Falha ao carregar protocolo.resource; orquestrador desativado temporariamente:", err?.message || err);
}

// ========================
// Genética: import dinâmico
// ========================
try {
  const { default: geneticaResource } = await import("./resources/genetica.resource.js");
  if (geneticaResource) {
    app.use("/api/v1/genetica", geneticaResource);
    console.log("✅ /api/v1/genetica montada.");
  } else {
    console.warn("⚠️ genetica.resource export default vazio; rota não montada.");
  }
} catch (err) {
  console.warn("⚠️ Falha ao carregar genetica.resource; rota desativada temporariamente:", err?.message || err);
}

// ❌ NÃO use "/api/*" no Express 5 — quebra o path-to-regexp
// ✅ Catch-all de API usando prefixo:
app.use("/api", (req, res) => {
  return res.status(404).json({ error: "API route não encontrada" });
});

// SPA (build do React). Em dev o Vite cuida.
// ❌ NÃO use app.get("*") no Express 5
// ✅ Use regex /.*/ para o fallback do SPA
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

app.get(/.*/, (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res
    .status(200)
    .send("<!doctype html><html><body><h1>Dev server ativo</h1></body></html>");
});

// handler de erro (último)
app.use((err, req, res, next) => {
  console.error("❌ ERRO:", {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    query: req.query,
    stack: err?.stack || String(err),
  });
  res.status(500).json({ error: "Internal Server Error" });
});

// job opcional
if (process.env.ENABLE_PREPARTO_JOB === "true") {
  import("./jobs/preparto.js")
    .then((m) => (typeof m.default === "function" ? m.default() : null))
    .catch((e) => console.error("Erro ao iniciar job preparto:", e));
}

// start
const server = app.listen(PORT, () => {
  console.log(`✅ API v1 on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Porta ${PORT} já está em uso.`);
    process.exit(1);
  } else {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
});

export default app;