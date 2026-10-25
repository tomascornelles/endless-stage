// Endless Stage · Service Worker
// Mismos archivos propios: red primero (para recibir cambios) y caché como respaldo offline.
// CDN de Three.js: caché primero (versión fija).
const VERSION = 'endless-stage-v2';
const CORE = [
  './', 'index.html', 'play.html', 'css/style.css', 'js/core.js', 'js/game.js', 'manifest.webmanifest', 'favicon.svg',
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

  // Navegación y recursos propios: red primero, caché si no hay conexión
  if (req.mode === 'navigate' || url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(r => {
          if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
          return r;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }
  // Three.js y otros recursos del CDN: caché primero
  if (req.url.startsWith(CDN)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
        return r;
      }))
    );
  }
});
