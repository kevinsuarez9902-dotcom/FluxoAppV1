const VER = '1.4';
const CACHE = 'fluxoapp-' + VER;

// App shell: these files are needed to open FluxoApp after installation/offline.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './js/config.js',
  './js/pwa.js',
  './js/app.js',
  './js/finance/financeStorage.js',
  './js/finance/calculator.js',
  './js/finance/financeEngine.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // Keep the existing network-first strategy so published updates arrive promptly.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(response =>
        response || new Response(
          '<h2 style="font-family:sans-serif;text-align:center;padding:40px">Sin conexión 📵<br><small>Abre FluxoApp cuando tengas internet para ver la versión más reciente.</small></h2>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      ))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
