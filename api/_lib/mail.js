// Envoi par Gmail (même compte que l'ancienne newsletter GitHub) : variables Vercel
// EMAIL_USER et EMAIL_PASSWORD (mot de passe d'application Google).
const nodemailer = require('nodemailer');

let transport = null;
function mailer() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) throw new Error('EMAIL_USER / EMAIL_PASSWORD manquants');
  transport ||= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
  return transport;
}

async function sendMail(to, subject, html, unsubscribeUrl) {
  await mailer().sendMail({
    from: `Télé7Sport <${process.env.EMAIL_USER}>`, to, subject, html,
    headers: unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {},
  });
}

module.exports = { sendMail, mailReady: () => !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) };
