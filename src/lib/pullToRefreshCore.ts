// « Tirer vers le bas pour actualiser » — règles pures (aucun accès au DOM),
// testées par src/lib/pullToRefreshCore.test.mjs. Le geste lui-même est dans
// src/components/PullToRefresh.tsx.
import { isSensitivePath } from './appUpdateCore.ts';

/** Distance (après amortissement) à partir de laquelle relâcher actualise la page. */
export const PULL_THRESHOLD_PX = 72;
/** Déplacement maximal de l'indicateur. */
export const PULL_MAX_PX = 110;
/** Mouvement du doigt sous lequel on n'a pas encore décidé de la direction. */
const DIRECTION_SLOP_PX = 8;

export type PullDirection = 'pending' | 'pull' | 'ignore';

/**
 * Direction du geste depuis le point de départ. Un geste horizontal
 * (carrousel, galerie, onglets défilants) ou vers le haut n'est jamais un
 * « tirer pour actualiser ».
 */
export function pullDirection(dx: number, dy: number): PullDirection {
  if (Math.abs(dx) < DIRECTION_SLOP_PX && Math.abs(dy) < DIRECTION_SLOP_PX) return 'pending';
  if (dy > 0 && dy > Math.abs(dx) * 1.5) return 'pull';
  return 'ignore';
}

/** Distance affichée : le doigt va deux fois plus loin que l'indicateur, plafonnée. */
export function dampedPull(dy: number): number {
  if (!(dy > 0)) return 0;
  return Math.min(PULL_MAX_PX, dy * 0.5);
}

export type RefreshBlock = 'sensitive' | 'unsaved' | null;

/**
 * Raison pour laquelle on ne doit pas recharger ici : paiement, commande ou
 * saisie importante (mêmes pages que le bandeau de mise à jour), ou
 * formulaire modifié et pas encore enregistré.
 */
export function refreshBlockReason(pathname: string, hasUnsavedChanges: boolean): RefreshBlock {
  if (isSensitivePath(pathname)) return 'sensitive';
  if (hasUnsavedChanges) return 'unsaved';
  return null;
}

const TEXT_ENTRY_TYPES = new Set([
  'text', 'email', 'tel', 'number', 'password', 'url', 'date', 'datetime-local', 'time', 'month', 'week', 'file', '',
]);

/**
 * Vrai si une saisie dans ce champ compte comme « modification non
 * enregistrée ». Les cases à cocher, boutons radio, curseurs et champs de
 * recherche servent surtout de filtres : ils ne bloquent pas l'actualisation.
 */
export function isUnsavedEntryField(tagName: string, type: string | null | undefined, contentEditable = false): boolean {
  const tag = tagName.toUpperCase();
  if (contentEditable) return true;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return false;
  if (tag !== 'INPUT') return false;
  return TEXT_ENTRY_TYPES.has((type ?? '').toLowerCase());
}
