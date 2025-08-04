const Usuario = require('../models/Usuario');
const TokenRecuperacao = require('../models/TokenRecuperacao');
const { hashSenha, compararSenha } = require('../utils/hashSenha');
const gerarTokenJWT = require('../utils/gerarToken');
const validarEmail = require('../utils/validarEmail');
const enviarEmail = require('../utils/enviarEmail');
const crypto = require('crypto');

const gerarCodigo = () => crypto.randomInt(100000, 999999).toString();

exports.cadastro = async (req, res) => {
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
    const usuario = await Usuario.create({
      nome,
      email,
      senha: senhaHash,
      tipo,
      status: 'pendente',
    });
    const codigo = gerarCodigo();
    const validade = new Date(Date.now() + 60 * 60 * 1000);
    await TokenRecuperacao.create({
      userId: usuario.id,
      token: codigo,
      validade,
      tipo: 'verificacao',
    });
    await enviarEmail(
      email,
      'Código de verificação',
      `Seu código de verificação é: ${codigo}`
    );
    return res
      .status(201)
      .json({ message: 'Usuário cadastrado. Verifique seu e-mail.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no cadastro' });
  }
};

exports.verificarEmail = async (req, res) => {
  const { email, codigo } = req.body;
  try {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ message: 'Usuário não encontrado' });
    }
    const tokenRecord = await TokenRecuperacao.findOne({
      where: { userId: usuario.id, token: codigo, tipo: 'verificacao' },
    });
    if (!tokenRecord || tokenRecord.validade < new Date()) {
      return res.status(400).json({ message: 'Código inválido ou expirado' });
    }
    await usuario.update({ status: 'verificado' });
    await tokenRecord.destroy();
    return res.json({ message: 'Email verificado com sucesso' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro na verificação' });
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
    if (usuario.status !== 'verificado') {
      return res.status(403).json({ message: 'Email não verificado' });
    }
    const token = gerarTokenJWT({ id: usuario.id, tipo: usuario.tipo });
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no login' });
  }
};

exports.esqueciSenha = async (req, res) => {
  const { email } = req.body;
  try {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ message: 'Usuário não encontrado' });
    }
    const codigo = gerarCodigo();
    const validade = new Date(Date.now() + 60 * 60 * 1000);
    await TokenRecuperacao.create({
      userId: usuario.id,
      token: codigo,
      validade,
      tipo: 'recuperacao',
    });
    await enviarEmail(
      email,
      'Recuperação de senha',
      `Seu código para redefinição de senha é: ${codigo}`
    );
    return res.json({ message: 'Código enviado para o email' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar código' });
  }
};

exports.redefinirSenha = async (req, res) => {
  const { email, codigo, novaSenha } = req.body;
  try {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(400).json({ message: 'Usuário não encontrado' });
    }
    const tokenRecord = await TokenRecuperacao.findOne({
      where: { userId: usuario.id, token: codigo, tipo: 'recuperacao' },
    });
    if (!tokenRecord || tokenRecord.validade < new Date()) {
      return res.status(400).json({ message: 'Código inválido ou expirado' });
    }
    const senhaHash = await hashSenha(novaSenha);
    await usuario.update({ senha: senhaHash });
    await tokenRecord.destroy();
    return res.json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
};
