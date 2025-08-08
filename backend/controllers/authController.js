const bcrypt = require('bcryptjs');
const emailUtils = require('../utils/email');
const { initDB, getDBPath } = require('../db');
const Usuario = require('../models/Usuario');

const pendentes = new Map();
const EXPIRA_MS = 10 * 60 * 1000; // 10 min
const REENVIO_MS = 3 * 60 * 1000; // 3 min

function limpaExpirados() {
  const agora = Date.now();
  for (const [email, p] of pendentes.entries()) {
    if (agora - p.criado_em.getTime() > EXPIRA_MS) pendentes.delete(email);
  }
}

function geraCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Compatível com o seu frontend:
 * POST /api/auth/enviar-codigo
 * Aceita:
 *  - Mínimo: { email }
 *  - Ideal:  { nome, nomeFazenda, email, telefone, senha, plano, formaPagamento }
 * Guarda o que vier no Map para uso na verificação.
 */
async function enviarCodigo(req, res) {
  try {
    limpaExpirados();
    const {
      nome = null,
      nomeFazenda = null,
      email,
      telefone = null,
      senha = null,
      plano = null,
      formaPagamento = null,
    } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ erro: 'Email inválido.' });
    }

    // Se já existe usuário com esse e-mail, bloqueia cadastro
    const dbPath = getDBPath(email);
    const fs = require('fs');
    if (fs.existsSync(dbPath)) {
      return res.status(400).json({ erro: 'Email já cadastrado.' });
    }

    // Anti-spam de reenvio
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
      senha: hashSenha, // pode ser null se veio só email (preencha antes de confirmar)
      plano,
      formaPagamento,
      criado_em: new Date(),
    });

    await emailUtils.enviarCodigo(email, codigo);
    return res.status(200).json({ ok: true, msg: 'Código enviado.' });
  } catch (err) {
    console.error('Erro enviar-codigo:', err);
    return res.status(500).json({ erro: 'Falha ao enviar código.' });
  }
}

/**
 * Compatível com o seu frontend:
 * POST /api/auth/verificar-codigo
 * Espera: { email, codigoDigitado, ...camposOpcionalmenteFaltantes }
 * Se no passo anterior você só enviou {email}, aqui você pode enviar os demais campos.
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
      senha, // se não veio no passo anterior, aceita aqui
      plano,
      formaPagamento,
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

    // Consolidar dados (permite completar campos aqui)
    const final = {
      nome: pend.nome ?? nome,
      nomeFazenda: pend.nomeFazenda ?? nomeFazenda,
      telefone: pend.telefone ?? telefone,
      email,
      senha: pend.senha, // pode vir do passo 1
      plano: pend.plano ?? plano,
      formaPagamento: pend.formaPagamento ?? formaPagamento,
    };

    // Se a senha não foi enviada no passo 1, hashear agora
    if (!final.senha && senha) {
      final.senha = await bcrypt.hash(senha, 10);
    }

    // Valida mínimos obrigatórios (ajuste conforme sua regra)
    if (!final.nome || !final.senha) {
      return res.status(400).json({ erro: 'Dados incompletos (nome e senha são obrigatórios).' });
    }

    const db = await initDB(email);
    await Usuario.criar(db, final);

    pendentes.delete(email);
    return res.status(201).json({ ok: true, msg: 'Usuário cadastrado com sucesso.' });
  } catch (err) {
    console.error('Erro verificar-codigo:', err);
    return res.status(500).json({ erro: 'Falha ao verificar e cadastrar.' });
  }
}

module.exports = {
  enviarCodigo,
  verificarCodigo,
};

