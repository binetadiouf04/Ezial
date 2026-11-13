import { supabase } from './supabaseClient';
import { getMfaState, isMfaRequiredError, verifyTotpChallenge } from './supabaseMfa';

// Mirrors supabaseSellerAuth.ts's pattern exactly, but for the admin role:
// a real Supabase Auth user (real email this time — the admin login form
// already collects one) whose uid is listed in public.admins. Needed so
// RLS on hero_slides / home_discover_tiles can actually restrict writes to
// admins instead of trusting the client.
//
// Double authentification (administrateurs uniquement) : quand le compte a
// un facteur TOTP vérifié et que la session n'est pas encore au niveau aal2,
// la connexion s'arrête sur { mfaRequired } — l'espace admin ne s'ouvre
// qu'après completeAdminMfaChallenge(). L'état MFA est lu sur l'API Auth
// AVANT public.admins : le serveur peut refuser cette lecture (message
// `mfa_required`) tant que la session n'est pas aal2, ce qui ne doit jamais
// être confondu avec « ce compte n'est pas administrateur ».

export interface AdminAuthInfo {
  name: string;
}

/** Mot de passe accepté, mais le code de l'application d'authentification reste à vérifier. */
export interface AdminMfaRequired {
  mfaRequired: true;
  factorId: string;
}

const GENERIC_LOGIN_ERROR = 'Email ou mot de passe incorrect.';
const NOT_ADMIN_ERROR = "Ce compte n'a pas d'accès administrateur.";
const MFA_STATE_ERROR = 'Impossible de vérifier la double authentification. Vérifiez votre connexion internet et réessayez.';
const MFA_FACTOR_MISSING_ERROR = "Le serveur exige la double authentification, mais aucune application d'authentification vérifiée n'est inscrite sur ce compte. Suivez la procédure de docs/securite/actions-manuelles.md.";
const MFA_STILL_REFUSED_ERROR = "Le code est correct, mais le serveur refuse encore l'accès administrateur. Reconnectez-vous.";

// Only public.admins.user_id is guaranteed to exist — a display name column
// is optional, so this never fails the admin check just because a specific
// column (e.g. `name`) isn't present in the real table.
function adminNameFrom(row: Record<string, unknown>): string {
  const name = row.name ?? row.full_name ?? row.display_name;
  return typeof name === 'string' && name.trim() ? name : 'Admin EZIAL';
}

type AdminLookup =
  | { kind: 'admin'; info: AdminAuthInfo }
  | { kind: 'not_admin' }
  // Lecture refusée par le serveur : administrateur inscrit, session pas aal2.
  | { kind: 'mfa_required' };

async function lookupAdmin(userId: string): Promise<AdminLookup> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && isMfaRequiredError(error)) return { kind: 'mfa_required' };
  if (error || !data) return { kind: 'not_admin' };

  return { kind: 'admin', info: { name: adminNameFrom(data) } };
}

type AdminAccess =
  | { kind: 'admin'; info: AdminAuthInfo }
  | { kind: 'mfa_required'; factorId: string }
  | { kind: 'not_admin' }
  | { kind: 'error'; error: string };

// Ordre imposé : état MFA (API Auth) d'abord, table admins ensuite.
async function resolveAdminAccess(userId: string): Promise<AdminAccess> {
  const mfa = await getMfaState();
  if (mfa.status === 'error' || mfa.status === 'signed_out') return { kind: 'error', error: MFA_STATE_ERROR };

  // 'unavailable' (MFA désactivée sur le projet) : aucun facteur ne peut
  // exister, la connexion continue comme avant.
  const verifiedFactors = mfa.status === 'ready' ? mfa.verifiedFactors : [];
  if (mfa.status === 'ready' && mfa.needsChallenge) {
    return { kind: 'mfa_required', factorId: verifiedFactors[0].id };
  }

  const lookup = await lookupAdmin(userId);
  if (lookup.kind !== 'mfa_required') return lookup;
  // Le serveur exige aal2 alors que l'état lu ne demandait pas de challenge.
  if (verifiedFactors.length > 0) return { kind: 'mfa_required', factorId: verifiedFactors[0].id };
  return { kind: 'error', error: MFA_FACTOR_MISSING_ERROR };
}

export async function signInAdmin(email: string, password: string): Promise<AdminAuthInfo | AdminMfaRequired | { error: string }> {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.user) return { error: GENERIC_LOGIN_ERROR };

  const access = await resolveAdminAccess(signInData.user.id);
  if (access.kind === 'admin') return access.info;
  if (access.kind === 'mfa_required') return { mfaRequired: true, factorId: access.factorId };

  // Authenticated, but not listed in public.admins (or the check could not
  // be completed) — never leave a half-authenticated admin session standing.
  await supabase.auth.signOut();
  return { error: access.kind === 'error' ? access.error : NOT_ADMIN_ERROR };
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the admin role.
// Renvoie { mfaRequired } quand la session existe mais n'est pas (ou plus)
// au niveau aal2 alors qu'un facteur vérifié est inscrit.
export async function restoreAdminSession(): Promise<AdminAuthInfo | AdminMfaRequired | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const access = await resolveAdminAccess(data.session.user.id);
  if (access.kind === 'admin') return access.info;
  if (access.kind === 'mfa_required') return { mfaRequired: true, factorId: access.factorId };
  // État MFA illisible (réseau) : la session est laissée telle quelle,
  // l'écran de connexion s'affiche et une nouvelle tentative reste possible.
  if (access.kind === 'error') return null;

  await supabase.auth.signOut();
  return null;
}

// Deuxième étape de la connexion : vérifie le code TOTP (la session passe en
// aal2), puis seulement lit public.admins. `fatal` : inutile de ressaisir un
// code, il faut repartir de l'écran de connexion.
export async function completeAdminMfaChallenge(factorId: string, code: string): Promise<AdminAuthInfo | { error: string; fatal?: boolean }> {
  const verified = await verifyTotpChallenge(factorId, code);
  if (!verified.ok) {
    return { error: verified.error, fatal: verified.code === 'session' || verified.code === 'factor_not_found' || verified.code === 'unavailable' };
  }

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { error: 'Session expirée. Reconnectez-vous.', fatal: true };

  const lookup = await lookupAdmin(userId);
  if (lookup.kind === 'admin') return lookup.info;
  if (lookup.kind === 'mfa_required') return { error: MFA_STILL_REFUSED_ERROR, fatal: true };

  await supabase.auth.signOut();
  return { error: NOT_ADMIN_ERROR, fatal: true };
}
