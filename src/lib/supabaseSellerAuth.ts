import { supabase } from './supabaseClient';
import { mapAuthErrorMessage, isValidEmail } from './authErrors';

// Sellers log in with their username (`seller_code`) or their email, plus
// a password. Supabase Auth itself only knows email + password; the email
// behind a username is resolved server-side (see resolveSellerEmail) and
// only once the password has been checked — a username alone never reveals
// it. The first pilot accounts are backed by an internal-only address
// (<code>@sellers.ezial.internal, `.internal` being an IANA-reserved TLD
// that never delivers mail).

// seller_code must always normalize the same way, regardless of how the
// seller types it.
function normalizeSellerCode(sellerCode: string): string {
  return sellerCode.trim().toLowerCase();
}

// Deliberately generic and identical for "unknown seller_code" and "wrong
// password" — never reveals which part was incorrect.
const GENERIC_LOGIN_ERROR = 'Identifiant ou mot de passe incorrect.';
const NO_SHOP_ERROR = "Aucune boutique n'est associée à ce compte. Contactez EZIAL.";

export interface SellerAuthShop {
  shopId: string;
  shopName: string;
  sellerCode: string;
  // From shops.is_official — the only signal used anywhere to recognize
  // the official Ezial shop (no hardcoded id/slug/name).
  isOfficial: boolean;
}

// The one real authorization check for the seller area: the signed-in
// Supabase Auth user must own a real shop row (shops.owner_id = auth.uid()).
// Used at both login time and session-restore time — a seller session is
// never trusted without re-checking this. Also reused by AuthConfirmPage
// right after a signup-confirmation link establishes a session, to tell a
// seller signup apart from a customer one (the shop row already exists —
// created at signUp() time, before confirmation — so this is reliable).
// knownUserId skips the getUser() round-trip entirely when the caller
// already has a freshly, server-verified id in hand (e.g. the session
// AuthConfirmPage just established directly from the confirmation link's
// own token exchange) — one fewer sequential network call on the slowest,
// most latency-sensitive path in the app (a mobile connection switching
// from the mail app back to the browser right after tapping the link).
export async function shopForCurrentUser(knownUserId?: string): Promise<SellerAuthShop | null> {
  let userId = knownUserId;
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return null;
    userId = userData.user.id;
  }

  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, owner_id, is_official, seller_code')
    .eq('owner_id', userId)
    .maybeSingle();
  if (shopError || !shop) return null;

  return {
    shopId: shop.id as string,
    shopName: shop.name as string,
    sellerCode: (shop.seller_code as string | null) ?? '',
    isOfficial: Boolean(shop.is_official),
  };
}

// Sellers sign up with a real email + a username they choose (stored in
// shops.seller_code, the same column the pilot accounts use for their
// generated code). Login accepts either. Supabase's own APIs
// (signInWithPassword, resend) always need the email, so a username is
// resolved by the resolve_seller_login_email() RPC (security definer — it
// reads auth.users), which only returns the email when the password is
// right, and locks the username for 15 minutes after 10 failures (login by
// email still works then). Shared by signInSeller and
// resendSellerConfirmationForIdentifier.
async function resolveSellerEmail(identifier: string, password: string): Promise<{ email: string } | { error: string }> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return { email: trimmed };
  const { data, error } = await supabase.rpc('resolve_seller_login_email', { p_identifier: trimmed, p_password: password });
  if (error) {
    // P0001 = the lockout message written for the seller in the RPC itself.
    return { error: error.code === 'P0001' ? error.message : GENERIC_LOGIN_ERROR };
  }
  return typeof data === 'string' && data ? { email: data } : { error: GENERIC_LOGIN_ERROR };
}

const UNCONFIRMED_LOGIN_ERROR = "Confirmez votre adresse email avant de vous connecter (lien envoyé à l'inscription).";

export async function signInSeller(identifier: string, password: string): Promise<SellerAuthShop | { error: string; code?: 'unconfirmed' }> {
  const resolved = await resolveSellerEmail(identifier, password);
  if ('error' in resolved) return { error: resolved.error };
  const { email } = resolved;

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    if (signInError.message.toLowerCase().includes('confirm')) return { error: UNCONFIRMED_LOGIN_ERROR, code: 'unconfirmed' };
    return { error: GENERIC_LOGIN_ERROR };
  }

  const shop = await shopForCurrentUser();
  if (!shop) {
    // Authenticated, but no real shop is linked to this account — never
    // leave a half-authenticated seller session standing.
    await supabase.auth.signOut();
    return { error: NO_SHOP_ERROR };
  }
  return shop;
}

