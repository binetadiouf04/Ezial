// Règles pures (sans réseau) de la reprise de session de l'espace boutique.
//
// Principe : une erreur passagère (réseau coupé ou lent, application reprise après
// une mise en veille, serveur momentanément indisponible) ne déconnecte JAMAIS le
// vendeur. Seule une réponse claire du serveur (« cette session n'existe plus ») ou
// l'absence de session enregistrée sur l'appareil ramène à l'écran de connexion.

export interface ErrorLike { name?: string; status?: number }

export type SessionCheckOutcome = 'unavailable' | 'signed_out';

/**
 * Que faire d'une erreur survenue pendant la vérification de la session ?
 * - plus aucune session enregistrée sur l'appareil → 'signed_out' (supabase-js ne
 *   l'efface lui-même que lorsque le serveur l'a refusée définitivement) ;
 * - le serveur dit que la session n'existe plus (session supprimée, compte supprimé,
 *   jeton refusé : 401 / 403) → 'signed_out' ;
 * - tout le reste (réseau, délai dépassé, 5xx, erreur inconnue) → 'unavailable' :
 *   la session est gardée et la vérification sera refaite.
 */
export function classifySessionCheckError(error: ErrorLike | null | undefined, sessionStillStored: boolean): SessionCheckOutcome {
  if (!sessionStillStored) return 'signed_out';
  if (error?.name === 'AuthSessionMissingError') return 'signed_out';
  if (error?.name === 'AuthApiError' && (error.status === 401 || error.status === 403)) return 'signed_out';
  return 'unavailable';
}

/** Requête de renouvellement du jeton de session (POST /auth/v1/token?grant_type=refresh_token). */
export function isRefreshTokenRequestUrl(url: string): boolean {
  return /\/auth\/v1\/token\?(?:[^#]*&)?grant_type=refresh_token(?:[&#]|$)/.test(url);
}
