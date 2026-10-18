// Mode hors-ligne : réseau d'abord (programme à jour), cache en secours.
// Les données elles-mêmes sont aussi gardées dans le localStorage par app.js.
const CACHE = 't7s-app-v1';
const SHELL = ['/programme/', '/programme/app.css', '/programme/app.js', '/programme/manifest.webmanifest', '/programme/icon-180.png', '/programme/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