// Same normalization ProContext.tsx already uses for mock shop ids — kept
// identical so real and mock slugs never diverge in style.
function slugifyShopName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function uniqueShopSlug(shopName: string, userId: string): Promise<string> {
  const base = slugifyShopName(shopName) || 'boutique';
  const { data: clash } = await supabase.from('shops').select('id').eq('slug', base).maybeSingle();
  return clash ? `${base}-${userId.slice(0, 8)}` : base;
}

// One email can legitimately be both a customer and a seller (shops.owner_id
// and customer_profiles.id both just point at the same auth.users row) —
// small businesses routinely want exactly this. signUp() can't do it though:
// it always tries to create a brand new auth user, so it fails whenever the
// email is already registered (e.g. as a customer). The fix is to sign in
// to that existing account with the password just entered (proving it's
// really theirs — never skips authentication) and attach the shop there
// directly. RLS already allows this (`shops_insert_self`: owner_id =
// auth.uid()), so no new policy is needed.
// Shared by linkShopToExistingAccount (after proving the password) and
// createShopForLoggedInCustomer (session already live, nothing to prove) —
// both just attach a 'draft' shop to whichever Supabase Auth user is
// currently signed in.
async function createShopRowForCurrentUser(input: { shopName: string; username: string }): Promise<SignUpSellerResult> {
  const existingShop = await shopForCurrentUser();
  if (existingShop) return { error: 'Ce compte possède déjà une boutique.' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: mapAuthErrorMessage(undefined) };

  const slug = await uniqueShopSlug(input.shopName, userId);
  const { error: insertError } = await supabase.from('shops').insert({
    owner_id: userId,
    name: input.shopName.trim(),
    slug,
    seller_code: input.username,
    status: 'draft',
  });
  if (insertError) {
    const msg = insertError.message.toLowerCase();
    if (msg.includes('seller_code') || msg.includes('duplicate')) return { error: USERNAME_TAKEN_ERROR };
    return { error: mapAuthErrorMessage(undefined) };
  }

  const shop = await shopForCurrentUser();
  if (!shop) return { error: mapAuthErrorMessage(undefined) };
  return { status: 'confirmed', shop };
}

async function linkShopToExistingAccount(input: { email: string; password: string; shopName: string; username: string }): Promise<SignUpSellerResult> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (signInError) {
    return {
      error: "Un compte existe déjà avec cet email. Connectez-vous avec son mot de passe pour y associer votre boutique, ou utilisez « Mot de passe oublié » pour le réinitialiser.",
      code: 'email_taken',
    };
  }
  return createShopRowForCurrentUser(input);
}

// The "Devenir vendeur" shortcut for a customer already signed in on this
// device: no email/password is asked again at all — the live customer
// session itself is the proof of identity (never a signUp()/signInWithPassword()
// round trip, which is what previously made the seller signup form blind to
// an existing session and ask the customer to re-authenticate from scratch).
export async function createShopForLoggedInCustomer(input: { shopName: string; username: string }): Promise<SignUpSellerResult> {
  const username = normalizeSellerCode(input.username);
  if (!/^[a-z0-9]{4,32}$/.test(username)) return { error: USERNAME_FORMAT_ERROR };

  const { data: existing } = await supabase.from('shops').select('id').eq('seller_code', username).maybeSingle();
  if (existing) return { error: USERNAME_TAKEN_ERROR };

  return createShopRowForCurrentUser({ shopName: input.shopName, username });
}

export interface SignUpSellerInput {
  shopName: string;
  email: string;
  username: string;
  password: string;
}

export type SignUpSellerResult =
  | { status: 'confirmed'; shop: SellerAuthShop }
  | { status: 'pending_confirmation' }
  | { error: string; code?: 'email_taken' };

const USERNAME_TAKEN_ERROR = 'Ce nom d\'utilisateur est déjà utilisé.';
const USERNAME_FORMAT_ERROR = "Le nom d'utilisateur doit contenir 4 à 32 lettres/chiffres, sans espace.";

