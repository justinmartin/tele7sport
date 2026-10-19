// Télé7Sport — widget d'écran d'accueil (app Scriptable, iOS).
// Généré par l'app (Mes favoris → « Copier le script du widget ») avec tes favoris du moment.
// Installation : Scriptable → « + » → coller → nommer « Télé7Sport » ; puis sur l'écran
// d'accueil : ajouter un widget Scriptable (petit, moyen ou grand) → Script : Télé7Sport.
const FAVS = __FAVS__;
const CATALOG_URL = 'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/catalog.json';
const APP_URL = 'https://tele7sport.vercel.app';
const NIGHT_END_HOUR = 7;
const LEAGUE_PASS = 'NBA League Pass';
const NATIONS_EN = __NATIONS__;
const CHANNEL_COLORS = __CHANNELS__;
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const RED = new Color('#e8483b'), NIGHT = new Color('#9aa5ff'), WHITE = new Color('#f5f5f7'), GREY = new Color('#8e8e96');

// ---------- données (avec cache pour le hors-ligne) ----------
async function loadCatalog() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), 't7s-catalog.json');
  try {
    const req = new Request(CATALOG_URL);
    req.timeoutInterval = 20;
    const cat = await req.loadJSON();
    fm.writeString(path, JSON.stringify(cat));
    return cat;
  } catch (e) {
    return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : null;
  }
}

// ---------- mêmes règles que l'app ----------
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function tvToday() { const d = new Date(); if (d.getHours() < NIGHT_END_HOUR) d.setDate(d.getDate() - 1); return isoDay(d); }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRaw = (name, needle) => new RegExp(`(^|[^\\p{L}])${esc(needle)}([^\\p{L}]|$)`, 'iu').test(name);
const wordMatch = (name, needle) => wordRaw(name, needle) || (!!NATIONS_EN[needle.toLowerCase()] && wordRaw(name, NATIONS_EN[needle.toLowerCase()]));

function makeVisible(cat) {
  const favFor = lg => FAVS.leagues.find(f => f.league === lg);
  const teamOf = (lg, id) => ((cat.leagues[lg] || {}).teams || {})[id] || { n: '?', a: '?' };
  const isFav = (lg, id) => { const f = favFor(lg); return !!f && f.mode === 'teams' && (f.teams.includes(id) || (f.names || []).some(n => wordMatch(teamOf(lg, id).n, n))); };
  const onlyLP = e => !e.ch.length || e.ch.every(c => c === LEAGUE_PASS);
  return {
    teamOf,
    visible(e) {
      const f = favFor(e.lg);
      if (!f || (f.finals && !e.ph)) return false;
      if (f.mode === 'ap') return !!(e.h.rk || e.a.rk);
      if (f.mode === 'teams') return isFav(e.lg, e.h.id) || isFav(e.lg, e.a.id);
      if (e.lg === 'nba') return !onlyLP(e) || !!e.hl;
      return true;
    },
  };
}

