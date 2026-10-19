// Télé7Sport — app.
// Le serveur publie un catalogue (web/data/catalog.json, 2×/jour) : toutes les compétitions
// en cours, leurs matchs, équipes et classements. L'app filtre selon TES favoris, gardés sur
// le téléphone (initialisés avec ceux de la newsletter) et modifiables dans « Mes favoris ».
const SOURCES = [
  'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/catalog.json',
  '/data/catalog.json',
];
const KEYS = { catalog: 't7s_catalog', favs: 't7s_favs', tab: 't7s_tab', sub: 't7s_newsletter' };
const NIGHT_END_HOUR = 7;      // avant 7h : rattaché à la soirée de la veille
const MATCH_DURATION_H = 3;
const LEAGUE_PASS = 'NBA League Pass';
const US_SPORTS = new Set(['football', 'basketball', 'hockey']); // à l'américaine : extérieur en haut
const SPORT_LABELS = { soccer: 'Football', basketball: 'Basket', football: 'Football américain', rugby: 'Rugby', hockey: 'Hockey sur glace', tennis: 'Tennis' };
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

function saveFavs() { write(KEYS.favs, favs); }

function isFavTeam(lg, id) {
  const f = favFor(lg);
  if (!f || f.mode !== 'teams') return false;
  return f.teams.includes(id) || (f.names || []).some(n => wordMatch(team(lg, id).n, n));
}

const onlyLeaguePass = e => !e.ch.length || e.ch.every(c => c === LEAGUE_PASS);

