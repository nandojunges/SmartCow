import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';             // ← usando Postgres
import * as emailUtils from '../utils/email.js';  // Zoho ajustado
import { ensureTenant } from '../db/tenancy.js';

const SECRET = process.env.JWT_SECRET || 'segredo';
const TTL_MIN = Number(process.env.VERIFICATION_TTL_MINUTES || 3);

const norm = (e) => String(e || '').trim().toLowerCase();
const genCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

// Garante colunas/índice necessários no PG (uma única vez, com SQL válido)
(async function ensureInfra() {
  try {
    const sql = `
      -- Campos básicos que o fluxo usa (cada ADD isolado)
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome_fazenda       TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone           TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_hash         TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN DEFAULT FALSE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verification_code  VARCHAR(6);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil             TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_conta         TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano              TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS forma_pagamento    TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_schema      TEXT;

      -- Índice único case-insensitive para e-mail
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = 'uniq_usuarios_email_ci'
        ) THEN
          CREATE UNIQUE INDEX uniq_usuarios_email_ci ON usuarios (LOWER(email));
        END IF;
      END $$;
    `;
    await pool.query(sql);
  } catch (e) {
    console.warn('[ensureInfra] ', e.message);
  }
})();

// ➤ Cadastro inicial: gera código e envia por e-mail
async function cadastro(req, res) {
  const {
    nome,
    nomeFazenda,
    email: endereco,
    telefone,
    senha,
    plano: planoSolicitado,
    formaPagamento,
  } = req.body;
  const codigo = genCode();

  if (!endereco || typeof endereco !== 'string') {
    return res.status(400).json({ message: 'Email inválido ou não informado.' });
  }

  const emailLC = norm(endereco);

  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    // Procura usuário por e-mail (case-insensitive)
    const { rows } = await client.query(
      `SELECT id, is_verified, verification_expires
         FROM usuarios
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [emailLC]
    );

    if (rows.length) {
      const u = rows[0];
      if (u.is_verified) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'E-mail já cadastrado e verificado.' });
      }
      const now = new Date();
      if (u.verification_expires && now < u.verification_expires) {
        const seconds = Math.max(0, Math.floor((u.verification_expires - now)/1000));
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Cadastro pendente de verificação.', retry_after_seconds: seconds });
      }
      // Expirou → gera novo código e novo vencimento (calculado no Node, sem INTERVAL)
      const expires = new Date(Date.now() + TTL_MIN * 60 * 1000);
      await client.query(
        `UPDATE usuarios
            SET verification_code = $1,
                verification_expires = $2
          WHERE id = $3`,
        [codigo, expires, u.id]
      );
      try {
        await emailUtils.enviarCodigo(emailLC, codigo, TTL_MIN);
      } catch (err) {
        await client.query('ROLLBACK');
        return res.status(502).json({ message: 'Falha ao enviar e-mail de verificação.' });
      }
      await client.query('COMMIT');
      const { schema, backupDir } = await ensureTenant(emailLC);
      await pool.query('UPDATE usuarios SET tenant_schema = $1 WHERE id = $2', [schema, u.id]);
      console.log('Tenant criado:', { schema, backupDir });
      return res.status(200).json({ message: 'Novo código enviado.' });
    }

    // Novo cadastro → cria usuário pendente
    const hash = await bcrypt.hash(senha, 10);
    const expires = new Date(Date.now() + TTL_MIN * 60 * 1000);

    const ins = await client.query(
      `INSERT INTO usuarios
         (nome, nome_fazenda, email, telefone, senha_hash, is_verified, verification_code, verification_expires, plano, forma_pagamento)
       VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,$9)
       RETURNING id`,
      [nome || null, nomeFazenda || null, emailLC, telefone || null, hash, codigo, expires, planoSolicitado || null, formaPagamento || null]
    );

    try {
      await emailUtils.enviarCodigo(emailLC, codigo, TTL_MIN);
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(502).json({ message: 'Falha ao enviar e-mail de verificação.' });
    }

    await client.query('COMMIT');
    const userId = ins.rows[0].id;
    const { schema, backupDir } = await ensureTenant(emailLC);
    await pool.query('UPDATE usuarios SET tenant_schema = $1 WHERE id = $2', [schema, userId]);
    console.log('Tenant criado:', { schema, backupDir });
    return res.status(201).json({ message: 'Código enviado. Verifique o e-mail.', userId });
  } catch (error) {
    console.error('💥 [CADASTRO] erro inesperado:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
}

// ➤ Verifica o código enviado por e-mail e cria o usuário
async function verificarEmail(req, res) {
  // aceita codigoDigitado, codigo ou code
  const endereco = (req.body.email || req.body.endereco || '').toLowerCase().trim();
  const codigoDigitado = ((req.body.codigoDigitado ?? req.body.codigo ?? req.body.code) || '')
    .toString()
    .trim();

  if (!endereco || typeof endereco !== 'string') {
    return res.status(400).json({ erro: 'Email inválido.' });
  }

  try {
    const emailLC = norm(endereco);
    const client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, is_verified, verification_code, verification_expires, tenant_schema
         FROM usuarios
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [emailLC]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Usuário não encontrado.' }); }

    const u = rows[0];
    if (u.is_verified) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Usuário já verificado.' }); }
    if (!u.verification_code || !u.verification_expires) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Código não gerado.' }); }

    const now = new Date();
    if (now > u.verification_expires) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Código expirado. Faça o cadastro novamente.' }); }
    if (codigoDigitado !== u.verification_code) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Código incorreto.' }); }

    // Marca como verificado
    await client.query(
      `UPDATE usuarios
          SET is_verified = true,
              verification_code = NULL,
              verification_expires = NULL
        WHERE id = $1`,
      [u.id]
    );

    await client.query('COMMIT');
    const { schema, backupDir } = await ensureTenant(emailLC);
    await pool.query('UPDATE usuarios SET tenant_schema = $1 WHERE id = $2', [schema, u.id]);
    console.log(`🔐 Verificação OK: ${emailLC} | schema=${schema} | backup=${backupDir}`);
    return res.json({ sucesso: true, tenant_schema: schema });
  } catch (err) {
    console.error('💥 [VERIFICAR] erro inesperado:', err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
}

// ➤ Login e geração do token JWT
async function login(req, res) {
  const { email, senha } = req.body;
  const emailLC = norm(email);
  try {
    const { rows } = await pool.query(
      `SELECT id,
              email,
              COALESCE(senha_hash, senha) AS senha_hash,   -- compat com bases antigas
              is_verified,
              COALESCE(perfil, 'funcionario') AS perfil,
              COALESCE(tipo_conta, 'usuario') AS tipo_conta
         FROM usuarios
        WHERE LOWER(email)=LOWER($1)
        LIMIT 1`,
      [emailLC]
    );
    if (!rows.length) return res.status(400).json({ message: 'Usuário não encontrado.' });
    const u = rows[0];
    if (!u.is_verified) return res.status(403).json({ erro: 'Usuário não verificado. Confirme seu e-mail.' });
    const ok = await bcrypt.compare(senha, u.senha_hash);
    if (!ok) return res.status(400).json({ message: 'Senha incorreta.' });
    const token = jwt.sign(
      { email: u.email, idProdutor: u.id, perfil: u.perfil || 'funcionario', tipoConta: u.tipo_conta || 'usuario' },
      SECRET,
      { expiresIn: '2h' }
    );
    return res.status(200).json({ token });
  } catch (e) {
    console.error('💥 [LOGIN] erro:', e);
    return res.status(500).json({ message: 'Erro ao efetuar login.' });
  }
}

export {
  cadastro,
  verificarEmail,
  login,
  verificarEmail as verifyCode,
};