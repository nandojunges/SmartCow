const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_REMETENTE,
    pass: process.env.SENHA_REMETENTE,
  },
});

async function enviarCodigo(destinatario, codigo) {
  const mailOptions = {
    from: process.env.EMAIL_REMETENTE,
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
