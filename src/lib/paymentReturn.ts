// Retour après paiement et écran « vérification en cours ».
//
// Contexte réel (25 nov. 2026) : sur iPhone, après un paiement dans Max It / Orange
// Money, l'adresse de retour s'ouvre dans Safari et non dans l'application installée.
// Safari n'a pas la session du client : la page doit donc pouvoir afficher l'état du
// paiement SANS connexion (fonction payment_return_status, docs/sql/retour-paiement.sql),
// à partir de l'uuid de la tentative transmis dans l'adresse (« ref= »).
//
// TypeScript pur (testé par paymentReturn.test.mjs), sauf les petites fonctions de
// mémorisation en bas du fichier (stockage du navigateur, toujours protégé).

/** Sondage de la page de retour : toutes les 4 s pendant 3 min, puis bouton « Vérifier à nouveau ». */
export const RETURN_POLL_MS = 4000;
export const RETURN_POLL_WINDOW_MS = 3 * 60_000;
/** Dans l'application : sondage pendant la vérification. */
export const VERIFY_POLL_MS = 4000;
/** « Réessayer le paiement » n'est proposé qu'après ce délai sans confirmation (ou sur échec réel). */
export const RETRY_AFTER_MS = 5 * 60_000;

export type ReturnKind = 'retour' | 'annule';
export type ReturnState = 'paid' | 'pending' | 'failed' | 'expired';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidRef(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Lit « ?paiement=retour|annule&ref=<uuid> » ; tout autre contenu est ignoré. */
export function parseReturnParams(search: string): { kind: ReturnKind | null; ref: string | null } {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return { kind: null, ref: null }; }
  const p = params.get('paiement');
  const kind: ReturnKind | null = p === 'retour' || p === 'annule' ? p : null;
  const ref = params.get('ref');
  return { kind, ref: isUuidRef(ref) ? ref.toLowerCase() : null };
}

export function isReturnState(value: unknown): value is ReturnState {
  return value === 'paid' || value === 'pending' || value === 'failed' || value === 'expired';
}

/**
 * Écran du paiement Orange Money dans l'application, d'après les statuts RÉELS :
 *   - loading   : première lecture pas encore faite (jamais « Payer maintenant » à ce moment-là) ;
 *   - start     : aucune tentative utilisable, la personne peut lancer le paiement (bouton) ;
 *   - qr        : QR / lien Max It valable, paiement pas encore lancé depuis cet appareil ;
 *   - verifying : paiement lancé (Max It ouvert, retour de paiement) ou tentative confirmée
 *                 côté fournisseur mais commande pas encore marquée payée : on attend, sans bouton de paiement ;
 *   - verifying_retry : idem, mais plus de RETRY_AFTER_MS sans confirmation : « Réessayer » proposé ;
 *   - failed    : la dernière tentative a échoué / expiré : « Réessayer le paiement » (action explicite).
 */
export type AttemptView = 'loading' | 'start' | 'qr' | 'verifying' | 'verifying_retry' | 'failed';

export interface AttemptInput {
  /** false tant que la première lecture de payment_transactions n'est pas terminée. */
  loaded: boolean;
  /** Statut de la dernière tentative (payment_transactions.status), null s'il n'y en a pas. */
  status: string | null;
  /** QR / lien encore valable pour cette tentative. */
  hasValidQr: boolean;
  /** Moment où le paiement a été lancé (ouverture de Max It, retour de paiement), sinon null. */
  launchedAt: number | null;
  now: number;
}

export function attemptView(i: AttemptInput): AttemptView {
  if (!i.loaded) return 'loading';
  if (!i.status) return 'start';
  if (i.status === 'failed' || i.status === 'cancelled' || i.status === 'expired') return 'failed';
  // Confirmée chez le fournisseur : la commande va passer « payée », on n'offre rien d'autre.
  if (i.status === 'confirmed' || i.status === 'duplicate') return 'verifying';
  if (i.launchedAt !== null) return i.now - i.launchedAt >= RETRY_AFTER_MS ? 'verifying_retry' : 'verifying';
  if (i.status === 'pending' && i.hasValidQr) return 'qr';
  return 'start';
}

// ── Mémorisation « paiement lancé » (par commande, dans ce navigateur) ─────────────
// Clé par numéro de commande : la liste « Mes commandes » et la page de la commande
// lisent la même information. Jamais une preuve de paiement : seulement « ne pas
// pousser la personne à payer une seconde fois pendant la vérification ».

const LAUNCH_PREFIX = 'ezial-paiement-lance-';
/** Au-delà, l'information est trop ancienne pour être utile. */
const LAUNCH_TTL_MS = 2 * 60 * 60_000;

export function readLaunch(orderNumber: string, now = Date.now()): { at: number; ref: string | null } | null {
  try {
    const raw = window.localStorage.getItem(LAUNCH_PREFIX + orderNumber);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: unknown; ref?: unknown };
    if (typeof v.at !== 'number' || !Number.isFinite(v.at) || now - v.at > LAUNCH_TTL_MS || v.at > now + 60_000) return null;
    return { at: v.at, ref: isUuidRef(v.ref) ? v.ref : null };
  } catch {
    return null;
  }
}

/** Enregistre le lancement ; garde la date d'origine si la même tentative était déjà notée. */
export function rememberLaunch(orderNumber: string, ref: string | null, now = Date.now()): number {
  const previous = readLaunch(orderNumber, now);
  if (previous && (previous.ref === ref || !ref || !previous.ref)) {
    if (ref && !previous.ref) {
      try { window.localStorage.setItem(LAUNCH_PREFIX + orderNumber, JSON.stringify({ at: previous.at, ref })); } catch { /* best-effort */ }
    }
    return previous.at;
  }
  try { window.localStorage.setItem(LAUNCH_PREFIX + orderNumber, JSON.stringify({ at: now, ref })); } catch { /* best-effort */ }
  return now;
}

export function forgetLaunch(orderNumber: string): void {
  try { window.localStorage.removeItem(LAUNCH_PREFIX + orderNumber); } catch { /* best-effort */ }
}
