import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA install support — registered after load so it never delays first
// paint. Safe no-op on browsers without support (older iOS Safari, etc).
if ('serviceWorker' in navigator) {
  // Hash routing never re-fetches index.html, so a tab or installed PWA
  // left open across a deploy can keep running the previous build's JS
  // indefinitely even though the server is already fully up to date —
  // only a fresh navigation (sw.js's own network-first strategy) picks up
  // a new version. `controller` is already set here only on a RETURNING
  // visit already controlled by a previously-installed worker; for that
  // case alone, reload once the moment a newer worker takes over, so an
  // already-open instance can't keep showing stale content forever. A
  // brand-new visitor (no prior controller) is unaffected.
  const hadController = Boolean(navigator.serviceWorker.controller);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Non-fatal — the app works identically without an installed SW.
    });
  });
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }
}
