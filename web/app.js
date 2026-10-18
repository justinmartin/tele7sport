// Télé7Sport — app.
// Le serveur publie un catalogue (web/data/catalog.json, 2×/jour) : toutes les compétitions
// en cours, leurs matchs, équipes et classements. L'app filtre selon TES favoris, gardés sur
// le téléphone (initialisés avec ceux de la newsletter) et modifiables dans « Mes favoris ».
const SOURCES = [
  'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/catalog.json',
  '/data/catalog.json',
];
const KEYS = { catalog: 't7s_catalog', favs: 't7s_favs', tab: 't7s_tab' };
const NIGHT_END_HOUR = 7;      // avant 7h : rattaché à la soirée de la veille
const MATCH_DURATION_H = 3;
const LEAGUE_PASS = 'NBA League Pass';
const US_SPORTS = new Set(['football', 'basketball']); // à l'américaine : extérieur en haut
const SPORT_LABELS = { soccer: 'Football', basketball: 'Basket', football: 'Football américain', rugby: 'Rugby', tennis: 'Tennis' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

let cat = null;          // catalogue
let favs = null;         // { leagues: [{league, mode: all|teams|ap, teams: [ids], names: [], finals}], cycling: [ids] }
let tab = 'today';
let filter = 'all';
let openLeague = null;   // compétition dépliée dans « Mes favoris »
let teamQuery = '';

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
const wordMatch = (name, needle) => new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(name);

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
  return `<span class="lg-tile ${size}">${L.logo ? `<img src="${esc(L.logo)}" alt="" loading="lazy">` : `<span class="em">${esc(L.emoji || '')}</span>`}</span>`;
}

function liveState(e) {
  if (e.st === 'c') return 'done';
  const start = new Date(e.ko).getTime(), now = Date.now();
  if (now >= start && now < start + MATCH_DURATION_H * 3600e3) return 'live';
  return now >= start ? 'done' : 'upcoming';
}

function teamLine(e, side) {
  const s = e[side], t = team(e.lg, s.id);
  const done = e.st === 'c' && e.hs != null;
  const mine = side === 'h' ? e.hs : e.as, theirs = side === 'h' ? e.as : e.hs;
  const cls = ['team'];
  if (isFavTeam(e.lg, s.id)) cls.push('fav');
  if (done && mine < theirs) cls.push('loser');
  return `<div class="${cls.join(' ')}">
    ${t.l ? `<img src="${esc(t.l)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
    <span class="name">${s.rk ? `<span class="rk">${s.rk}</span>` : ''}${esc(t.n)}${s.r ? `<span class="rec">${esc(s.r)}</span>` : ''}</span>
    ${done ? `<span class="score">${mine}</span>` : ''}
  </div>`;
}

function matchRow(e) {
  const state = liveState(e);
  const sport = league(e.lg)?.sport;
  const [top, bottom] = US_SPORTS.has(sport) ? ['a', 'h'] : ['h', 'a'];
  let side = '';
  if (state === 'done' && e.st !== 'c') side = '<span class="status">Score à venir</span>';
  else if (state === 'live') side = '<span class="live">EN DIRECT</span>';
  else if (state === 'upcoming') side = `<span class="time">${hhmm(e.ko)}</span>`;
  const extras = [];
  if (e.hl && state !== 'done') extras.push('<span class="tag">À ne pas rater</span>');
  if (state !== 'done') extras.push(...e.ch.map(c => `<span class="ch">${esc(c)}</span>`));
  if (e.rd) extras.push(`<span class="round">${esc(e.rd)}</span>`);
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
      <div class="side">${c.time ? `<span class="time">${esc(c.time)}</span>` : ''}<div class="channels">${(c.ch || []).map(x => `<span class="ch">${esc(x)}</span>`).join('')}</div></div>
    </article>`).join('')).join('');
}

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

