// Relais ESPN pour l'app (même domaine → pas de souci CORS : le CDN d'ESPN ne renvoie pas
// toujours l'en-tête Access-Control-Allow-Origin). Limité au scoreboard et au calendrier
// d'une équipe. Cache 60 s côté Vercel.
const ALLOWED = /^(football|basketball|soccer|rugby|hockey)\/[\w.-]+\/(scoreboard|teams\/\d+\/schedule)$/;

module.exports = async (req, res) => {
  const path = String(req.query.path || '');
  if (!ALLOWED.test(path)) {
    res.status(400).json({ error: 'chemin non autorisé' });
    return;
  }
  const dates = /^\d{8}$/.test(String(req.query.dates || '')) ? `?dates=${req.query.dates}` : '';
  try {
    const upstream = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}${dates}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(upstream.status).send(await upstream.text());
  } catch (e) {
    res.status(502).json({ error: 'ESPN indisponible' });
  }
};
