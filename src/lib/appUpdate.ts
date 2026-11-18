// Mises à jour de l'application installée (iPhone, Android) et des onglets
// restés ouverts — sans réinstallation, sans rechargement imposé.
//
//   - Le service worker (public/sw.js) est enregistré avec updateViaCache: 'none'
//     et revérifié au retour sur l'application et toutes les 30 minutes. Il ne
//     sert aucun fichier de l'application : sa mise à jour ne recharge rien.
//   - La version de l'application est comparée à /version.json (jamais en
//     cache). Si une autre version est en ligne, un bandeau discret propose
//     « Mettre à jour » (src/components/UpdateBanner.tsx). Jamais pendant un
//     paiement, une commande ou une saisie importante (isSensitivePath).
//   - Si un fichier d'une ancienne version a disparu après un déploiement
//     (« vite:preloadError » : la page demandée ne peut plus se charger), la
//     page est rechargée UNE fois pour obtenir la nouvelle version — au plus
//     une fois par minute, jamais en boucle.
import { isNewerBuild, isSensitivePath, parseVersionPayload, shouldAutoReloadAfterChunkError } from './appUpdateCore';

export const CURRENT_BUILD = __EZIAL_BUILD_ID__;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_GAP_BETWEEN_CHECKS_MS = 60 * 1000;
const CHUNK_RELOAD_KEY = 'ezial-chunk-reload-at';
const DISMISSED_KEY = 'ezial-update-dismissed';

type Listener = (availableBuild: string | null) => void;
let availableBuild: string | null = null;
const listeners = new Set<Listener>();
let lastCheckAt = 0;
let registration: ServiceWorkerRegistration | null = null;

export function onUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener);
  listener(availableBuild);
  return () => { listeners.delete(listener); };
}

function publish(build: string | null) {
  availableBuild = build;
  listeners.forEach((l) => l(build));
}

/** Interroge /version.json (jamais en cache) ; ne fait rien hors ligne ou en développement. */
export async function checkForUpdate(force = false): Promise<void> {
  if (CURRENT_BUILD === 'dev') return;
  const now = Date.now();
  if (!force && now - lastCheckAt < MIN_GAP_BETWEEN_CHECKS_MS) return;
  lastCheckAt = now;
  void registration?.update().catch(() => {});
  try {
    const res = await fetch(`/version.json?t=${now}`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return;
    const published = parseVersionPayload(await res.json());
    if (isNewerBuild(CURRENT_BUILD, published)) publish(published);
  } catch {
    // Hors ligne ou réponse illisible : on réessaiera plus tard.
  }
}

/** La mise à jour peut-elle être proposée sur la page actuelle ? */
export function canOfferUpdateHere(): boolean {
  return !isSensitivePath(window.location.pathname);
}

export function isUpdateDismissed(build: string): boolean {
  try { return sessionStorage.getItem(DISMISSED_KEY) === build; } catch { return false; }
}

export function dismissUpdate(build: string): void {
  try { sessionStorage.setItem(DISMISSED_KEY, build); } catch { /* facultatif */ }
  listeners.forEach((l) => l(availableBuild));
}

/** Rechargement demandé par l'utilisateur (bouton « Mettre à jour »). */
export function applyUpdate(): void {
  window.location.reload();
}

function readChunkReloadAt(): number | null {
  try { const v = sessionStorage.getItem(CHUNK_RELOAD_KEY); return v ? Number(v) : null; } catch { return null; }
}

/** À appeler une fois au démarrage (src/main.tsx). */
export function startAppUpdates(): void {
  // Fichiers d'une ancienne version introuvables après un déploiement.
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now();
    if (!shouldAutoReloadAfterChunkError(readChunkReloadAt(), now)) {
      // Déjà rechargé il y a moins d'une minute : on laisse l'erreur s'afficher
      // plutôt que de boucler, et on propose la mise à jour.
      void checkForUpdate(true);
      return;
    }
    event.preventDefault();
    try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now)); } catch { /* facultatif */ }
    window.location.reload();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => { registration = reg; })
        .catch(() => { /* sans service worker, le site fonctionne à l'identique (sans notifications) */ });
      // Copies de fichiers laissées par une très ancienne version du worker.
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ezial-static-')).map((k) => caches.delete(k))))
          .catch(() => {});
      }
    });
  }

  if (CURRENT_BUILD === 'dev') return;
  // Retour sur l'application (très fréquent pour une app installée qui reste
  // ouverte en arrière-plan), retour du réseau, puis toutes les 30 minutes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('online', () => { void checkForUpdate(); });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, CHECK_INTERVAL_MS);
  window.setTimeout(() => { void checkForUpdate(true); }, 10_000);
}
