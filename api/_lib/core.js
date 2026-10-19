// Outils communs aux fonctions Vercel (agenda .ics, newsletter) : lecture du catalogue et
// mêmes règles de favoris que l'app (web/app.js → visible()).
const CATALOG_URL = 'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/catalog.json';
const APP_URL = 'https://tele7sport.vercel.app';
const TZ = 'Europe/Paris';
const LEAGUE_PASS = 'NBA League Pass';
const US_SPORTS = new Set(['football', 'basketball', 'hockey']);
const NATIONS_EN = { 'écosse': 'Scotland', 'angleterre': 'England', 'irlande': 'Ireland', 'pays de galles': 'Wales', 'italie': 'Italy', 'espagne': 'Spain', 'allemagne': 'Germany', 'belgique': 'Belgium', 'pays-bas': 'Netherlands', 'argentine': 'Argentina', 'brésil': 'Brazil', 'nouvelle-zélande': 'New Zealand', 'afrique du sud': 'South Africa', 'australie': 'Australia', 'japon': 'Japan', 'états-unis': 'United States', 'suisse': 'Switzerland', 'croatie': 'Croatia', 'maroc': 'Morocco', 'géorgie': 'Georgia', 'fidji': 'Fiji', 'portugal': 'Portugal' };

let cached = null;
async function loadCatalog() {
  if (cached && Date.now() - cached.at < 5 * 60e3) return cached.cat;
  const r = await fetch(`${CATALOG_URL}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`catalogue indisponible (${r.status})`);
  cached = { at: Date.now(), cat: await r.json() };
  return cached.cat;
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRaw = (name, needle) => new RegExp(`(^|[^\\p{L}])${escRe(needle)}([^\\p{L}]|$)`, 'iu').test(name);
const wordMatch = (name, needle) => wordRaw(name, needle) || (!!NATIONS_EN[needle.toLowerCase()] && wordRaw(name, NATIONS_EN[needle.toLowerCase()]));

// favs = { leagues: [{league, mode: all|teams|ap, teams: [ids], names: [], finals}], cycling: [ids] }
function makeView(cat, favs) {
  const favFor = lg => (favs.leagues || []).find(f => f.league === lg);
  const teamOf = (lg, id) => ((cat.leagues[lg] || {}).teams || {})[id] || { n: '?', a: '', l: '' };
  const isFavTeam = (lg, id) => {
    const f = favFor(lg);
    return !!f && f.mode === 'teams' && ((f.teams || []).includes(id) || (f.names || []).some(n => wordMatch(teamOf(lg, id).n, n)));
  };
  const onlyLP = e => !e.ch.length || e.ch.every(c => c === LEAGUE_PASS);
  const visible = e => {
    const f = favFor(e.lg);
    if (!f || (f.finals && !e.ph)) return false;
    if (f.mode === 'ap') return !!(e.h.rk || e.a.rk);
    if (f.mode === 'teams') return isFavTeam(e.lg, e.h.id) || isFavTeam(e.lg, e.a.id);
    if (e.lg === 'nba') return !onlyLP(e) || !!e.hl;
    return true;
  };
  const hiddenNba = day => {
    const f = favFor('nba');
    if (!f || f.mode !== 'all') return 0;
    return cat.events.filter(e => e.lg === 'nba' && e.day === day && e.st !== 'c' && onlyLP(e) && !e.hl).length;
  };
  const cycling = () => (cat.cycling || []).filter(c => (favs.cycling || []).includes(c.lg));
  // « Paris Saint-Germain – Barcelona » (à l'américaine : « Lakers @ Celtics »)
  const title = e => {
    const us = US_SPORTS.has((cat.leagues[e.lg] || {}).sport);
    const [a, b] = us ? [e.a, e.h] : [e.h, e.a];
    return `${teamOf(e.lg, a.id).n} ${us ? '@' : '–'} ${teamOf(e.lg, b.id).n}`;
  };
  return { favFor, teamOf, isFavTeam, visible, hiddenNba, cycling, title, events: () => cat.events.filter(visible) };
}

// Favoris dans une URL (abonnement agenda) : JSON compact en base64url.
const encodeFavs = favs => Buffer.from(JSON.stringify(favs)).toString('base64url');
function decodeFavs(s) {
  try {
    const f = JSON.parse(Buffer.from(String(s || ''), 'base64url').toString('utf8'));
    return f && Array.isArray(f.leagues) ? { leagues: f.leagues, cycling: Array.isArray(f.cycling) ? f.cycling : [] } : null;
  } catch (e) { return null; }
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const addDays = (s, n) => { const d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = s => { const d = parseDay(s); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const dayName = s => DAYS[parseDay(s).getUTCDay()];
const hhmm = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const parisDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { APP_URL, TZ, loadCatalog, makeView, encodeFavs, decodeFavs, addDays, dayLabel, dayName, hhmm, parisDay, esc, MONTHS };
