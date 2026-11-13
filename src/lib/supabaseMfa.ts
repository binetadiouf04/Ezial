import { supabase } from './supabaseClient';

// Double authentification (MFA, TOTP) des administrateurs : fonctions fines
// autour de l'API MFA de Supabase Auth (supabase.auth.mfa.*). Aucun second
// système d'authentification : le facteur, le challenge et le niveau aal2
// vivent dans Supabase Auth, la session reste celle de supabase-js.
//
// Règles de ce fichier :
// - le secret TOTP et les codes ne sont jamais stockés ni journalisés ;
// - aucun message brut de l'API n'atteint l'interface (tout passe par
//   MESSAGES ci-dessous) ;
// - aucune fonction ne lève d'exception : chaque appel renvoie un résultat.

export type AssuranceLevel = 'aal1' | 'aal2';

export interface MfaFactor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
}

export type MfaErrorCode =
  | 'unavailable'
  | 'invalid_code'
  | 'challenge_expired'
  | 'rate_limited'
  | 'session'
  | 'insufficient_aal'
  | 'factor_not_found'
  | 'already_enrolled'
  | 'too_many_factors'
  | 'network'
  | 'unknown';

export interface MfaFailure {
  ok: false;
  code: MfaErrorCode;
  error: string;
}

export type MfaResult<T = object> = ({ ok: true } & T) | MfaFailure;

export type MfaState =
  | {
      status: 'ready';
      currentLevel: AssuranceLevel | null;
      nextLevel: AssuranceLevel | null;
      /** Facteurs TOTP vérifiés, du plus ancien au plus récent. */
      verifiedFactors: MfaFactor[];
      /** Vrai quand un facteur vérifié existe et que la session n'est pas encore aal2. */
      needsChallenge: boolean;
    }
  /** La double authentification n'est pas activée sur le projet Supabase. */
  | { status: 'unavailable'; error: string }
  /** Aucune session Supabase active. */
  | { status: 'signed_out'; error: string }
  | { status: 'error'; code: MfaErrorCode; error: string };

export interface TotpEnrollment {
  factorId: string;
  /** QR code prêt pour un attribut `src` d'image (data URI SVG), ou null s'il est inexploitable. */
  qrCodeSvg: string | null;
  /** Clé secrète pour la saisie manuelle. À garder en mémoire uniquement. */
  secret: string;
  /** Adresse otpauth:// équivalente au QR code. */
  uri: string;
}

export const MFA_UNAVAILABLE_MESSAGE =
  "La double authentification n'est pas activée sur le projet Supabase (Authentication → Multi-Factor).";

const MESSAGES: Record<MfaErrorCode, string> = {
  unavailable: MFA_UNAVAILABLE_MESSAGE,
  invalid_code: "Code incorrect. Saisissez le code à 6 chiffres affiché en ce moment dans votre application d'authentification.",
  challenge_expired: 'La vérification a expiré. Saisissez un nouveau code.',
  rate_limited: 'Trop de tentatives. Patientez une minute avant de réessayer.',
  session: 'Session expirée. Reconnectez-vous.',
  insufficient_aal: 'Reconnectez-vous avec votre code de vérification avant de modifier la double authentification.',
  factor_not_found: "Cette inscription n'existe plus. Reconnectez-vous ou recommencez l'activation.",
  already_enrolled: 'Deux appareils sont déjà enregistrés sur ce compte. Retirez-en un avant d’en ajouter un autre.',
  too_many_factors: 'Ce compte a atteint le nombre maximal de facteurs. Supprimez les anciens facteurs dans Supabase avant de réessayer.',
  network: 'Connexion impossible. Vérifiez votre connexion internet et réessayez.',
  unknown: 'La double authentification a rencontré une erreur. Réessayez.',
};

const DEFAULT_FRIENDLY_NAME = 'Ezial Admin';
/** Nombre maximal d'appareils vérifiés par compte administrateur. */
export const MAX_VERIFIED_FACTORS = 2;
// Nom affiché dans l'application d'authentification, à côté de l'email.
const TOTP_ISSUER = 'Ezial Admin';

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
}

