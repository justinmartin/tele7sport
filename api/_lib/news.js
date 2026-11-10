// Actu sport : les flux RSS publics de quelques sites, rangés par sport (même principe que Le Fauteuil Rouge).
// On ne garde que le titre, l'image, la date, un court extrait et le lien vers l'article.
// Sports : soccer, basketball, rugby, football (US), hockey, tennis, cycling, auto (F1, endurance, rallye),
// moto, hiver, handball, athletisme, natation, voile, golf, combat.
const UA = 'Mozilla/5.0 (compatible; tele7sport/1.0; app perso ; github.com/justinmartin)';
const EQ = path => `https://dwh.lequipe.fr/api/edito/rss?path=/${path}/`;

// sport : sport de tous les articles du flux ; sinon deviné d'après l'adresse de l'article (sources générales)
const SOURCES = [
  { id: 'lequipe', name: "L'Équipe", color: '#d4002a', ink: '#fff', feeds: [
    ['Football', 'soccer'], ['Basket', 'basketball'], ['Rugby', 'rugby'], ['Tennis', 'tennis'], ['Cyclisme', 'cycling'],
    ['Formule-1', 'auto'], ['Moto', 'moto'], ['Ski', 'hiver'], ['Biathlon', 'hiver'], ['Handball', 'handball'],
    ['Athletisme', 'athletisme'], ['Voile', 'voile'], ['Golf', 'golf'], ['Natation', 'natation'],
    ['Football-americain', 'football'], ['Sports-de-combat', 'combat'], ['Hockey-sur-glace', 'hockey'],
  ].map(([p, sport]) => ({ url: EQ(p), sport })) },
  { id: 'rmc', name: 'RMC Sport', color: '#e10600', ink: '#fff', feeds: [
    { url: 'https://rmcsport.bfmtv.com/rss/football/', sport: 'soccer' },
    { url: 'https://rmcsport.bfmtv.com/rss/basket/', sport: 'basketball' },
    { url: 'https://rmcsport.bfmtv.com/rss/rugby/', sport: 'rugby' },
  ] },
  // Trashtalk : certificat du site expiré en novembre 2026, le flux revient tout seul quand il sera renouvelé
  { id: 'trashtalk', name: 'Trashtalk', color: '#111', ink: '#fff', feeds: [{ url: 'https://trashtalk.co/feed/', sport: 'basketball' }] },
  { id: 'basketusa', name: 'Basket USA', color: '#1d428a', ink: '#fff', feeds: [{ url: 'https://www.basketusa.com/feed/', sport: 'basketball' }] },
  { id: 'rugbyrama', name: 'Rugbyrama', color: '#0f6b3c', ink: '#fff', feeds: [{ url: 'https://www.rugbyrama.fr/rss.xml', sport: 'rugby' }] },
  { id: 'footmercato', name: 'Foot Mercato', color: '#00a651', ink: '#fff', feeds: [{ url: 'https://www.footmercato.net/flux-rss', sport: 'soccer' }] },
  { id: 'motorsport', name: 'Motorsport', color: '#ff3c00', ink: '#fff', feeds: [{ url: 'https://fr.motorsport.com/rss/all/news/', sport: null }] },
  { id: 'handnews', name: 'Handnews', color: '#2f6fb3', ink: '#fff', feeds: [{ url: 'https://www.handnews.fr/feed/', sport: 'handball' }] },
  { id: 'ouestfrance', name: 'Ouest-France', color: '#e30613', ink: '#fff', feeds: [{ url: 'https://www.ouest-france.fr/rss/sport', sport: null }] },
];
// Actus d'ESPN par ligue (en anglais), sans blocage
const ESPN = [['basketball/nba', 'basketball'], ['football/nfl', 'football'], ['hockey/nhl', 'hockey']];

