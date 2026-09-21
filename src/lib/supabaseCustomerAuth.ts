import { supabase } from './supabaseClient';
import { mapAuthErrorMessage, isValidEmail } from './authErrors';

// Real customer accounts — email + mot de passe (Supabase Auth). Téléphone
// reste une information de profil, jamais un identifiant de connexion (ça
// évite un système à deux entrées qui ne marchait pas correctement).
//
// Root cause fixed here: the customer_profiles row used to be inserted by
// the CLIENT right after signUp() — but when "Confirm email" is enabled on
// the Supabase project (it is), signUp() returns no active session until
// the email is confirmed, so that insert ran as an anonymous request and
// was always rejected by RLS ("id = auth.uid()" with auth.uid() = null).
// That's exactly what surfaced as the generic "Impossible de créer le
// compte" error. The profile row is now created server-side by a database
// trigger on auth.users (see the migration this fix ships with), which
// runs regardless of confirmation status — so it exists by the time the
// customer actually logs in, confirmed or not.

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
  email: string;
  password: string;
}

export type SignUpCustomerResult =
  | { status: 'confirmed'; profile: CustomerProfile }
  | { status: 'pending_confirmation' }
  | { error: string };

export async function signUpCustomer(input: SignUpCustomerInput): Promise<SignUpCustomerResult> {
  const email = input.email.trim();
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' };
  if (input.password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        role: 'customer',
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone?.trim() || null,
      },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
      return { error: 'Un compte existe déjà avec cette adresse email. Connectez-vous ou réinitialisez votre mot de passe.' };
    }
    return { error: mapAuthErrorMessage(error.message) };
  }
  if (!data.user) return { error: mapAuthErrorMessage(undefined) };

  // No session yet — email confirmation is pending. The profile row was
  // already created server-side (see migration), so nothing else to do
  // here; the customer will be able to log in once confirmed.
  if (!data.session) return { status: 'pending_confirmation' };

  const profile = await fetchOwnProfile();
  if (!profile) return { error: mapAuthErrorMessage(undefined) };
  return { status: 'confirmed', profile };
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

const GENERIC_LOGIN_ERROR = 'Adresse email ou mot de passe incorrect.';
const UNCONFIRMED_LOGIN_ERROR = 'Confirmez votre adresse email avant de vous connecter (lien envoyé à l\'inscription).';

export async function signInCustomer(email: string, password: string): Promise<CustomerProfile | { error: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (signInError) {
    if (signInError.message.toLowerCase().includes('confirm')) return { error: UNCONFIRMED_LOGIN_ERROR };
    return { error: GENERIC_LOGIN_ERROR };
  }

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

export async function requestCustomerPasswordReset(email: string): Promise<{ error?: string }> {
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' };
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return error ? { error: mapAuthErrorMessage(error.message) } : {};
}

export async function resendCustomerConfirmation(email: string): Promise<{ error?: string }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } });
  return error ? { error: mapAuthErrorMessage(error.message) } : {};
}

// Self-service deletion: the account can't be removed from the client (that
// needs the service role, never exposed to the frontend — see
// account_deletion_requests, which an admin processes from the Supabase
// dashboard). What the client CAN safely do under RLS is anonymize the
// customer's own profile immediately and sign them out — their order
// history stays intact for accounting, just no longer attached to a real
// name/contact.
export async function requestCustomerAccountDeletion(userId: string, email: string | null): Promise<{ error?: string }> {
  const { error: requestError } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: userId, role: 'customer', email_at_request: email });
  if (requestError) return { error: requestError.message };

  const { error: anonymizeError } = await supabase
    .from('customer_profiles')
    .update({ first_name: 'Client', last_name: 'supprimé', phone: null, email: null, quartier: null, landmark: null })
    .eq('id', userId);
  if (anonymizeError) return { error: anonymizeError.message };

  await supabase.auth.signOut();
  return {};
}
