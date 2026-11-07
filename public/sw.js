// Service worker for browser notifications only. Ezial is a classic website
// (no installable app, no offline mode): this worker exists solely so the
// browser can display Web Push notifications — order, mission and admin
// alerts — and open the right page when one is clicked. It never intercepts
// a network request (no 'fetch' listener): pages, assets and Supabase calls
// all go straight to the network, exactly as on a site without a worker.

// Caches written by the earlier version of this worker (cache-first copy of
// build assets). Deleted on activation so no browser keeps them around.
const OBSOLETE_CACHE_PREFIX = 'ezial-static-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(OBSOLETE_CACHE_PREFIX)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Web Push — the payload is whatever JSON the send-push / send-push-campaign
// Edge Functions sent: { title, body, url }. `url` is a site path (e.g.
// "/pro/seller/commandes" for a seller order, "/compte/commandes" for a
// customer order).
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

// Same-origin absolute URL of the page a notification points to. Anything
// that is not a site path (empty, another origin) opens the homepage.
function targetUrlFor(path) {
  const scope = self.registration.scope;
  try {
    const url = new URL(typeof path === 'string' && path.startsWith('/') ? path : '/', scope);
    return url.origin === new URL(scope).origin ? url.href : scope;
  } catch {
    return scope;
  }
}

// Focuses an already-open Ezial tab and loads the page there, or opens a new
// tab when none is open (or the open one cannot be navigated).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = targetUrlFor(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (!('focus' in client)) continue;
        try {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        } catch {
          break; // fall back to a new tab below
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
