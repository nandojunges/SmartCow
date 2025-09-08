// backend/routes/auth.js (ESM) — login/cadastro + esqueci/reset de senha
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pg from "pg";
import nodemailer from "nodemailer";

const { Pool } = pg;
const pool = new Pool(); // PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD via .env

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TTL_MIN = Number(process.env.VERIFICATION_TTL_MINUTES || 10);

/* ============ helpers ============ */
const normEmail = (e) => String(e || "").trim().toLowerCase();

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      verification_code TEXT,
      verification_expires TIMESTAMP,
      verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}

function genCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/* ============ SMTP: tolerante (não quebra em dev) ============ */
function smtpSettings() {
  return {
    host: process.env.SMTP_HOST || "smtp.zoho.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: String(process.env.SMTP_SECURE ?? "true") === "true",
    user: process.env.EMAIL_REMETENTE,
    pass: process.env.EMAIL_SENHA_APP,
    from: process.env.MAIL_FROM || process.env.EMAIL_REMETENTE,
  };
}
let transporterCache = null;
function getTransportOrNull() {
  const s = smtpSettings();
  if (!s.user || !s.pass) return null;
  if (transporterCache) return transporterCache;
  transporterCache = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
  });
  return transporterCache;
}
async function sendMailSafe({ to, subject, html, text }) {
  const t = getTransportOrNull();
  if (!t) {
    console.log("📬 [DEV] SMTP não configurado — e-mail simulado:");
    console.log({ to, subject, text, html });
    return { mocked: true };
  }
  await t.verify().catch(() => {});
  return t.sendMail({ from: smtpSettings().from, to, subject, html, text });
}

/* ============ emissão/armazenamento de código ============ */
async function issueVerificationCode(userId, email, subjectPrefix) {
  const code = genCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expires = new Date(Date.now() + TTL_MIN * 60_000);

  await pool.query(
    "UPDATE users SET verification_code=$1, verification_expires=$2 WHERE id=$3",
    [codeHash, expires, userId]
  );

  await sendMailSafe({
    to: email,
    subject: `${subjectPrefix} - Gestão Leiteira`,
    html: `<p>Seu código:</p><h2 style="letter-spacing:3px">${code}</h2><p>Expira em ${TTL_MIN} minuto(s).</p>`,
    text: `Código: ${code} (expira em ${TTL_MIN} min)`,
  });

  return { ttl_minutes: TTL_MIN };
}

/* ============ rotas ============ */

// (opcional) sanity check do router
router.get("/health", (_req, res) => res.json({ ok: true, scope: "/api/auth" }));

// Registro simples por e-mail + senha
router.post("/register", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    const senha = String(req.body?.senha || "");
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha" });
    if (senha.length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });

    const exists = await pool.query("SELECT id, verified FROM users WHERE lower(email)=lower($1)", [email]);
    if (exists.rowCount) {
      const u = exists.rows[0];
      if (u.verified) return res.status(409).json({ error: "E-mail já cadastrado" });
      const password_hash = await bcrypt.hash(senha, 10);
      await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [password_hash, u.id]);
      const { ttl_minutes } = await issueVerificationCode(u.id, email, "Novo código de verificação");
      return res.status(200).json({ message: "Senha atualizada e novo código enviado.", user: { id: u.id, email, verified: false }, ttl_minutes });
    }

    const password_hash = await bcrypt.hash(senha, 10);
    const ins = await pool.query(
      "INSERT INTO users (email, password_hash, verified) VALUES ($1,$2,false) RETURNING id, email, verified, created_at",
      [email, password_hash]
    );
    const u = ins.rows[0];
    const { ttl_minutes } = await issueVerificationCode(u.id, email, "Código de verificação");
    res.status(201).json({ message: "Cadastro criado. Código enviado.", user: { id: u.id, email: u.email, verified: u.verified }, ttl_minutes });
  } catch (err) { next(err); }
});

// Reenviar código
router.post("/resend", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Informe email" });
    const q = await pool.query("SELECT id, verified FROM users WHERE lower(email)=lower($1)", [email]);
    const u = q.rows[0];
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    if (u.verified) return res.json({ message: "E-mail já verificado." });
    const { ttl_minutes } = await issueVerificationCode(u.id, email, "Novo código de verificação");
    res.json({ message: "Novo código enviado.", ttl_minutes });
  } catch (err) { next(err); }
});

// Verificar e-mail
router.post("/verify", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code || "");
    if (!email || !code) return res.status(400).json({ error: "Informe email e code" });

    const q = await pool.query(
      "SELECT id, email, verification_code, verification_expires FROM users WHERE lower(email)=lower($1)",
      [email]
    );
    const u = q.rows[0];
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    if (!u.verification_code || !u.verification_expires) return res.status(400).json({ error: "Solicite um novo código" });
    if (new Date(u.verification_expires) < new Date()) return res.status(400).json({ error: "Código expirado" });

    const ok = await bcrypt.compare(code, u.verification_code);
    if (!ok) return res.status(400).json({ error: "Código inválido" });

    await pool.query("UPDATE users SET verified=true, verification_code=NULL, verification_expires=NULL WHERE id=$1", [u.id]);
    const token = jwt.sign({ sub: u.id, email: u.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "E-mail verificado.", token, user: { id: u.id, email: u.email, verified: true } });
  } catch (err) { next(err); }
});

// Login
router.post("/login", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    const senha = String(req.body?.senha || "");
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha" });

    const q = await pool.query("SELECT id, email, password_hash, verified FROM users WHERE lower(email)=lower($1)", [email]);
    const u = q.rows[0];
    if (!u || !u.password_hash || !(await bcrypt.compare(senha, u.password_hash))) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
    if (!u.verified) return res.status(403).json({ error: "E-mail não verificado" });

    const token = jwt.sign({ sub: u.id, email: u.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: u.id, email: u.email, verified: u.verified } });
  } catch (err) { next(err); }
});

// Esqueci a senha — envia código
router.post("/forgot-password", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Informe email" });

    const q = await pool.query("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);
    const u = q.rows[0];
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });

    const { ttl_minutes } = await issueVerificationCode(u.id, email, "Código de recuperação de senha");
    res.json({ message: "Código enviado.", ttl_minutes });
  } catch (err) { next(err); }
});

// Reset de senha
router.post("/reset-password", async (req, res, next) => {
  try {
    await ensureUsersTable();
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code || "");
    const novaSenha = String(req.body?.novaSenha || "");
    if (!email || !code || !novaSenha) return res.status(400).json({ error: "Dados incompletos" });
    if (novaSenha.length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });

    const q = await pool.query(
      "SELECT id, verification_code, verification_expires FROM users WHERE lower(email)=lower($1)",
      [email]
    );
    const u = q.rows[0];
    if (!u) return res.status(404).json({ error: "Usuário não encontrado" });
    if (!u.verification_code || !u.verification_expires) return res.status(400).json({ error: "Solicite o código novamente" });
    if (new Date(u.verification_expires) < new Date()) return res.status(400).json({ error: "Código expirado" });

    const ok = await bcrypt.compare(code, u.verification_code);
    if (!ok) return res.status(400).json({ error: "Código inválido" });

    const password_hash = await bcrypt.hash(novaSenha, 10);
    await pool.query(
      "UPDATE users SET password_hash=$1, verification_code=NULL, verification_expires=NULL WHERE id=$2",
      [password_hash, u.id]
    );
    res.json({ message: "Senha redefinida com sucesso." });
  } catch (err) { next(err); }
});

// Token -> me
router.get("/me", (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sem token" });
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});

export default router;
