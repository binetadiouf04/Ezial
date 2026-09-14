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

async function adminForCurrentUser(): Promise<AdminAuthInfo | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('name')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (adminError || !admin) return null;

  return { name: (admin.name as string) || 'Admin EZIAL' };
}

export async function signInAdmin(email: string, password: string): Promise<AdminAuthInfo | { error: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: GENERIC_LOGIN_ERROR };

  const admin = await adminForCurrentUser();
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

  const admin = await adminForCurrentUser();
  if (!admin) {
    await supabase.auth.signOut();
    return null;
  }
  return admin;
}
