// Détection du clavier virtuel (iPhone, Android) — code pur, testé par
// src/lib/mobileKeyboard.test.mjs. Utilisé par useVirtualKeyboardOpen pour
// masquer les barres fixées en bas de l'écran pendant la saisie : sur iOS, une
// barre « position: fixed; bottom: 0 » reste accrochée au bas de la page
// (derrière ou au-dessus du clavier) et se met à sauter pendant le défilement.

/** Types de champs <input> qui n'ouvrent pas de clavier. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'image', 'hidden']);

/** Vrai pour un élément qui ouvre un clavier (ou le sélecteur iOS d'un <select>). */
export function isEditableTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean; readOnly?: boolean; disabled?: boolean } | null | undefined): boolean {
  if (!el || !el.tagName) return false;
  if (el.disabled || el.readOnly) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
  return Boolean(el.isContentEditable);
}

/** Hauteur minimale « mangée » par un clavier (en px CSS). En dessous : barre d'outils du navigateur, zoom, etc. */
export const KEYBOARD_MIN_HEIGHT = 120;
/** Délai pendant lequel on suppose le clavier en train de s'ouvrir après la prise de focus. */
export const KEYBOARD_OPENING_GRACE_MS = 800;

export interface KeyboardState {
  /** Un champ de saisie a le focus. */
  editableFocused: boolean;
  /** window.innerHeight (viewport de mise en page). */
  layoutHeight: number;
  /** visualViewport.height, ou null si l'API n'existe pas. */
  visualHeight: number | null;
  /** visualViewport.scale (zoom par pincement), 1 par défaut. */
  scale?: number;
  /** Millisecondes écoulées depuis la prise de focus. */
  msSinceFocus: number;
  /** Écran tactile (pointer: coarse). */
  coarsePointer: boolean;
}

/**
 * Le clavier virtuel est-il (probablement) ouvert ?
 * - aucun champ actif → non ;
 * - visualViewport disponible → oui si la partie visible a rétréci d'au moins
 *   KEYBOARD_MIN_HEIGHT (zoom par pincement neutralisé), ou pendant les
 *   premières 800 ms (le clavier s'anime) sur écran tactile ; ainsi la barre
 *   réapparaît si le clavier est fermé sans quitter le champ (bouton retour
 *   Android) ou s'il n'y en a pas (clavier physique sur iPad) ;
 * - sans visualViewport → oui sur écran tactile tant que le champ a le focus.
 */
export function isKeyboardLikelyOpen(s: KeyboardState): boolean {
  if (!s.editableFocused) return false;
  if (s.visualHeight == null) return s.coarsePointer;
  const visible = s.visualHeight * (s.scale && s.scale > 0 ? s.scale : 1);
  if (s.layoutHeight - visible >= KEYBOARD_MIN_HEIGHT) return true;
  return s.coarsePointer && s.msSinceFocus < KEYBOARD_OPENING_GRACE_MS;
}
