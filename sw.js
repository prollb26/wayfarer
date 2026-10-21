// Wayfarer service worker: keeps the app and visited map tiles available offline.
const SHELL = 'wayfarer-shell-v4';
const TILES = 'wayfarer-tiles-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const TILE_HOSTS = /(autonavi\.com|basemaps\.cartocdn\.com|tile\.openstreetmap\.org)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('wayfarer-') && k !== SHELL && k !== TILES).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: cache first, then network (and store).
  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      const res = await fetch(req.url, { mode: 'no-cors' });
      if (res && (res.ok || res.type === 'opaque')) c.put(req.url, res.clone());
      return res;
    }));
    return;
  }

  // App files: network first with a short timeout (so updates arrive), cache as fallback.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return (await c.match(req)) || (await c.match('./index.html'));
      }
    })());
  }
});
