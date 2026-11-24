import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import UpdateBanner from './components/UpdateBanner.tsx';
import AppErrorBoundary from './components/AppErrorBoundary.tsx';
import PullToRefresh from './components/PullToRefresh.tsx';
import { startAppUpdates } from './lib/appUpdate';
import { applyPwaIdentity } from './lib/pwaIdentity';
import './index.css';

// Nom et icône de l'application installée : propres à admin.ezial.net.
applyPwaIdentity();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
    <UpdateBanner />
    <PullToRefresh />
  </StrictMode>
);

// Service worker (notifications + page hors connexion) et détection des
// nouvelles versions. Plus aucun rechargement automatique quand un nouveau
// worker prend la main : l'ancienne version rechargeait tous les onglets
// ouverts, y compris en plein paiement. La mise à jour est désormais proposée
// (bandeau), jamais imposée — voir src/lib/appUpdate.ts.
startAppUpdates();
