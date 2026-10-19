// Agenda .ics : un match (?e=<compétition>:<id ESPN>) ou l'abonnement à tous les matchs de
// mes favoris (?f=<favoris encodés>), que l'app de calendrier relit toute seule.
const { APP_URL, loadCatalog, makeView, decodeFavs, addDays } = require('./_lib/core');

const DURATION_H = { soccer: 2, rugby: 2, basketball: 2.5, hockey: 3, football: 3.5 };
const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const text = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);

// Lignes de 75 octets max (RFC 5545), suite précédée d'une espace
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function matchEvent(cat, view, e) {
  const L = cat.leagues[e.lg] || {};
  const start = new Date(e.ko);
  const end = new Date(start.getTime() + (DURATION_H[L.sport] || 2) * 3600e3);
  const score = e.st === 'c' && e.hs != null ? ` (${e.hs}-${e.as})` : '';
  const desc = [L.label + (e.rd ? ` · ${e.rd}` : ''), e.ch.length ? `📺 ${e.ch.join(', ')}` : '', APP_URL].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT', `UID:t7s-${e.lg}-${e.eid}@tele7sport`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`${L.emoji || ''} ${view.title(e)}${score}`.trim())}`,
    e.ch.length ? `LOCATION:${text(e.ch.join(', '))}` : null,
    `DESCRIPTION:${text(desc)}`, `URL:${APP_URL}`, 'END:VEVENT',
  ].filter(Boolean);
}

function soloEvent(c) {
  return [
    'BEGIN:VEVENT', `UID:t7s-${c.lg}-${c.start}-${c.name.replace(/[^\w]/g, '')}@tele7sport`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART;VALUE=DATE:${c.start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(c.end, 1).replace(/-/g, '')}`,
    `SUMMARY:${text(`${c.emoji || ''} ${c.name}`.trim())}`,
    c.loc ? `LOCATION:${text(c.loc)}` : null,
    `DESCRIPTION:${text([c.label, c.details, (c.ch || []).length ? `📺 ${c.ch.join(', ')}` : ''].filter(Boolean).join('\n'))}`,
    'END:VEVENT',
  ].filter(Boolean);
}

module.exports = async (req, res) => {
  let cat;
  try { cat = await loadCatalog(); } catch (err) { res.status(502).send('Programme indisponible'); return; }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tele7Sport//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let filename = 'tele7sport.ics';

  if (req.query.e) {
    const [lg, eid] = String(req.query.e).split(':');
    const e = cat.events.find(x => x.lg === lg && String(x.eid) === eid);
    if (!e) { res.status(404).send('Match introuvable'); return; }
    const view = makeView(cat, { leagues: [{ league: lg, mode: 'all' }] });
    lines.push(...matchEvent(cat, view, e));
    filename = 'match.ics';
  } else {
    const favs = decodeFavs(req.query.f);
    if (!favs) { res.status(400).send('Favoris manquants'); return; }
    const view = makeView(cat, favs);
    lines.push('X-WR-CALNAME:Télé7Sport', 'X-WR-TIMEZONE:Europe/Paris',
      'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H');
    view.events().forEach(e => lines.push(...matchEvent(cat, view, e)));
    view.cycling().forEach(c => lines.push(...soloEvent(c)));
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.status(200).send(lines.map(fold).join('\r\n') + '\r\n');
};
