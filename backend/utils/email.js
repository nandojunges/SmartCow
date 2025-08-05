const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE, // Zoho
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
      <div style="font-family: sans-serif; text-align: center">
        <h2>Bem-vindo à Gestão Leiteira!</h2>
        <p>Seu código de verificação é:</p>
        <h1>${codigo}</h1>
        <p>O código é válido por 10 minutos.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { enviarCodigo };
