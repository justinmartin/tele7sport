// Abonnés à la newsletter, rangés dans un store Vercel Blob privé : un fichier JSON par
// adresse, nommé d'après l'empreinte de l'adresse.
const crypto = require('crypto');
const { put, get, list, del } = require('@vercel/blob');

const PREFIX = 'subscribers/';
const idOf = email => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
const newToken = () => crypto.randomBytes(18).toString('base64url');
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const pathOf = id => `${PREFIX}${id}.json`;

async function readBlob(pathname) {
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text());
}

const getSubscriber = id => /^[0-9a-f]{24}$/.test(id) ? readBlob(pathOf(id)) : Promise.resolve(null);

const saveSubscriber = sub => put(pathOf(sub.id), JSON.stringify(sub), {
  access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
});

const deleteSubscriber = id => del(pathOf(id));

async function allSubscribers() {
  const paths = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor });
    paths.push(...page.blobs.map(b => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return (await Promise.all(paths.map(p => readBlob(p).catch(() => null)))).filter(Boolean);
}

module.exports = { idOf, newToken, sameToken, getSubscriber, saveSubscriber, deleteSubscriber, allSubscribers };
