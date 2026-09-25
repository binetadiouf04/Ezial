import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// Driver identity is username + 6-digit PIN, never an email/password the
// driver has to see or type. The technical Supabase Auth identity behind
// it (a never-delivered drivers.ezial.internal address) is generated and
// consumed entirely server-side (see supabase/functions/create-driver,
// driver-set-pin, driver-login) — this file never sees it either.
//
// A real Supabase Auth session is still established client-side, via a
// one-time token_hash exchanged through verifyOtp(), so RLS keeps working
// exactly like for admin/seller.

export interface DriverAuthInfo {
  id: string;
  username: string;
  name: string;
}

export type DriverLoginStatus = 'not_found' | 'suspended' | 'needs_pin_setup' | 'ready';

// IMPORTANT: this project's Edge Functions get a dashboard-assigned deploy
// slug that can differ from their source folder name — delete-account's own
// slug is "bright-api" (see supabaseAccountDeletion.ts), not "delete-account".
// After deploying driver-set-pin/driver-login, confirm their actual slugs in
// the Supabase dashboard and update these two constants if they differ.
const DRIVER_SET_PIN_FUNCTION_SLUG = 'driver-set-pin';
const DRIVER_LOGIN_FUNCTION_SLUG = 'driver-login';

const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.';
const NOT_DRIVER_ERROR = "Ce compte n'a pas d'accès livreur.";

function driverNameFrom(row: { first_name: string | null; last_name: string | null }): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || 'Livreur EZIAL';
}

async function fetchDriverProfile(userId: string): Promise<DriverAuthInfo | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, role, is_suspended, username')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data || data.role !== 'driver' || data.is_suspended || !data.username) return null;
  return { id: userId, username: data.username, name: driverNameFrom(data) };
}

// Edge Function errors arrive as a non-2xx HTTP response, not in `data` —
// supabase-js surfaces that as a FunctionsHttpError whose real JSON body
// (our { error: string }) has to be read from its Response separately.
async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to the generic message below
    }
  }
  return fallback;
}

async function exchangeTokenForSession(tokenHash: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) return { error: GENERIC_ERROR };
  return {};
}

async function establishDriverSession(tokenHash: string): Promise<DriverAuthInfo | { error: string }> {
  const exchange = await exchangeTokenForSession(tokenHash);
  if (exchange.error) return { error: exchange.error };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { error: GENERIC_ERROR };

  const driver = await fetchDriverProfile(userId);
  if (!driver) {
    await supabase.auth.signOut();
    return { error: NOT_DRIVER_ERROR };
  }
  return driver;
}

// Step 1 of login — safe to call before any session exists (no PIN sent
// yet). Tells the UI whether to show "create your PIN" or "enter your PIN".
export async function checkDriverUsername(username: string): Promise<DriverLoginStatus | { error: string }> {
  const { data, error } = await supabase.rpc('driver_login_status', { p_username: username.trim() });
  if (error) return { error: GENERIC_ERROR };
  return data as DriverLoginStatus;
}

// Step 2 when the account has no PIN yet — creates it, then logs in.
export async function createDriverPin(username: string, pin: string): Promise<DriverAuthInfo | { error: string }> {
  const { data, error } = await supabase.functions.invoke<{ tokenHash?: string }>(DRIVER_SET_PIN_FUNCTION_SLUG, {
    body: { username: username.trim(), pin },
  });
  if (error) return { error: await readFunctionError(error, 'Impossible de créer le NIP.') };
  if (!data?.tokenHash) return { error: GENERIC_ERROR };
  return establishDriverSession(data.tokenHash);
}

// Step 2 when the account already has a PIN — ordinary login.
export async function signInDriverWithPin(username: string, pin: string): Promise<DriverAuthInfo | { error: string }> {
  const { data, error } = await supabase.functions.invoke<{ tokenHash?: string }>(DRIVER_LOGIN_FUNCTION_SLUG, {
    body: { username: username.trim(), pin },
  });
  if (error) return { error: await readFunctionError(error, "Nom d'utilisateur ou NIP incorrect.") };
  if (!data?.tokenHash) return { error: GENERIC_ERROR };
  return establishDriverSession(data.tokenHash);
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the driver role
// — a suspended driver is signed out here even mid-session.
export async function restoreDriverSession(): Promise<DriverAuthInfo | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const driver = await fetchDriverProfile(data.session.user.id);
  if (!driver) {
    await supabase.auth.signOut();
    return null;
  }
  return driver;
}

export interface OwnDriverProfile {
  firstName: string;
  lastName: string;
  username: string;
  phone: string | null;
  createdAt: string;
}

// Self-service read for DriverProfile.tsx — the signed-in driver's own row,
// via the existing "Users can view own profile" policy (id = auth.uid()).
// Never exposed to the UI: pin_hash, the technical internal email, role.
export async function fetchOwnDriverProfile(): Promise<OwnDriverProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, username, phone, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;

  return {
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    username: data.username ?? '',
    phone: data.phone,
    createdAt: data.created_at,
  };
}
