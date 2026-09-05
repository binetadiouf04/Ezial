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
    .select('id, name, owner_id')
    .eq('owner_id', userData.user.id)
    .maybeSingle();
  if (shopError || !shop) return null;

  return { shopId: shop.id as string, shopName: shop.name as string };
}

export async function signInSeller(sellerCode: string, password: string): Promise<SellerAuthShop | { error: string }> {
  const email = sellerEmailForCode(sellerCode);
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
