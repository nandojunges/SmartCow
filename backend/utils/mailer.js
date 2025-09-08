import nodemailer from 'nodemailer';

// Cria transporte utilizando serviço ou configuração SMTP manual
const transporter = process.env.EMAIL_SERVICE
  ? nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_REMETENTE,
        pass: process.env.EMAIL_SENHA_APP,
      },
    })
  : nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.zoho.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_REMETENTE,
        pass: process.env.EMAIL_SENHA_APP,
      },
    });

async function enviarCodigoVerificacao(destinatario, codigo) {
  const base = process.env.APP_BASE_URL || 'http://localhost:5173';
  const link = `${base}/verificar?email=${encodeURIComponent(destinatario)}&codigo=${encodeURIComponent(codigo)}`;
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.EMAIL_REMETENTE,
    to: destinatario,
    subject: 'Código de verificação',
    html: `<p>Seu código: <b>${codigo}</b></p><p>Ou clique: <a href="${link}">${link}</a></p>`,
  });
  console.log('✅ E-mail enviado:', info.messageId);
}

export { transporter, enviarCodigoVerificacao };