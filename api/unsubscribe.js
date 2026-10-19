// Désinscription (lien en bas de chaque newsletter, bouton de l'app, ou « one-click » de Gmail).
const { APP_URL, esc } = require('./_lib/core');
const { getSubscriber, deleteSubscriber, sameToken } = require('./_lib/store');

const page = (title, text) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Télé7Sport</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f5f5f7;font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:22px;font-weight:900;text-transform:uppercase">Télé<span style="color:#e8483b">7</span>Sport</div>
<h1 style="font-size:20px;margin:28px 0 8px">${esc(title)}</h1><p style="color:#a1a1aa">${esc(text)}</p>
<p style="margin-top:24px"><a href="${APP_URL}" style="color:#f5f5f7;font-weight:700">Ouvrir l'app</a></p></div></body></html>`;

module.exports = async (req, res) => {
  const id = String(req.query.id || ''), token = String(req.query.t || '');
  const sub = await getSubscriber(id).catch(() => null);
  const ok = !!sub && sameToken(token, sub.token);
  if (ok) await deleteSubscriber(id);
  if (/json/.test(req.headers.accept || '') || req.method === 'POST') { res.status(ok ? 200 : 404).json({ ok }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(ok || !sub
    ? page('Tu es désinscrit', "Tu ne recevras plus la newsletter. Tu peux te réinscrire depuis l'app, dans Mes favoris.")
    : page('Lien invalide', "Ce lien de désinscription n'est plus valable."));
};
