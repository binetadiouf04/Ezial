// Minimal, deliberately conservative service worker — this makes Ezial
// installable (PWA requirement) without turning into a fragile offline-app
// cache layer. Strategy:
//  - index.html (and any other navigation) is ALWAYS fetched from the
//    network first, so a new deploy is picked up on the very next visit
//    instead of serving a stale app shell referencing old, gone asset
//    hashes.
//  - Hashed build assets (Vite's /assets/*-<hash>.js/css) are safe to
//    cache-first — a given hash's content never changes.
//  - Everything else (Supabase REST/RPC calls, any other API) is never
//    intercepted — always goes straight to the network, untouched.
const CACHE_NAME = 'ezial-static-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

function isHashedAsset(url) {
  return url.pathname.includes('/assets/') && /-[a-zA-Z0-9_-]{6,}\.(js|css)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touches Supabase or any cross-origin call

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return res;
      })),
    );
  }
});

// Web Push — the payload is whatever JSON the send-push Edge Function sent
// (see supabase/functions/send-push/index.ts): { title, body, url }. `url`
// is an app hash route (e.g. "/pro" for a seller order, "/compte/commande/
// EZI-..." for a customer order) — notificationclick focuses an already-open
// Ezial tab and navigates it there, or opens a new one.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'Ezial', {
      body: body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(`${self.registration.scope}#${targetPath}`);
          return;
        }
      }
      return self.clients.openWindow(`${self.registration.scope}#${targetPath}`);
    }),
  );
});
