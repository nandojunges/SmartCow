const Usuario = require('../models/Usuario');
const TokenRecuperacao = require('../models/TokenRecuperacao');
const { hashSenha, compararSenha } = require('../utils/hashSenha');
const gerarTokenJWT = require('../utils/gerarToken');
const validarEmail = require('../utils/validarEmail');
const crypto = require('crypto');

exports.register = async (req, res) => {
  const { nome, email, senha, tipo } = req.body;
  try {
    if (!validarEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    const existente = await Usuario.findOne({ where: { email } });
    if (existente) {
      return res.status(400).json({ message: 'Email já cadastrado' });
    }
    const senhaHash = await hashSenha(senha);
    const usuario = await Usuario.create({ nome, email, senha: senhaHash, tipo });
    return res.status(201).json({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no cadastro' });
  }
};

exports.login = async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }
    const match = await compararSenha(senha, usuario.senha);
    if (!match) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }
    const token = gerarTokenJWT({ id: usuario.id, tipo: usuario.tipo });
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no login' });
  }
};

exports.gerarToken = async (req, res) => {
  const { email } = req.body;
  try {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ message: 'Usuário não encontrado' });
    }
    const token = crypto.randomBytes(20).toString('hex');
    const validade = new Date(Date.now() + 60 * 60 * 1000);
    await TokenRecuperacao.create({ userId: usuario.id, token, validade });
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar token' });
  }
};
