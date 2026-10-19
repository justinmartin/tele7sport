// Inscription à la newsletter (ou mise à jour des favoris) depuis l'app : { email, favs, id?, token? }.
// À la première inscription, on envoie tout de suite le programme de la semaine.
const { APP_URL, loadCatalog, parisDay, addDays } = require('./_lib/core');
const { idOf, newToken, sameToken, getSubscriber, saveSubscriber } = require('./_lib/store');
const { render } = require('./_lib/newsletter');
const { sendMail, mailReady } = require('./_lib/mail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanFavs(f) {
  if (!f || !Array.isArray(f.leagues)) return null;
  const str = a => (Array.isArray(a) ? a : []).filter(x => typeof x === 'string').slice(0, 200).map(x => x.slice(0, 80));
  return {
    leagues: f.leagues.slice(0, 100).filter(l => l && typeof l.league === 'string').map(l => ({
      league: l.league.slice(0, 60), mode: ['all', 'teams', 'ap'].includes(l.mode) ? l.mode : 'all',
      teams: str(l.teams), names: str(l.names), finals: !!l.finals,
    })),
    cycling: str(f.cycling),
  };
}

const unsubscribeUrl = sub => `${APP_URL}/api/unsubscribe?id=${sub.id}&t=${encodeURIComponent(sub.token)}`;
// Lundi de la semaine en cours (heure de Paris)
const monday = () => { const d = parisDay(); const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST attendu' }); return; }
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const email = String(body.email || '').trim().toLowerCase();
  const favs = cleanFavs(body.favs);
  if (!EMAIL_RE.test(email) || email.length > 200) { res.status(400).json({ error: 'Adresse e-mail invalide' }); return; }
  if (!favs) { res.status(400).json({ error: 'Favoris manquants' }); return; }
  if (!mailReady()) { res.status(503).json({ error: "L'envoi d'e-mails n'est pas encore configuré" }); return; }

  const id = idOf(email);
  const existing = await getSubscriber(id);
  const now = new Date().toISOString();
  if (existing) {
    // Déjà inscrit : seul le téléphone qui a le jeton peut changer les favoris
    if (!sameToken(body.token, existing.token)) { res.status(200).json({ ok: true, id, existing: true }); return; }
    await saveSubscriber({ ...existing, favs, updated: now });
    res.status(200).json({ ok: true, id, token: existing.token });
    return;
  }
  const sub = { id, email, favs, token: newToken(), created: now, updated: now };
  // Premier envoi tout de suite : il vérifie l'adresse et montre ce qui arrivera chaque lundi
  try {
    const cat = await loadCatalog();
    const { subject, html } = render(cat, favs, { start: parisDay(), unsubscribeUrl: unsubscribeUrl(sub) });
    await sendMail(email, subject.replace('📺 Télé7Sport — ', '📺 Bienvenue sur Télé7Sport — '), html, unsubscribeUrl(sub));
  } catch (err) {
    console.error('envoi de bienvenue', err);
    res.status(502).json({ error: "Impossible d'envoyer l'e-mail, réessaie plus tard" });
    return;
  }
  sub.lastSent = monday();
  await saveSubscriber(sub);
  res.status(200).json({ ok: true, id, token: sub.token, welcome: true });
};
