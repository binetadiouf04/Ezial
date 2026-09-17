import { supabase } from './supabaseClient';

// Real customer accounts, mirroring the seller/admin Supabase Auth pattern
// already used in this app (supabaseSellerAuth.ts / supabaseAdminAuth.ts).
//
// A customer signs up with prénom + nom + mot de passe, and EITHER a phone
// OR an email (at least one). Supabase Auth itself only understands
// email + password, so a phone-only signup gets a deterministic, internal
// technical email exactly like sellers already get from their seller_code
// (`<phone>@customers.ezial.internal` — `.internal` is an IANA-reserved
// special-use TLD, RFC 6761, never a real deliverable domain). A customer
// who gives a real email uses that real address as their Supabase Auth
// email instead, so "mot de passe oublié" works for them out of the box.
//
// Login accepts either identifier (email or phone) — resolved to the
// account's real Supabase Auth email via the resolve_customer_login_email()
// RPC (security definer) before calling signInWithPassword, so a phone
// works as a login identifier even for an email-primary account and vice
// versa. See the migration this feature ships with.
const CUSTOMER_EMAIL_DOMAIN = 'customers.ezial.internal';

export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[^\d+]/g, '');
}

function syntheticEmailForPhone(phone: string): string {
  return `${normalizePhone(phone).replace(/^\+/, '')}@${CUSTOMER_EMAIL_DOMAIN}`;
}

const GENERIC_LOGIN_ERROR = 'Identifiant ou mot de passe incorrect.';
const GENERIC_SIGNUP_ERROR = "Impossible de créer le compte. Vérifiez vos informations et réessayez.";

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  quartier: string | null;
  landmark: string | null;
}

interface CustomerProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  quartier: string | null;
  landmark: string | null;
}

function mapProfile(row: CustomerProfileRow): CustomerProfile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    quartier: row.quartier,
    landmark: row.landmark,
  };
}

export interface SignUpCustomerInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  password: string;
}

export async function signUpCustomer(input: SignUpCustomerInput): Promise<CustomerProfile | { error: string }> {
  const email = input.email?.trim();
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const authEmail = email || (phone ? syntheticEmailForPhone(phone) : undefined);
  if (!authEmail) return { error: 'Renseignez un email ou un numéro de téléphone.' };

  const { data, error } = await supabase.auth.signUp({ email: authEmail, password: input.password });
  if (error || !data.user) return { error: error?.message ?? GENERIC_SIGNUP_ERROR };

  const { data: profileRow, error: profileError } = await supabase
    .from('customer_profiles')
    .insert({
      id: data.user.id,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: phone ?? null,
      email: email ?? null,
    })
    .select('*')
    .single();

  if (profileError || !profileRow) {
    // The auth user exists but its profile row failed — never leave the app
    // thinking this account is usable.
    await supabase.auth.signOut();
    return { error: GENERIC_SIGNUP_ERROR };
  }

  return mapProfile(profileRow as CustomerProfileRow);
}

async function fetchOwnProfile(): Promise<CustomerProfile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError || !profileRow) return null;

  return mapProfile(profileRow as CustomerProfileRow);
}

export async function signInCustomer(identifier: string, password: string): Promise<CustomerProfile | { error: string }> {
  const trimmed = identifier.trim();
  let email = trimmed;
  if (!trimmed.includes('@')) {
    const { data: resolved } = await supabase.rpc('resolve_customer_login_email', { p_identifier: normalizePhone(trimmed) });
    if (!resolved) return { error: GENERIC_LOGIN_ERROR };
    email = resolved as string;
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: GENERIC_LOGIN_ERROR };

  const profile = await fetchOwnProfile();
  if (!profile) {
    // Authenticated but no profile row — never leave a half-set-up session.
    await supabase.auth.signOut();
    return { error: GENERIC_LOGIN_ERROR };
  }
  return profile;
}

// Re-validates an existing Supabase session (e.g. on page load) — never
// trusts a cached local flag alone, exactly like the seller/admin sessions.
export async function restoreCustomerSession(): Promise<CustomerProfile | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return fetchOwnProfile();
}

export async function signOutCustomer(): Promise<void> {
  await supabase.auth.signOut();
}

export interface UpdateCustomerProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  quartier: string;
  landmark: string;
}

export async function updateCustomerProfile(userId: string, input: UpdateCustomerProfileInput): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('customer_profiles')
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      quartier: input.quartier || null,
      landmark: input.landmark.trim() || null,
    })
    .eq('id', userId);
  return error ? { error: error.message } : {};
}

// Only works for an account whose registered Supabase Auth email is a real,
// reachable address — i.e. one given at signup. A phone-only account (whose
// technical email is the synthetic customers.ezial.internal address) has no
// reset path in this MVP: there is no SMS-based recovery, by design (see
// the push-notification feature's own "no SMS for MVP" rule). The UI must
// only offer this for a real email, never a phone number.
export async function requestCustomerPasswordReset(email: string): Promise<{ error?: string }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return error ? { error: error.message } : {};
}
