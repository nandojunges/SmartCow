const nodemailer = require('nodemailer');

function ensureEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[CONFIG] Faltando variável: ${name} (crie server/.env)`);
    throw new Error(`ENV ausente: ${name}`);
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
    pass: SENHA_REMETENTE
  }
});

transporter.verify((err) => {
  if (err) console.error('[SMTP] Falha verificação:', err.message || err);
  else console.log('[SMTP] Conectado ao Zoho.');
});

async function enviarCodigo(destinatario, codigo) {
  await transporter.sendMail({
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
    `
  });
}

module.exports = { enviarCodigo };
