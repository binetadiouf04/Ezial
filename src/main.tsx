import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker for browser notifications only (see public/sw.js) — Ezial
// is a classic website, not an installable app. Registered after load so it
// never delays first paint. Safe no-op on browsers without support.
if ('serviceWorker' in navigator) {
  // In-app navigation never re-fetches index.html, so a tab left open
  // across a deploy can keep running the previous build's JS. `controller`
  // is already set here only on a RETURNING visit controlled by a
  // previously registered worker; for that case alone, reload once the
  // moment a newer worker takes over, so an already-open tab can't keep
  // showing stale content forever. A brand-new visitor (no prior
  // controller) is unaffected.
  const hadController = Boolean(navigator.serviceWorker.controller);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Non-fatal — the site works identically without it (no browser notifications).
    });
    // Copies of build assets kept by the earlier version of sw.js. The new
    // worker deletes them when it activates; this also removes a copy the
    // old worker was still writing at that very moment.
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ezial-static-')).map((k) => caches.delete(k))))
        .catch(() => {});
    }
  });
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }
}