// Sources générales : le sport d'après l'adresse de l'article (Ouest-France, Motorsport)
const URL_SPORTS = [
  [/\/(football|foot)\//, 'soccer'], [/\/basket/, 'basketball'], [/\/rugby/, 'rugby'], [/\/tennis/, 'tennis'],
  [/\/cyclisme|\/velo/, 'cycling'], [/\/f1\/|formule-?1|\/wec\/|\/wrc\/|endurance|rallye|dakar/, 'auto'], [/\/motogp|\/moto/, 'moto'],
  [/\/ski|biathlon/, 'hiver'], [/\/handball/, 'handball'], [/athletisme/, 'athletisme'], [/\/voile/, 'voile'], [/\/golf/, 'golf'],
  [/natation/, 'natation'], [/\/nfl|football-americain/, 'football'], [/\/hockey/, 'hockey'], [/\/ufc|\/mma|\/boxe/, 'combat'],
];
const sportFromUrl = url => (URL_SPORTS.find(([re]) => re.test(url)) || [])[1] || null;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô' };
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const strip = s => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i').exec(x); return m ? m[1] : ''; };
const attr = (x, t, a) => { const m = new RegExp(`<${t}\\b[^>]*\\b${a}="([^"]+)"`, 'i').exec(x); return m ? decode(m[1]) : ''; };

function image(item) {
  const raw = decode(item);
  const candidates = [
    attr(item, 'media:content', 'url'), attr(item, 'media:thumbnail', 'url'),
    /type="image/.test(item) ? attr(item, 'enclosure', 'url') : '',
    (/<img[^>]+src="([^"]+)"/i.exec(raw) || [])[1],
  ].filter(Boolean);
  return candidates.find(u => /^https:\/\//.test(u) && !/\.(gif|svg)(\?|$)/i.test(u) && !/(feedburner|pixel|tracking|gravatar|emoji)/i.test(u)) || '';
}

function getText(url) {
  return fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.text() : ''));
}

async function fetchFeed(src, feed) {
  try {
    const xml = await getText(feed.url);
    const items = xml.split(/<item[\s>]/i).slice(1).map(x => x.split(/<\/item>/i)[0]);
    return items.slice(0, 30).map(it => {
      const title = strip(tag(it, 'title'));
      const url = (strip(tag(it, 'link')) || attr(it, 'link', 'href')).replace(/#at_medium=.*$/, '');
      const date = new Date(strip(tag(it, 'pubDate')) || strip(tag(it, 'dc:date')) || Date.now());
      let excerpt = strip(tag(it, 'description'));
      if (excerpt.length > 190) excerpt = excerpt.slice(0, 187).replace(/\s\S*$/, '') + '…';
      return { title, url, date: isNaN(date) ? null : date.toISOString(), source: src.id, lang: 'fr',
               sport: feed.sport || sportFromUrl(url), image: image(it), excerpt };
    }).filter(a => a.title && /^https?:\/\//.test(a.url) && a.date && a.sport);
  } catch (e) { return []; }
}

async function fetchEspn([path, sport]) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/news?limit=25`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    return ((await r.json()).articles || []).filter(a => a.type === 'HeadlineNews' || a.type === 'Story').map(a => ({
      title: a.headline, url: a.links?.web?.href || '', date: a.published, source: 'espn', lang: 'en', sport,
      image: (a.images || []).find(i => /^https:/.test(i.url))?.url || '', excerpt: a.description || '',
    })).filter(a => a.title && /^https?:\/\//.test(a.url));
  } catch (e) { return []; }
}

const key = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);

async function news() {
  const lists = await Promise.all([...SOURCES.flatMap(s => s.feeds.map(f => fetchFeed(s, f))), ...ESPN.map(fetchEspn)]);
  const since = Date.now() - 7 * 864e5;
  const seen = new Set();
  const all = lists.flat().filter(a => new Date(a.date).getTime() >= since && new Date(a.date).getTime() <= Date.now() + 3600e3)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(a => { const k = key(a.title); if (seen.has(a.url) || seen.has(k)) return false; seen.add(a.url); seen.add(k); return true; });
  const sources = [...SOURCES.map(({ id, name, color, ink }) => ({ id, name, color, ink })), { id: 'espn', name: 'ESPN', color: '#cc0000', ink: '#fff' }];
  // Au plus 50 articles par sport : le foot ne doit pas chasser le ski ou la voile
  const count = {};
  const articles = all.filter(a => (count[a.sport] = (count[a.sport] || 0) + 1) <= 50);
  return { sources, articles };
}

module.exports = { news, SOURCES };
