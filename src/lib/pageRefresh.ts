// Actualisation de la page dans l'application installée (iPhone, Android).
//
// En mode « application » (écran d'accueil), ni l'iPhone ni Chrome Android ne
// proposent de « tirer vers le bas pour actualiser » ni de bouton recharger :
// Ezial fournit le geste (src/components/PullToRefresh.tsx) et une entrée
// « Actualiser » dans les menus (src/components/RefreshMenuButton.tsx).
//
// Jamais d'actualisation par le geste pendant un paiement, une commande, une
// saisie vendeur (isSensitivePath) ou quand un formulaire a été modifié sans
// être enregistré. Le bouton, lui, demande confirmation dans ce dernier cas.
import { refreshBlockReason, isUnsavedEntryField, type RefreshBlock } from './pullToRefreshCore';

/** Application ouverte depuis l'écran d'accueil (pas un onglet du navigateur). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Page (adresse) sur laquelle l'utilisateur a tapé quelque chose. Changer de
// page (navigation interne) efface la marque ; un rechargement aussi.
let unsavedOn: string | null = null;
let tracking = false;

function pageKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** À appeler une fois au démarrage : repère les saisies dans les formulaires. */
export function startUnsavedChangesTracking(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  const mark = (event: Event) => {
    const el = event.target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return;
    // Recherche de l'en-tête : jamais considérée comme une saisie à protéger.
    if (el.closest('header, [role="search"], [data-refresh-ignore-input]')) return;
    const type = el instanceof HTMLInputElement ? el.type : null;
    if (!isUnsavedEntryField(el.tagName, type, el.isContentEditable)) return;
    unsavedOn = pageKey();
  };
  document.addEventListener('input', mark, true);
  document.addEventListener('change', mark, true);
}

export function hasUnsavedChanges(): boolean {
  return unsavedOn !== null && unsavedOn === pageKey();
}

export function currentRefreshBlock(): RefreshBlock {
  return refreshBlockReason(window.location.pathname, hasUnsavedChanges());
}

/** Recharge la page (nouvelles données, et nouvelle version si elle est en ligne). */
export function reloadPage(): void {
  window.location.reload();
}
