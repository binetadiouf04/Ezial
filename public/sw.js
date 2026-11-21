// Service worker d'Ezial (application web installable).
//
// Rôle volontairement limité :
//   1. notifications Web Push (affichage + ouverture de la bonne page) —
//      comportement identique à la version précédente ;
//   2. page « hors connexion » quand une NAVIGATION échoue faute de réseau.
//
// Ce qu'il ne fait JAMAIS : mettre en cache les pages, le JavaScript, le CSS,
// les images ou les réponses Supabase (comptes, sessions, paiements, commandes).
// Toutes ces requêtes vont directement au réseau, exactement comme sans service
// worker ; les fichiers /assets/* sont versionnés par Vite et gérés par le cache
// HTTP de Cloudflare Pages (voir public/_headers). Le seul fichier gardé est
// /offline.html, une page statique sans aucune donnée personnelle.
//
// Mises à jour : un nouveau sw.js s'installe et s'active tout de suite
// (skipWaiting + clients.claim) sans recharger aucune page. C'est sans risque
// parce qu'il ne sert aucun fichier de l'application ; la mise à jour de
// l'application elle-même est proposée à l'utilisateur par la page
// (src/lib/appUpdate.ts), jamais imposée.

const OFFLINE_CACHE = 'ezial-offline-v1';
const OFFLINE_URL = '/offline.html';
// Caches d'anciennes versions du worker (copie des fichiers du site) : supprimés.
const OBSOLETE_PREFIXES = ['ezial-static-', 'ezial-offline-'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // Sans réseau à l'installation : le worker s'installe quand même
      // (notifications), la page hors ligne sera simplement absente.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== OFFLINE_CACHE && OBSOLETE_PREFIXES.some((p) => k.startsWith(p)))
      .map((k) => caches.delete(k)));
    // Le préchargement de navigation évite tout délai dû au démarrage du worker.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* facultatif */ }
    }
    await self.clients.claim();
  })());
});

// Uniquement les navigations GET (ouverture d'une page) : réseau d'abord,
// page hors ligne seulement si le réseau échoue. Aucune autre requête n'est
// interceptée (API, paiements, fichiers, images, autres domaines).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      if (preloaded) return preloaded;
      return await fetch(request);
    } catch {
      const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return cached || Response.error();
    }
  })());
});

// Web Push — the payload is whatever JSON the send-push / send-push-campaign
// Edge Functions sent: { title, body, url } plus, for a campaign, an optional
// { image, action }. `url` is a site path (e.g. "/pro/seller/commandes" for a
// seller order, "/compte/commandes" for a customer order).
// Android : `badge` = petite icône blanche de la barre d'état (silhouette du
// papillon) ; `image` = grande image sous le texte ; `actions` = bouton. L'iPhone
// ignore ces trois options (il n'affiche que l'icône, le titre et le texte).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const { title, body, url, tag, image, action } = payload;
  // Application Ezial Livreur (livreur.ezial.net) : son icône (scooter), pas celle de la marketplace.
  const appIcon = self.location.hostname.toLowerCase().startsWith('livreur.') ? '/icons/livreur/icon-192.png' : '/icons/icon-192.png';
  const options = {
    body: body || '',
    icon: appIcon,
    badge: '/icons/badge-96.png',
    data: { url: url || '/' },
  };
  if (typeof image === 'string' && image.startsWith('https://')) options.image = image;
  if (typeof action === 'string' && action.trim()) options.actions = [{ action: 'open', title: action.trim().slice(0, 24) }];
  // Même « tag » = la notification remplace la précédente au lieu de s'empiler
  // (anti-doublon côté appareil). Facultatif : absent des envois actuels.
  if (typeof tag === 'string' && tag) options.tag = tag;
  event.waitUntil(self.registration.showNotification(title || 'Ezial', options));
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

// Focuses an already-open Ezial window (tab or installed app) and loads the
// page there, or opens a new one when none is open (or it cannot be navigated).
// Le bouton d'une campagne (event.action === 'open') mène à la même page.
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
          break; // fall back to a new window below
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
