const bcrypt = require('bcryptjs');
const { initDB, getDBPath } = require('../db');
const Usuario = require('../models/Usuario');
const emailUtils = require('../utils/email');
const fs = require('fs');

const pendentes = new Map();
const EXPIRA_MS = 10 * 60 * 1000;
const REENVIO_MS = 3 * 60 * 1000;

function limpaExpirados() {
  const agora = Date.now();
  for (const [email, p] of pendentes.entries()) {
    if (agora - p.criado_em.getTime() > EXPIRA_MS) pendentes.delete(email);
  }
}

function geraCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** POST /api/auth/enviar-codigo
 * Aceita só {email} ou todos os campos (nome, senha, etc.)
 */
async function enviarCodigo(req, res) {
  try {
    limpaExpirados();

    const {
      email,
      nome = null,
      nomeFazenda = null,
      telefone = null,
      senha = null,
      plano = null,
      formaPagamento = null
    } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ erro: 'Email inválido.' });
    }

    const dbPath = getDBPath ? getDBPath(email) : null;
    if (dbPath && fs.existsSync(dbPath)) {
      return res.status(400).json({ erro: 'Email já cadastrado.' });
    }

    const atual = pendentes.get(email);
    if (atual && Date.now() - atual.criado_em.getTime() < REENVIO_MS) {
      return res.status(429).json({ erro: 'Aguarde alguns minutos para reenviar o código.' });
    }

    const codigo = geraCodigo();
    const hashSenha = senha ? await bcrypt.hash(senha, 10) : null;

    pendentes.set(email, {
      codigo,
      nome,
      nomeFazenda,
      telefone,
      senha: hashSenha,
      plano,
      formaPagamento,
      criado_em: new Date()
    });

    await emailUtils.enviarCodigo(email, codigo);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEV] Código de verificação', email, '=>', codigo);
    }
    return res.status(200).json({ ok: true, msg: 'Código enviado.' });
  } catch (err) {
    console.error('Erro enviar-codigo:', err?.message || err);
    const tip = (!process.env.EMAIL_REMETENTE || !process.env.SENHA_REMETENTE)
      ? 'Verifique server/.env (EMAIL_REMETENTE e SENHA_REMETENTE).'
      : 'Se usar 2FA no Zoho, gere senha de app e use no SENHA_REMETENTE.';
    return res.status(500).json({ erro: 'Falha ao enviar código.', dica: tip });
  }
}

/** POST /api/auth/verificar-codigo
 * Espera { email, codigoDigitado } e, opcionalmente, dados faltantes
 */
async function verificarCodigo(req, res) {
  try {
    limpaExpirados();
    const {
      email,
      codigoDigitado,
      nome,
      nomeFazenda,
      telefone,
      senha,
      plano,
      formaPagamento
    } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ erro: 'Email inválido.' });
    }
    if (!codigoDigitado) {
      return res.status(400).json({ erro: 'Código não informado.' });
    }

    const pend = pendentes.get(email);
    if (!pend) return res.status(400).json({ erro: 'Código não encontrado ou expirado.' });

    const expirado = Date.now() - pend.criado_em.getTime() > EXPIRA_MS;
    if (expirado) {
      pendentes.delete(email);
      return res.status(400).json({ erro: 'Código expirado. Solicite novo código.' });
    }

    if (pend.codigo !== codigoDigitado) {
      return res.status(400).json({ erro: 'Código incorreto.' });
    }

    const final = {
      nome: pend.nome ?? nome,
      email,
      nomeFazenda: pend.nomeFazenda ?? nomeFazenda,
      telefone: pend.telefone ?? telefone,
      senha: pend.senha,
      plano: pend.plano ?? plano,
      formaPagamento: pend.formaPagamento ?? formaPagamento
    };

    if (!final.senha && senha) {
      final.senha = await bcrypt.hash(senha, 10);
    }

    if (!final.nome || !final.senha) {
      return res.status(400).json({ erro: 'Dados incompletos (nome e senha são obrigatórios).' });
    }

    const db = await initDB(email);
    await Usuario.criar(db, final);

    pendentes.delete(email);
    return res.status(201).json({ ok: true, msg: 'Usuário cadastrado com sucesso.' });
  } catch (err) {
    console.error('Erro verificar-codigo:', err?.message || err);
    return res.status(500).json({ erro: 'Falha ao verificar e cadastrar.' });
  }
}

module.exports = { enviarCodigo, verificarCodigo };
