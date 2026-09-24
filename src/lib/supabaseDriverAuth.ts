import { supabase } from './supabaseClient';

// Mirrors supabaseAdminAuth.ts exactly, but checks profiles.role = 'driver'
// instead of membership in public.admins — the only other real per-role
// gate already established in this schema (see the user_role enum).

export interface DriverAuthInfo {
  id: string;
  name: string;
}

const GENERIC_LOGIN_ERROR = 'Email ou mot de passe incorrect.';
const NOT_DRIVER_ERROR = "Ce compte n'a pas d'accès livreur.";

function driverNameFrom(row: { first_name: string | null; last_name: string | null }): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || 'Livreur EZIAL';
}

async function isListedAsDriver(userId: string): Promise<DriverAuthInfo | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data || data.role !== 'driver') return null;

  return { id: userId, name: driverNameFrom(data) };
}

export async function signInDriver(email: string, password: string): Promise<DriverAuthInfo | { error: string }> {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.user) return { error: GENERIC_LOGIN_ERROR };

  const driver = await isListedAsDriver(signInData.user.id);
  if (!driver) {
    // Authenticated, but not a driver profile — never leave a
    // half-authenticated driver session standing.
    await supabase.auth.signOut();
    return { error: NOT_DRIVER_ERROR };
  }
  return driver;
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the driver role.
export async function restoreDriverSession(): Promise<DriverAuthInfo | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const driver = await isListedAsDriver(data.session.user.id);
  if (!driver) {
    await supabase.auth.signOut();
    return null;
  }
  return driver;
}
