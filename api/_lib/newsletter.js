// Newsletter du lundi, construite à partir du catalogue et des favoris de l'abonné
// (mêmes règles que l'app). HTML d'e-mail : tableaux et styles en ligne.
const { APP_URL, makeView, addDays, dayLabel, dayName, hhmm, esc, MONTHS } = require('./core');

const CHANNEL_COLORS = {
  'canal+': '#1a1a1a', 'canal+ sport': '#1a1a1a', 'canal+ foot': '#1a1a1a', 'canal+ premier league': '#1a1a1a',
  'bein sports': '#6b2eaf', 'bein sports 1': '#6b2eaf', 'bein sports 2': '#6b2eaf', 'bein sports 3': '#6b2eaf', 'bein sports max': '#6b2eaf',
  'eurosport': '#003f87', 'eurosport 1': '#003f87', 'eurosport 2': '#003f87', 'max': '#002be7',
  'tf1': '#e4002b', 'france 2': '#1e5aa8', 'france 3': '#005bbb', 'france 4': '#6b2d7b', 'france tv': '#1e5aa8', 'france.tv': '#1e5aa8',
  'm6': '#d97c00', "l'équipe": '#d4880f', "l'equipe": '#d4880f', 'dazn': '#262626', 'rmc sport': '#e10600', 'ligue 1+': '#0b1f8f',
  'nba league pass': '#1d428a', 'prime video': '#00a8e1', 'red bull tv': '#db0a40',
};
const US = new Set(['football', 'basketball', 'hockey']);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const badge = c => `<span style="display:inline-block;background:${CHANNEL_COLORS[c.toLowerCase()] || '#3a3a40'};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin:1px 0 1px 3px;white-space:nowrap;border:1px solid #333">${esc(c)}</span>`;
const logo = (url, size = 18) => url
  ? `<span style="display:inline-block;width:${size}px;height:${size}px;background:#fff;border-radius:50%;vertical-align:middle;text-align:center;line-height:${size}px;margin-right:7px"><img src="${esc(url)}" width="${size - 4}" height="${size - 4}" alt="" style="vertical-align:middle;border:0"></span>`
  : `<span style="display:inline-block;width:${size}px;height:${size}px;background:#2a2a2e;border-radius:50%;vertical-align:middle;margin-right:7px"></span>`;
const section = (title, body) => `<tr><td style="padding:22px 22px 6px"><div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#e8483b;border-bottom:1px solid #2a2a2a;padding-bottom:8px;margin-bottom:6px">${title}</div>${body}</td></tr>`;
const dayTitle = s => `<div style="font-size:17px;font-weight:800;color:#fff;margin:16px 0 2px">${esc(cap(s))}</div>`;
const sub = (html, color = '#8e8e96') => `<div style="font-size:12px;font-weight:700;color:${color};margin:10px 0 4px">${html}</div>`;

