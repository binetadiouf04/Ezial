import { supabase } from './supabaseClient';
import { mapAuthErrorMessage, isValidEmail } from './authErrors';

// Sellers log in with `seller_code` + a real password — never an email
// address. Supabase Auth itself only knows email + password, so each shop
// is backed by a real Supabase Auth user whose email is a deterministic,
// internal-only address derived from seller_code and never shown to
// anyone. `.internal` is an IANA-reserved special-use TLD (RFC 6761) — it
// will never resolve as a real, mail-deliverable domain.
const SELLER_EMAIL_DOMAIN = 'sellers.ezial.internal';

// seller_code must always normalize the same way before becoming part of
// the technical email, regardless of how the seller types it.
function normalizeSellerCode(sellerCode: string): string {
  return sellerCode.trim().toLowerCase();
}

function sellerEmailForCode(sellerCode: string): string {
  return `${normalizeSellerCode(sellerCode)}@${SELLER_EMAIL_DOMAIN}`;
}

// Deliberately generic and identical for "unknown seller_code" and "wrong
// password" — never reveals which part was incorrect.
const GENERIC_LOGIN_ERROR = 'Identifiant ou mot de passe incorrect.';
const NO_SHOP_ERROR = "Aucune boutique n'est associée à ce compte. Contactez EZIAL.";

export interface SellerAuthShop {
  shopId: string;
  shopName: string;
  // From shops.is_official — the only signal used anywhere to recognize
  // the official Ezial shop (no hardcoded id/slug/name).
  isOfficial: boolean;
}

// The one real authorization check for the seller area: the signed-in
// Supabase Auth user must own a real shop row (shops.owner_id = auth.uid()).
// Used at both login time and session-restore time — a seller session is
// never trusted without re-checking this.
async function shopForCurrentUser(): Promise<SellerAuthShop | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, name, owner_id, is_official')
    .eq('owner_id', userData.user.id)
    .maybeSingle();
  if (shopError || !shop) return null;

  return { shopId: shop.id as string, shopName: shop.name as string, isOfficial: Boolean(shop.is_official) };
}

// New (post-migration) sellers sign up with a real email + a username they
// choose (stored in shops.seller_code, exactly the same column the old
// pilot accounts already use for their generated code — one unified
// identifier column, two ways of populating it). Login accepts either the
// username/seller_code OR the real email, resolved server-side to whatever
// email is actually registered for that account via the
// resolve_seller_login_email() RPC (security definer — it may read
// auth.users, which anon/authenticated can't query directly). This keeps
// every existing pilot account (seller_code + synthetic email) working
// unchanged: for them the RPC just returns the same deterministic
// <code>@sellers.ezial.internal address signInSeller always computed
// locally before.
export async function signInSeller(identifier: string, password: string): Promise<SellerAuthShop | { error: string }> {
  const trimmed = identifier.trim();
  let email: string | null;
  if (trimmed.includes('@')) {
    email = trimmed;
  } else {
    const { data: resolved } = await supabase.rpc('resolve_seller_login_email', { p_identifier: trimmed });
    // Falls back to the deterministic synthetic address if the RPC isn't
    // deployed yet or found nothing — preserves old-pilot-account login
    // even before the resolver migration is applied.
    email = (resolved as string | null) ?? sellerEmailForCode(trimmed);
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: GENERIC_LOGIN_ERROR };

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
async function linkShopToExistingAccount(input: { email: string; password: string; shopName: string; username: string }): Promise<SignUpSellerResult> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  if (signInError) {
    return { error: "Un compte existe déjà avec cet email. Connectez-vous avec son mot de passe pour y associer votre boutique, ou utilisez « Mot de passe oublié » pour le réinitialiser." };
  }

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

export interface SignUpSellerInput {
  shopName: string;
  email: string;
  username: string;
  password: string;
}

export type SignUpSellerResult =
  | { status: 'confirmed'; shop: SellerAuthShop }
  | { status: 'pending_confirmation' }
  | { error: string };

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
  return error ? { error: mapAuthErrorMessage(error.message) } : {};
}

// Re-validates an existing Supabase session (e.g. on page reload). The
// app's own sessionStorage flag is never trusted alone for the seller role.
export async function restoreSellerSession(): Promise<SellerAuthShop | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const shop = await shopForCurrentUser();
  if (!shop) {
    await supabase.auth.signOut();
    return null;
  }
  return shop;
}

export async function signOutSeller(): Promise<void> {
  await supabase.auth.signOut();
}

export async function resendSellerConfirmation(email: string): Promise<{ error?: string }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } });
  return error ? { error: mapAuthErrorMessage(error.message) } : {};
}

// Real, permanent account deletion now lives in supabaseAccountDeletion.ts
// (deleteMyAccount) — the delete-account Edge Function anonymizes the
// shop server-side (shops.owner_id has no FK to auth.users, so it would
// otherwise survive untouched with a dangling owner_id) before removing
// the auth.users row. Historical orders reference shop_id directly, with
// no foreign key to auth.users either, so they stay untouched.
