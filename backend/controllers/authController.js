const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const Usuario = require('../models/Usuario');
const emailUtils = require('../utils/email');
const { initDB, getDBPath } = require('../db');

const pendentes = new Map();
const SECRET = process.env.JWT_SECRET || 'segredo';

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

  const codigo = Math.floor(100000 + Math.random() * 900000).toString();

  if (!endereco || typeof endereco !== 'string') {
    return res.status(400).json({ message: 'Email inválido ou não informado.' });
  }

  const dbPath = getDBPath(endereco);

  // Limpa pendências expiradas (10 min)
  for (const [email, pend] of pendentes) {
    if (Date.now() - pend.criado_em.getTime() > 10 * 60 * 1000) {
      pendentes.delete(email);
    }
  }

  if (pendentes.has(endereco)) {
    return res.status(400).json({ message: 'Já existe uma verificação pendente para este e-mail.' });
  }

  if (fs.existsSync(dbPath)) {
    return res.status(400).json({ message: 'Email já cadastrado.' });
  }

  try {
    const pendente = pendentes.get(endereco);
    if (pendente && Date.now() - pendente.criado_em.getTime() < 3 * 60 * 1000) {
      return res.status(400).json({ message: 'Código já enviado. Aguarde para reenviar.' });
    }

    const hash = await bcrypt.hash(senha, 10);
    pendentes.set(endereco, {
      codigo,
      nome,
      nomeFazenda,
      telefone,
      senha: hash,
      planoSolicitado,
      formaPagamento,
      criado_em: new Date(),
    });

    await emailUtils.enviarCodigo(endereco, codigo);
    res.status(201).json({ message: 'Código enviado por e-mail.' });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
}

async function verificarEmail(req, res) {
  const { email: endereco, codigoDigitado } = req.body;

  if (!endereco || typeof endereco !== 'string') {
    return res.status(400).json({ erro: 'Email inválido.' });
  }

  try {
    const pendente = pendentes.get(endereco);
    if (!pendente) {
      return res.status(400).json({ erro: 'Código não encontrado. Faça o cadastro novamente.' });
    }

    const expirado = Date.now() - new Date(pendente.criado_em).getTime() > 10 * 60 * 1000;
    if (expirado) {
      pendentes.delete(endereco);
      return res.status(400).json({ erro: 'Código expirado. Faça o cadastro novamente.' });
    }

    if (pendente.codigo !== codigoDigitado) {
      return res.status(400).json({ erro: 'Código incorreto.' });
    }

    // Criação do usuário
    const db = await initDB(endereco);
    const novoUsuario = {
      nome: pendente.nome,
      email: endereco,
      nomeFazenda: pendente.nomeFazenda,
      telefone: pendente.telefone,
      senha: pendente.senha,
      plano: pendente.planoSolicitado,
      formaPagamento: pendente.formaPagamento,
    };

    await Usuario.criar(db, novoUsuario);
    pendentes.delete(endereco);
    res.status(201).json({ message: 'Usuário cadastrado com sucesso.' });
  } catch (error) {
    console.error('Erro ao verificar e cadastrar usuário:', error);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { cadastro, verificarEmail };
