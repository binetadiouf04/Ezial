import { supabase } from './supabaseClient';

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

export interface SignUpSellerInput {
  shopName: string;
  email: string;
  username: string;
  password: string;
}

const USERNAME_TAKEN_ERROR = 'Ce nom d\'utilisateur est déjà utilisé.';
const GENERIC_SIGNUP_ERROR = "Impossible de créer le compte. Vérifiez vos informations et réessayez.";

// Self-service shop signup — creates the real Supabase Auth user (real
// email, so "mot de passe oublié" works natively) and the shop row in one
// step, with status 'draft' (see the onboarding feature: the seller then
// fills in the rest and submits it for admin review — nothing here makes
// the shop public). shops.owner_id is unique (see migration), so this can
// never silently attach a second shop to an account that already has one.
export async function signUpSeller(input: SignUpSellerInput): Promise<SellerAuthShop | { error: string }> {
  const username = normalizeSellerCode(input.username);
  if (!/^[a-z0-9]{4,32}$/.test(username)) return { error: "Le nom d'utilisateur doit contenir 4 à 32 lettres/chiffres." };

  const { data, error } = await supabase.auth.signUp({ email: input.email.trim(), password: input.password });
  if (error || !data.user) return { error: error?.message ?? GENERIC_SIGNUP_ERROR };

  const { data: shopRow, error: shopError } = await supabase
    .from('shops')
    .insert({ owner_id: data.user.id, name: input.shopName.trim(), seller_code: username, status: 'draft' })
    .select('id, name, is_official')
    .single();

  if (shopError || !shopRow) {
    await supabase.auth.signOut();
    if (shopError?.message.includes('seller_code')) return { error: USERNAME_TAKEN_ERROR };
    return { error: GENERIC_SIGNUP_ERROR };
  }

  return { shopId: shopRow.id as string, shopName: shopRow.name as string, isOfficial: Boolean(shopRow.is_official) };
}

// Only works for an account registered with a real, reachable email — an
// old pilot account (synthetic @sellers.ezial.internal address) has no
// reset path in this MVP, same limitation as a phone-only customer account.
export async function requestSellerPasswordReset(email: string): Promise<{ error?: string }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return error ? { error: error.message } : {};
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
