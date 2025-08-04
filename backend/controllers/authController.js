const { enviarCodigoEmail } = require('../services/emailService');
const {
  gerarCodigo,
  salvarCodigo,
  verificarCodigo,
  emailFoiVerificado
} = require('../utils/verificacaoStorage');

async function enviarCodigo(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ erro: 'Email obrigatório' });

  const codigo = gerarCodigo();
  salvarCodigo(email, codigo);

  try {
    await enviarCodigoEmail(email, codigo);
    res.json({ mensagem: 'Código enviado com sucesso!' });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    res.status(500).json({ erro: 'Erro ao enviar o código. Verifique o email do remetente.' });
  }
}

function verificarCodigoHandler(req, res) {
  const { email, codigo } = req.body;
  if (!email || !codigo) return res.status(400).json({ erro: 'Email e código obrigatórios' });

  const resultado = verificarCodigo(email, codigo);
  if (!resultado.valido) return res.status(400).json({ erro: resultado.motivo });

  res.json({ mensagem: 'Código verificado com sucesso!' });
}

function cadastrar(req, res) {
  const { nome, nomeFazenda, email, telefone, senha, plano, formaPagamento } = req.body;

  if (!emailFoiVerificado(email)) {
    return res.status(403).json({ erro: 'Email ainda não verificado' });
  }

  // Aqui você salvaria no banco (Sequelize)
  console.log('📦 Cadastro aprovado:', { nome, email });
  res.json({ mensagem: 'Cadastro realizado com sucesso!' });
}

module.exports = {
  enviarCodigo,
  verificarCodigoHandler,
  cadastrar
};