function classify(raw: unknown): MfaErrorCode {
  const error = (raw && typeof raw === 'object' ? raw : {}) as ErrorLike;
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const name = typeof error.name === 'string' ? error.name : '';
  const status = typeof error.status === 'number' ? error.status : null;

  if (/^mfa_.*_not_enabled$/.test(code) || (message.includes('mfa') && (message.includes('disabled') || message.includes('not enabled')))) {
    return 'unavailable';
  }
  if (code === 'mfa_verification_failed' || code === 'mfa_verification_rejected' || message.includes('invalid totp code')) {
    return 'invalid_code';
  }
  if (code === 'mfa_challenge_expired' || (message.includes('challenge') && message.includes('expired'))) {
    return 'challenge_expired';
  }
  if (code === 'over_request_rate_limit' || status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'rate_limited';
  }
  if (code === 'insufficient_aal' || message.includes('aal2')) return 'insufficient_aal';
  if (code === 'mfa_factor_not_found' || (message.includes('factor') && message.includes('not found'))) return 'factor_not_found';
  if (code === 'mfa_verified_factor_exists') return 'already_enrolled';
  if (code === 'too_many_enrolled_mfa_factors') return 'too_many_factors';
  if (
    code === 'session_not_found' || code === 'session_expired' || code === 'bad_jwt' || code === 'no_authorization'
    || code === 'refresh_token_not_found' || code === 'user_not_found' || name === 'AuthSessionMissingError' || status === 401
  ) {
    return 'session';
  }
  if (name === 'AuthRetryableFetchError' || status === 0 || message.includes('fetch') || message.includes('network')) {
    return 'network';
  }
  return 'unknown';
}

function failure(raw: unknown): MfaFailure {
  const code = classify(raw);
  return { ok: false, code, error: MESSAGES[code] };
}

function failureOf(code: MfaErrorCode): MfaFailure {
  return { ok: false, code, error: MESSAGES[code] };
}

/**
 * Vrai quand une requête à la base (PostgREST) a été refusée parce que la
 * session d'un administrateur inscrit n'est pas au niveau aal2 : le serveur
 * répond alors avec un message contenant `mfa_required`.
 */
export function isMfaRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { message, details, hint, code } = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [message, details, hint, code].some((part) => typeof part === 'string' && part.toLowerCase().includes('mfa_required'));
}

/** Garde uniquement les chiffres d'une saisie (espaces et tirets collés depuis l'application retirés), 6 au plus. */
export function normalizeTotpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

function isCompleteCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

// Supabase renvoie le QR code soit en data URI (`data:image/svg+xml;utf-8,<svg…`,
// SVG non encodé : un « # » de couleur y couperait l'image), soit en chaîne SVG
// brute. Dans les deux cas le SVG est ré-encodé en data URI propre, destiné à
// une balise <img> : le SVG n'est jamais injecté dans le DOM.
function toQrImageSrc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^data:image\/svg\+xml;base64,/i.test(value)) return value;
  let svg = value;
  const dataUri = value.match(/^data:image\/svg\+xml[^,]*,([\s\S]*)$/i);
  if (dataUri) {
    svg = dataUri[1];
    if (/^%3csvg/i.test(svg)) {
      try {
        svg = decodeURIComponent(svg);
      } catch {
        return null;
      }
    }
  }
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Notification des changements (bandeau de rappel, carte Sécurité) ──────────

type MfaChangeListener = () => void;
const listeners = new Set<MfaChangeListener>();

/** Appelle `listener` après chaque activation ou désactivation d'un facteur. Renvoie la fonction de désabonnement. */
export function subscribeToMfaChanges(listener: MfaChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyMfaChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Un écouteur défaillant ne doit pas faire échouer l'opération MFA.
    }
  });
}

// ── Lecture de l'état ────────────────────────────────────────────────────────

/**
 * État MFA de la session courante, lu sur l'API Auth uniquement (jamais la
 * base) : niveau actuel dans le jeton, facteurs TOTP vérifiés relus sur le
 * serveur (supabase.auth.mfa.listFactors → getUser), et besoin de challenge.
 */
