const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_REMETENTE,
    pass: process.env.SENHA_REMETENTE
  }
});

async function enviarCodigoEmail(destinatario, codigo) {
  await transporter.sendMail({
    from: process.env.EMAIL_REMETENTE,
    to: destinatario,
    subject: 'Código de Verificação - Gestão Leiteira',
    html: `<p>Seu código de verificação é:</p><h2>${codigo}</h2><p>Ele expira em 10 minutos.</p>`
  });
}

module.exports = { enviarCodigoEmail };
