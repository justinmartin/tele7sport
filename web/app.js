// Télé7Sport — app.
// Le serveur publie un catalogue (web/data/catalog.json, 2×/jour) : toutes les compétitions
// en cours, leurs matchs, équipes et classements. L'app filtre selon TES favoris, gardés sur
// le téléphone (initialisés avec ceux de la newsletter) et modifiables dans « Mes favoris ».
const SOURCES = [
  'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/catalog.json',
  '/data/catalog.json',
];
const KEYS = { catalog: 't7s_catalog', favs: 't7s_favs', favsAt: 't7s_favs_at', tab: 't7s_tab', sub: 't7s_newsletter', account: 't7s_account' };
const NIGHT_END_HOUR = 7;      // avant 7h : rattaché à la soirée de la veille
const MATCH_DURATION_H = 3;
const LEAGUE_PASS = 'NBA League Pass';
const US_SPORTS = new Set(['football', 'basketball', 'hockey']); // à l'américaine : extérieur en haut
const SPORT_LABELS = { 'foot-intl': 'Football international', 'rugby-intl': 'Rugby international', jo: 'Jeux olympiques', soccer: 'Football', basketball: 'Basket', football: 'Football américain', rugby: 'Rugby', hockey: 'Hockey sur glace', tennis: 'Tennis' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// Couleurs des chaînes (comme dans la newsletter) : plus facile à repérer d'un coup d'œil.
const CHANNEL_COLORS = {
  'canal+': '#1a1a1a', 'canal+ sport': '#1a1a1a', 'canal+ foot': '#1a1a1a', 'canal+ premier league': '#1a1a1a',
  'bein sports': '#6b2eaf', 'bein sports 1': '#6b2eaf', 'bein sports 2': '#6b2eaf', 'bein sports 3': '#6b2eaf', 'bein sports max': '#6b2eaf',
  'eurosport': '#003f87', 'eurosport 1': '#003f87', 'eurosport 2': '#003f87', 'max': '#002be7',
  'tf1': '#e4002b', 'france 2': '#1e5aa8', 'france 3': '#005bbb', 'france 4': '#6b2d7b', 'france tv': '#1e5aa8', 'france.tv': '#1e5aa8',
  'm6': '#d97c00', "l'équipe": '#d4880f', "l'equipe": '#d4880f', 'dazn': '#262626', 'rmc sport': '#e10600', 'ligue 1+': '#0b1f8f',
  'nba league pass': '#1d428a', 'league pass': '#1d428a', 'prime video': '#00a8e1', 'red bull tv': '#db0a40', 'espn': '#5a5a64',
};
const chColor = c => CHANNEL_COLORS[c.toLowerCase()] || '#3a3a40';
// Logos des chaînes (web/channels/, tirés de Wikimedia) ; le numéro de chaîne (« beIN Sports 2 ») reste en
// texte à côté. Sans logo connu : la pastille de couleur avec le nom.
const INVERT_DARK = new Set(['eurosport.svg', 'france2.png', 'france3.png', 'france4.png', 'francetv.svg', 'max.svg']);
const DARK_LOGOS = { 'lequipe.svg': 'lequipe-dark.svg' };
const CHANNEL_LOGOS = [
  [/^bein sports\s*(.*)$/i, 'bein.svg'], [/^canal\+ sport$/i, 'canal-sport.png'], [/^canal\+ foot$/i, 'canal-foot.png'],
  [/^canal\+\s*(.*)$/i, 'canal.svg'], [/^eurosport\s*(.*)$/i, 'eurosport.svg'], [/^tf1$/i, 'tf1.svg'], [/^france 2$/i, 'france2.png'],
  [/^france 3$/i, 'france3.png'], [/^france 4$/i, 'france4.png'], [/^france\s?\.?tv$/i, 'francetv.svg'], [/^m6$/i, 'm6.svg'],
  [/^dazn$/i, 'dazn.svg'], [/^rmc sport\s*(.*)$/i, 'rmc.png'], [/^ligue 1\+$/i, 'ligue1plus.svg'], [/^prime video$/i, 'prime.svg'],
  [/^max$/i, 'max.svg'], [/^espn$/i, 'espn.svg'], [/^l'[ée]quipe$/i, 'lequipe.svg'],
];
function chTag(c) {
  for (const [re, file] of CHANNEL_LOGOS) {
    const m = c.match(re);
    if (m) return `<span class="chl" title="${esc(c)}"><img src="/channels/${DARK_MQ.matches && DARK_LOGOS[file] || file}" alt="${esc(c)}"${INVERT_DARK.has(file) ? ' class="inv"' : ''}>${m[1] ? `<b>${esc(m[1] === 'Premier League' ? 'PL' : m[1])}</b>` : ''}</span>`;
  }
  return `<span class="ch" style="background:${chColor(c)}">${esc(c)}</span>`;
}

// Bilan « 4V 3N 1D » ou forme « WLLWL » : V/W en vert, D/L en rouge.
function recordHtml(r) {
  if (!r) return '';
  if (/^[WLDT]+$/.test(r)) return [...r].map(c => c === 'W' ? '<span class="w">W</span>' : c === 'L' ? '<span class="l">L</span>' : c).join('');
  return esc(r).replace(/(\d+)V/g, '<span class="w">$1V</span>').replace(/(\d+)D/g, '<span class="l">$1D</span>');
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

let cat = null;          // catalogue
let favs = null;         // { leagues: [{league, mode: all|teams|ap, teams: [ids], names: [], finals}], cycling: [ids] }
let tab = 'today';
let filter = 'all';
let openLeague = null;   // compétition dépliée dans « Mes favoris »
let teamQuery = '';
let selDay = null;       // jour choisi dans le calendrier
let calView = 'month';   // calendrier : month | week | list
let standLg = null;      // compétition affichée dans Classements

// ---------------------------------------------------------------- utilitaires
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const dayName = s => DAYS[parseDay(s).getDay()];
const dayLabel = s => { const d = parseDay(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
// Sélections nationales : ESPN les nomme en anglais (« Écosse » → « Scotland »)
const NATIONS_EN = {"écosse": "Scotland", "angleterre": "England", "irlande": "Ireland", "pays de galles": "Wales", "italie": "Italy", "espagne": "Spain", "allemagne": "Germany", "belgique": "Belgium", "pays-bas": "Netherlands", "argentine": "Argentina", "brésil": "Brazil", "nouvelle-zélande": "New Zealand", "afrique du sud": "South Africa", "australie": "Australia", "japon": "Japan", "états-unis": "United States", "suisse": "Switzerland", "croatie": "Croatia", "maroc": "Morocco", "sénégal": "Senegal", "géorgie": "Georgia", "fidji": "Fiji", "danemark": "Denmark", "suède": "Sweden", "norvège": "Norway", "autriche": "Austria", "pologne": "Poland", "mexique": "Mexico", "colombie": "Colombia", "uruguay": "Uruguay", "algérie": "Algeria", "tunisie": "Tunisia", "côte d'ivoire": "Ivory Coast", "cameroun": "Cameroon", "turquie": "Turkey", "grèce": "Greece", "tchéquie": "Czechia", "roumanie": "Romania", "samoa": "Samoa", "tonga": "Tonga", "canada": "Canada"};
const wordMatchRaw = (name, needle) => new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(name);
const wordMatch = (name, needle) => wordMatchRaw(name, needle) || (!!NATIONS_EN[needle.toLowerCase()] && wordMatchRaw(name, NATIONS_EN[needle.toLowerCase()]));

function tvToday() {
  const now = new Date();
  if (now.getHours() < NIGHT_END_HOUR) now.setDate(now.getDate() - 1);
  return isoDay(now);
}

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 60) return `il y a ${Math.max(min, 1)} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------------------------------------------------------------- favoris
const league = id => cat.leagues[id];
const team = (lg, id) => (league(lg)?.teams || {})[id] || { n: '?', a: '', l: '' };
const favFor = lg => favs.leagues.find(f => f.league === lg);

function defaultFavs() {
  return { leagues: JSON.parse(JSON.stringify(cat.default_favorites || [])), cycling: [...(cat.default_cycling || [])] };
}

function saveFavs() { write(KEYS.favs, favs); write(KEYS.favsAt, Date.now()); schedulePush(); }

function isFavTeam(lg, id) {
  const f = favFor(lg);
  if (!f || f.mode !== 'teams') return false;
  return f.teams.includes(id) || (f.names || []).some(n => wordMatch(team(lg, id).n, n));
}

const onlyLeaguePass = e => !e.ch.length || e.ch.every(c => c === LEAGUE_PASS);

// Un match fait-il partie de « mon » programme ?
// Tours d'une phase finale (catalogue : e.rk), du plus tôt au plus tard
const STAGES = ['po', 'r32', 'r16', 'qf', 'sf', 'f'];
const STAGE_LABELS = { po: 'Barrages', r32: '16es de finale', r16: '8es de finale', qf: 'Quarts de finale', sf: 'Demi-finales', f: 'Finale' };
const STAGE_LABELS_US = { r16: '1er tour des playoffs', qf: '2e tour', sf: 'Finales de conférence', f: 'Finale' };
const stageLabels = lg => US_SPORTS.has(league(lg)?.sport) ? STAGE_LABELS_US : STAGE_LABELS;
const fromOk = (f, e) => !!e.rk && STAGES.indexOf(e.rk) >= STAGES.indexOf(f.from);

function visible(e) {
  const f = favFor(e.lg);
  if (!f) return false;
  if (f.from) {  // mes équipes toute la saison, plus tous les matchs à partir de ce tour
    if (f.mode === 'teams' && (isFavTeam(e.lg, e.h.id) || isFavTeam(e.lg, e.a.id))) return true;
    return fromOk(f, e);
  }
  if (f.finals && !e.ph) return false;
  if (f.mode === 'ap') return !!(e.h.rk || e.a.rk);
  if (f.mode === 'teams') return isFavTeam(e.lg, e.h.id) || isFavTeam(e.lg, e.a.id);
  // Toute la NBA : en détail seulement les matchs diffusés en France (le reste est compté)
  if (e.lg === 'nba') return !onlyLeaguePass(e) || !!e.hl;
  return true;
}

function hiddenNba(day) {
  const f = favFor('nba');
  if (!f || f.mode !== 'all' || (filter !== 'all' && filter !== 'nba')) return 0;
  return cat.events.filter(e => e.lg === 'nba' && e.day === day && e.st !== 'c' && onlyLeaguePass(e) && !e.hl).length;
}

const myEvents = () => cat.events.filter(e => visible(e) && (filter === 'all' || e.lg === filter));

// ---------------------------------------------------------------- composants
// Logos sans fond : ESPN publie une variante pour fond sombre (/500-dark/), servie en mode sombre.
const darkSrc = url => /espncdn\.com\/i\/(teamlogos|leaguelogos)\/[^/]+\/500\//.test(url) && !/combiner/.test(url) ? url.replace('/500/', '/500-dark/')
  : /altrstat\.xyz\/.*\/logoBlack\//.test(url) ? url.replace('/logoBlack/', '/logoWhite/') : '';
const DARK_MQ = window.matchMedia('(prefers-color-scheme: dark)');
function pic(url, attrs = 'alt="" loading="lazy"') {
  const src = ((DARK_MQ.matches && darkSrc(url)) || url).replace(/^http:\/\//, 'https://');
  return `<img src="${esc(src)}" ${attrs}>`;
}

// Terrain dessiné en fond des boîtes (web/fields/) : par sport pour les compétitions par équipes,
// par discipline pour les sports individuels.
const SOLO_FIELDS = {
  'cycling-road': 'cycling', 'cycling-mtb-dh': 'mtb', 'cycling-mtb-enduro': 'mtb', motogp: 'motor', f1: 'motor', endurance: 'motor',
  dakar: 'dakar', mxgp: 'mx', supercross: 'mx', 'australian-open': 'tennis', 'roland-garros': 'tennis', wimbledon: 'tennis',
  'us-open': 'tennis', 'masters-1000': 'tennis', handball: 'handball', athletisme: 'athletisme', natation: 'natation', volley: 'volley',
  voile: 'voile', golf: 'golf', ufc: 'ufc', 'ski-alpin': 'ski', biathlon: 'biathlon', 'ski-fond': 'ski-fond', 'saut-ski': 'saut-ski', patinage: 'patinage',
};
const fieldOf = lg => { const f = league(lg)?.sport || SOLO_FIELDS[lg]; return f ? ` f-${f}` : ''; };

// Sports sans logo de compétition : logo officiel quand il existe (web/sports/), sinon picto (Tabler Icons, MIT)
const PICTOS = {"ball-volleyball": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M12 12a8 8 0 0 0 8 4\" /> <path d=\"M7.5 13.5a12 12 0 0 0 8.5 6.5\" /> <path d=\"M12 12a8 8 0 0 0 -7.464 4.928\" /> <path d=\"M12.951 7.353a12 12 0 0 0 -9.88 4.111\" /> <path d=\"M12 12a8 8 0 0 0 -.536 -8.928\" /> <path d=\"M15.549 15.147a12 12 0 0 0 1.38 -10.611\" />","target": "<path d=\"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0\" /> <path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" />","ball-tennis": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M6 5.3a9 9 0 0 1 0 13.4\" /> <path d=\"M18 5.3a9 9 0 0 0 0 13.4\" />","bike": "<path d=\"M5 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M19 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M12 19l0 -4l-3 -3l5 -4l2 3l3 0\" /> <path d=\"M17 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />","motorbike": "<path d=\"M5 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M19 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M7.5 14h5l4 -4h-10.5m1.5 4l4 -4\" /> <path d=\"M13 6h2l1.5 3l2 4\" />","ski-jumping": "<path d=\"M11 3a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M17 17.5l-5 -4.5v-6l5 4\" /> <path d=\"M7 17.5l5 -4.5\" /> <path d=\"M15.103 21.58l6.762 -14.502a2 2 0 0 0 -.968 -2.657\" /> <path d=\"M8.897 21.58l-6.762 -14.503a2 2 0 0 1 .968 -2.657\" /> <path d=\"M7 11l5 -4\" />","sailboat": "<path d=\"M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1\" /> <path d=\"M4 18l-1 -3h18l-1 3\" /> <path d=\"M11 12h7l-7 -9v9\" /> <path d=\"M8 7l-2 5\" />","snowflake": "<path d=\"M10 4l2 1l2 -1\" /> <path d=\"M12 2v6.5l3 1.72\" /> <path d=\"M17.928 6.268l.134 2.232l1.866 1.232\" /> <path d=\"M20.66 7l-5.629 3.25l.01 3.458\" /> <path d=\"M19.928 14.268l-1.866 1.232l-.134 2.232\" /> <path d=\"M20.66 17l-5.629 -3.25l-2.99 1.738\" /> <path d=\"M14 20l-2 -1l-2 1\" /> <path d=\"M12 22v-6.5l-3 -1.72\" /> <path d=\"M6.072 17.732l-.134 -2.232l-1.866 -1.232\" /> <path d=\"M3.34 17l5.629 -3.25l-.01 -3.458\" /> <path d=\"M4.072 9.732l1.866 -1.232l.134 -2.232\" /> <path d=\"M3.34 7l5.629 3.25l2.99 -1.738\" />","trophy": "<path d=\"M8 21l8 0\" /> <path d=\"M12 17l0 4\" /> <path d=\"M7 4l10 0\" /> <path d=\"M17 4v8a5 5 0 0 1 -10 0v-8\" /> <path d=\"M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />","play-handball": "<path d=\"M13 21l3.5 -2l-4.5 -4l2 -4.5\" /> <path d=\"M7 6l2 4l5 .5l4 2.5l2.5 3\" /> <path d=\"M4 20l5 -1l1.5 -2\" /> <path d=\"M15 7a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M9.5 5a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1z\" fill=\"currentColor\" />","ice-skating": "<path d=\"M5.905 5h3.418a1 1 0 0 1 .928 .629l1.143 2.856a3 3 0 0 0 2.207 1.83l4.717 .926a2.084 2.084 0 0 1 1.682 2.045v.714a1 1 0 0 1 -1 1h-13.895a1 1 0 0 1 -1 -1.1l.8 -8a1 1 0 0 1 1 -.9z\" /> <path d=\"M3 19h17a1 1 0 0 0 1 -1\" /> <path d=\"M9 15v4\" /> <path d=\"M15 15v4\" />","golf": "<path d=\"M12 18v-15l7 4l-7 4\" /> <path d=\"M9 17.67c-.62 .36 -1 .82 -1 1.33c0 1.1 1.8 2 4 2s4 -.9 4 -2c0 -.5 -.38 -.97 -1 -1.33\" />","ball-basketball": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M5.65 5.65l12.7 12.7\" /> <path d=\"M5.65 18.35l12.7 -12.7\" /> <path d=\"M12 3a9 9 0 0 0 9 9\" /> <path d=\"M3 12a9 9 0 0 1 9 9\" />","mountain": "<path d=\"M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612z\" /> <path d=\"M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2\" />","swimming": "<path d=\"M16 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M6 11l4 -2l3.5 3l-1.5 2\" /> <path d=\"M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25\" />","run": "<path d=\"M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M4 17l5 1l.75 -1.5\" /> <path d=\"M15 21l0 -4l-4 -3l1 -6\" /> <path d=\"M7 12l0 -3l5 -1l3 3l3 1\" />"};
const SPORT_ICONS = {
  cyclisme: 'bike', 'cycling-road': 'bike', 'cycling-mtb-dh': 'bike', 'cycling-mtb-enduro': 'bike', tennis: 'ball-tennis', 'australian-open': 'ball-tennis',
  'roland-garros': 'ball-tennis', wimbledon: 'ball-tennis', 'us-open': 'ball-tennis', 'masters-1000': 'ball-tennis',
  motogp: '@motogp.svg', f1: '@f1.svg', endurance: '@wec.png', dakar: '@dakar.svg', ufc: '@ufc.svg', mxgp: 'motorbike', supercross: 'motorbike',
  handball: 'play-handball', athletisme: 'run', natation: 'swimming', volley: 'ball-volleyball', voile: 'sailboat', golf: 'golf',
  'ski-alpin': 'mountain', biathlon: 'target', 'ski-fond': 'snowflake', 'saut-ski': 'ski-jumping', patinage: 'ice-skating',
  'jo-basket-m': 'ball-basketball', 'jo-basket-w': 'ball-basketball', 'premiere-ligue-f': 'trophy', 'trophee-des-champions': 'trophy',
};
const INVERT_ICONS = new Set(['@ufc.svg', '@motogp.svg', '@dakar.svg']);
// Logos de compétition sombres sans variante claire : passés en blanc en mode sombre
const INVERT_LEAGUES = new Set(['rugby-world-cup', 'champions-cup-rugby', 'challenge-cup-rugby', 'euroleague']);
function sportIcon(id, size) {
  const k = SPORT_ICONS[id];
  if (!k) return '';
  if (k[0] === '@') return `<span class="lg-tile ${size}"><img src="/sports/${k.slice(1)}" alt=""${INVERT_ICONS.has(k) ? ' class="inv"' : ''}></span>`;
  return `<span class="lg-tile ${size} picto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PICTOS[k]}</svg></span>`;
}

function lgTile(lg, size = 's') {
  const L = league(lg) || cat.cycling_leagues?.[lg] || {};
  if (!L.logo && SPORT_ICONS[lg]) return sportIcon(lg, size);
  return L.logo ? `<span class="lg-tile ${size}${/\.jpe?g$|Top_14/i.test(L.logo) ? ' solid' : ''}${INVERT_LEAGUES.has(lg) ? ' inv' : ''}">${pic(L.logo)}</span>`
    : `<span class="lg-tile ${size} mono"><span>${esc(mono(lg, L))}</span></span>`;
}

function liveState(e) {
  if (e.st === 'c') return 'done';
  if (e.st === 'i') return 'live';
  const start = new Date(e.ko).getTime(), now = Date.now();
  if (now >= start && now < start + MATCH_DURATION_H * 3600e3) return 'live';
  return now >= start ? 'done' : 'upcoming';
}

// Nom court pour la ligne centrée : « AS Monaco » → « Monaco », « Inter Miami CF » → « Inter Miami »
const shortName = n => n.replace(/^(?:FC|AFC|AC|AS|SC|CF|RC|SV|1\. FC) (?=\S)/, '').replace(/ (?:FC|CF|SC|AFC)$/, '');
// Fin estimée (minutes, pauses comprises)
const DURATION_MIN = { soccer: 115, rugby: 110, basketball: 135, football: 195, hockey: 150 };
const endTime = e => { const m = DURATION_MIN[league(e.lg)?.sport]; return m ? hhmm(new Date(new Date(e.ko).getTime() + m * 60e3).toISOString()) : ''; };

function teamLogo(lg, id) {
  const t = team(lg, id);
  return t.l ? pic(t.l) : '<span class="noimg"></span>';
}

function sideCol(e, side) {
  const s = e[side], t = team(e.lg, s.id);
  const cls = ['mt'];
  if (isFavTeam(e.lg, s.id)) cls.push('fav');
  const mine = side === 'h' ? e.hs : e.as, theirs = side === 'h' ? e.as : e.hs;
  if (e.st === 'c' && e.hs != null && mine < theirs) cls.push('loser');
  return `<div class="${cls.join(' ')}" data-team="${esc(s.id)}" data-league="${e.lg}" role="button" tabindex="0" aria-label="${esc(t.n)}">
    ${teamLogo(e.lg, s.id)}
    <span class="mn">${s.rk ? `<span class="rk">${s.rk}</span>` : ''}${esc(shortName(t.n))}</span>
  </div>`;
}

function matchRow(e) {
  const state = liveState(e);
  const sport = league(e.lg)?.sport;
  const [left, right] = US_SPORTS.has(sport) ? ['a', 'h'] : ['h', 'a'];
  const hasScore = e.hs != null && (e.st === 'c' || e.st === 'i');
  const lv = left === 'h' ? e.hs : e.as, rv = left === 'h' ? e.as : e.hs;
  let center;
  if (hasScore) center = `<span class="mscore${state === 'live' ? ' on' : ''}">${lv}<i>-</i>${rv}</span>`;
  else center = `<span class="mtime${state === 'upcoming' ? '' : ' dim'}">${hhmm(e.ko)}</span>`;
  let under = '';
  if (state === 'live') under = `<span class="live">EN DIRECT</span>${e.det ? `<span class="live-detail">${esc(e.det)}</span>` : ''}`;
  else if (state === 'done') under = `<span class="status">${e.st === 'c' ? 'Terminé' : 'Score à venir'}</span>`;
  else under = e.ch.slice(0, 2).map(c => chTag(c)).join('')
    + `<button class="cal-add" type="button" data-cal="${e.lg}:${esc(e.eid)}" aria-label="Ajouter à mon agenda">${CAL_ICON}</button>`;
  const top = [e.hl && state !== 'done' ? '<span class="tag">À ne pas rater</span>' : '', e.rd ? esc(e.rd) : ''].filter(Boolean).join(' ');
  return `<article class="match box${fieldOf(e.lg)}${e.nt ? ' night' : ''}" data-match="${e.lg}:${esc(e.eid)}">
    ${top ? `<div class="mround">${top}</div>` : ''}
    <div class="mrow">
      ${sideCol(e, left)}
      <div class="mid">
        <div class="mline"><span class="rec">${recordHtml(e[left].r)}</span>${center}<span class="rec">${recordHtml(e[right].r)}</span></div>
        <div class="munder">${under}</div>
      </div>
      ${sideCol(e, right)}
    </div>
  </article>`;
}

function byLeague(events) {
  const groups = new Map();
  events.forEach(e => { if (!groups.has(e.lg)) groups.set(e.lg, []); groups.get(e.lg).push(e); });
  return [...groups].map(([lg, evs]) =>
    `<div class="league">${lgTile(lg)}${esc(league(lg).label)}</div><div class="cards">${evs.map(matchRow).join('')}</div>`).join('');
}

// Le bandeau regroupe certains sports sous une seule entrée (tous les tournois de tennis)
const STRIP_GROUPS = { cyclisme: ['cycling-road', 'cycling-mtb-dh', 'cycling-mtb-enduro'], tennis: ['australian-open', 'roland-garros', 'wimbledon', 'us-open', 'masters-1000'] };
const inFilter = lg => filter === 'all' || lg === filter || (STRIP_GROUPS[filter] || []).includes(lg);

function cyclingFor(day) {
  return (cat.cycling || []).filter(c => favs.cycling.includes(c.lg) && inFilter(c.lg) && c.start <= day && day <= c.end);
}

function cyclingRows(list) {
  if (!list.length) return '';
  const groups = new Map();
  list.forEach(c => { if (!groups.has(c.lg)) groups.set(c.lg, []); groups.get(c.lg).push(c); });
  return [...groups].map(([lg, cs]) => `<div class="league">${lgTile(lg)}${esc(cs[0].label)}</div><div class="cards">` + cs.map(c => `
    <article class="event-solo box${fieldOf(lg)}" data-solo="${(cat.cycling || []).indexOf(c)}">
      <div><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.loc || '')}${c.details ? ` · ${esc(c.details)}` : ''}</div></div>
      <div class="side">${c.time ? `<span class="time">${esc(c.time)}</span>` : ''}<div class="channels">${(c.ch || []).map(x => chTag(x)).join('')}</div></div>
    </article>`).join('') + '</div>').join('');
}

const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';

// Une journée : soirée par compétition, puis la nuit, puis le résumé League Pass.
function dayBlock(day, events, { title = true, newestFirst = false } = {}) {
  const sort = list => list.sort((a, b) => newestFirst ? b.ko.localeCompare(a.ko) : a.ko.localeCompare(b.ko));
  const evening = sort(events.filter(e => !e.nt)), night = sort(events.filter(e => e.nt));
  const hidden = newestFirst ? 0 : hiddenNba(day);
  const cycling = newestFirst ? [] : cyclingFor(day);
  if (!evening.length && !night.length && !hidden && !cycling.length) return '';
  const isToday = day === tvToday();
  return `<section class="day">
    ${title ? `<h2 class="day-title"><span>${cap(dayLabel(day))}</span>${isToday && !newestFirst ? '<span class="pill">Ce soir</span>' : ''}</h2>` : ''}
    ${byLeague(evening)}${cyclingRows(cycling)}
    ${night.length ? `<div class="subhead">${MOON}Nuit de ${dayName(day)} à ${dayName(addDays(day, 1))}</div>${byLeague(night)}` : ''}
    ${hidden ? `<div class="more">+ ${hidden} autre${hidden > 1 ? 's' : ''} match${hidden > 1 ? 's' : ''} NBA sur le League Pass</div>` : ''}
  </section>`;
}

// Le titre d'abord ; la date ou le contexte en dessous, jamais en sur-titre.
function pageHead(meta, title) {
  return `<header class="page-head"><h1 class="page-title">${esc(title)}</h1><div class="page-meta">${esc(meta)}</div></header>`;
}

// Sports sans logo : un monogramme, pas un émoji
const MONO = {
  'cycling-road': 'CYC', 'cycling-mtb-dh': 'DH', 'cycling-mtb-enduro': 'END', motogp: 'MGP', f1: 'F1', mxgp: 'MX',
  supercross: 'SX', dakar: 'DKR', endurance: 'WEC', 'australian-open': 'AO', 'roland-garros': 'RG', wimbledon: 'WIM',
  'us-open': 'USO', 'masters-1000': 'ATP', handball: 'HB', athletisme: 'ATH', natation: 'NAT', volley: 'VB', voile: 'VOI',
  golf: 'GLF', ufc: 'UFC', 'ski-alpin': 'SKI', biathlon: 'BIA', 'ski-fond': 'FND', 'saut-ski': 'SAU', patinage: 'PAT',
};
const mono = (lg, L) => MONO[lg] || (L.label || '').split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();

const noFavs = () => '<p class="empty">Aucune compétition suivie pour l\'instant.<br><button type="button" data-action="open-favs">Choisir mes favoris</button></p>';

// ---------------------------------------------------------------- pages
// Le match du soir : une affiche signalée, sinon un match d'une équipe suivie, sinon le premier.
function featured(list) {
  const upcoming = list.filter(e => liveState(e) !== 'done');
  const pool = upcoming.length ? upcoming : list;
  // Équipes suivies dans n'importe quelle compétition (le PSG suivi en Ligue 1 compte aussi en C1)
  const favNames = new Set();
  favs.leagues.filter(f => f.mode === 'teams').forEach(f => {
    f.teams.forEach(id => favNames.add(team(f.league, id).n));
    (f.names || []).forEach(n => favNames.add(n));
  });
  const isMine = e => [e.h, e.a].some(s => isFavTeam(e.lg, s.id) || [...favNames].some(n => wordMatch(team(e.lg, s.id).n, n)));
  const prime = e => { const h = new Date(e.ko).getHours(); return h >= 20 && h <= 22; };
  return pool.find(e => e.hl) || pool.find(isMine) || pool.find(prime) || pool[0];
}

function heroCard(e) {
  const L = league(e.lg), state = liveState(e);
  const [left, right] = US_SPORTS.has(L.sport) ? ['a', 'h'] : ['h', 'a'];
  const side = k => {
    const t = team(e.lg, e[k].id);
    return `<div class="hero-team" data-team="${esc(e[k].id)}" data-league="${e.lg}" role="button" tabindex="0">
      ${teamLogo(e.lg, e[k].id)}<b>${esc(shortName(t.n))}</b><span class="rec">${recordHtml(e[k].r)}</span></div>`;
  };
  const hasScore = e.hs != null && (e.st === 'c' || e.st === 'i');
  const lv = left === 'h' ? e.hs : e.as, rv = left === 'h' ? e.as : e.hs;
  const end = endTime(e);
  const center = hasScore ? `<span class="hero-time">${lv} - ${rv}</span>${state === 'live' ? '<span class="live">EN DIRECT</span>' : '<span class="status">Terminé</span>'}`
    : `<span class="hero-time">${hhmm(e.ko)}</span>${end ? `<span class="hero-end">fin vers ${end}</span>` : ''}`;
  const fav = isFavTeam(e.lg, e.h.id) ? e.h.id : isFavTeam(e.lg, e.a.id) ? e.a.id : e[left].id;
  return `<section class="hero${fieldOf(e.lg)}${e.nt ? ' night' : ''}" data-match="${e.lg}:${esc(e.eid)}">
    <div class="hero-top"><span>${e.hl ? 'À ne pas rater' : 'Le match du soir'}</span><span>${lgTile(e.lg)}${esc(L.label)}</span></div>
    <div class="hero-row">${side(left)}<div class="hero-mid">${center}</div>${side(right)}</div>
    ${e.ch.length ? `<div class="hero-ch">${e.ch.map(c => chTag(c)).join('')}</div>` : ''}
    <div class="hero-actions">
      ${state === 'upcoming' ? `<button type="button" data-cal="${e.lg}:${esc(e.eid)}">${CAL_ICON}Ajouter à l'agenda</button>` : ''}
      <button type="button" data-team="${esc(fav)}" data-league="${e.lg}">Fiche ${esc(shortName(team(e.lg, fav).n).length > 12 && team(e.lg, fav).a ? team(e.lg, fav).a : shortName(team(e.lg, fav).n))}</button>
    </div>
  </section>`;
}

// Une carte compacte du fil horaire : logos, noms, chaîne, compétition et fin estimée.
function slotCard(e) {
  const L = league(e.lg), state = liveState(e);
  const [left, right] = US_SPORTS.has(L.sport) ? ['a', 'h'] : ['h', 'a'];
  const hasScore = e.hs != null && (e.st === 'c' || e.st === 'i');
  const line = k => {
    const score = k === 'h' ? e.hs : e.as;
    return `<div class="sc-team${isFavTeam(e.lg, e[k].id) ? ' fav' : ''}" data-team="${esc(e[k].id)}" data-league="${e.lg}" role="button" tabindex="0">
      ${teamLogo(e.lg, e[k].id)}<span>${esc(shortName(team(e.lg, e[k].id).n))}</span>${hasScore ? `<b>${score}</b>` : ''}</div>`;
  };
  const end = endTime(e);
  const info = state === 'live' ? '<span class="live">EN DIRECT</span>' : state === 'done' ? (hasScore ? 'Terminé' : 'Score à venir') : (end ? `fin vers ${end}` : '');
  return `<article class="slot-card box${fieldOf(e.lg)}${e.nt ? ' night' : ''}" data-match="${e.lg}:${esc(e.eid)}">
    <div class="sc-teams">${line(left)}${line(right)}</div>
    <div class="sc-side">${e.ch.slice(0, 1).map(c => chTag(c)).join('')}
      ${state === 'upcoming' ? `<button class="cal-add" type="button" data-cal="${e.lg}:${esc(e.eid)}" aria-label="Ajouter à mon agenda">${CAL_ICON}</button>` : ''}</div>
    <div class="sc-sub">${lgTile(e.lg)}${esc(L.label)}${info ? ` · ${info}` : ''}</div>
  </article>`;
}

function timeline(list) {
  const slots = new Map();
  list.sort((a, b) => a.ko.localeCompare(b.ko)).forEach(e => {
    const k = hhmm(e.ko) + (e.nt ? 'n' : '');
    if (!slots.has(k)) slots.set(k, []);
    slots.get(k).push(e);
  });
  let nightShown = false;
  return [...slots].map(([k, evs]) => {
    const night = k.endsWith('n');
    const head = night && !nightShown ? (nightShown = true, `<div class="subhead">${MOON}Cette nuit</div>`) : '';
    return `${head}<div class="slot${night ? ' night' : ''}"><div class="slot-time">${k.replace('n', '')}</div><div class="slot-list">${evs.map(slotCard).join('')}</div></div>`;
  }).join('');
}

function renderToday() {
  const today = tvToday();
  if (!favs.leagues.length && !favs.cycling.length) return pageHead(cap(dayLabel(today)), 'Ce soir') + installTip() + noFavs();
  const list = myEvents().filter(e => e.day === today);
  const nightCount = list.filter(e => e.nt).length;
  const summary = list.length ? `${list.length} match${list.length > 1 ? 's' : ''} pour tes équipes${nightCount ? ` · ${nightCount} cette nuit` : ''}` : '';
  let html = pageHead(cap(dayLabel(today)), 'Ce soir') + (summary ? `<p class="page-sub">${summary}</p>` : '') + installTip();
  if (list.length) {
    const hero = featured(list);
    html += heroCard(hero) + timeline(list.filter(e => e !== hero));
    const hidden = hiddenNba(today), cycling = cyclingFor(today);
    if (cycling.length) html += cyclingRows(cycling);
    if (hidden) html += `<div class="more">+ ${hidden} autre${hidden > 1 ? 's' : ''} match${hidden > 1 ? 's' : ''} NBA sur le League Pass</div>`;
    return html;
  }
  const solo = dayBlock(today, [], { title: false });
  if (solo) return html + solo;
  html += '<p class="empty">Rien au programme ce soir pour tes équipes.</p>';
  const next = [...new Set(myEvents().filter(e => e.day > today).map(e => e.day))].sort().slice(0, 2);
  return html + next.map(d => dayBlock(d, myEvents().filter(e => e.day === d))).join('');
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Grille du mois : de ce lundi jusqu'au bout du programme connu (4 à 5 semaines).
const SPORT_COLORS = { soccer: '#5b8cff', rugby: '#f2a33a', basketball: '#ff6b5e', football: '#34c759', hockey: '#9aa5ff', tennis: '#d4e157', solo: '#b0b0b8' };
const SPORT_SHORT = { soccer: 'Foot', rugby: 'Rugby', basketball: 'Basket', football: 'Foot US', hockey: 'Hockey', tennis: 'Tennis', solo: 'Autres sports' };
const dayEvents = d => myEvents().filter(e => e.day === d);
const daySports = d => {
  const set = new Set(dayEvents(d).map(e => league(e.lg)?.sport));
  if (cyclingFor(d).length) set.add('solo');
  return [...set].filter(Boolean);
};
const calLast = today => cat.range?.end && cat.range.end > today ? cat.range.end : addDays(today, 27);
const mondayOf = d => addDays(d, -((parseDay(d).getDay() + 6) % 7));
const dots = d => daySports(d).slice(0, 4).map(sp => `<i style="background:${SPORT_COLORS[sp]}"></i>`).join('');

function monthView(today) {
  const first = mondayOf(today), last = calLast(today);
  const cells = [];
  for (let d = first; d <= last || (cells.length % 7); d = addDays(d, 1)) {
    const n = parseDay(d).getDate();
    const cls = ['cal-day'];
    if (d === today) cls.push('today');
    if (d === selDay) cls.push('sel');
    if (d < today) cls.push('past');
    if (d > last) cls.push('out');
    const count = dayEvents(d).length;
    cells.push(`<button class="${cls.join(' ')}" type="button" data-day="${d}"${d > last ? ' disabled' : ''} aria-label="${esc(dayLabel(d))}${count ? `, ${count} match${count > 1 ? 's' : ''}` : ''}">
      <span class="num">${n === 1 ? `1 ${MONTHS_SHORT[parseDay(d).getMonth()]}` : n}</span><span class="dots">${dots(d)}</span></button>`);
  }
  const used = new Set();
  for (let d = first; d <= last; d = addDays(d, 1)) daySports(d).forEach(sp => used.add(sp));
  return `<div class="cal">
    <div class="cal-head">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="cal-legend">${[...used].map(sp => `<span><i style="background:${SPORT_COLORS[sp]}"></i>${SPORT_SHORT[sp]}</span>`).join('')}</div>
  </div>`;
}

function weekView(today) {
  const start = mondayOf(selDay);
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const last = calLast(today);
  return `<div class="week-strip">${days.map(d => {
      const n = dayEvents(d).length + cyclingFor(d).length;
      const cls = ['wk-day'];
      if (d === selDay) cls.push('sel');
      if (d === today) cls.push('today');
      const off = d < cat.range.start || d > last;
      return `<button class="${cls.join(' ')}" type="button" data-day="${d}"${off ? ' disabled' : ''}>
        <span class="w">${SHORT_DAYS[parseDay(d).getDay()].replace('.', '')}</span><span class="n">${parseDay(d).getDate()}</span>
        <span class="c">${n ? `${n} m.` : '–'}</span></button>`;
    }).join('')}</div>
    <div class="week-nav">
      <button type="button" data-week="-7"${addDays(start, -1) < cat.range.start ? ' disabled' : ''}>‹ Semaine précédente</button>
      <button type="button" data-week="7"${addDays(start, 7) > last ? ' disabled' : ''}>Semaine suivante ›</button>
    </div>`;
}

// Noms complets s'ils tiennent, sinon les acronymes officiels
function agLabel(e, l, r, us) {
  const [a, b] = [team(e.lg, e[l].id), team(e.lg, e[r].id)];
  const full = `${shortName(a.n)} ${us ? '@' : '–'} ${shortName(b.n)}`;
  return full.length <= 27 || !a.a || !b.a ? full : `${a.a} ${us ? '@' : '–'} ${b.a}`;
}

function listView(today) {
  const last = calLast(today);
  const rows = [];
  for (let d = today; d <= last; d = addDays(d, 1)) {
    const evs = dayEvents(d).sort((a, b) => a.ko.localeCompare(b.ko)), solo = cyclingFor(d);
    if (!evs.length && !solo.length) continue;
    const dt = parseDay(d);
    rows.push(`<div class="ag-day${d === today ? ' today' : ''}">
      <div class="ag-date"><span>${d === today ? 'AUJ.' : SHORT_DAYS[dt.getDay()].toUpperCase()}</span><b>${dt.getDate()}</b>${dt.getDate() === 1 || d === today ? `<small>${MONTHS_SHORT[dt.getMonth()]}</small>` : ''}</div>
      <div class="ag-list">
        ${evs.map(e => {
          const sp = league(e.lg)?.sport, us = US_SPORTS.has(sp);
          const [l, r] = us ? ['a', 'h'] : ['h', 'a'];
          return `<button class="ag-item${e.nt ? ' night' : ''}" type="button" data-day-jump="${d}">
            <i style="background:${SPORT_COLORS[sp] || '#888'}"></i>
            <span class="lbl">${esc(agLabel(e, l, r, us))}</span>
            <span class="t">${e.st === 'c' && e.hs != null ? `${e[l] === e.h ? e.hs : e.as}-${e[r] === e.h ? e.hs : e.as}` : hhmm(e.ko)}</span></button>`;
        }).join('')}
        ${solo.map(c => `<div class="ag-item"><i style="background:${SPORT_COLORS.solo}"></i><span class="lbl">${esc(c.name)}</span><span class="t">${esc(c.time || '')}</span></div>`).join('')}
      </div>
    </div>`);
  }
  return `<div class="agenda">${rows.join('') || '<p class="empty">Rien au programme pour tes équipes.</p>'}</div>`;
}

function renderCalendar() {
  const today = tvToday();
  if (!selDay || selDay < cat.range.start || selDay > cat.range.end) selDay = today;
  const sel = parseDay(selDay);
  let html = `<header class="page-head row"><div><h1 class="page-title">${cap(MONTHS[sel.getMonth()])} <span class="dim">${sel.getFullYear()}</span></h1></div>
    <button class="sub-pill" type="button" data-action="subscribe">${CAL_ICON}S'abonner</button></header>`;
  if (!favs.leagues.length && !favs.cycling.length) return html + noFavs();
  html += `<div class="seg" role="tablist" aria-label="Affichage">${[['month', 'Mois'], ['week', 'Semaine'], ['list', 'Liste']].map(([v, l]) =>
    `<button type="button" role="tab" aria-selected="${calView === v}" class="${calView === v ? 'on' : ''}" data-calview="${v}">${l}</button>`).join('')}</div>`;
  if (calView === 'list') return html + listView(today);
  html += calView === 'week' ? weekView(today) : monthView(today);
  const block = dayBlock(selDay, dayEvents(selDay));
  return html + `<div id="cal-list">${block || `<section class="day"><h2 class="day-title"><span>${cap(dayLabel(selDay))}</span></h2><p class="empty small">Rien ce jour-là pour tes équipes.</p></section>`}</div>`;
}

function renderResults() {
  const done = myEvents().filter(e => e.st === 'c' && e.hs != null);
  let html = pageHead('Les deux dernières semaines', 'Résultats');
  if (!done.length) return html + '<p class="empty">Pas encore de résultat pour tes équipes.</p>';
  const days = [...new Set(done.map(e => e.day))].sort().reverse();
  return html + days.map(d => dayBlock(d, done.filter(e => e.day === d), { newestFirst: true })).join('');
}

let expandedTables = new Set();

// Longue table : le haut du classement + deux places autour de chaque équipe suivie.
function condensed(entries, isFav, key) {
  if (entries.length <= 12 || expandedTables.has(key)) return { rows: entries, hidden: 0 };
  const keep = new Set([0, 1, 2, 3]);
  entries.forEach((r, i) => { if (isFav(r)) for (let j = i - 2; j <= i + 2; j++) keep.add(j); });
  if (keep.size <= 4) for (let j = 4; j < 8; j++) keep.add(j);
  const rows = [];
  entries.forEach((r, i) => {
    if (keep.has(i)) rows.push(r);
    else if (rows[rows.length - 1] !== 'gap') rows.push('gap');
  });
  return { rows, hidden: entries.length - [...keep].filter(i => i >= 0 && i < entries.length).length };
}

// Forme (5 derniers matchs) d'après le catalogue
function formOf(lg, id) {
  return cat.events.filter(e => e.lg === lg && e.st === 'c' && e.hs != null && (e.h.id === id || e.a.id === id))
    .sort((a, b) => b.ko.localeCompare(a.ko)).slice(0, 5).reverse()
    .map(e => { const us = e.h.id === id ? e.hs : e.as, them = e.h.id === id ? e.as : e.hs; return us > them ? 'w' : us < them ? 'l' : 'd'; });
}

function standingCards() {
  const cards = [];
  favs.leagues.filter(f => f.mode === 'teams').forEach(f => {
    const table = cat.tables[f.league];
    if (!table) return;
    const L = league(f.league);
    table.groups.forEach(g => g.entries.forEach(r => {
      if (!isFavTeam(f.league, r.team_id)) return;
      const form = formOf(f.league, r.team_id);
      const ordinal = r.rank ? (r.rank === 1 ? '1er' : `${r.rank}e`) : '–';
      cards.push(`<article class="st-card box${fieldOf(f.league)}" data-team="${esc(r.team_id)}" data-league="${f.league}" role="button" tabindex="0">
        <div class="st-top">
          ${r.logo ? pic(r.logo, 'alt=""') : '<span class="noimg"></span>'}
          <div class="st-name"><b>${esc(r.team)}</b><span>${esc(L.label)}${table.groups.length > 1 ? ` · ${esc(g.name)}` : ''}</span></div>
          <div class="st-rank"><b>${ordinal}</b><span>sur ${g.entries.length}</span></div>
        </div>
        <div class="st-bottom"><span class="rec-cell">${recordHtml(r.record)}${r.points != null && r.points !== '' ? ` · ${esc(r.points)} pts` : ''}</span>
          ${form.length ? `<span class="form sm">${form.map(o => `<span class="${o}">${OUTCOME_FR[o]}</span>`).join('')}</span>` : ''}</div>
      </article>`);
    }));
  });
  return cards.join('');
}

function leagueTable(lgId, f) {
  const table = cat.tables[lgId];
  const isFav = row => isFavTeam(lgId, row.team_id);
  const L = league(lgId), points = ['soccer', 'rugby'].includes(L.sport);
  return table.groups.map(g => {
    const key = `${lgId}:${g.name}`;
    const { rows, hidden } = condensed(g.entries, isFav, key);
    const cols = points ? 4 : 3;
    return `<div class="card table-card"><table class="table">
      ${table.groups.length > 1 || g.name !== L.label ? `<caption>${esc(g.name)}</caption>` : ''}
      <thead><tr><th>#</th><th>Équipe</th><th>Bilan</th>${points ? '<th>Pts</th>' : ''}</tr></thead>
      <tbody>${rows.map(r => r === 'gap' ? `<tr class="gap"><td colspan="${cols}">···</td></tr>` : `<tr class="${isFav(r) ? 'fav' : ''}" data-team="${esc(r.team_id)}" data-league="${lgId}">
        <td>${r.rank ?? '–'}</td>
        <td class="team-cell"><span class="tc">${r.logo ? pic(r.logo) : ''}<span>${esc(r.team)}</span></span></td>
        <td class="rec-cell">${recordHtml(r.record)}</td>${points ? `<td class="pts">${esc(r.points ?? '')}</td>` : ''}
      </tr>`).join('')}</tbody></table>${hidden ? `<button class="table-more" type="button" data-expand="${esc(key)}">Voir les ${g.entries.length} équipes</button>` : ''}</div>`;
  }).join('');
}

function renderStandings() {
  let html = pageHead('Bilan de tes équipes', 'Classements');
  const cards = standingCards();
  if (cards) html += `<div class="section-title">Mes équipes</div><div class="st-cards">${cards}</div>`;
  const brackets = cat.brackets || {};
  const ordered = [...favs.leagues].sort((a, b) => (b.mode === 'teams') - (a.mode === 'teams'))
    .filter(f => (cat.tables[f.league] && f.mode !== 'ap') || brackets[f.league]);
  // Sports individuels suivis (F1, MotoGP) : classement des pilotes
  const solo = favs.cycling.filter(id => cat.solo_tables?.[id] || brackets[id]);
  const ids = [...ordered.map(f => f.league), ...solo];
  if (!ids.length) return html + (cards ? '' : '<p class="empty">Pas de classement pour tes compétitions en ce moment.</p>');
  if (ids.includes(filter)) standLg = filter;
  if (!standLg || !ids.includes(standLg)) standLg = ids[0];
  const chip = id => {
    const L = league(id) || cat.cycling_leagues[id];
    return `<button class="chip${id === standLg ? ' active' : ''}" type="button" data-stand="${id}">${L.logo ? pic(L.logo, 'alt=""') : lgTile(id)}${esc(L.label)}</button>`;
  };
  html += `<div class="section-title" id="tables">Classements complets</div>
    <div class="filters">${ids.map(chip).join('')}</div>
`;
  const hasTable = !!(cat.tables[standLg] || cat.solo_tables?.[standLg]), b = brackets[standLg];
  if (b && hasTable) html += `<div class="seg two">${[['table', 'Classement'], ['bracket', 'Tableau']].map(([v, l]) =>
    `<button type="button" class="${(standView === v) ? 'on' : ''}" data-standview="${v}">${l}</button>`).join('')}</div>`;
  if (b && (standView === 'bracket' || !hasTable)) return html + bracketView(b, standLg);
  return html + (cat.solo_tables?.[standLg] ? soloTable(standLg) : leagueTable(standLg, favFor(standLg)));
}

// Tableau des phases finales : une colonne par tour, défilement horizontal ; projection signalée
let standView = 'table';
function bracketSide(s, lgId, us) {
  if (!s) return '<div class="bk-side tbd"><span class="bk-name">À venir</span></div>';
  if (s.tbd) return `<div class="bk-side tbd"><span class="bk-name">${esc(s.n)}</span></div>`;
  const fav = lgId && league(lgId) && isFavTeam(lgId, s.id);
  const logo = s.l ? pic(s.l) : '<span class="noimg"></span>';
  return `<div class="bk-side${s.win ? ' win' : ''}${fav ? ' fav' : ''}"${league(lgId) && s.id ? ` data-team="${esc(s.id)}" data-league="${lgId}" role="button" tabindex="0"` : ''}>
    ${logo}<span class="bk-name">${s.seed ? `<small>${s.seed}</small>` : ''}${esc(US_SPORTS.has(league(lgId)?.sport) && s.n.includes(' ') ? s.n.replace(/^.* (\S+)$/, '$1') : shortName(s.n))}</span>${s.score != null && s.score !== '' ? `<b>${esc(s.score)}</b>` : ''}</div>`;
}
function bracketView(b, lgId) {
  const head = b.kind === 'projection' ? '<span class="bk-badge">Projection</span>' : b.kind === 'empty' ? '<span class="bk-badge muted">À venir</span>' : '';
  return `<div class="bk-head">${head}${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}</div>` + b.sections.map(sec => `
    ${sec.name ? `<h3 class="bk-section">${esc(sec.name)}</h3>` : ''}
    <div class="bracket">${sec.rounds.map(r => `<div class="bk-round"><div class="bk-rname">${esc(r.name)}</div><div class="bk-ties">
      ${r.ties.map(t => `<div class="bk-tie">${bracketSide(t.a, lgId)}${bracketSide(t.b, lgId)}${t.info ? `<div class="bk-info">${esc(t.info)}</div>` : ''}</div>`).join('')}
    </div></div>`).join('')}</div>`).join('');
}

function soloTable(lgId) {
  const t = cat.solo_tables[lgId], key = `${lgId}:solo`;
  const { rows, hidden } = condensed(t.rows, () => false, key);
  return `<div class="card table-card"><table class="table">
    <caption>${esc(t.title)} · saison ${esc(t.season)}</caption>
    <thead><tr><th>#</th><th>Pilote</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => r === 'gap' ? '<tr class="gap"><td colspan="3">···</td></tr>' : `<tr>
      <td>${r.rank ?? '–'}</td>
      <td class="team-cell"><span class="tc">${r.flag ? pic(r.flag) : ''}<span>${esc(r.name)}${r.team ? `<small class="sub"> · ${esc(r.team)}</small>` : ''}</span></span></td>
      <td class="pts">${esc(r.pts ?? '')}</td>
    </tr>`).join('')}</tbody></table>${hidden ? `<button class="table-more" type="button" data-expand="${esc(key)}">Voir les ${t.rows.length} pilotes</button>` : ''}</div>`;
}

// ---------------------------------------------------------------- actu
// /api/news : L'Équipe, RMC Sport, Trashtalk, Rugbyrama… rangés par sport. L'app garde les articles des sports
// suivis, met en avant ceux qui citent tes équipes ou tes compétitions, et le bandeau filtre par compétition.
let newsData = read('t7s_news');
let newsMode = 'mine';     // mine : mes sports et équipes | all : toute l'actu
let newsLimit = 30;
const SOLO_SPORT = { tennis: 'tennis', cycling: 'cycling', hiver: 'hiver' };
const SOLO_NEWS = { f1: 'auto', endurance: 'auto', dakar: 'auto', motogp: 'moto', mxgp: 'moto', supercross: 'moto', ufc: 'combat',
  handball: 'handball', athletisme: 'athletisme', natation: 'natation', voile: 'voile', golf: 'golf' };
const NEWS_SPORT_LABELS = { soccer: 'Foot', basketball: 'Basket', rugby: 'Rugby', football: 'Foot US', hockey: 'Hockey', tennis: 'Tennis',
  cycling: 'Cyclisme', auto: 'Auto', moto: 'Moto', hiver: 'Sports d\'hiver', handball: 'Handball', athletisme: 'Athlétisme',
  natation: 'Natation', voile: 'Voile', golf: 'Golf', combat: 'Combat' };
const newsSportOf = id => league(id)?.sport || SOLO_NEWS[id] || SOLO_SPORT[cat.cycling_leagues?.[id]?.sport] || (STRIP_GROUPS[id] ? (id === 'cyclisme' ? 'cycling' : id) : null);

let newsLoading = false, newsFailedAt = 0;
async function loadNews() {
  if (newsLoading || (newsData && Date.now() - newsData.at < 20 * 60e3) || Date.now() - newsFailedAt < 60e3) return;
  newsLoading = true;
  try {
    const d = await fetch('/api/news').then(r => r.ok ? r.json() : Promise.reject(r.status));
    newsData = { at: Date.now(), ...d }; write('t7s_news', newsData);
  } catch (e) { newsFailedAt = Date.now(); }
  newsLoading = false;
  if (tab === 'news') render();
}

// Ce qui m'intéresse : mes équipes (3 points), mes compétitions citées (2), mes sports (1)
function newsKeys() {
  const teams = [], comps = [];
  favs.leagues.forEach(f => {
    const L = league(f.league);
    if (!L) return;
    comps.push(L.label, STRIP_LABELS[f.league]);
    (f.mode === 'teams' ? f.teams : []).forEach(id => {
      const t = team(f.league, id);
      teams.push({ sport: L.sport, v: [t.n, shortName(t.n), US_SPORTS.has(L.sport) ? t.n.split(' ').pop() : '', /^[A-Z]{2,4}$/.test(t.a || '') && t.a.length >= 3 ? t.a : ''].filter(Boolean) });
    });
    // Sélections nationales : « France » seul accrocherait « Coupe de France » ; on cherche « équipe de France », « les Bleus »…
    (f.names || []).forEach(n => teams.push({ sport: L.sport, v: /^france$/i.test(n)
      ? ['équipe de France', 'Bleus', 'Bleues', ...(L.sport === 'rugby' ? ['XV de France'] : [])]
      : NATIONS_EN[n.toLowerCase()] || /^[A-ZÉ][a-zé]+$/.test(n) ? [`équipe d'${n}`, `équipe de ${n}`, `${n} –`, `– ${n}`] : [n] }));
  });
  favs.cycling.forEach(id => comps.push(cat.cycling_leagues?.[id]?.label));
  return { teams, comps: comps.filter(c => c && c.length > 2) };
}
function scored() {
  const sports = new Set([...favs.leagues.map(f => newsSportOf(f.league)), ...favs.cycling.map(newsSportOf)].filter(Boolean));
  const { teams, comps } = newsKeys();
  const only = filter !== 'all' ? newsSportOf(filter) : null;
  return (newsData?.articles || []).map(a => {
    const text = `${a.title} ${a.excerpt}`;
    // Une équipe ne compte que dans son sport : « France » au rugby n'accroche pas les Bleus du foot
    const hit = teams.find(t => t.sport === a.sport && t.v.some(v => wordMatchRaw(text, v)));
    const score = hit ? 3 : comps.some(c => wordMatchRaw(text, c)) ? 2 : sports.has(a.sport) ? 1 : 0;
    return { ...a, score, tagTeam: hit ? (hit.v[0].startsWith('équipe') ? hit.v[0].replace(/^équipe d(e |')/, '') : hit.v[1] || hit.v[0]) : '' };
  }).filter(a => (only ? a.sport === only : true));
}
function newsCard(a, big) {
  const src = (newsData.sources || []).find(s => s.id === a.source) || { name: a.source, color: '#333', ink: '#fff' };
  const meta = `<span class="nw-src" style="background:${src.color};color:${src.ink}">${esc(src.name)}</span><span class="nw-time">${ago(a.date)}</span>${a.tagTeam ? `<span class="nw-tag">${esc(shortName(a.tagTeam))}</span>` : ''}`;
  return big ? `<a class="nw-hero" href="${esc(a.url)}" target="_blank" rel="noopener">
      ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : ''}<div class="nw-body"><div class="nw-meta">${meta}</div><h2>${esc(a.title)}</h2>${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}</div></a>`
    : `<a class="nw-row" href="${esc(a.url)}" target="_blank" rel="noopener"><div><div class="nw-meta">${meta}</div><h3>${esc(a.title)}</h3></div>
      ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : ''}</a>`;
}
function renderNews() {
  loadNews();
  let html = pageHead(filter !== 'all' ? `${NEWS_SPORT_LABELS[newsSportOf(filter)] || ''} · d'après le bandeau` : 'Tes sports et tes équipes', 'Actu');
  if (filter === 'all') html += `<div class="seg two">${[['mine', 'Pour toi'], ['all', 'Toute l\'actu']].map(([v, l]) => `<button type="button" class="${newsMode === v ? 'on' : ''}" data-newsmode="${v}">${l}</button>`).join('')}</div>`;
  if (!newsData) return html + `<p class="empty">${newsFailedAt ? 'Actu indisponible pour l\'instant, réessaie dans un moment.' : 'Chargement de l\'actu…'}</p>`;
  const all = scored();
  // « Pour toi » : d'abord ce qui cite mes équipes ou mes compétitions, puis le reste de mes sports ;
  // « Toute l'actu » : tout, du plus récent au plus ancien
  const mine = newsMode === 'mine' && filter === 'all';
  const top = mine ? all.filter(a => a.score >= 2) : all;
  const more = mine ? all.filter(a => a.score === 1) : [];
  if (!top.length && !more.length) return html + '<p class="empty">Pas d\'article récent pour tes favoris.</p>';
  // À la une : l'article le plus récent qui cite une de mes équipes (sinon le plus récent), de préférence avec une image
  const pool = top.length ? top : more;
  const hero = pool.find(a => a.score === 3 && a.image) || pool.find(a => a.image) || pool[0];
  const rest = top.filter(a => a !== hero), rest2 = more.filter(a => a !== hero);
  const shown = rest.slice(0, newsLimit), left = newsLimit - shown.length;
  return html + newsCard(hero, true) + `<div class="nw-list">${shown.map(a => newsCard(a)).join('')}</div>`
    + (mine && left > 0 && rest2.length ? `<div class="section-title">Dans tes sports</div><div class="nw-list">${rest2.slice(0, left).map(a => newsCard(a)).join('')}</div>` : '')
    + (rest.length + rest2.length > newsLimit ? '<button class="table-more" type="button" data-newsmore>Voir plus d\'articles</button>' : '')
    + '<p class="note nw-credit">Titres, images et extraits des sites cités ; l\'article complet s\'ouvre chez eux.</p>';
}

function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || !/iPhone|iPad/.test(navigator.userAgent)) return '';
  return '<div class="install-tip">Pour l\'avoir sur ton écran d\'accueil : <strong>Partager</strong>, puis <strong>« Sur l\'écran d\'accueil »</strong>.</div>';
}

function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.body.classList.toggle('no-strip', tab === 'standings');
  const view = $('#view');
  if (!cat) { view.innerHTML = '<p class="empty">Chargement du programme…</p>'; return; }
  view.innerHTML = { today: renderToday, week: renderCalendar, results: renderResults, standings: renderStandings, news: renderNews }[tab]();
  $('#updated').textContent = ago(cat.generated_at);
  renderStrip();
}

// Bandeau du haut (façon ESPN) : « Tout », puis mes compétitions et mes sports. Il filtre toutes les pages.
const STRIP_LABELS = {
  'champions-league': 'C1', 'europa-league': 'C3', 'conference-league': 'C4', 'coupe-de-france': 'Coupe de Fr.', 'nations-league': 'Ligue des n.',
  'world-cup-qual': 'Qualif. CM', 'equipe-de-france-foot': 'Bleus', 'premier-league': 'Premier L.', 'champions-cup-rugby': 'Champions Cup',
  'challenge-cup-rugby': 'Challenge Cup', 'six-nations': '6 Nations', 'rugby-world-cup': 'CM rugby', 'betclic-elite': 'Betclic Élite',
  'cycling-road': 'Cyclisme', 'cycling-mtb-dh': 'VTT DH', 'cycling-mtb-enduro': 'Enduro', 'masters-1000': 'Masters 1000', handball: 'Handball',
  golf: 'Golf', endurance: 'Endurance', 'roland-garros': 'Roland-G.', 'australian-open': 'Open d\'Aus.',
};
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>';
function renderStrip() {
  if (!cat || !favs) return;
  const solo = favs.cycling.filter(id => cat.cycling_leagues?.[id]);
  const grouped = new Set(Object.values(STRIP_GROUPS).flat());
  const ids = [...favs.leagues.map(f => f.league).filter(id => league(id)), ...solo.filter(id => !grouped.has(id)),
    ...Object.keys(STRIP_GROUPS).filter(g => solo.some(id => STRIP_GROUPS[g].includes(id)))];
  if (filter !== 'all' && !ids.includes(filter)) filter = 'all';
  const item = id => {
    const L = league(id) || cat.cycling_leagues[id] || { label: cap(id) };
    return `<button class="st-item${filter === id ? ' active' : ''}" type="button" data-strip="${id}" aria-pressed="${filter === id}">${STRIP_GROUPS[id] ? sportIcon(id, 'm') : lgTile(id, 'm')}<span>${esc(STRIP_LABELS[id] || L.label)}</span></button>`;
  };
  $('#strip').innerHTML = `<button class="st-item${filter === 'all' ? ' active' : ''}" type="button" data-strip="all" aria-pressed="${filter === 'all'}"><span class="st-all"><svg viewBox="-6 -2 222 104" aria-hidden="true"><g transform="skewX(-14)"><path fill="currentColor" d="M0 0h64v24H44v76H20V24H0z"/><path fill="var(--accent)" d="M72 0h64v24l-36 76H76l34-76H72z"/><path fill="currentColor" d="M152 0h56v24h-40v14h32l8 8v46l-8 8h-56V76h40V62h-32l-8-8V8z"/></g></svg></span><span>Tout</span></button>`
    + ids.map(item).join('')
    + `<span class="st-sep"></span><button class="st-item" type="button" data-action="open-favs"><span class="st-plus">${PLUS}</span><span>Favoris</span></button>`;
}

// ---------------------------------------------------------------- éditeur de favoris
function favSummary(f) {
  if (!f) return '';
  const finals = f.from ? ` · tout dès les ${stageLabels(f.league)[f.from].toLowerCase()}` : f.finals ? ' · phases finales' : '';
  if (f.mode === 'ap') return 'Top 25 AP';
  if (f.mode === 'all') return (f.league === 'nba' ? 'Toute la ligue (matchs diffusés en France)' : 'Toutes les équipes') + finals;
  const n = f.teams.length + (f.names || []).length;
  return `${n} équipe${n > 1 ? 's' : ''}${finals}`;
}

function renderFavs() {
  // Sections : clubs par sport, puis sélections nationales et JO à part
  const SECTION_ORDER = ['soccer', 'foot-intl', 'rugby', 'rugby-intl', 'basketball', 'football', 'hockey', 'tennis', 'jo'];
  const bySport = {};
  Object.entries(cat.leagues).forEach(([id, L]) => { (bySport[L.group || L.sport] ||= []).push([id, L]); });
  const sorted = Object.fromEntries(Object.entries(bySport).sort((a, b) =>
    (SECTION_ORDER.indexOf(a[0]) + 1 || 99) - (SECTION_ORDER.indexOf(b[0]) + 1 || 99)));
  Object.keys(bySport).forEach(k => delete bySport[k]);
  Object.assign(bySport, sorted);
  // Dans chaque sport : compétitions en cours d'abord, celles à l'arrêt ensuite
  Object.values(bySport).forEach(list => list.sort((a, b) => (b[1].active !== false) - (a[1].active !== false)));
  let html = `<input class="search team-search" type="search" placeholder="Chercher une équipe (PSG, Lakers, Stade Toulousain…)" value="${esc(favQuery)}" data-action="team-search" autocomplete="off">
    <div id="team-results">${teamResults()}</div>`;
  html += account
    ? `<p class="note" style="margin-top:14px">Synchronisés avec le compte <strong>${esc(account.pseudo)}</strong>.</p>`
    : `<section class="acc-pitch box f-soccer"><h3>Tes favoris, partout</h3><p>Crée un compte pour les retrouver sur tous tes appareils.</p>
        <button class="btn primary" type="button" data-action="account">Créer un compte ou me connecter</button></section>`;
  Object.entries(bySport).forEach(([sport, list]) => {
    html += `<div class="sport">${esc(SPORT_LABELS[sport] || sport)}</div>`;
    list.forEach(([id, L]) => {
      const f = favFor(id);
      const ap = id === 'ncaaf' || id === 'ncaam';
      html += `<div class="fav-league">
        <div class="fav-row">
          ${lgTile(id, 'm')}
          <button class="label" type="button" data-action="expand" data-league="${id}">${esc(L.label)}<small>${esc(f ? favSummary(f) : 'Non suivie')}${L.note && L.active === false ? ` · ${esc(L.note)}` : L.active === false ? ' · pas de match en ce moment' : ''}</small></button>
          <button class="switch" role="switch" aria-checked="${!!f}" aria-label="Suivre ${esc(L.label)}" data-action="toggle" data-league="${id}" type="button"></button>
        </div>`;
      if (f && openLeague === id) {
        const modes = [['all', 'Toutes'], ['teams', 'Mes équipes'], ...(ap ? [['ap', 'Top 25']] : [])];
        html += `<div class="fav-detail">
          <div class="seg">${modes.map(([m, l]) => `<button type="button" class="${f.mode === m ? 'on' : ''}" data-action="mode" data-league="${id}" data-mode="${m}">${l}</button>`).join('')}</div>
          ${L.has_finals ? `<label class="from">${f.mode === 'teams' ? 'Et tous les matchs à partir des' : 'Seulement à partir des'}
            <select data-action="from" data-league="${id}"><option value="">${f.mode === 'teams' ? '— (mes équipes seulement)' : '— (toute la compétition)'}</option>
            ${Object.entries(stageLabels(id)).map(([k, l]) => `<option value="${k}"${f.from === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          ${f.mode === 'teams' ? teamPicker(id, f) : ''}
        </div>`;
      }
      html += '</div>';
    });
  });
  const SOLO_SECTIONS = { tennis: 'Tennis', cycling: 'Cyclisme', moto: 'Sports mécaniques', autres: 'Autres sports', hiver: "Sports d'hiver" };
  Object.entries(SOLO_SECTIONS).forEach(([sport, title]) => {
    const list = Object.entries(cat.cycling_leagues || {}).filter(([, C]) => (C.sport || 'cycling') === sport);
    if (!list.length) return;
    html += `<div class="sport">${title}</div>`;
    list.forEach(([id, C]) => {
      const on = favs.cycling.includes(id);
      const today = tvToday();
      const soon = (cat.cycling || []).filter(c => c.lg === id && c.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
      const next = soon ? (soon.start <= today ? `En cours : ${soon.name}` : `Prochain : ${soon.name} · ${dayLabel(soon.start)}`)
        : C.next ? `Prochain : ${C.next.name} · ${dayLabel(C.next.start)}` : 'Calendrier pas encore publié';
      html += `<div class="fav-league"><div class="fav-row">
        ${lgTile(id, 'm')}
        <span class="label">${esc(C.label)}<small>${esc(next)}</small></span>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="Suivre ${esc(C.label)}" data-action="toggle-cycling" data-league="${id}" type="button"></button>
      </div></div>`;
    });
  });
  // Newsletter par e-mail en pause (identifiants Gmail pas configurés sur Vercel) : NEWSLETTER_ON pour la réactiver
  html += (NEWSLETTER_ON ? newsletterBlock() : '') + `<div class="sport">Widget iPhone</div>
  <div class="sheet-actions" style="margin-top:10px">
    <button class="btn primary" type="button" data-action="widget">Copier le script du widget</button>
    <p class="note">1. Installe l'app gratuite <strong>Scriptable</strong> (App Store).<br>
      2. Dans Scriptable : <strong>+</strong>, colle le script, nomme-le « Télé7Sport ».<br>
      3. Sur l'écran d'accueil : appui long → <strong>+</strong> → Scriptable → widget petit, moyen ou grand → touche-le → Script : <strong>Télé7Sport</strong>.<br>
      Le widget suit tes favoris du moment où tu copies le script : recopie-le si tu les changes.</p>
  </div>
  <div class="sheet-actions"><button class="btn" type="button" data-action="reset">Revenir aux favoris par défaut</button>
    <button class="btn primary" type="button" data-action="done">Terminé</button></div>`;
  $('#favs-body').innerHTML = html;
}

// Recherche d'une équipe dans toutes les compétitions : la suivre partout d'un geste
let favQuery = '';
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Compétitions féminines : le PSG féminin est une autre équipe que le PSG masculin
const isWomen = lg => /-f$/.test(lg) || /f[ée]minin/i.test(league(lg)?.label || '');
function teamMatches(q) {
  const groups = new Map();
  Object.entries(cat.leagues).forEach(([lg, L]) => Object.entries(L.teams || {}).forEach(([id, t]) => {
    if (!norm(t.n).includes(q) && norm(t.a || '') !== q) return;
    const name = isWomen(lg) ? `${t.n} (féminines)` : t.n;
    if (!groups.has(name)) groups.set(name, { name, logo: t.l, places: [] });
    groups.get(name).places.push([lg, id]);
  }));
  return [...groups.values()].sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q) || b.places.length - a.places.length).slice(0, 8);
}
function teamResults() {
  const q = norm(favQuery.trim());
  if (q.length < 2) return '';
  const list = teamMatches(q);
  if (!list.length) return '<p class="note">Aucune équipe trouvée.</p>';
  return `<div class="tr-list">${list.map(g => {
    const all = g.places.every(([lg, id]) => isFavTeam(lg, id) || favFor(lg)?.mode === 'all');
    return `<div class="tr-row">${g.logo ? pic(g.logo) : '<span class="noimg"></span>'}
      <span class="tr-name">${esc(g.name)}<small>${esc(g.places.map(([lg]) => league(lg).label).join(' · '))}</small></span>
      <button class="follow-pill sm${all ? ' on' : ''}" type="button" data-action="follow-everywhere" data-name="${esc(g.name)}">${all ? 'Suivie' : 'Suivre'}</button></div>`;
  }).join('')}</div>`;
}
function followEverywhere(name) {
  const g = teamMatches(norm(name)).find(x => x.name === name);
  if (!g) return;
  const all = g.places.every(([lg, id]) => isFavTeam(lg, id) || favFor(lg)?.mode === 'all');
  g.places.forEach(([lg, id]) => {
    let f = favFor(lg);
    if (all) {  // déjà suivie partout : on la retire de ses compétitions « mes équipes »
      if (f && f.mode === 'teams') { f.teams = f.teams.filter(x => x !== id); if (!f.teams.length && !(f.names || []).length) favs.leagues = favs.leagues.filter(x => x !== f); }
      return;
    }
    if (!f) { f = { league: lg, mode: 'teams', teams: [], names: [], finals: false }; favs.leagues.push(f); }
    if (f.mode === 'ap') { f.mode = 'teams'; f.teams = []; }
    if (f.mode === 'teams' && !f.teams.includes(id)) f.teams.push(id);
  });
  toast(all ? `${name} retirée de tes favoris` : `${name} suivie dans ${g.places.length} compétition${g.places.length > 1 ? 's' : ''}`);
}

function teamPicker(lg, f) {
  return `<input class="search" type="search" placeholder="Rechercher une équipe" value="${esc(teamQuery)}" data-action="search" data-league="${lg}" autocomplete="off">${teamGrid(lg, f)}`;
}

function teamGrid(lg, f) {
  const all = Object.entries(league(lg).teams);
  const q = teamQuery.trim().toLowerCase();
  const list = all.filter(([, t]) => !q || t.n.toLowerCase().includes(q))
    .sort((a, b) => (f.teams.includes(b[0]) - f.teams.includes(a[0])) || a[1].n.localeCompare(b[1].n));
  const names = (f.names || []).map(n => `<button class="team-chip on" type="button" data-action="drop-name" data-league="${lg}" data-name="${esc(n)}">${esc(n)}</button>`).join('');
  // Équipe pas (encore) connue — ex. « France » pour une Coupe du monde pas commencée : on suit le nom.
  const typed = teamQuery.trim();
  const addName = typed && !list.some(([, t]) => t.n.toLowerCase() === typed.toLowerCase()) && !(f.names || []).includes(typed)
    ? `<button class="team-chip" type="button" data-action="add-name" data-league="${lg}" data-name="${esc(typed)}">+ Suivre « ${esc(typed)} »</button>` : '';
  if (!all.length && !names && !addName) return '<p class="note">Les équipes apparaîtront dès les premiers matchs. Tape un nom pour le suivre dès maintenant.</p>';
  return `<div class="team-grid">${names}${addName}${list.map(([id, t]) => `<button class="team-chip${f.teams.includes(id) ? ' on' : ''}" type="button" data-action="team" data-league="${lg}" data-team="${id}">
      ${t.l ? pic(t.l) : ''}${esc(t.n)}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- newsletter par e-mail
// On s'inscrit avec son adresse : le serveur garde l'adresse et les favoris, et envoie le
// programme chaque lundi matin. Les favoris changés ici sont renvoyés automatiquement.
const NEWSLETTER_ON = false;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let sub = null;          // { email, id, token }

function newsletterBlock() {
  const head = '<div class="sport">Newsletter du lundi</div>';
  if (sub) return `${head}<div class="newsletter">
    <p class="note">Le programme de la semaine arrive chaque lundi matin à <strong>${esc(sub.email)}</strong>, avec tes favoris ci-dessus.</p>
    <button class="btn" type="button" data-action="unsubscribe">Me désinscrire</button></div>`;
  return `${head}<form class="newsletter" data-action="subscribe-form">
    <p class="note">Reçois le programme de tes équipes chaque lundi matin.</p>
    <div class="nl-row"><input class="search" type="email" name="email" placeholder="ton@email.fr" autocomplete="email" inputmode="email" required>
    <button class="btn primary" type="submit">S'inscrire</button></div></form>`;
}

async function subscribe(email) {
  const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, favs, ...(sub && sub.email === email ? { id: sub.id, token: sub.token } : {}) }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Inscription impossible');
  if (data.token) { sub = { email, id: data.id, token: data.token }; write(KEYS.sub, sub); }
  return data;
}

// Favoris modifiés : on met la newsletter à jour (une seule fois, après la dernière modif)
let syncTimer = null;
function syncNewsletter() {
  if (!sub) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => subscribe(sub.email).catch(() => {}), 1500);
}

async function unsubscribe() {
  if (!sub || !confirm('Ne plus recevoir la newsletter ?')) return;
  await fetch(`/api/unsubscribe?id=${encodeURIComponent(sub.id)}&t=${encodeURIComponent(sub.token)}`, { headers: { Accept: 'application/json' } }).catch(() => {});
  sub = null;
  try { localStorage.removeItem(KEYS.sub); } catch (e) {}
  toast('Désinscrit');
  renderFavs();
}

// ---------------------------------------------------------------- compte
// Pseudo + mot de passe (empreinte scrypt côté serveur, comme Le Fauteuil Rouge) : les favoris suivent
// sur tous les appareils. Le plus récent gagne ; à la connexion, ceux du compte remplacent ceux du téléphone.
let account = null;      // { pseudo, token }
let accMode = 'signup';
let pushTimer = null;
const USER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

async function accountApi(body) {
  const r = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Erreur, réessaie.'); e.status = r.status; throw e; }
  return d;
}
const accountData = () => ({ favs, updated: read(KEYS.favsAt) || Date.now() });
function schedulePush() { if (!account) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1200); }
async function pushNow() {
  if (!account || !favs) return;
  try { await accountApi({ action: 'push', pseudo: account.pseudo, token: account.token, data: accountData() }); }
  catch (e) { if (e.status === 401) signOutLocal('Session expirée : reconnecte-toi'); }
}
function applyRemote(data) { favs = data.favs; migrateFavs(); write(KEYS.favs, favs); write(KEYS.favsAt, data.updated); }
async function pullOnOpen() {
  if (!account) return;
  try {
    const { data } = await accountApi({ action: 'pull', pseudo: account.pseudo, token: account.token });
    const localAt = read(KEYS.favsAt) || 0;
    if (data?.favs && data.updated > localAt) { applyRemote(data); if ($('#favs').hidden) render(); }
    else if (favs && (!data?.favs || localAt > data.updated)) pushNow();
  } catch (e) { if (e.status === 401) signOutLocal('Session expirée : reconnecte-toi'); }
}
function signOutLocal(msg) { account = null; write(KEYS.account, null); refreshMeButton(); if (msg) toast(msg); }
function refreshMeButton() {
  const b = $('#open-me');
  b.innerHTML = account ? `<span class="avatar">${esc(account.pseudo[0].toUpperCase())}</span>` : USER_ICON;
  b.setAttribute('aria-label', account ? `Mon compte (${account.pseudo})` : 'Mon compte');
}

function renderAccount() {
  const body = $('#account-body');
  if (account) {
    const n = favs ? favs.leagues.length + favs.cycling.length : 0;
    body.innerHTML = `<section class="me">
      <div class="me-head"><span class="avatar">${esc(account.pseudo[0].toUpperCase())}</span><div><h3>${esc(account.pseudo)}</h3><small>${n} compétition${n > 1 ? 's' : ''} suivie${n > 1 ? 's' : ''}, synchronisées sur tous tes appareils</small></div></div>
      <p class="note">Connecte-toi avec ce pseudo sur un autre téléphone ou un ordinateur : tes favoris y seront aussi.</p>
      <div class="sheet-actions" style="margin-top:8px">
        <button class="btn" type="button" data-acc-sync>Synchroniser maintenant</button>
        <button class="btn" type="button" data-acc-logout>Se déconnecter</button>
      </div>
      <button class="link-btn" type="button" data-acc-delete>Supprimer mon compte</button>
    </section>`;
    return;
  }
  body.innerHTML = `<section class="acc-pitch box f-soccer">
      <h3>Tes favoris, partout</h3>
      <p>Un pseudo et un mot de passe suffisent : tes compétitions et tes équipes te suivent d'un téléphone à l'autre, et tu ne les perds plus si tu changes d'appareil.</p>
    </section>
    <form id="acc-form" class="acc-form" autocomplete="on">
      <div class="seg"><button type="button" class="${accMode === 'signup' ? 'on' : ''}" data-acc-mode="signup">Créer un compte</button><button type="button" class="${accMode === 'login' ? 'on' : ''}" data-acc-mode="login">Se connecter</button></div>
      <label>Pseudo<input class="search" name="pseudo" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="24"></label>
      <label>Mot de passe<input class="search" name="password" type="password" autocomplete="${accMode === 'signup' ? 'new-password' : 'current-password'}" required minlength="8"></label>
      <button class="btn primary" type="submit">${accMode === 'signup' ? 'Créer mon compte' : 'Me connecter'}</button>
      <p class="acc-msg" role="status"></p>
      <p class="note">Pas d'adresse e-mail demandée, donc pas de récupération possible : garde ton mot de passe. Il n'est jamais stocké en clair.</p>
    </form>`;
}

async function authSubmit(form) {
  const msg = form.querySelector('.acc-msg'), btn = form.querySelector('button[type="submit"]');
  msg.textContent = ''; btn.disabled = true;
  try {
    const res = await accountApi({ action: accMode, pseudo: form.pseudo.value.trim(), password: form.password.value });
    account = { pseudo: res.pseudo, token: res.token }; write(KEYS.account, account);
    if (res.data?.favs) { applyRemote(res.data); toast('Connecté : tes favoris sont de retour'); }
    else { await pushNow(); toast(accMode === 'signup' ? `Bienvenue ${res.pseudo} : tes favoris sont sauvegardés` : 'Connecté : favoris sauvegardés'); }
    refreshMeButton(); renderAccount(); render();
    if (!$('#favs').hidden) renderFavs();
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

function openAccount() { renderAccount(); $('#account').hidden = false; document.body.classList.add('sheet-open'); }
function closeAccount() {
  $('#account').hidden = true;
  if ($('#favs').hidden && $('#team').hidden) document.body.classList.remove('sheet-open');
  if (!$('#favs').hidden) renderFavs();
}

// ---------------------------------------------------------------- agenda
// Un match : fichier .ics (Apple), ou lien d'ajout Google / Outlook.
// Mes favoris : abonnement (webcal) que l'app d'agenda relit toute seule.
const CAL_DURATION_H = { soccer: 2, rugby: 2, basketball: 2.5, hockey: 3, football: 3.5 };
const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const b64url = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function compactFavs() {
  return { leagues: favs.leagues.map(f => {
    const o = { league: f.league, mode: f.mode };
    if (f.teams?.length) o.teams = f.teams;
    if (f.names?.length) o.names = f.names;
    if (f.finals) o.finals = true;
    return o;
  }), cycling: favs.cycling };
}

function openCalSheet(title, sub2, options) {
  $('#cal-title').textContent = title;
  $('#cal-sub').textContent = sub2;
  $('#cal-options').innerHTML = options.map(([label, href, note]) =>
    `<a class="as-option" href="${esc(href)}"${href.startsWith('http') && !href.startsWith(location.origin) ? ' target="_blank" rel="noopener"' : ''}>
      <span>${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ''}</a>`).join('');
  $('#cal').hidden = false;
}

function closeCalSheet() { $('#cal').hidden = true; }

function addMatchToCalendar(key) {
  const [lg, eid] = key.split(':');
  const e = cat.events.find(x => x.lg === lg && String(x.eid) === eid);
  if (!e) return;
  const L = league(lg), us = US_SPORTS.has(L.sport);
  const [a, b] = us ? [e.a, e.h] : [e.h, e.a];
  const title = `${team(lg, a.id).n} ${us ? '@' : '–'} ${team(lg, b.id).n}`;
  const start = new Date(e.ko), end = new Date(start.getTime() + (CAL_DURATION_H[L.sport] || 2) * 3600e3);
  const details = [L.label + (e.rd ? ` · ${e.rd}` : ''), e.ch.length ? `Sur ${e.ch.join(', ')}` : '', location.origin].filter(Boolean).join('\n');
  const q = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  openCalSheet(title, `${cap(dayLabel(e.day))} · ${hhmm(e.ko)}${e.ch.length ? ` · ${e.ch.join(', ')}` : ''}`, [
    ['Calendrier Apple', `/api/ics?e=${encodeURIComponent(key)}`],
    ['Google Agenda', `https://calendar.google.com/calendar/render?${q({ action: 'TEMPLATE', text: title, dates: `${icsStamp(start)}/${icsStamp(end)}`, details, location: e.ch.join(', ') })}`],
    ['Outlook', `https://outlook.live.com/calendar/0/deeplink/compose?${q({ path: '/calendar/action/compose', rru: 'addevent', subject: title, startdt: start.toISOString(), enddt: end.toISOString(), body: details, location: e.ch.join(', ') })}`],
  ]);
}

function subscribeCalendar() {
  const feed = `${location.host}/api/ics?f=${b64url(JSON.stringify(compactFavs()))}`;
  openCalSheet('Mes matchs dans mon agenda', 'Un agenda « Télé7Sport » avec les matchs de tes favoris actuels, mis à jour tout seul.', [
    ['Calendrier Apple', `webcal://${feed}`],
    ['Google Agenda', `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${feed}`)}`, 'Sur ordinateur, puis visible sur le téléphone'],
    ['Outlook', `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(`https://${feed}`)}&name=${encodeURIComponent('Télé7Sport')}`],
  ]);
}

function onFavAction(el) {
  const lg = el.dataset.league, action = el.dataset.action;
  const f = lg && favFor(lg);
  if (action === 'toggle') {
    if (f) { favs.leagues = favs.leagues.filter(x => x.league !== lg); if (openLeague === lg) openLeague = null; }
    else { favs.leagues.push({ league: lg, mode: lg === 'ncaaf' || lg === 'ncaam' ? 'ap' : 'all', teams: [], names: [], finals: false }); openLeague = lg; teamQuery = ''; }
  } else if (action === 'expand') {
    openLeague = openLeague === lg ? null : lg; teamQuery = '';
  } else if (action === 'toggle-cycling') {
    favs.cycling = favs.cycling.includes(lg) ? favs.cycling.filter(x => x !== lg) : [...favs.cycling, lg];
  } else if (action === 'mode' && f) {
    f.mode = el.dataset.mode;
  } else if (action === 'from' && f) {
    f.from = el.value || null; f.finals = !!f.from;  // « finals » : compatibilité newsletter / widget
  } else if (action === 'follow-everywhere') {
    followEverywhere(el.dataset.name);
  } else if (action === 'done') {
    closeFavs();
    return;
  } else if (action === 'team' && f) {
    const id = el.dataset.team;
    f.teams = f.teams.includes(id) ? f.teams.filter(x => x !== id) : [...f.teams, id];
  } else if (action === 'add-name' && f) {
    f.names = [...(f.names || []), el.dataset.name]; teamQuery = '';
  } else if (action === 'drop-name' && f) {
    f.names = (f.names || []).filter(n => n !== el.dataset.name);
  } else if (action === 'account') {
    openAccount();
    return;
  } else if (action === 'unsubscribe') {
    unsubscribe();
    return;
  } else if (action === 'reset') {
    if (!confirm('Revenir aux favoris par défaut ?')) return;
    favs = defaultFavs();
  } else if (action === 'widget') {
    if (!widgetTemplate) { toast('Script pas encore chargé, réessaie'); loadWidgetTemplate(); return; }
    const script = widgetTemplate
      .replace('__FAVS__', JSON.stringify(favs))
      .replace('__NATIONS__', JSON.stringify(NATIONS_EN))
      .replace('__CHANNELS__', JSON.stringify(CHANNEL_COLORS));
    navigator.clipboard?.writeText(script).then(() => toast('Script copié : colle-le dans Scriptable'), () => toast('Copie impossible'));
    return;
  } else {
    return;
  }
  saveFavs();
  syncNewsletter();
  renderFavs();
}

function openFavs() {
  if (!widgetTemplate) loadWidgetTemplate();
  $('#favs').hidden = false;
  document.body.classList.add('sheet-open');
  renderFavs();
}

function closeFavs() {
  $('#favs').hidden = true;
  document.body.classList.remove('sheet-open');
  if (filter !== 'all' && !favFor(filter)) filter = 'all';
  render();
}

// ---------------------------------------------------------------- scores en direct
// Toutes les minutes, s'il y a un match de mes favoris en cours ou sur le point de commencer,
// on lit le scoreboard ESPN de sa compétition (autorisé depuis le navigateur).
// Relais Vercel (/api/espn) : le CDN d'ESPN ne renvoie pas toujours l'en-tête CORS.
const espnUrl = (path, dates) => `/api/espn?path=${encodeURIComponent(path)}${dates ? `&dates=${dates}` : ''}`;
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const ymdNY = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d).replace(/-/g, '');

async function pollLive() {
  if (!cat || document.visibilityState !== 'visible') return;
  const now = Date.now();
  const watch = cat.events.filter(e => e.st !== 'c' && e.eid && league(e.lg)?.espn && visible(e)
    && now >= new Date(e.ko) - 15 * 60e3 && now < new Date(e.ko).getTime() + 5 * 3600e3);
  if (!watch.length) return;
  const byLeague = new Map();
  watch.forEach(e => {
    const d = new Date(e.ko);
    if (!byLeague.has(e.lg)) byLeague.set(e.lg, new Set());
    byLeague.get(e.lg).add(ymd(d)).add(ymdNY(d));
  });
  let changed = false;
  await Promise.all([...byLeague].flatMap(([lg, dates]) => [...dates].map(async date => {
    try {
      const data = await fetch(espnUrl(`${league(lg).espn}/scoreboard`, date)).then(r => r.json());
      (data.events || []).forEach(raw => {
        const e = cat.events.find(x => x.eid === raw.id);
        if (!e) return;
        const comp = raw.competitions?.[0] || {}, type = comp.status?.type || {};
        const score = side => { const c = (comp.competitors || []).find(x => x.homeAway === side); const v = parseInt(c?.score, 10); return Number.isNaN(v) ? null : v; };
        const st = type.completed ? 'c' : type.state === 'in' ? 'i' : e.st;
        const det = type.state === 'in' ? (type.shortDetail || comp.status?.displayClock || '') : '';
        const hs = score('home'), as = score('away');
        if (st !== e.st || hs !== e.hs || as !== e.as || det !== e.det) {
          Object.assign(e, { st, det }, hs != null ? { hs, as } : {});
          changed = true;
        }
      });
    } catch (err) { /* hors-ligne : on garde l'état connu */ }
  })));
  if (changed && $('#favs').hidden && $('#team').hidden) render();
}

// ---------------------------------------------------------------- fiche équipe
const SHORT_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const shortDate = iso => { const d = new Date(iso); return `${SHORT_DAYS[d.getDay()]} ${d.getDate()}/${pad(d.getMonth() + 1)}`; };

// Matchs d'une équipe : catalogue (3 semaines, fiable) + calendrier ESPN de la saison quand
// il est à jour (NFL, NBA…), dédoublonnés par identifiant de match.
function teamGamesFromCatalog(lg, id) {
  return cat.events.filter(e => e.lg === lg && (e.h.id === id || e.a.id === id)).map(e => {
    const home = e.h.id === id, opp = home ? e.a : e.h;
    return { eid: e.eid, ko: e.ko, home, oppId: opp.id, oppName: team(lg, opp.id).n, oppLogo: team(lg, opp.id).l,
             done: e.st === 'c' && e.hs != null, us: home ? e.hs : e.as, them: home ? e.as : e.hs, ch: e.ch, live: e.st === 'i' };
  });
}

// Logo d'un adversaire venu d'ESPN : celui du catalogue s'il existe (déjà corrigé), et jamais un
// drapeau pour un club (ESPN confond Perpignan « USA » avec les États-Unis, Vannes « VAN » avec le Vanuatu)
function clubLogo(lg, id, espnLogo) {
  const known = team(lg, id).l;
  if (known) return known;
  const intl = ['foot-intl', 'rugby-intl', 'jo'].includes(league(lg)?.group);
  return !intl && /\/countries\//.test(espnLogo) ? '' : espnLogo;
}

async function teamGamesFromEspn(lg, id) {
  if (!league(lg)?.espn) return [];  // EuroLeague, Betclic Élite : le catalogue suffit
  try {
    const data = await fetch(espnUrl(`${league(lg).espn}/teams/${id}/schedule`)).then(r => r.ok ? r.json() : {});
    return (data.events || []).map(raw => {
      const comp = raw.competitions?.[0] || {};
      const me = (comp.competitors || []).find(c => String(c.team?.id) === String(id));
      const opp = (comp.competitors || []).find(c => String(c.team?.id) !== String(id));
      if (!me || !opp) return null;
      const val = c => { const v = typeof c.score === 'object' ? c.score?.displayValue : c.score; const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };
      const done = !!comp.status?.type?.completed;
      return { eid: raw.id, ko: raw.date, home: me.homeAway === 'home', oppId: String(opp.team?.id || ''),
               oppName: opp.team?.displayName || '?', oppLogo: clubLogo(lg, String(opp.team?.id || ''), opp.team?.logos?.[0]?.href || opp.team?.logo || ''),
               done, us: done ? val(me) : null, them: done ? val(opp) : null, ch: [] };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function outcome(g) {
  if (!g.done || g.us == null) return '';
  return g.us > g.them ? 'w' : g.us < g.them ? 'l' : 'd';
}
const OUTCOME_FR = { w: 'V', l: 'D', d: 'N' };

function standingOf(lg, id) {
  for (const g of cat.tables[lg]?.groups || []) {
    const row = g.entries.find(r => r.team_id === id);
    if (row) return { ...row, group: g.name, size: g.entries.length };
  }
  return null;
}

function renderTeam(lg, id, games) {
  const t = team(lg, id), L = league(lg), st = standingOf(lg, id);
  const now = Date.now();
  const past = games.filter(g => g.done).sort((a, b) => b.ko.localeCompare(a.ko));
  const next = games.filter(g => !g.done && new Date(g.ko).getTime() > now - 3 * 3600e3).sort((a, b) => a.ko.localeCompare(b.ko));
  const followed = isFavTeam(lg, id);
  const ordinal = n => n === 1 ? '1er' : `${n}e`;
  const form = past.slice(0, 5).map(outcome).filter(Boolean).reverse();
  const meta = [L.label, st?.rank ? `${ordinal(st.rank)} sur ${st.size}` : '', st?.record ? recordHtml(st.record) : ''].filter(Boolean);
  const first = next[0];
  const firstEvent = first && cat.events.find(e => e.lg === lg && String(e.eid) === String(first.eid));
  const nextCard = first ? `<section class="next-card box${fieldOf(lg)}">
      <div class="nc-top"><span>${first.live ? 'EN DIRECT' : 'Prochain match'}</span><span>${cap(shortDate(first.ko))} · ${hhmm(first.ko)}</span></div>
      <div class="nc-row">
        <div class="nc-team">${t.l ? pic(t.l, 'alt=""') : '<span class="noimg"></span>'}<b>${esc(shortName(t.n))}</b></div>
        <div class="nc-mid">${first.home ? 'vs' : '@'}${(first.ch || []).slice(0, 2).map(c => chTag(c)).join('')}</div>
        <div class="nc-team" data-team="${esc(first.oppId)}" data-league="${lg}" role="button" tabindex="0">${first.oppLogo ? pic(first.oppLogo, 'alt=""') : '<span class="noimg"></span>'}<b>${esc(shortName(first.oppName))}</b></div>
      </div>
      ${firstEvent && !first.live ? `<button class="nc-cal" type="button" data-cal="${lg}:${esc(first.eid)}">${CAL_ICON}Ajouter à mon agenda</button>` : ''}
    </section>` : '';
  const upcoming = g => `<div class="fx">
      <span class="fx-date">${cap(shortDate(g.ko))}</span>
      ${g.oppLogo ? pic(g.oppLogo) : '<span class="noimg"></span>'}
      <span class="fx-opp">${g.home ? '' : '<small>à</small> '}${esc(shortName(g.oppName))}</span>
      <span class="fx-time">${g.live ? '<span class="live">LIVE</span>' : hhmm(g.ko)}</span>
    </div>`;
  const result = g => { const o = outcome(g); return `<div class="fx">
      <span class="fx-badge ${o}">${OUTCOME_FR[o] || ''}</span>
      <span class="fx-opp">${g.home ? '' : '<small>à</small> '}${esc(shortName(g.oppName))}</span>
      <span class="fx-date">${shortDate(g.ko)}</span>
      <span class="fx-time">${g.us}-${g.them}</span>
    </div>`; };
  return `
    <div class="team-hero2 box${fieldOf(lg)}">
      ${t.l ? pic(t.l, 'alt=""') : '<span class="noimg"></span>'}
      <h2 id="team-name">${esc(t.n)}</h2>
      <div class="meta"><span class="rec-cell">${meta.join(' · ')}</span></div>
      ${form.length ? `<div class="form sm">${form.map(o => `<span class="${o}">${OUTCOME_FR[o]}</span>`).join('')}</div>` : ''}
    </div>
    ${nextCard}
    <div class="section-title">À venir</div>
    <div class="card fx-list">${next.slice(first ? 1 : 0, 6).map(upcoming).join('') || '<p class="empty small">Pas d\'autre match programmé pour l\'instant.</p>'}</div>
    <div class="section-title">Derniers résultats</div>
    <div class="card fx-list">${past.slice(0, 5).map(result).join('') || '<p class="empty small">Pas encore de résultat.</p>'}</div>${fullTable(lg, id)}`;
}

// Classement complet de la compétition, l'équipe surlignée
function fullTable(lg, id) {
  const table = cat.tables[lg];
  if (!table) return '';
  const points = ['soccer', 'rugby'].includes(league(lg).sport);
  return `<div class="section-title">Classement · ${esc(league(lg).label)}</div>` + table.groups.filter(g => table.groups.length === 1 || g.entries.some(r => r.team_id === id)).map(g => `
    <div class="table-card"><table class="table">${table.groups.length > 1 ? `<caption>${esc(g.name)}</caption>` : ''}
      <thead><tr><th>#</th><th>Équipe</th><th>Bilan</th>${points ? '<th>Pts</th>' : ''}</tr></thead>
      <tbody>${g.entries.map(r => `<tr class="${r.team_id === id ? 'self' : isFavTeam(lg, r.team_id) ? 'fav' : ''}" data-team="${esc(r.team_id)}" data-league="${lg}">
        <td>${r.rank ?? '–'}</td><td class="team-cell"><span class="tc">${r.logo ? pic(r.logo) : ''}<span>${esc(r.team)}</span></span></td>
        <td class="rec-cell">${recordHtml(r.record)}</td>${points ? `<td class="pts">${esc(r.points ?? '')}</td>` : ''}</tr>`).join('')}</tbody></table></div>`).join('');
}

// Étoile « Ajouter à mes favoris » de la fiche équipe
function refreshTeamStar(lg, id, animate) {
  const b = $('#team-fav'), on = isFavTeam(lg, id);
  b.dataset.league = lg; b.dataset.team = id;
  b.setAttribute('aria-pressed', on);
  b.querySelector('span').textContent = on ? 'Dans mes favoris' : 'Ajouter à mes favoris';
  if (animate && on) { b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst'); }
}

// ---------------------------------------------------------------- fiche de rencontre
// Tout de suite ce que dit le catalogue, puis le résumé ESPN : lieu, arbitre, affluence, buteurs,
// meilleurs joueurs, compositions. Pour un sport individuel : l'épreuve et le reste du programme.
const row = (k, v) => v ? `<div class="mi-row"><span>${k}</span><b>${v}</b></div>` : '';
function matchHead(e, data) {
  const L = league(e.lg), state = liveState(e);
  const [l, r] = US_SPORTS.has(L.sport) ? ['a', 'h'] : ['h', 'a'];
  const side = k => { const t = team(e.lg, e[k].id); return `<div class="hero-team" data-team="${esc(e[k].id)}" data-league="${e.lg}" role="button" tabindex="0">
    ${teamLogo(e.lg, e[k].id)}<b>${esc(shortName(t.n))}</b><span class="rec">${recordHtml(e[k].r)}</span></div>`; };
  const hasScore = e.hs != null && (e.st === 'c' || e.st === 'i');
  const lv = l === 'h' ? e.hs : e.as, rv = l === 'h' ? e.as : e.hs;
  const mid = hasScore ? `<span class="hero-time">${lv} - ${rv}</span>${state === 'live' ? `<span class="live">EN DIRECT</span>${e.det ? `<span class="live-detail">${esc(e.det)}</span>` : ''}` : '<span class="status">Terminé</span>'}`
    : `<span class="hero-time">${hhmm(e.ko)}</span>${endTime(e) ? `<span class="hero-end">fin vers ${endTime(e)}</span>` : ''}`;
  return `<section class="hero${fieldOf(e.lg)}">
    <div class="hero-top"><span>${esc(cap(dayLabel(e.day)))}</span><span>${lgTile(e.lg)}${esc(L.label)}</span></div>
    ${e.rd ? `<p class="mi-round">${esc(e.rd)}</p>` : ''}
    <div class="hero-row">${side(l)}<div class="hero-mid">${mid}</div>${side(r)}</div>
    ${e.ch.length ? `<div class="hero-ch">${e.ch.map(chTag).join('')}</div>` : ''}
    ${state === 'upcoming' ? `<div class="hero-actions"><button type="button" data-cal="${e.lg}:${esc(e.eid)}">${CAL_ICON}Ajouter à l'agenda</button></div>` : ''}
  </section>`;
}
function matchInfo(e, data) {
  const gi = data?.gameInfo || {};
  const venue = gi.venue?.fullName ? gi.venue.fullName + (gi.venue.address?.city ? `, ${gi.venue.address.city}` : '') : e.v;
  const ref = (gi.officials || []).find(o => /referee|arbitre/i.test(o.position?.displayName || o.position?.name || '')) || (gi.officials || [])[0];
  const att = gi.attendance ? Number(gi.attendance).toLocaleString('fr-FR') + ' spectateurs' : '';
  const info = row('Lieu', esc(venue || '')) + row('Coup d\'envoi', `${esc(cap(dayLabel(e.day)))} à ${hhmm(e.ko)}`) + row('Arbitre', esc(ref?.displayName || ''))
    + row('Affluence', att) + row('Diffusion', esc(e.ch.join(', ')));
  const form = k => { const f = formOf(e.lg, e[k].id), st = standingOf(e.lg, e[k].id), t = team(e.lg, e[k].id);
    return `<div class="mi-form">${teamLogo(e.lg, e[k].id)}<span>${esc(shortName(t.n))}${st?.rank ? `<small>${st.rank === 1 ? '1er' : st.rank + 'e'} sur ${st.size}</small>` : ''}</span>
      ${f.length ? `<span class="form sm">${f.map(o => `<span class="${o}">${OUTCOME_FR[o]}</span>`).join('')}</span>` : ''}</div>`; };
  return `<div class="section-title">Infos</div><div class="card mi-card">${info}</div>
    <div class="section-title">Forme et classement</div><div class="card mi-card">${form('h')}${form('a')}</div>`;
}
function matchDetails(e, data) {
  if (!data) return '';
  let html = '';
  const goals = (data.keyEvents || []).filter(k => /goal|but|red card|carton rouge|penalty/i.test(k.type?.text || '') && !/disallowed|annul/i.test(k.type?.text || ''));
  if (goals.length) html += `<div class="section-title">Le match</div><div class="card mi-card">${goals.map(k => {
    const who = (k.participants || []).map(p => p.athlete?.displayName).filter(Boolean)[0] || '';
    const kind = /red/i.test(k.type.text) ? 'Carton rouge' : /own/i.test(k.type.text) ? 'But contre son camp' : /penalty/i.test(k.type.text) ? 'But sur penalty' : 'But';
    return `<div class="mi-ev"><b>${esc(k.clock?.displayValue || '')}</b><span>${kind} · ${esc(who)}</span><small>${esc(shortName(k.team?.displayName || ''))}</small></div>`;
  }).join('')}</div>`;
  const leaders = (data.leaders || []).filter(t => t.leaders?.length);
  if (leaders.length) html += `<div class="section-title">Meilleurs joueurs</div><div class="card mi-card">${leaders.map(t => `<div class="mi-lead"><b>${esc(shortName(t.team?.displayName || ''))}</b>${t.leaders.slice(0, 3).map(c => {
    const p = c.leaders?.[0]; return p ? `<span>${esc(c.displayName)} : ${esc(p.athlete?.displayName || '')} (${esc(p.displayValue)})</span>` : ''; }).join('')}</div>`).join('')}</div>`;
  const rosters = (data.rosters || []).filter(r => (r.roster || []).some(p => p.starter));
  if (rosters.length === 2) html += `<div class="section-title">Compositions</div><div class="card mi-card mi-xi">${rosters.map(r => `<div><b>${esc(shortName(r.team?.displayName || ''))}</b>${(r.formation ? `<small>${esc(r.formation)}</small>` : '')}
    ${r.roster.filter(p => p.starter).map(p => `<span>${esc(p.jersey || '')} ${esc(p.athlete?.displayName || '')}</span>`).join('')}</div>`).join('')}</div>`;
  return html;
}
let matchToken = 0;
async function openMatch(key) {
  const [lg, eid] = key.split(':');
  const e = cat.events.find(x => x.lg === lg && String(x.eid) === eid);
  if (!e) return;
  const token = ++matchToken;
  const body = $('#match-body');
  body.innerHTML = matchHead(e) + matchInfo(e) + (league(lg).espn ? '<p class="empty small">Chargement des détails…</p>' : '');
  body.scrollTop = 0;
  $('#match').classList.remove('head-hidden');
  $('#match').hidden = false; document.body.classList.add('sheet-open');
  if (!league(lg).espn) return;
  const data = await fetch(espnUrl(`${league(lg).espn}/summary`) + `&event=${encodeURIComponent(eid)}`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (token !== matchToken || $('#match').hidden) return;
  body.innerHTML = matchHead(e, data) + matchInfo(e, data) + matchDetails(e, data);
}
function openSolo(i) {
  const c = (cat.cycling || [])[i];
  if (!c) return;
  const C = cat.cycling_leagues?.[c.lg] || {};
  const dates = c.start === c.end ? cap(dayLabel(c.start)) : `Du ${dayLabel(c.start)} au ${dayLabel(c.end)}`;
  // Le reste du programme : les autres épreuves du même rendez-vous (même lieu, à quelques jours près)
  const near = (cat.cycling || []).filter(x => x !== c && x.lg === c.lg && x.loc && x.loc === c.loc && Math.abs(parseDay(x.start) - parseDay(c.start)) <= 5 * 864e5)
    .sort((a, b) => (a.start + a.time).localeCompare(b.start + b.time));
  $('#match-body').innerHTML = `<section class="hero${fieldOf(c.lg)}">
      <div class="hero-top"><span>${esc(C.label || '')}</span><span>${lgTile(c.lg)}</span></div>
      <h2 class="mi-title" id="match-title">${esc(c.name)}</h2>
      <p class="mi-sub">${esc(dates)}${c.time ? ` · ${esc(c.time)}` : ''}</p>
      ${(c.ch || []).length ? `<div class="hero-ch">${c.ch.map(chTag).join('')}</div>` : ''}
    </section>
    <div class="section-title">Infos</div><div class="card mi-card">${row('Lieu', esc(c.loc || ''))}${row('Départ', c.time ? esc(c.time) : 'Horaire pas encore publié')}${row('Détails', esc(c.details || ''))}${row('Diffusion', esc((c.ch || []).join(', ')))}</div>
    ${near.length ? `<div class="section-title">Au programme</div><div class="card mi-card">${near.map(x => `<div class="mi-ev"><b>${esc(cap(SHORT_DAYS[parseDay(x.start).getDay()]))} ${parseDay(x.start).getDate()}</b><span>${esc(x.name)}</span><small>${esc(x.time || 'heure à venir')}</small></div>`).join('')}</div>` : ''}`;
  $('#match-body').scrollTop = 0;
  $('#match').hidden = false; document.body.classList.add('sheet-open');
}
function closeMatch() {
  $('#match').hidden = true;
  if ($('#favs').hidden && $('#team').hidden) document.body.classList.remove('sheet-open');
}

let teamToken = 0;
async function openTeam(lg, id) {
  if (!league(lg) || !id) return;
  const token = ++teamToken;
  $('#team').hidden = false;
  document.body.classList.add('sheet-open');
  const fromCatalog = teamGamesFromCatalog(lg, id);
  $('#team-body').innerHTML = renderTeam(lg, id, fromCatalog);
  $('#team-body').scrollTop = 0;
  $('#team').classList.remove('head-hidden');
  refreshTeamStar(lg, id);
  const fromEspn = await teamGamesFromEspn(lg, id);
  if (token !== teamToken || $('#team').hidden) return;
  const known = new Set(fromCatalog.map(g => g.eid));
  $('#team-body').innerHTML = renderTeam(lg, id, [...fromCatalog, ...fromEspn.filter(g => !known.has(g.eid))]);
}

function closeTeam() {
  $('#team').hidden = true;
  if ($('#favs').hidden && $('#match').hidden) document.body.classList.remove('sheet-open');
  render();
}

function toggleFollow(lg, id) {
  let f = favFor(lg);
  if (!f) { f = { league: lg, mode: 'teams', teams: [], names: [], finals: false }; favs.leagues.push(f); }
  if (f.mode !== 'teams') { f.mode = 'teams'; f.teams = []; }
  f.teams = f.teams.includes(id) ? f.teams.filter(x => x !== id) : [...f.teams, id];
  if (!f.teams.length && !(f.names || []).length) favs.leagues = favs.leagues.filter(x => x !== f);
  saveFavs();
  syncNewsletter();
  toast(f.teams.includes(id) ? 'Équipe ajoutée à tes favoris' : 'Équipe retirée de tes favoris');
  refreshTeamStar(lg, id, true);
}

// Modèle du script Scriptable, chargé d'avance : Safari n'autorise la copie que pendant le tap.
let widgetTemplate = null;
function loadWidgetTemplate() {
  fetch('/widget/scriptable.js').then(r => r.ok ? r.text() : null).then(t => { widgetTemplate = t; }).catch(() => {});
}

// ---------------------------------------------------------------- données
async function load({ manual = false } = {}) {
  $('#refresh').classList.add('spin');
  // GitHub (mis à jour 2×/jour) et copie déployée : on garde la plus récente des deux.
  const results = await Promise.allSettled(SOURCES.map(url =>
    fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(r.status))));
  const fresh = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] || null;
  $('#refresh').classList.remove('spin');
  if (fresh && (!cat || fresh.generated_at >= cat.generated_at)) {
    cat = fresh;
    write(KEYS.catalog, cat);
    if (!favs) { favs = defaultFavs(); migrateFavs(); saveFavs(); }
  } else if (manual && !fresh) {
    toast('Hors-ligne : programme gardé en mémoire');
  }
  render();
  pollLive();
  pullOnOpen();
}

// ---------------------------------------------------------------- démarrage
cat = read(KEYS.catalog);
favs = read(KEYS.favs);
if (cat && !favs) favs = defaultFavs();
tab = read(KEYS.tab) || 'today';
sub = read(KEYS.sub);
calView = read('t7s_calview') || 'month';
account = read(KEYS.account);
refreshMeButton();
// Ancien réglage « seulement les phases finales » → « à partir des quarts »
const migrateFavs = () => favs?.leagues.forEach(f => { if (f.finals && !f.from) f.from = 'qf'; });
migrateFavs();
if (favs && !read('t7s_mig_nations')) {
  const xv = favs.leagues.find(f => ['six-nations', 'tests-rugby', 'rugby-world-cup'].includes(f.league));
  if (xv && !favs.leagues.some(f => f.league === 'nations-championship'))
    favs.leagues.push({ league: 'nations-championship', mode: xv.mode, teams: [], names: xv.mode === 'teams' ? [...(xv.names || [])] : [], finals: false });
  write(KEYS.favs, favs); write('t7s_mig_nations', true);
}

$('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab; write(KEYS.tab, tab);
  render(); window.scrollTo(0, 0);
  const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
});
$('#view').addEventListener('click', ev => {
  const calBtn = ev.target.closest('[data-cal]');
  if (calBtn) { addMatchToCalendar(calBtn.dataset.cal); return; }
  const dayBtn = ev.target.closest('[data-day]');
  if (dayBtn) {
    selDay = dayBtn.dataset.day; render();
    const list = $('#cal-list');
    if (list && list.getBoundingClientRect().top > window.innerHeight * 0.75) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (ev.target.closest('[data-action="subscribe"]')) { subscribeCalendar(); return; }
  const cv = ev.target.closest('[data-calview]');
  if (cv) { calView = cv.dataset.calview; write('t7s_calview', calView); render(); return; }
  const wk = ev.target.closest('[data-week]');
  if (wk) { selDay = addDays(selDay, +wk.dataset.week); render(); return; }
  const jump = ev.target.closest('[data-day-jump]');
  if (jump) { selDay = jump.dataset.dayJump; calView = 'week'; render(); $('#cal-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const nm = ev.target.closest('[data-newsmode]');
  if (nm) { newsMode = nm.dataset.newsmode; newsLimit = 30; render(); return; }
  if (ev.target.closest('[data-newsmore]')) { newsLimit += 30; render(); return; }
  const sv = ev.target.closest('[data-standview]');
  if (sv) { standView = sv.dataset.standview; render(); return; }
  const sl = ev.target.closest('[data-stand]');
  if (sl) { standLg = sl.dataset.stand; render(); $('#tables')?.scrollIntoView({ block: 'start' }); return; }
  const teamEl = ev.target.closest('[data-team]');
  if (teamEl) { openTeam(teamEl.dataset.league, teamEl.dataset.team); return; }
  const matchEl = ev.target.closest('[data-match]');
  if (matchEl && !ev.target.closest('button')) { openMatch(matchEl.dataset.match); return; }
  const soloEl = ev.target.closest('[data-solo]');
  if (soloEl) { openSolo(+soloEl.dataset.solo); return; }
  const more = ev.target.closest('[data-expand]');
  if (more) { expandedTables.add(more.dataset.expand); render(); return; }
  const story = ev.target.closest('[data-filter]');
  if (story) { filter = story.dataset.filter; render(); return; }
  if (ev.target.closest('[data-action="open-favs"]')) openFavs();
});
$('#strip').addEventListener('click', ev => {
  if (ev.target.closest('[data-action="open-favs"]')) { openFavs(); return; }
  const b = ev.target.closest('[data-strip]');
  if (!b) return;
  filter = b.dataset.strip;
  render(); window.scrollTo(0, 0);
});
$('#refresh').addEventListener('click', () => load({ manual: true }));
$('#open-favs').addEventListener('click', openFavs);
$('#open-me').addEventListener('click', openAccount);
$('#close-account').addEventListener('click', closeAccount);
$('#account-body').addEventListener('click', ev => {
  const m = ev.target.closest('[data-acc-mode]');
  if (m) { accMode = m.dataset.accMode; renderAccount(); return; }
  if (ev.target.closest('[data-acc-sync]')) { pushNow().then(pullOnOpen).then(() => { toast('Synchronisé'); renderAccount(); }); return; }
  if (ev.target.closest('[data-acc-logout]')) {
    const a = account; signOutLocal(); accountApi({ action: 'logout', pseudo: a.pseudo, token: a.token }).catch(() => {});
    renderAccount(); toast('Déconnecté de cet appareil (tes favoris restent ici)'); return;
  }
  if (ev.target.closest('[data-acc-delete]')) {
    const pw = prompt(`Supprimer définitivement le compte ${account.pseudo} ? Tes favoris restent sur ce téléphone.\nMot de passe :`);
    if (pw) accountApi({ action: 'delete', pseudo: account.pseudo, password: pw }).then(() => { signOutLocal(); renderAccount(); toast('Compte supprimé'); }).catch(e => toast(e.message));
  }
});
$('#account-body').addEventListener('submit', ev => { ev.preventDefault(); authSubmit(ev.target); });
$('#close-favs').addEventListener('click', closeFavs);
$('#close-team').addEventListener('click', closeTeam);
$('#close-match').addEventListener('click', closeMatch);
$('#match-body').addEventListener('click', ev => {
  const c = ev.target.closest('[data-cal]');
  if (c) { addMatchToCalendar(c.dataset.cal); return; }
  const t = ev.target.closest('[data-team]');
  if (t) openTeam(t.dataset.league, t.dataset.team);
});
$('#team-fav').addEventListener('click', ev => { const b = ev.currentTarget; toggleFollow(b.dataset.league, b.dataset.team); });
// Fiches : la barre du haut s'efface quand on descend, revient quand on remonte
['#team', '#match'].forEach(sel => {
  let last = 0;
  $(`${sel} .sheet-body`).addEventListener('scroll', ev => {
    const y = ev.target.scrollTop;
    $(sel).classList.toggle('head-hidden', y > 60 && y > last);
    last = y;
  }, { passive: true });
});
$('#team-body').addEventListener('click', ev => {
  const c = ev.target.closest('[data-cal]');
  if (c) { addMatchToCalendar(c.dataset.cal); return; }
  const other = ev.target.closest('[data-team]');
  if (other) { openTeam(other.dataset.league, other.dataset.team); return; }
  const b = ev.target.closest('[data-follow]');
  if (b) toggleFollow(b.dataset.league, b.dataset.follow);
});
$('#favs-body').addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el && !['from', 'search', 'team-search'].includes(el.dataset.action)) onFavAction(el);
});
$('#favs-body').addEventListener('submit', async ev => {
  ev.preventDefault();
  const form = ev.target, email = form.email.value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { toast('Adresse e-mail invalide'); return; }
  const btn = form.querySelector('button');
  btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const r = await subscribe(email);
    toast(r.welcome ? 'Inscrit : le programme de la semaine arrive par mail' : 'Inscrit');
    renderFavs();
  } catch (err) {
    toast(err.message); btn.disabled = false; btn.textContent = "S'inscrire";
  }
});
$('#cal').addEventListener('click', ev => { if (ev.target.closest('[data-close]') || ev.target.closest('.as-option')) setTimeout(closeCalSheet, 0); });
$('#favs-body').addEventListener('change', ev => { if (ev.target.dataset.action === 'from') onFavAction(ev.target); });
$('#favs-body').addEventListener('input', ev => {
  if (ev.target.dataset.action === 'team-search') { favQuery = ev.target.value; $('#team-results').innerHTML = teamResults(); return; }
  if (ev.target.dataset.action !== 'search') return;
  teamQuery = ev.target.value;
  const grid = ev.target.nextElementSibling, f = favFor(ev.target.dataset.league);
  grid.outerHTML = teamGrid(ev.target.dataset.league, f);
});
DARK_MQ.addEventListener?.('change', () => render());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if ($('#favs').hidden && $('#team').hidden) render(); }, 60000);
setInterval(pollLive, 60000);

render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
