import { supabase } from './supabaseClient';

// Mirrors supabaseSellerAuth.ts's pattern exactly, but for the admin role:
// a real Supabase Auth user (real email this time — the admin login form
// already collects one) whose uid is listed in public.admins. Needed so
// RLS on hero_slides / home_discover_tiles can actually restrict writes to
// admins instead of trusting the client.

export interface AdminAuthInfo {
  name: string;
}

const GENERIC_LOGIN_ERROR = 'Email ou mot de passe incorrect.';
const NOT_ADMIN_ERROR = "Ce compte n'a pas d'accès administrateur.";

// Only public.admins.user_id is guaranteed to exist — a display name column
// is optional, so this never fails the admin check just because a specific
// column (e.g. `name`) isn't present in the real table.
function adminNameFrom(row: Record<string, unknown>): string {
  const name = row.name ?? row.full_name ?? row.display_name;
  return typeof name === 'string' && name.trim() ? name : 'Admin EZIAL';
}

async function isListedAsAdmin(userId: string): Promise<AdminAuthInfo | null> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;

  return { name: adminNameFrom(data) };
}

export async function signInAdmin(email: string, password: string): Promise<AdminAuthInfo | { error: string }> {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.user) return { error: GENERIC_LOGIN_ERROR };

  const admin = await isListedAsAdmin(signInData.user.id);
  if (!admin) {
    // Authenticated, but not listed in public.admins — never leave a
    // half-authenticated admin session standing.
    await supabase.auth.signOut();
    return { error: NOT_ADMIN_ERROR };
  }
  return admin;
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the admin role.
export async function restoreAdminSession(): Promise<AdminAuthInfo | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const admin = await isListedAsAdmin(data.session.user.id);
  if (!admin) {
    await supabase.auth.signOut();
    return null;
  }
  return admin;
}