// Self-service shop signup — creates the real Supabase Auth user (real
// email, so "mot de passe oublié" works natively) and its shop row in one
// step, status 'draft' (see the onboarding feature: the seller then fills
// in the rest and submits it for admin review — nothing here makes the
// shop public).
//
// Root cause fixed here: the shops row used to be inserted by the CLIENT
// right after signUp() — but with "Confirm email" enabled on the Supabase
// project, signUp() returns no active session until confirmed, so that
// insert ran as an anonymous request and was always rejected by RLS
// ("owner_id = auth.uid()" with auth.uid() = null). That's exactly what
// surfaced as the generic "Impossible de créer le compte" error. The shop
// row is now created server-side by a database trigger on auth.users (see
// the migration this fix ships with), which runs regardless of
// confirmation status.
export async function signUpSeller(input: SignUpSellerInput): Promise<SignUpSellerResult> {
  const email = input.email.trim();
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' };
  if (input.password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };

  const username = normalizeSellerCode(input.username);
  if (!/^[a-z0-9]{4,32}$/.test(username)) return { error: USERNAME_FORMAT_ERROR };

  // Pre-check before spending a Supabase Auth call — shops is already
  // publicly readable (the catalog fetch relies on it), so this is a plain
  // read, not a new access path.
  const { data: existing } = await supabase.from('shops').select('id').eq('seller_code', username).maybeSingle();
  if (existing) return { error: USERNAME_TAKEN_ERROR };

  // Bare URL — AuthConfirmPage (App.tsx) figures out customer vs seller
  // from the confirmed session itself (shopForCurrentUser), not from a
  // marker on this redirect, since Supabase silently falls back to the
  // project's default Site URL whenever emailRedirectTo isn't on the
  // Redirect URLs allow-list, which would have dropped any such marker.
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: redirectTo,
      data: { role: 'seller', shop_name: input.shopName.trim(), username },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('seller_code') || msg.includes('duplicate')) return { error: USERNAME_TAKEN_ERROR };
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
      return linkShopToExistingAccount({ email, password: input.password, shopName: input.shopName, username });
    }
    return { error: mapAuthErrorMessage(error.message) };
  }
  if (!data.user) return { error: mapAuthErrorMessage(undefined) };

  // Supabase never raises an "already registered" error for an email that
  // already has a CONFIRMED account — it silently returns a fake success
  // instead (anti-enumeration: this is the only way an attacker couldn't
  // otherwise tell which emails are already taken). The one client-visible
  // signal for this exact case is an empty `identities` array. Without this
  // check, a customer trying to also become a seller on their existing
  // email saw "check your email" forever, with nothing ever sent — this
  // routes them to the same existing-account path a real "already
  // registered" error already triggers above.
  if (data.user.identities && data.user.identities.length === 0) {
    return linkShopToExistingAccount({ email, password: input.password, shopName: input.shopName, username });
  }

  if (!data.session) return { status: 'pending_confirmation' };

  const shop = await shopForCurrentUser();
  if (!shop) return { error: mapAuthErrorMessage(undefined) };
  return { status: 'confirmed', shop };
}

// Only works for an account registered with a real, reachable email — an
// old pilot account (synthetic @sellers.ezial.internal address) has no
// reset path in this MVP, same limitation as a phone-only customer account.
export async function requestSellerPasswordReset(email: string): Promise<{ error?: string }> {
  if (!isValidEmail(email)) return { error: 'Adresse email invalide.' };
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return error ? { error: mapAuthErrorMessage(error.message, "Impossible d'envoyer le lien. Réessayez dans quelques instants.") } : {};
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the seller role.
export async function restoreSellerSession(): Promise<SellerAuthShop | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  // One account can be buyer and seller: a session with no shop is a buyer's
  // session, left untouched (signing it out here used to log a buyer out of
  // the whole site as soon as they opened the seller space).
  return shopForCurrentUser();
}

export async function signOutSeller(): Promise<void> {
  await supabase.auth.signOut();
}

export async function resendSellerConfirmation(email: string): Promise<{ error?: string }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } });
  return error ? { error: mapAuthErrorMessage(error.message, "Impossible d'envoyer le lien. Réessayez dans quelques instants.") } : {};
}

// Same as resendSellerConfirmation, but for the login screen, where a
// seller may have typed their username instead of their real email. Offered
// only after a login attempt whose password was right (Supabase answers
// "email not confirmed" only then), so that same password resolves it.
export async function resendSellerConfirmationForIdentifier(identifier: string, password: string): Promise<{ error?: string }> {
  const resolved = await resolveSellerEmail(identifier, password);
  if ('error' in resolved) return { error: resolved.error };
  return resendSellerConfirmation(resolved.email);
}

// Real, permanent account deletion now lives in supabaseAccountDeletion.ts
// (deleteMyAccount) — the delete-account Edge Function anonymizes the
// shop server-side (shops.owner_id has no FK to auth.users, so it would
// otherwise survive untouched with a dangling owner_id) before removing
// the auth.users row. Historical orders reference shop_id directly, with
// no foreign key to auth.users either, so they stay untouched.