// ---------- logos (petites vignettes en cache, pour ne pas les retélécharger à chaque rafraîchissement) ----------
const LOGO_PX = 64;
function smallLogo(url) {
  const m = url && url.match(/^https:\/\/a\.espncdn\.com(\/i\/.+\.png)$/);
  return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${LOGO_PX}&h=${LOGO_PX}` : url;
}
async function loadLogo(url) {
  if (!url) return null;
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.cacheDirectory(), 't7s-logos');
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  const path = fm.joinPath(dir, url.replace(/[^a-z0-9]/gi, '_').slice(-120) + '.png');
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const req = new Request(smallLogo(url));
    req.timeoutInterval = 10;
    const img = await req.loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) { return null; }
}

// ---------- widget ----------
function addChip(s, logo, size) {
  // Pastille blanche comme dans l'app : les logos sombres restent lisibles sur fond noir
  const chip = s.addStack();
  chip.size = new Size(size, size);
  chip.cornerRadius = size / 2;
  chip.backgroundColor = logo ? WHITE : new Color('#2a2a2e');
  chip.centerAlignContent();
  if (logo) { const img = chip.addImage(logo); img.imageSize = new Size(size - 4, size - 4); }
}

function addName(s, text, size) {
  const t = s.addText(text);
  t.font = Font.semiboldSystemFont(size);
  t.textColor = WHITE;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
}

// Petit / grand : une équipe par ligne. Moyen : « [logo] Équipe – Équipe [logo] » sur une ligne.
function addTeam(stack, team, logo, compact) {
  const s = stack.addStack();
  s.centerAlignContent();
  addChip(s, logo, compact ? 15 : 17);
  s.addSpacer(4);
  addName(s, compact ? (team.a || team.n) : team.n, compact ? 12 : 13);
}

function addRow(w, helpers, e, logos, family, us) {
  const compact = family === 'small';
  const row = w.addStack();
  row.centerAlignContent();
  const live = e.st === 'i' || (e.st !== 'c' && Date.now() >= new Date(e.ko) && Date.now() < new Date(e.ko).getTime() + 3 * 3600e3);
  const d = new Date(e.ko);
  const left = row.addText(e.st === 'c' && e.hs != null ? `${e.hs}-${e.as}` : live ? 'LIVE' : `${pad(d.getHours())}:${pad(d.getMinutes())}`);
  left.font = Font.boldMonospacedSystemFont(compact ? 11 : 13);
  left.textColor = live ? RED : e.nt ? NIGHT : WHITE;
  row.addSpacer(compact ? 5 : 8);
  const [top, bottom] = us ? [e.a, e.h] : [e.h, e.a];
  const [t1, t2] = [helpers.teamOf(e.lg, top.id), helpers.teamOf(e.lg, bottom.id)];
  if (family === 'medium') {
    const line = row.addStack();
    line.centerAlignContent();
    addChip(line, logos[top.id], 16);
    line.addSpacer(5);
    addName(line, `${t1.n} ${us ? '@' : '–'} ${t2.n}`, 13);
    line.addSpacer(5);
    addChip(line, logos[bottom.id], 16);
  } else {
    const teams = row.addStack();
    teams.layoutVertically();
    teams.spacing = 2;
    addTeam(teams, t1, logos[top.id], compact);
    addTeam(teams, t2, logos[bottom.id], compact);
  }
  if (!compact && e.ch.length) {
    row.addSpacer();
    const ch = row.addText(e.ch[0]);
    ch.font = Font.boldSystemFont(10);
    ch.textColor = new Color(CHANNEL_COLORS[e.ch[0].toLowerCase()] || '#8e8e96');
    ch.lineLimit = 1;
  }
}

async function main() {
  const family = config.widgetFamily || 'medium';
  const compact = family === 'small';
  const maxRows = { small: 3, medium: 4, large: 7 }[family] || 4;
  const w = new ListWidget();
  w.backgroundColor = new Color('#000000');
  w.url = APP_URL;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);

  const head = w.addStack();
  head.centerAlignContent();
  const brand = head.addText('TÉLÉ7SPORT');
  brand.font = Font.heavySystemFont(compact ? 12 : 14);
  brand.textColor = WHITE;
  head.addSpacer();

  const cat = await loadCatalog();
  if (!cat) {
    head.addText('');
    w.addSpacer();
    const t = w.addText('Programme indisponible (hors-ligne).');
    t.font = Font.systemFont(12); t.textColor = GREY;
    return w;
  }
  const helpers = makeVisible(cat);
  const mine = cat.events.filter(e => helpers.visible(e));
  const today = tvToday();
  let day = today;
  let list = mine.filter(e => e.day === today);
  if (!list.length || list.every(e => e.st === 'c')) {
    const next = mine.filter(e => e.day > today).map(e => e.day).sort()[0];
    if (next) { day = next; list = mine.filter(e => e.day === next); }
  }
  list.sort((a, b) => a.ko.localeCompare(b.ko));

  const label = day === today ? 'Ce soir' : (() => { const [y, m, d] = day.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DAYS[dt.getDay()]} ${dt.getDate()}`; })();
  const when = head.addText(label);
  when.font = Font.semiboldSystemFont(compact ? 11 : 12);
  when.textColor = RED;
  w.addSpacer(compact ? 6 : 8);

  if (!list.length) {
    const t = w.addText('Rien au programme pour tes équipes.');
    t.font = Font.systemFont(12); t.textColor = GREY;
  }
  const shown = list.slice(0, maxRows);
  const logos = {};
  await Promise.all(shown.flatMap(e => [e.h, e.a]).map(async side => {
    logos[side.id] = await loadLogo(helpers.teamOf(shown.find(e => e.h === side || e.a === side).lg, side.id).l);
  }));
  shown.forEach((e, i) => {
    if (i) w.addSpacer(family === 'medium' ? 6 : compact ? 5 : 7);
    const sport = (cat.leagues[e.lg] || {}).sport;
    addRow(w, helpers, e, logos, family, sport === 'football' || sport === 'basketball' || sport === 'hockey');
  });
  if (list.length > maxRows) {
    w.addSpacer(4);
    const more = w.addText(`+ ${list.length - maxRows} autre${list.length - maxRows > 1 ? 's' : ''}`);
    more.font = Font.systemFont(10); more.textColor = GREY;
  }
  w.addSpacer();
  return w;
}

const widget = await main();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
