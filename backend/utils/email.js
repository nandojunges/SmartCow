// backend/utils/email.js
import nodemailer from 'nodemailer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const cfg = {
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
  auth: {
    user: process.env.EMAIL_REMETENTE,
    pass: process.env.EMAIL_SENHA_APP,
  },
};

const MAIL_FROM = process.env.MAIL_FROM || process.env.EMAIL_REMETENTE || '';

function logCfg() {
  // mostra só o começo da senha pra evitar vazar tudo
  const passSample =
    process.env.EMAIL_SENHA_APP ? process.env.EMAIL_SENHA_APP.slice(0, 3) + '***' : '(vazio)';
  console.log('[MAIL] config efetiva:', {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.auth.user,
    from: MAIL_FROM,
    senha_len: process.env.EMAIL_SENHA_APP ? process.env.EMAIL_SENHA_APP.length : 0,
    senha_ini: passSample,
  });
}

const transporter = nodemailer.createTransport(cfg);

async function verificarSMTP() {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/**
 * Envia o código de verificação por e-mail via Zoho
 * Lança erro com prefixo SMTP_AUTH_FAIL/SEND_FAIL para o controlador traduzir em 502.
 */
async function enviarCodigo(destino, codigo) {
  logCfg();

  // 1) testa autenticação antes de tentar enviar
  const vr = await verificarSMTP();
  if (!vr.ok) {
    console.error('❌ [MAIL] verify falhou:', vr.error?.message || vr.error);
    const err = new Error(`SMTP_AUTH_FAIL: ${vr.error?.message || vr.error}`);
    err.code = 'SMTP_AUTH_FAIL';
    throw err;
  }

  const mensagem = {
    from: MAIL_FROM,
    to: destino,
    subject: 'Código de verificação - Gestão Leiteira',
    text: `Seu código de verificação é: ${codigo}`,
    headers: { 'X-Mailer': 'GestaoLeiteira' },
    replyTo: MAIL_FROM,
  };

  try {
    const info = await transporter.sendMail(mensagem);
    console.log('✔️  E-mail enviado com sucesso:', info.messageId);
    return info;
  } catch (e) {
    console.error('❌ [MAIL] falha ao enviar para ' + destino + ':', e.message);
    const err = new Error(`SEND_FAIL: ${e.message}`);
    err.code = 'SEND_FAIL';
    throw err;
  }
}

export { enviarCodigo, verificarSMTP };