function renderWeek() {
  const first = tvToday(), last = addDays(first, 6);
  const leaguesWithEvents = [...new Set(cat.events.filter(visible).filter(e => e.day >= first && e.day <= last).map(e => e.lg))];
  const short = s => { const d = parseDay(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  let html = pageHead(`${short(first)} → ${short(last)}`, 'Cette semaine');
  if (leaguesWithEvents.length > 1) {
    html += `<div class="stories" role="group" aria-label="Filtrer par compétition">
      <button class="story${filter === 'all' ? ' active' : ''}" data-filter="all" type="button"><span class="ring"><span class="disc all">Tout</span></span><span class="lbl">Tout</span></button>
      ${leaguesWithEvents.map(lg => `<button class="story${filter === lg ? ' active' : ''}" data-filter="${lg}" type="button">
        <span class="ring"><span class="disc">${league(lg).logo ? `<img src="${esc(league(lg).logo)}" alt="">` : esc(league(lg).emoji)}</span></span>
        <span class="lbl">${esc(league(lg).label)}</span></button>`).join('')}
    </div>`;
  }
  if (!favs.leagues.length) return html + noFavs();
  const blocks = [];
  for (let d = first; d <= last; d = addDays(d, 1)) blocks.push(dayBlock(d, myEvents().filter(e => e.day === d)));
  return html + (blocks.join('') || '<p class="empty">Rien cette semaine pour ce filtre.</p>');
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
        <tbody>${rows.map(r => r === 'gap' ? `<tr class="gap"><td colspan="${cols}">···</td></tr>` : `<tr class="${isFav(r) ? 'fav' : ''}">
          <td>${r.rank ?? '–'}</td>
          <td class="team-cell"><span class="tc">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ''}<span>${esc(r.team)}</span></span></td>
          <td>${esc(r.record)}</td>${points ? `<td class="pts">${esc(r.points ?? '')}</td>` : ''}
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
  view.innerHTML = { today: renderToday, week: renderWeek, results: renderResults, standings: renderStandings }[tab]();
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
  let html = '';
  Object.entries(bySport).forEach(([sport, list]) => {
    html += `<div class="sport">${esc(SPORT_LABELS[sport] || sport)}</div>`;
    list.forEach(([id, L]) => {
      const f = favFor(id);
      const ap = id === 'ncaaf' || id === 'ncaam';
      html += `<div class="fav-league">
        <div class="fav-row">
          ${lgTile(id, 'm')}
          <button class="label" type="button" data-action="expand" data-league="${id}">${esc(L.label)}<small>${esc(f ? favSummary(f) : 'Non suivie')}</small></button>
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
  if (cat.cycling_leagues) {
    html += '<div class="sport">Cyclisme</div>';
    Object.entries(cat.cycling_leagues).forEach(([id, C]) => {
      const on = favs.cycling.includes(id);
      html += `<div class="fav-league"><div class="fav-row">
        <span class="lg-tile m"><span class="em">${esc(C.emoji)}</span></span>
        <span class="label">${esc(C.label)}</span>
        <button class="switch" role="switch" aria-checked="${on}" aria-label="Suivre ${esc(C.label)}" data-action="toggle-cycling" data-league="${id}" type="button"></button>
      </div></div>`;
    });
  }
  html += `<div class="sheet-actions">
    <button class="btn primary" type="button" data-action="copy">Copier pour la newsletter</button>
    <button class="btn" type="button" data-action="reset">Revenir aux favoris de la newsletter</button>
    <p class="note">Tes favoris sont enregistrés sur ce téléphone. La newsletter du lundi garde sa propre liste : pour l'aligner, copie la configuration et colle-la dans le secret GitHub <strong>FAVORITES_JSON</strong>.</p>
  </div>`;
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
  return `<div class="team-grid">${names}${list.map(([id, t]) => `<button class="team-chip${f.teams.includes(id) ? ' on' : ''}" type="button" data-action="team" data-league="${lg}" data-team="${id}">
      ${t.l ? `<img src="${esc(t.l)}" alt="" loading="lazy">` : ''}${esc(t.n)}</button>`).join('')}</div>`;
}

function newsletterConfig() {
  const favorites = favs.leagues.map(f => {
    const item = { league: f.league };
    if (f.mode === 'ap') item.teams = ['AP_RANKED'];
    else if (f.mode === 'teams') item.teams = [...f.teams.map(id => team(f.league, id).n), ...(f.names || [])];
    else item.teams = [];
    if (f.finals) item.phases_only = ['SEMIFINAL', 'FINAL'];
    return item;
  });
  favs.cycling.forEach(lg => favorites.push({ league: lg }));
  return JSON.stringify({ favorites, channels: cat.channels || [] }, null, 2);
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
  } else if (action === 'drop-name' && f) {
    f.names = (f.names || []).filter(n => n !== el.dataset.name);
  } else if (action === 'reset') {
    if (!confirm('Revenir aux favoris de la newsletter ?')) return;
    favs = defaultFavs();
  } else if (action === 'copy') {
    navigator.clipboard?.writeText(newsletterConfig()).then(() => toast('Configuration copiée'), () => toast('Copie impossible'));
    return;
  } else {
    return;
  }
  saveFavs();
  renderFavs();
}

function openFavs() {
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

// ---------------------------------------------------------------- données
async function load({ manual = false } = {}) {
  $('#refresh').classList.add('spin');
  let fresh = null;
  for (const url of SOURCES) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) { fresh = await r.json(); break; }
    } catch (e) { /* source suivante */ }
  }
  $('#refresh').classList.remove('spin');
  if (fresh && (!cat || fresh.generated_at >= cat.generated_at)) {
    cat = fresh;
    write(KEYS.catalog, cat);
    if (!favs) { favs = defaultFavs(); saveFavs(); }
  } else if (manual && !fresh) {
    toast('Hors-ligne : programme gardé en mémoire');
  }
  render();
}

// ---------------------------------------------------------------- démarrage
cat = read(KEYS.catalog);
favs = read(KEYS.favs);
if (cat && !favs) favs = defaultFavs();
tab = read(KEYS.tab) || 'today';

$('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab; write(KEYS.tab, tab);
  render(); window.scrollTo(0, 0);
});
$('#view').addEventListener('click', ev => {
  const more = ev.target.closest('[data-expand]');
  if (more) { expandedTables.add(more.dataset.expand); render(); return; }
  const story = ev.target.closest('[data-filter]');
  if (story) { filter = story.dataset.filter; render(); return; }
  if (ev.target.closest('[data-action="open-favs"]')) openFavs();
});
$('#refresh').addEventListener('click', () => load({ manual: true }));
$('#open-favs').addEventListener('click', openFavs);
$('#close-favs').addEventListener('click', closeFavs);
$('#favs-body').addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el && el.dataset.action !== 'finals' && el.dataset.action !== 'search') onFavAction(el);
});
$('#favs-body').addEventListener('change', ev => { if (ev.target.dataset.action === 'finals') onFavAction(ev.target); });
$('#favs-body').addEventListener('input', ev => {
  if (ev.target.dataset.action !== 'search') return;
  teamQuery = ev.target.value;
  const grid = ev.target.nextElementSibling, f = favFor(ev.target.dataset.league);
  grid.outerHTML = teamGrid(ev.target.dataset.league, f);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if ($('#favs').hidden) render(); }, 60000);

render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
