// Actu sport (onglet Actu) : flux RSS de L'Équipe, RMC Sport, Trashtalk… et actus ESPN, rangés par sport.
// Gardée 30 min au CDN de Vercel : les sites ne sont lus qu'une fois par demi-heure, quel que soit le nombre d'utilisateurs.
const { news } = require('./_lib/news');

module.exports = async (req, res) => {
  try {
    const data = await news();
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Actu indisponible' });
  }
};
