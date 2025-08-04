const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// Armazena os códigos de verificação e os e-mails já verificados
const codigosVerificacao = {};
const emailsVerificados = {};

function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get('/api', (req, res) => {
  res.send('✅ Backend está rodando!');
});

app.post('/api/auth/enviar-codigo', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ erro: 'Email obrigatório' });

  const codigo = gerarCodigo();
  const expiraEm = Date.now() + 10 * 60 * 1000; // 10 minutos

  codigosVerificacao[email] = { codigo, expiraEm };

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_REMETENTE,
        pass: process.env.SENHA_REMETENTE,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_REMETENTE,
      to: email,
      subject: 'Código de Verificação - Gestão Leiteira',
      html: `<p>Seu código de verificação é:</p><h2>${codigo}</h2><p>Ele expira em 10 minutos.</p>`,
    });

    console.log('📧 Código enviado para', email);
    res.status(200).json({ mensagem: 'Código enviado com sucesso!' });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    res.status(500).json({ erro: 'Erro ao enviar o código. Verifique o email do remetente.' });
  }
});

app.post('/api/auth/verificar-codigo', (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) return res.status(400).json({ erro: 'Email e código obrigatórios' });

  const registro = codigosVerificacao[email];
  if (!registro) return res.status(400).json({ erro: 'Código não encontrado para este email' });

  if (Date.now() > registro.expiraEm) {
    delete codigosVerificacao[email];
    return res.status(400).json({ erro: 'Código expirado' });
  }

  if (registro.codigo !== codigo) {
    return res.status(400).json({ erro: 'Código inválido' });
  }

  emailsVerificados[email] = true;
  delete codigosVerificacao[email];
  console.log(`✅ Email verificado: ${email}`);
  res.json({ mensagem: 'Código verificado com sucesso!' });
});

app.post('/api/auth/cadastrar', (req, res) => {
  const { nome, nomeFazenda, email, telefone, senha, plano, formaPagamento } = req.body;

  if (!emailsVerificados[email]) {
    return res.status(403).json({ erro: 'Email ainda não verificado' });
  }

  console.log('📦 Cadastro aprovado:', { nome, email });
  res.json({ mensagem: 'Cadastro realizado com sucesso!' });

  // Aqui você poderá salvar no banco com Sequelize ou outro
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
