// Envoi du lundi matin (Vercel Cron, voir vercel.json) à tous les abonnés.
// Un abonné ne reçoit qu'un envoi par semaine, même si la fonction est relancée.
const { loadCatalog, parisDay, addDays, APP_URL } = require('./_lib/core');
const { allSubscribers, saveSubscriber } = require('./_lib/store');
const { render } = require('./_lib/newsletter');
const { sendMail } = require('./_lib/mail');

const monday = () => { const d = parisDay(); const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); };

function authorized(req) {
  // Avec CRON_SECRET, Vercel envoie « Authorization: Bearer <secret> » ; sinon on se fie à l'en-tête du cron
  if (process.env.CRON_SECRET) return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  return /vercel-cron/.test(req.headers['user-agent'] || '');
}

module.exports = async (req, res) => {
  if (!authorized(req)) { res.status(401).json({ error: 'réservé au cron' }); return; }
  const week = monday();
  const cat = await loadCatalog();
  const subs = await allSubscribers();
  const report = { week, total: subs.length, sent: 0, skipped: 0, failed: 0 };
  for (const sub of subs) {
    if (sub.lastSent === week) { report.skipped++; continue; }
    const unsub = `${APP_URL}/api/unsubscribe?id=${sub.id}&t=${encodeURIComponent(sub.token)}`;
    try {
      const { subject, html } = render(cat, sub.favs, { start: parisDay(), unsubscribeUrl: unsub });
      await sendMail(sub.email, subject, html, unsub);
      await saveSubscriber({ ...sub, lastSent: week });
      report.sent++;
    } catch (err) {
      console.error('envoi', sub.id, err);
      report.failed++;
    }
  }
  console.log('newsletter', report);
  res.status(report.failed && !report.sent ? 500 : 200).json(report);
};
