// Télé7Sport — app « programme de la semaine ».
// Données : web/data/programme.json, régénéré chaque jour par une GitHub Action.
// On le lit sur GitHub (toujours à jour), sinon la copie déployée, sinon le cache local.
const SOURCES = [
  'https://raw.githubusercontent.com/justinmartin/tele7sport/main/web/data/programme.json',
  '/data/programme.json',
];
const CACHE_KEY = 't7s_programme';
const TAB_KEY = 't7s_tab';
const NIGHT_END_HOUR = 7; // avant 7h : rattaché à la soirée de la veille
const MATCH_DURATION_H = 3;

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const CHANNEL_COLORS = {
  'canal+': '#1a1a1a', 'canal+ sport': '#1a1a1a', 'canal+ foot': '#1a1a1a',
  'bein sports': '#6b2eaf', 'bein sports 1': '#6b2eaf', 'bein sports 2': '#6b2eaf', 'bein sports 3': '#6b2eaf', 'bein sports max': '#6b2eaf',
  'eurosport': '#003f87', 'eurosport 1': '#003f87', 'eurosport 2': '#003f87',
  'tf1': '#e4002b', 'france 2': '#1e5aa8', 'france 3': '#005bbb', 'france 4': '#6b2d7b', 'france tv': '#1e5aa8',
  'm6': '#f7a600', "l'équipe": '#e8a01c', "l'equipe": '#e8a01c', 'dazn': '#2b2b2b', 'rmc sport': '#e10600',
  'nba league pass': '#1d428a', 'league pass': '#1d428a', 'prime video': '#00a8e1', 'espn': '#5a5a64',
};

let data = null;
let tab = 'today';
let filter = 'all';

// ---------- utilitaires ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const time = e => { const d = new Date(e.kickoff); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Soirée télé en cours : avant 7h du matin, on est encore dans la soirée de la veille.
function tvToday() {
  const now = new Date();
  if (now.getHours() < NIGHT_END_HOUR) now.setDate(now.getDate() - 1);
  return isoDay(now);
}

function liveState(e) {
  if (e.status === 'completed') return 'done';
  const start = new Date(e.kickoff).getTime(), now = Date.now();
  if (now >= start && now < start + MATCH_DURATION_H * 3600e3) return 'live';
  if (now >= start) return 'done';
  return 'upcoming';
}

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 60) return `à jour il y a ${Math.max(min, 1)} min`;
  if (min < 1440) return `à jour il y a ${Math.round(min / 60)} h`;
  return `à jour il y a ${Math.round(min / 1440)} j`;
}

function badge(ch) {
  return `<span class="badge" style="background:${CHANNEL_COLORS[ch.toLowerCase()] || '#4b4b55'}">${esc(ch)}</span>`;
}

// Une équipe favorite a-t-elle gagné ? (fav = nom suivi, ex. « Montpellier »)
function favOutcome(e) {
  if (!e.fav || e.home_score == null) return null;
  const f = e.fav.toLowerCase();
  const home = e.home.toLowerCase().includes(f), away = e.away.toLowerCase().includes(f);
  if (home === away) return null;
  const mine = home ? e.home_score : e.away_score, theirs = home ? e.away_score : e.home_score;
  return mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
}

// ---------- rendu ----------
function matchCard(e) {
  const state = liveState(e);
  const meta = [];
  if (e.highlight) meta.push('<span class="badge star">À ne pas rater</span>');
  if (state === 'live') meta.push('<span class="badge live">En direct</span>');
  if (e.status === 'completed' && e.home_score != null) meta.push(`<span class="badge score">${e.home_score} - ${e.away_score}</span>`);
  meta.push(...(e.channels || []).map(badge));
  if (e.round) meta.push(`<span class="badge" style="background:#2a2a2e">${esc(e.round)}</span>`);
  return `
    <article class="match${e.night ? ' night' : ''}${e.highlight ? ' highlight' : ''}">
      <div class="time">${time(e)}</div>
      <div class="teams">${esc(e.home)} <span class="vs">vs</span> ${esc(e.away)}</div>
      <div class="meta">${meta.join('')}</div>
    </article>`;
}

