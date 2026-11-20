// Retour en haut de page lors d'un changement de page (navigation interne).
// Défilement IMMÉDIAT, jamais progressif : la feuille de style impose
// « scroll-behavior: smooth » à toute la page (src/index.css), et sur iPhone ce
// défilement progressif est interrompu par l'affichage de la nouvelle page —
// on restait alors en bas, sur le pied de page. On neutralise donc ce réglage le
// temps du saut, puis on le rétablit (les liens d'ancre internes restent fluides).
// Répété aux deux images suivantes, une fois la nouvelle page affichée (pages
// chargées à la demande).
function jumpToTop(): void {
  try {
    // « instant » l'emporte sur la feuille de style (navigateurs récents, Safari ≥ 15.4).
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (window.scrollY === 0) return;
  } catch { /* ancien navigateur : valeur « instant » inconnue */ }
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  void getComputedStyle(root).scrollBehavior; // applique le réglage avant le saut
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

export function scrollToTopNow(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  jumpToTop();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => { jumpToTop(); window.requestAnimationFrame(jumpToTop); });
  }
}
