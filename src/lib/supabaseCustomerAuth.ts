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
  | { error: string; code?: 'email_taken' };

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
      return { error: 'Un compte existe déjà avec cette adresse e-mail.', code: 'email_taken' };
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

// previousEmail lets this tell "the customer actually typed a new email"
// apart from "resaved the form with the same one" — needed because
// changing the real login credential (auth.users.email, via
// supabase.auth.updateUser) is a meaningfully different, slower operation
// (Supabase emails a confirmation to the new address before it takes
// effect) than saving the rest of the profile, and must never fire just
// because the customer updated their phone number on the same form.
export async function updateCustomerProfile(userId: string, input: UpdateCustomerProfileInput, previousEmail: string | null): Promise<{ error?: string; emailConfirmationSent?: boolean }> {
  const trimmedEmail = input.email.trim();
  let emailConfirmationSent = false;
  if (trimmedEmail && trimmedEmail !== (previousEmail ?? '')) {
    const { error: emailError } = await supabase.auth.updateUser({ email: trimmedEmail });
    if (emailError) return { error: mapAuthErrorMessage(emailError.message) };
    emailConfirmationSent = true;
  }

  const { error } = await supabase
    .from('customer_profiles')
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone.trim() || null,
      // The profile's own email column only ever mirrors the CONFIRMED
      // auth email — never the one just submitted to updateUser above,
      // which isn't real until the customer clicks the confirmation link.
      email: emailConfirmationSent ? previousEmail : (trimmedEmail || null),
      quartier: input.quartier || null,
      landmark: input.landmark.trim() || null,
    })
    .eq('id', userId);
  if (error) return { error: error.message };
  return emailConfirmationSent ? { emailConfirmationSent: true } : {};
}

// Change password from within "Mon compte" (signed in) — distinct from the
// forgot-password email-link flow (ResetPasswordPage.tsx), which is the
// only other place a customer's password is ever set. Re-verifies the
// current password via signInWithPassword before allowing the change
// (Supabase's updateUser() alone doesn't ask for it, since the session is
// already authenticated) — a sensitive change like this shouldn't succeed
// just because a device was left logged in.
export async function changeCustomerPassword(email: string, currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  if (newPassword.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: currentPassword });
  if (verifyError) return { error: 'Mot de passe actuel incorrect.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { error: mapAuthErrorMessage(updateError.message) };
  return {};
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

// Real, permanent account deletion now lives in supabaseAccountDeletion.ts
// (deleteMyAccount) — it calls the delete-account Edge Function, the only
// place allowed to hold the service_role key needed to actually remove an
// auth.users row. customer_profiles.id cascades automatically once the
// auth account is gone (confirmed via pg_constraint); order history has no
// foreign key to auth.users at all, so it's untouched either way.