export async function getMfaState(): Promise<MfaState> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      const f = failure(sessionError);
      return { status: 'error', code: f.code, error: f.error };
    }
    if (!sessionData.session) return { status: 'signed_out', error: MESSAGES.session };

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !aal) return stateFromFailure(failure(aalError));

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factors) return stateFromFailure(failure(factorsError));

    const verifiedFactors: MfaFactor[] = factors.totp
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? null, createdAt: factor.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const currentLevel = aal.currentLevel ?? null;
    const nextLevel = verifiedFactors.length > 0 ? 'aal2' : (aal.nextLevel ?? currentLevel);
    return {
      status: 'ready',
      currentLevel,
      nextLevel,
      verifiedFactors,
      needsChallenge: verifiedFactors.length > 0 && currentLevel !== 'aal2',
    };
  } catch (thrown) {
    return stateFromFailure(failure(thrown));
  }
}

function stateFromFailure(f: MfaFailure): MfaState {
  if (f.code === 'unavailable') return { status: 'unavailable', error: f.error };
  if (f.code === 'session') return { status: 'signed_out', error: f.error };
  return { status: 'error', code: f.code, error: f.error };
}

// ── Inscription ──────────────────────────────────────────────────────────────

/**
 * Démarre l'inscription d'une application d'authentification. Les facteurs
 * « unverified » laissés par une inscription abandonnée sont supprimés
 * d'abord (ils bloqueraient le nom du facteur et s'accumuleraient).
 */
export async function startTotpEnrollment(friendlyName: string = DEFAULT_FRIENDLY_NAME): Promise<MfaResult<TotpEnrollment>> {
  try {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factors) return failure(factorsError);
    // Deux appareils au plus : un principal et un de secours (récupération
    // d'accès si le premier est perdu).
    if (factors.totp.length >= MAX_VERIFIED_FACTORS) return failureOf('already_enrolled');

    for (const factor of factors.all) {
      if (factor.status !== 'unverified') continue;
      // Échec sans gravité : l'inscription ci-dessous signalera le vrai problème.
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName.trim() || DEFAULT_FRIENDLY_NAME,
      issuer: TOTP_ISSUER,
    });
    if (error || !data) return failure(error);
    if (!data.totp?.secret) return failureOf('unknown');

    return {
      ok: true,
      factorId: data.id,
      qrCodeSvg: toQrImageSrc(data.totp.qr_code),
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  } catch (thrown) {
    return failure(thrown);
  }
}

async function challengeAndVerify(factorId: string, rawCode: string): Promise<MfaResult> {
  const code = normalizeTotpCode(rawCode);
  if (!isCompleteCode(code)) return failureOf('invalid_code');
  try {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) return failure(challengeError);

    // En cas de succès, supabase-js remplace la session par une session aal2.
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyError) return failure(verifyError);
    return { ok: true };
  } catch (thrown) {
    return failure(thrown);
  }
}

/** Confirme l'inscription avec le premier code : le facteur devient « verified » et la session passe en aal2. */
export async function confirmTotpEnrollment(factorId: string, code: string): Promise<MfaResult> {
  const result = await challengeAndVerify(factorId, code);
  if (result.ok) notifyMfaChange();
  return result;
}

/** Vérification en deux étapes à la connexion : fait passer la session en aal2. */
export async function verifyTotpChallenge(factorId: string, code: string): Promise<MfaResult> {
  return challengeAndVerify(factorId, code);
}

/** Annule une inscription en cours : supprime le facteur non vérifié. */
export async function cancelTotpEnrollment(factorId: string): Promise<MfaResult> {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      const f = failure(error);
      // Déjà supprimé : l'annulation a atteint son but.
      return f.code === 'factor_not_found' ? { ok: true } : f;
    }
    return { ok: true };
  } catch (thrown) {
    return failure(thrown);
  }
}

/**
 * Supprime un facteur (désactive la double authentification s'il était
 * vérifié ; Supabase exige alors une session aal2). La session est ensuite
 * rafraîchie pour que son niveau reflète tout de suite la suppression.
 * `skipSessionRefresh` : à passer quand d'autres facteurs vérifiés restent à
 * supprimer juste après (le rafraîchissement ferait redescendre la session).
 */
export async function removeFactor(factorId: string, options: { skipSessionRefresh?: boolean } = {}): Promise<MfaResult> {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return failure(error);
  } catch (thrown) {
    return failure(thrown);
  }
  if (!options.skipSessionRefresh) {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Sans gravité : le facteur est supprimé, le jeton sera renouvelé à sa
      // prochaine échéance.
    }
  }
  notifyMfaChange();
  return { ok: true };
}