function render(cat, favs, { start, unsubscribeUrl }) {
  const v = makeView(cat, favs);
  const end = addDays(start, 6), prevStart = addDays(start, -7), prevEnd = addDays(start, -1);
  const mine = v.events();
  const leagueHead = lg => { const L = cat.leagues[lg] || {}; return sub(`${logo(L.logo, 16)}${esc(L.label || lg)}`); };

  const teamCell = (e, side, score) => {
    const t = v.teamOf(e.lg, e[side].id), fav = v.isFavTeam(e.lg, e[side].id);
    const mineScore = side === 'h' ? e.hs : e.as, other = side === 'h' ? e.as : e.hs;
    const lost = score && mineScore < other;
    return `<div style="padding:2px 0;color:${lost ? '#8e8e96' : '#f5f5f7'};font-weight:${fav ? 800 : 600};font-size:14px">${logo(t.l)}${esc(t.n)}${e[side].r ? ` <span style="color:#6e6e78;font-weight:500;font-size:12px;white-space:nowrap">${esc(e[side].r)}</span>` : ''}${score ? `<span style="float:right;font-weight:800;color:${lost ? '#8e8e96' : '#fff'}">${mineScore}</span>` : ''}</div>`;
  };
  const row = (e, { score = false } = {}) => {
    const us = US.has((cat.leagues[e.lg] || {}).sport);
    const [a, b] = us ? ['a', 'h'] : ['h', 'a'];
    const right = score ? '' : `<div style="font-size:14px;font-weight:800;color:${e.nt ? '#9aa5ff' : '#fff'}">${hhmm(e.ko)}</div><div style="margin-top:3px">${e.ch.map(badge).join('')}</div>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #1f1f22"><tr>
      <td style="padding:8px 0">${teamCell(e, a, score)}${teamCell(e, b, score)}${e.rd ? `<div style="font-size:11px;color:#6e6e78;margin-top:2px">${esc(e.rd)}</div>` : ''}</td>
      ${right ? `<td width="120" style="padding:8px 0 8px 10px;text-align:right;vertical-align:top">${right}</td>` : ''}</tr></table>`;
  };
  const byLeague = (list, opts) => {
    const groups = new Map();
    list.forEach(e => { if (!groups.has(e.lg)) groups.set(e.lg, []); groups.get(e.lg).push(e); });
    return [...groups].map(([lg, evs]) => leagueHead(lg) + evs.map(e => row(e, opts)).join('')).join('');
  };
  const soloRows = list => list.map(c => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #1f1f22"><tr>
      <td style="padding:8px 0;font-size:14px;color:#f5f5f7;font-weight:700">${esc(c.emoji || '')} ${esc(c.name)}<div style="font-size:12px;color:#8e8e96;font-weight:500">${esc([c.label, c.loc, c.details].filter(Boolean).join(' · '))}</div></td>
      <td width="120" style="padding:8px 0 8px 10px;text-align:right;vertical-align:top">${c.time ? `<div style="font-size:14px;font-weight:800;color:#fff">${esc(c.time)}</div>` : ''}${(c.ch || []).map(badge).join('')}</td></tr></table>`).join('');

  // À ne pas rater
  const highlights = mine.filter(e => e.hl && e.day >= start && e.day <= end && e.st !== 'c');
  let body = highlights.length ? section('À ne pas rater', highlights.map(e => sub(esc(cap(dayLabel(e.day))), '#f2c14e') + row(e)).join('')) : '';

  // Programme jour par jour
  let days = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const evs = mine.filter(e => e.day === d).sort((x, y) => x.ko.localeCompare(y.ko));
    const evening = evs.filter(e => !e.nt), night = evs.filter(e => e.nt);
    const solo = v.cycling().filter(c => c.start <= d && d <= c.end);
    const hidden = v.hiddenNba(d);
    if (!evs.length && !solo.length && !hidden) continue;
    days += dayTitle(dayLabel(d)) + byLeague(evening) + soloRows(solo)
      + (night.length ? sub(`Nuit de ${dayName(d)} à ${dayName(addDays(d, 1))}`, '#9aa5ff') + byLeague(night) : '')
      + (hidden ? `<div style="font-size:12px;color:#8e8e96;padding:6px 0">+ ${hidden} autre${hidden > 1 ? 's' : ''} match${hidden > 1 ? 's' : ''} NBA sur le League Pass</div>` : '');
  }
  body += section('Programme de la semaine', days || '<p style="color:#8e8e96;font-size:14px">Rien au programme cette semaine pour tes équipes.</p>');

  // Résultats de la semaine passée
  const done = mine.filter(e => e.st === 'c' && e.hs != null && e.day >= prevStart && e.day <= prevEnd).sort((x, y) => x.ko.localeCompare(y.ko));
  if (done.length) body += section('Résultats de la semaine passée', byLeague(done, { score: true }));

  // Classements des équipes suivies
  const standings = [];
  (favs.leagues || []).filter(f => f.mode === 'teams').forEach(f => {
    const table = (cat.tables || {})[f.league];
    if (!table) return;
    table.groups.forEach(g => g.entries.forEach(r => {
      if (!v.isFavTeam(f.league, r.team_id)) return;
      const L = cat.leagues[f.league] || {};
      standings.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #1f1f22"><tr>
        <td style="padding:8px 0;font-size:14px;font-weight:700;color:#f5f5f7">${logo(r.logo)}${esc(r.team)}<div style="font-size:12px;color:#8e8e96;font-weight:500;margin-left:25px">${esc(L.label)}${g.entries.length && g.name !== L.label ? ` · ${esc(g.name)}` : ''}</div></td>
        <td width="130" style="padding:8px 0;text-align:right;font-size:13px;color:#a1a1aa"><strong style="color:#fff">${r.rank ? `${r.rank}${r.rank === 1 ? 'er' : 'e'}` : '–'}</strong> · ${esc(r.record || '')}${r.points != null && r.points !== '' ? ` · ${esc(r.points)} pts` : ''}</td></tr></table>`);
    }));
  });
  if (standings.length) body += section('Classements', standings.join(''));

  const s = new Date(`${start}T12:00:00Z`), e2 = new Date(`${end}T12:00:00Z`);
  const weekLabel = s.getUTCMonth() === e2.getUTCMonth()
    ? `Semaine du ${s.getUTCDate()} au ${e2.getUTCDate()} ${MONTHS[e2.getUTCMonth()]}`
    : `Semaine du ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} au ${e2.getUTCDate()} ${MONTHS[e2.getUTCMonth()]}`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Télé7Sport</title></head>
<body style="margin:0;padding:0;background:#000;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0b0b0c;border:1px solid #222225;border-radius:14px">
<tr><td style="padding:26px 22px 18px;border-bottom:1px solid #222225">
  <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#fff;text-transform:uppercase">Télé<span style="color:#e8483b">7</span>Sport</div>
  <div style="font-size:14px;color:#a1a1aa;margin-top:4px">${weekLabel}</div></td></tr>
${body}
<tr><td style="padding:22px;border-top:1px solid #222225;font-size:12px;color:#6e6e78;line-height:1.7">
  <a href="${APP_URL}" style="color:#f5f5f7;font-weight:700">Ouvrir l'app</a> pour les scores en direct et modifier tes favoris.<br>
  ${unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:#6e6e78">Se désinscrire</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Télé7Sport — ${weekLabel}`, html };
}

module.exports = { render };
