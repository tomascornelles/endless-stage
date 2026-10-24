// Endless Stage · Service Worker: precache del shell y caché de recursos del CDN
const VERSION = 'endless-stage-v1';
const CORE = [
  './', 'index.html', 'css/style.css', 'js/game.js', 'manifest.webmanifest', 'favicon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const CDN = 'https://cdnjs.cloudflare.com/';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegación: red primero, con respaldo offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)); return r; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  // Recursos propios y del CDN: caché primero
  if (url.origin === location.origin || req.url.startsWith(CDN)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const cp = r.clone();
          caches.open(VERSION).then(c => c.put(req, cp));
        }
        return r;
      }))
    );
  }
});