function byLeague(events) {
  const groups = new Map();
  events.forEach(e => {
    const key = `${e.emoji} ${e.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  return [...groups].map(([label, evs]) => `<div class="league">${esc(label)}</div>${evs.map(matchCard).join('')}`).join('');
}

function cyclingFor(day) {
  return (data.cycling || []).filter(c => c.start <= day && day <= c.end);
}

function cyclingCard(c) {
  return `
    <article class="match">
      <div class="time">${esc(c.time || '—')}</div>
      <div class="teams">${esc(c.emoji)} ${esc(c.name)}${c.location ? ` <span class="vs">· ${esc(c.location)}</span>` : ''}</div>
      <div class="meta">${(c.channels || []).map(badge).join('')}</div>
    </article>`;
}

function dayBlock(day, events, { title = true } = {}) {
  const d = parseDay(day);
  const next = new Date(d); next.setDate(d.getDate() + 1);
  const evening = events.filter(e => !e.night), night = events.filter(e => e.night);
  const hidden = filter === 'all' || filter === 'NBA' ? (data.nba_hidden || {})[day] || 0 : 0;
  const cycling = filter === 'all' ? cyclingFor(day) : [];
  if (!evening.length && !night.length && !hidden && !cycling.length) return '';
  const isToday = day === tvToday();
  return `
    <section class="day${day < tvToday() ? ' past' : ''}" id="d-${day}">
      ${title ? `<h2 class="day-title"><span>${cap(dayLabel(d))}</span>${isToday ? '<span class="today-pill">CE SOIR</span>' : ''}</h2>` : ''}
      ${byLeague(evening)}
      ${cycling.map(cyclingCard).join('')}
      ${night.length ? `<div class="night-title">🌙 Nuit de ${DAYS[d.getDay()]} à ${DAYS[next.getDay()]}</div>${byLeague(night)}` : ''}
      ${hidden ? `<div class="more">🏀 + ${hidden} autre${hidden > 1 ? 's' : ''} match${hidden > 1 ? 's' : ''} NBA sur le League Pass</div>` : ''}
    </section>`;
}

const visible = () => data.events.filter(e => filter === 'all' || e.label === filter);

function renderToday() {
  const today = tvToday();
  const tonight = visible().filter(e => e.tv_day === today);
  let html = installTip();
  html += `<h1 class="page-title">Ce soir</h1><p class="page-sub">${cap(dayLabel(parseDay(today)))}</p>`;
  const block = dayBlock(today, tonight, { title: false });
  if (block) return html + block;
  const next = visible().filter(e => liveState(e) === 'upcoming').slice(0, 6);
  html += '<p class="empty">Rien au programme ce soir pour tes favoris.</p>';
  if (next.length) {
    html += '<h2 class="day-title"><span>Prochains matchs</span></h2>';
    html += next.map(e => `<div class="league">${esc(cap(dayLabel(parseDay(e.tv_day))))} · ${esc(e.emoji)} ${esc(e.label)}</div>${matchCard(e)}`).join('');
  }
  return html;
}

function renderWeek() {
  const labels = [...new Set(data.events.map(e => e.label))];
  const first = parseDay(tvToday());
  const last = new Date(first); last.setDate(first.getDate() + 6);
  let html = `<h1 class="page-title">Semaine</h1><p class="page-sub">Du ${dayLabel(first)} au ${dayLabel(last)}</p>`;
  html += `<div class="filters" role="group" aria-label="Filtrer par compétition">
    <button class="chip${filter === 'all' ? ' active' : ''}" data-filter="all" type="button">Tout</button>
    ${labels.map(l => {
      const e = data.events.find(x => x.label === l);
      return `<button class="chip${filter === l ? ' active' : ''}" data-filter="${esc(l)}" type="button">${esc(e.emoji)} ${esc(l)}</button>`;
    }).join('')}
  </div>`;
  const days = []; // 7 jours glissants à partir de ce soir (le passé est dans Résultats)
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(isoDay(d));
  const blocks = days.map(day => dayBlock(day, visible().filter(e => e.tv_day === day))).join('');
  return html + (blocks || '<p class="empty">Rien cette semaine pour ce filtre.</p>');
}

function renderResults() {
  const done = data.events.filter(e => e.status === 'completed' && e.home_score != null)
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  let html = '<h1 class="page-title">Résultats</h1><p class="page-sub">Les deux dernières semaines</p>';
  if (!done.length) return html + '<p class="empty">Pas encore de résultat.</p>';
  return html + done.map(e => {
    const o = favOutcome(e);
    const icon = o === 'win' ? '✓' : o === 'lose' ? '✕' : o === 'draw' ? '=' : '•';
    return `<div class="result ${o || ''}">
      <span class="icon">${icon}</span>
      <div class="line">${esc(e.home)} <strong>${e.home_score} - ${e.away_score}</strong> ${esc(e.away)}
        <div class="when">${esc(e.emoji)} ${esc(e.label)} · ${cap(dayLabel(parseDay(e.tv_day)))}</div></div>
    </div>`;
  }).join('');
}

function renderStandings() {
  let html = '<h1 class="page-title">Classements</h1><p class="page-sub">Bilan de tes équipes</p>';
  if (!(data.standings || []).length) return html + '<p class="empty">Pas de classement disponible.</p>';
  return html + data.standings.map(s => {
    const rank = s.rank ? `<b>${s.rank === 1 ? '1er' : s.rank + 'e'}</b><small>sur ${s.group_size}</small>` : '<b>—</b>';
    const group = s.group.toLowerCase().endsWith(s.league_label.toLowerCase()) ? s.league_label : `${s.league_label} · ${s.group}`;
    return `<div class="standing">
      <div class="team">${esc(s.emoji)} ${esc(s.team)}</div>
      <div class="rank">${rank}</div>
      <div class="comp">${esc(group)}</div>
      <div class="record"><span class="badge score">${esc(s.record)}</span>${s.points ? `<span class="badge score">${esc(s.points)} pts</span>` : ''}</div>
    </div>`;
  }).join('');
}

function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || !/iPhone|iPad/.test(navigator.userAgent)) return '';
  return `<div class="install-tip">📲 Pour l'avoir sur ton écran d'accueil : <strong>Partager</strong>, puis <strong>« Sur l'écran d'accueil »</strong>.</div>`;
}

function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const view = document.getElementById('view');
  if (!data) { view.innerHTML = '<p class="empty">Chargement du programme…</p>'; return; }
  view.innerHTML = { today: renderToday, week: renderWeek, results: renderResults, standings: renderStandings }[tab]();
  document.getElementById('updated').textContent = ago(data.generated_at);
  window.scrollTo(0, 0);
}

// ---------- données ----------
async function load({ manual = false } = {}) {
  const btn = document.getElementById('refresh');
  btn.classList.add('spin');
  let fresh = null;
  for (const url of SOURCES) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) { fresh = await r.json(); break; }
    } catch (e) { /* source suivante */ }
  }
  btn.classList.remove('spin');
  if (fresh && (!data || fresh.generated_at >= data.generated_at)) {
    data = fresh;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch (e) {}
  } else if (!data && manual) {
    document.getElementById('view').insertAdjacentHTML('afterbegin', '<div class="error">Impossible de charger le programme (hors-ligne ?).</div>');
  }
  render();
}

// ---------- démarrage ----------
try { data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { data = null; }
try { tab = localStorage.getItem(TAB_KEY) || 'today'; } catch (e) {}

document.querySelector('.tabs').addEventListener('click', ev => {
  const b = ev.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
  render();
});
document.getElementById('view').addEventListener('click', ev => {
  const chip = ev.target.closest('.chip');
  if (!chip) return;
  filter = chip.dataset.filter;
  render();
});
document.getElementById('refresh').addEventListener('click', () => load({ manual: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(render, 60000); // badges « en direct » et « à jour il y a… »

render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/programme/sw.js', { scope: '/programme/' }).catch(() => {});