// Un match fait-il partie de « mon » programme ?
function visible(e) {
  const f = favFor(e.lg);
  if (!f) return false;
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
function lgTile(lg, size = 's') {
  const L = league(lg) || cat.cycling_leagues?.[lg] || {};
  return L.logo ? `<span class="lg-tile ${size}"><img src="${esc(L.logo)}" alt="" loading="lazy"></span>`
    : `<span class="lg-tile ${size} emoji"><span class="em">${esc(L.emoji || '')}</span></span>`;
}

function liveState(e) {
  if (e.st === 'c') return 'done';
  if (e.st === 'i') return 'live';
  const start = new Date(e.ko).getTime(), now = Date.now();
  if (now >= start && now < start + MATCH_DURATION_H * 3600e3) return 'live';
  return now >= start ? 'done' : 'upcoming';
}

function teamLine(e, side) {
  const s = e[side], t = team(e.lg, s.id);
  const done = (e.st === 'c' || e.st === 'i') && e.hs != null;
  const mine = side === 'h' ? e.hs : e.as, theirs = side === 'h' ? e.as : e.hs;
  const cls = ['team'];
  if (isFavTeam(e.lg, s.id)) cls.push('fav');
  if (e.st === 'c' && done && mine < theirs) cls.push('loser');
  return `<div class="${cls.join(' ')}" data-team="${esc(s.id)}" data-league="${e.lg}" role="button" tabindex="0">
    ${t.l ? `<img src="${esc(t.l)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
    <span class="name">${s.rk ? `<span class="rk">${s.rk}</span>` : ''}${esc(t.n)}${s.r ? `<span class="rec">${recordHtml(s.r)}</span>` : ''}</span>
    ${done ? `<span class="score">${mine}</span>` : ''}
  </div>`;
}

function matchRow(e) {
  const state = liveState(e);
  const sport = league(e.lg)?.sport;
  const [top, bottom] = US_SPORTS.has(sport) ? ['a', 'h'] : ['h', 'a'];
  let side = '';
  if (state === 'done' && e.st !== 'c') side = '<span class="status">Score à venir</span>';
  else if (state === 'live') side = `<span class="live">EN DIRECT</span>${e.det ? `<span class="live-detail">${esc(e.det)}</span>` : ''}`;
  else if (state === 'upcoming') side = `<span class="time">${hhmm(e.ko)}</span>`;
  const extras = [];
  if (e.hl && state !== 'done') extras.push('<span class="tag">À ne pas rater</span>');
  if (state !== 'done') extras.push(...e.ch.map(c => `<span class="ch" style="background:${chColor(c)}">${esc(c)}</span>`));
  if (e.rd) extras.push(`<span class="round">${esc(e.rd)}</span>`);
  if (state === 'upcoming') extras.push(`<button class="cal-add" type="button" data-cal="${e.lg}:${esc(e.eid)}" aria-label="Ajouter à mon agenda">${CAL_ICON}</button>`);
  return `<article class="match${e.nt ? ' night' : ''}${side ? '' : ' no-side'}">
    <div class="teams">${teamLine(e, top)}${teamLine(e, bottom)}</div>
    ${side ? `<div class="side">${side}</div>` : ''}
    ${extras.length ? `<div class="extras">${extras.join('')}</div>` : ''}
  </article>`;
}

function byLeague(events) {
  const groups = new Map();
  events.forEach(e => { if (!groups.has(e.lg)) groups.set(e.lg, []); groups.get(e.lg).push(e); });
  return [...groups].map(([lg, evs]) =>
    `<div class="league">${lgTile(lg)}${esc(league(lg).label)}</div>${evs.map(matchRow).join('')}`).join('');
}

function cyclingFor(day) {
  if (filter !== 'all') return [];
  return (cat.cycling || []).filter(c => favs.cycling.includes(c.lg) && c.start <= day && day <= c.end);
}

function cyclingRows(list) {
  if (!list.length) return '';
  const groups = new Map();
  list.forEach(c => { if (!groups.has(c.lg)) groups.set(c.lg, []); groups.get(c.lg).push(c); });
  return [...groups].map(([lg, cs]) => `<div class="league">${lgTile(lg)}${esc(cs[0].label)}</div>` + cs.map(c => `
    <article class="event-solo">
      <div><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.loc || '')}${c.details ? ` · ${esc(c.details)}` : ''}</div></div>
      <div class="side">${c.time ? `<span class="time">${esc(c.time)}</span>` : ''}<div class="channels">${(c.ch || []).map(x => `<span class="ch" style="background:${chColor(x)}">${esc(x)}</span>`).join('')}</div></div>
    </article>`).join('')).join('');
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

function pageHead(kicker, title) {
  return `<header class="page-head"><div class="kicker">${esc(kicker)}</div><h1 class="page-title">${esc(title)}</h1></header>`;
}

const noFavs = () => '<p class="empty">Aucune compétition suivie pour l\'instant.<br><button type="button" data-action="open-favs">Choisir mes favoris</button></p>';

// ---------------------------------------------------------------- pages
function renderToday() {
  const today = tvToday();
  let html = pageHead(cap(dayLabel(today)), 'Ce soir') + installTip();
  if (!favs.leagues.length && !favs.cycling.length) return html + noFavs();
  const block = dayBlock(today, myEvents().filter(e => e.day === today), { title: false });
  if (block) return html + block;
  html += '<p class="empty">Rien au programme ce soir pour tes équipes.</p>';
  // Les deux prochaines journées avec des matchs
  const next = [...new Set(myEvents().filter(e => e.day > today).map(e => e.day))].sort().slice(0, 2);
  return html + next.map(d => dayBlock(d, myEvents().filter(e => e.day === d))).join('');
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Grille du mois : de ce lundi jusqu'au bout du programme connu (4 à 5 semaines).
function calendarGrid(today) {
  const t = parseDay(today);
  const first = addDays(today, -((t.getDay() + 6) % 7));
  const last = cat.range?.end && cat.range.end > today ? cat.range.end : addDays(today, 27);
  const mine = myEvents();
  const cells = [];
  for (let d = first; d <= last || (cells.length % 7); d = addDays(d, 1)) {
    const evs = mine.filter(e => e.day === d);
    const lgs = [...new Set(evs.map(e => e.lg))];
    const solo = cyclingFor(d);
    const marks = [...lgs.map(lg => league(lg)?.logo ? `<span class="mk"><img src="${esc(league(lg).logo)}" alt=""></span>` : `<span class="mk em">${esc(league(lg)?.emoji || '•')}</span>`),
      ...[...new Set(solo.map(c => c.emoji))].map(em => `<span class="mk em">${esc(em)}</span>`)];
    const n = parseDay(d).getDate();
    const cls = ['cal-day'];
    if (d === today) cls.push('today');
    if (d === selDay) cls.push('sel');
    if (d < today) cls.push('past');
    if (d > last) cls.push('out');
    cells.push(`<button class="${cls.join(' ')}" type="button" data-day="${d}"${d > last ? ' disabled' : ''} aria-label="${esc(dayLabel(d))}${evs.length ? `, ${evs.length} match${evs.length > 1 ? 's' : ''}` : ''}">
      <span class="num">${n === 1 ? `1 ${MONTHS_SHORT[parseDay(d).getMonth()]}` : n}</span>
      <span class="marks">${marks.slice(0, 3).join('')}${marks.length > 3 ? `<span class="mk more">+${marks.length - 3}</span>` : ''}</span>
    </button>`);
  }
  return `<div class="cal" role="group" aria-label="Calendrier">
    <div class="cal-head">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
  </div>`;
}

function renderCalendar() {
  const today = tvToday();
  if (!selDay || selDay < cat.range.start || selDay > cat.range.end) selDay = today;
  const leaguesWithEvents = [...new Set(cat.events.filter(visible).filter(e => e.day >= today).map(e => e.lg))];
  const sel = parseDay(selDay);
  let html = pageHead(`${cap(MONTHS[sel.getMonth()])} ${sel.getFullYear()}`, 'Calendrier');
  if (!favs.leagues.length && !favs.cycling.length) return html + noFavs();
  html += `<button class="sub-btn" type="button" data-action="subscribe">${CAL_ICON}<span>Mettre mes matchs dans mon agenda</span></button>`;
  if (leaguesWithEvents.length > 1) {
    html += `<div class="stories" role="group" aria-label="Filtrer par compétition">
      <button class="story${filter === 'all' ? ' active' : ''}" data-filter="all" type="button"><span class="ring"><span class="disc all">Tout</span></span><span class="lbl">Tout</span></button>
      ${leaguesWithEvents.map(lg => `<button class="story${filter === lg ? ' active' : ''}" data-filter="${lg}" type="button">
        <span class="ring"><span class="disc">${league(lg).logo ? `<img src="${esc(league(lg).logo)}" alt="">` : esc(league(lg).emoji)}</span></span>
        <span class="lbl">${esc(league(lg).label)}</span></button>`).join('')}
    </div>`;
  }
  html += calendarGrid(today);
  // Le jour choisi, puis la suite de la semaine
  const blocks = [];
  const chosen = dayBlock(selDay, myEvents().filter(e => e.day === selDay));
  blocks.push(chosen || `<section class="day"><h2 class="day-title"><span>${cap(dayLabel(selDay))}</span></h2><p class="empty small">Rien ce jour-là pour tes équipes.</p></section>`);
  for (let d = addDays(selDay, 1); d <= addDays(selDay, 6) && d <= cat.range.end; d = addDays(d, 1)) blocks.push(dayBlock(d, myEvents().filter(e => e.day === d)));
  return html + `<div id="cal-list">${blocks.join('')}</div>`;
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

function renderStandings() {
  let html = pageHead('Bilan de tes équipes', 'Classements');
  const parts = [];
  const ordered = [...favs.leagues].sort((a, b) => (b.mode === 'teams') - (a.mode === 'teams'));
  ordered.forEach(f => {
    const table = cat.tables[f.league];
    if (!table || f.mode === 'ap') return;
    const isFav = row => f.mode === 'teams' && (f.teams.includes(row.team_id) || (f.names || []).some(n => wordMatch(row.team, n)));
    const groups = f.mode === 'teams' ? table.groups.filter(g => g.entries.some(isFav)) : table.groups;
    if (!groups.length) return;
    const L = league(f.league), points = ['soccer', 'rugby'].includes(L.sport);
    parts.push(`<div class="comp-head">${lgTile(f.league, 'l')}<h2>${esc(L.label)}<small>${esc(table.season)}</small></h2></div>` +
      groups.map(g => {
        const key = `${f.league}:${g.name}`;
        const { rows, hidden } = condensed(g.entries, isFav, key);
        const cols = points ? 4 : 3;
        return `<table class="table">
        ${groups.length > 1 || g.name !== L.label ? `<caption>${esc(g.name)}</caption>` : ''}
        <thead><tr><th>#</th><th>Équipe</th><th>Bilan</th>${points ? '<th>Pts</th>' : ''}</tr></thead>
        <tbody>${rows.map(r => r === 'gap' ? `<tr class="gap"><td colspan="${cols}">···</td></tr>` : `<tr class="${isFav(r) ? 'fav' : ''}" data-team="${esc(r.team_id)}" data-league="${f.league}">
          <td>${r.rank ?? '–'}</td>
          <td class="team-cell"><span class="tc">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ''}<span>${esc(r.team)}</span></span></td>
          <td class="rec-cell">${recordHtml(r.record)}</td>${points ? `<td class="pts">${esc(r.points ?? '')}</td>` : ''}
        </tr>`).join('')}</tbody></table>${hidden ? `<button class="table-more" type="button" data-expand="${esc(key)}">Voir les ${g.entries.length} équipes</button>` : ''}`;
      }).join(''));
  });
  return html + (parts.join('') || '<p class="empty">Pas de classement pour tes compétitions en ce moment.</p>');
}

function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || !/iPhone|iPad/.test(navigator.userAgent)) return '';
  return '<div class="install-tip">Pour l\'avoir sur ton écran d\'accueil : <strong>Partager</strong>, puis <strong>« Sur l\'écran d\'accueil »</strong>.</div>';
}

function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const view = $('#view');
  if (!cat) { view.innerHTML = '<p class="empty">Chargement du programme…</p>'; return; }
  view.innerHTML = { today: renderToday, week: renderCalendar, results: renderResults, standings: renderStandings }[tab]();
  $('#updated').textContent = ago(cat.generated_at);
}

// ---------------------------------------------------------------- éditeur de favoris
function favSummary(f) {
  if (!f) return '';
  const finals = f.finals ? ' · phases finales' : '';
  if (f.mode === 'ap') return 'Top 25 AP';
  if (f.mode === 'all') return (f.league === 'nba' ? 'Toute la ligue (matchs diffusés en France)' : 'Toutes les équipes') + finals;
  const n = f.teams.length + (f.names || []).length;
  return `${n} équipe${n > 1 ? 's' : ''}${finals}`;
}

function renderFavs() {
  const bySport = {};
  Object.entries(cat.leagues).forEach(([id, L]) => { (bySport[L.sport] ||= []).push([id, L]); });
  // Dans chaque sport : compétitions en cours d'abord, celles à l'arrêt ensuite
  Object.values(bySport).forEach(list => list.sort((a, b) => (b[1].active !== false) - (a[1].active !== false)));
  let html = '';
  Object.entries(bySport).forEach(([sport, list]) => {
    html += `<div class="sport">${esc(SPORT_LABELS[sport] || sport)}</div>`;
    list.forEach(([id, L]) => {
      const f = favFor(id);
      const ap = id === 'ncaaf' || id === 'ncaam';
      html += `<div class="fav-league">
        <div class="fav-row">
          ${lgTile(id, 'm')}
          <button class="label" type="button" data-action="expand" data-league="${id}">${esc(L.label)}<small>${esc(f ? favSummary(f) : 'Non suivie')}${L.active === false ? ' · pas de match en ce moment' : ''}</small></button>
          <button class="switch" role="switch" aria-checked="${!!f}" aria-label="Suivre ${esc(L.label)}" data-action="toggle" data-league="${id}" type="button"></button>
        </div>`;
      if (f && openLeague === id) {
        const modes = [['all', 'Toutes'], ['teams', 'Mes équipes'], ...(ap ? [['ap', 'Top 25']] : [])];
        html += `<div class="fav-detail">
          <div class="seg">${modes.map(([m, l]) => `<button type="button" class="${f.mode === m ? 'on' : ''}" data-action="mode" data-league="${id}" data-mode="${m}">${l}</button>`).join('')}</div>
          ${L.has_finals ? `<label class="check"><input type="checkbox" data-action="finals" data-league="${id}" ${f.finals ? 'checked' : ''}>Seulement les phases finales</label>` : ''}
          ${f.mode === 'teams' ? teamPicker(id, f) : ''}
        </div>`;
      }
      html += '</div>';
    });
  });
  const SOLO_SECTIONS = { cycling: 'Cyclisme', moto: 'Sports mécaniques', hiver: "Sports d'hiver" };
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
        <span class="lg-tile m emoji"><span class="em">${esc(C.emoji)}</span></span>
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
  <div class="sheet-actions"><button class="btn" type="button" data-action="reset">Revenir aux favoris par défaut</button></div>`;
  $('#favs-body').innerHTML = html;
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
      ${t.l ? `<img src="${esc(t.l)}" alt="" loading="lazy">` : ''}${esc(t.n)}</button>`).join('')}</div>`;
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
  const details = [L.label + (e.rd ? ` · ${e.rd}` : ''), e.ch.length ? `📺 ${e.ch.join(', ')}` : '', location.origin].filter(Boolean).join('\n');
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
  } else if (action === 'finals' && f) {
    f.finals = el.checked;
  } else if (action === 'team' && f) {
    const id = el.dataset.team;
    f.teams = f.teams.includes(id) ? f.teams.filter(x => x !== id) : [...f.teams, id];
  } else if (action === 'add-name' && f) {
    f.names = [...(f.names || []), el.dataset.name]; teamQuery = '';
  } else if (action === 'drop-name' && f) {
    f.names = (f.names || []).filter(n => n !== el.dataset.name);
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
  const watch = cat.events.filter(e => e.st !== 'c' && e.eid && visible(e)
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

async function teamGamesFromEspn(lg, id) {
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
               oppName: opp.team?.displayName || '?', oppLogo: opp.team?.logos?.[0]?.href || opp.team?.logo || '',
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
  const fixture = g => {
    const o = outcome(g);
    const right = g.done ? `<span class="res"><i class="${o}">${OUTCOME_FR[o] || ''}</i>${g.us} - ${g.them}</span>`
      : g.live ? '<span class="live">EN DIRECT</span>' : '';
    return `<div class="fixture">
      <div class="when"><b>${g.done ? shortDate(g.ko) : hhmm(g.ko)}</b>${g.done ? '' : shortDate(g.ko)}</div>
      <div class="opp">${g.oppLogo ? `<img src="${esc(g.oppLogo)}" alt="" loading="lazy">` : ''}<small>${g.home ? 'vs' : '@'}</small><span>${esc(g.oppName)}</span></div>
      ${right}
      ${!g.done && g.ch?.length ? `<div class="chs">${g.ch.map(c => `<span class="ch" style="background:${chColor(c)}">${esc(c)}</span>`).join('')}</div>` : ''}
    </div>`;
  };
  const form = past.slice(0, 5).map(outcome).filter(Boolean);
  const ordinal = n => n === 1 ? '1er' : `${n}e`;
  return `
    <div class="team-hero">
      ${t.l ? `<img src="${esc(t.l)}" alt="">` : ''}
      <div><h2 id="team-name">${esc(t.n)}</h2><div class="meta">${lgTile(lg)}${esc(L.label)}</div></div>
    </div>
    ${st ? `<div class="team-stats" style="grid-template-columns:repeat(${st.points != null || st.played != null ? 3 : 2},minmax(0,1fr))">
      <div><b>${st.rank ? ordinal(st.rank) : '–'}</b><span>sur ${st.size}</span></div>
      <div><b class="rec-cell">${recordHtml(st.record)}</b><span>Bilan</span></div>
      ${st.points != null || st.played != null ? `<div><b>${esc(st.points ?? st.played)}</b><span>${st.points != null ? 'Points' : 'Matchs'}</span></div>` : ''}
    </div>` : ''}
    ${form.length ? `<div class="section-title">Forme</div><div class="form">${form.map(o => `<span class="${o}">${OUTCOME_FR[o]}</span>`).join('')}</div>` : ''}
    <div class="section-title">Prochains matchs</div>
    ${next.slice(0, 4).map(fixture).join('') || '<p class="empty">Pas de match programmé pour l\'instant.</p>'}
    <div class="section-title">Derniers résultats</div>
    ${past.slice(0, 5).map(fixture).join('') || '<p class="empty">Pas encore de résultat.</p>'}
    <button class="btn ${followed ? '' : 'primary'} follow-btn" type="button" data-follow="${esc(id)}" data-league="${lg}">${followed ? 'Ne plus suivre' : 'Suivre cette équipe'}</button>`;
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
  const fromEspn = await teamGamesFromEspn(lg, id);
  if (token !== teamToken || $('#team').hidden) return;
  const known = new Set(fromCatalog.map(g => g.eid));
  $('#team-body').innerHTML = renderTeam(lg, id, [...fromCatalog, ...fromEspn.filter(g => !known.has(g.eid))]);
}

function closeTeam() {
  $('#team').hidden = true;
  if ($('#favs').hidden) document.body.classList.remove('sheet-open');
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
  openTeam(lg, id);
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
    if (!favs) { favs = defaultFavs(); saveFavs(); }
  } else if (manual && !fresh) {
    toast('Hors-ligne : programme gardé en mémoire');
  }
  render();
  pollLive();
}

// ---------------------------------------------------------------- démarrage
cat = read(KEYS.catalog);
favs = read(KEYS.favs);
if (cat && !favs) favs = defaultFavs();
tab = read(KEYS.tab) || 'today';
sub = read(KEYS.sub);

$('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab; write(KEYS.tab, tab);
  render(); window.scrollTo(0, 0);
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
  const teamEl = ev.target.closest('[data-team]');
  if (teamEl) { openTeam(teamEl.dataset.league, teamEl.dataset.team); return; }
  const more = ev.target.closest('[data-expand]');
  if (more) { expandedTables.add(more.dataset.expand); render(); return; }
  const story = ev.target.closest('[data-filter]');
  if (story) { filter = story.dataset.filter; render(); return; }
  if (ev.target.closest('[data-action="open-favs"]')) openFavs();
});
$('#refresh').addEventListener('click', () => load({ manual: true }));
$('#open-favs').addEventListener('click', openFavs);
$('#close-favs').addEventListener('click', closeFavs);
$('#close-team').addEventListener('click', closeTeam);
$('#team-body').addEventListener('click', ev => {
  const b = ev.target.closest('[data-follow]');
  if (b) toggleFollow(b.dataset.league, b.dataset.follow);
});
$('#favs-body').addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el && el.dataset.action !== 'finals' && el.dataset.action !== 'search') onFavAction(el);
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
$('#favs-body').addEventListener('change', ev => { if (ev.target.dataset.action === 'finals') onFavAction(ev.target); });
$('#favs-body').addEventListener('input', ev => {
  if (ev.target.dataset.action !== 'search') return;
  teamQuery = ev.target.value;
  const grid = ev.target.nextElementSibling, f = favFor(ev.target.dataset.league);
  grid.outerHTML = teamGrid(ev.target.dataset.league, f);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if ($('#favs').hidden && $('#team').hidden) render(); }, 60000);
setInterval(pollLive, 60000);

render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
