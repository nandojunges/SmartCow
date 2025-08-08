const nodemailer = require('nodemailer');
// dotenv já carregado no index; aqui só usa process.env

function ensureEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[CONFIG] Variável de ambiente ausente: ${name}. Crie server/.env e reinicie o server.`);
  }
  return v;
}

const EMAIL_REMETENTE = ensureEnv('EMAIL_REMETENTE');
const SENHA_REMETENTE = ensureEnv('SENHA_REMETENTE');

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_REMETENTE,
    pass: SENHA_REMETENTE,
  },
});

// Verifica conexão SMTP no boot (apenas log; não lançar erro)
transporter.verify((err, success) => {
  if (err) {
    console.error('[SMTP] Falha na verificação:', err.message || err);
  } else {
    console.log('[SMTP] Conexão OK com Zoho.');
  }
});

async function enviarCodigo(destinatario, codigo) {
  const mailOptions = {
    from: EMAIL_REMETENTE,
    to: destinatario,
    subject: 'Código de Verificação - Gestão Leiteira',
    html: `
      <div style="font-family: Arial, sans-serif; text-align:center">
        <h2>Bem-vindo!</h2>
        <p>Seu código de verificação:</p>
        <h1>${codigo}</h1>
        <p>Válido por 10 minutos.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { enviarCodigo };
