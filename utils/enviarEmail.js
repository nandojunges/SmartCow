const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_REMETENTE,
    pass: process.env.EMAIL_SENHA_APP,
  },
});

const enviarEmail = async (to, subject, text) => {
  await transporter.sendMail({
    from: process.env.EMAIL_REMETENTE,
    to,
    subject,
    text,
  });
};

module.exports = enviarEmail;
