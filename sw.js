const VER = '1.2';
const CACHE = 'mis-turnos-' + VER;

// Archivos a cachear para uso offline
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Elimina caches viejos
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // Intenta la red primero; si falla, usa el cache
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        // Guarda la respuesta fresca en cache
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(r =>
        r || new Response(
          '<h2 style="font-family:sans-serif;text-align:center;padding:40px">Sin conexión 📵<br><small>Abre la app cuando tengas internet para ver la versión más reciente.</small></h2>',
          { headers: { 'Content-Type': 'text/html' } }
        )
      ))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
