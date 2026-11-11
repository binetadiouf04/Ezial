import { useCallback, useState } from 'react';
import type { BillingPeriod } from '@/data/subscriptionPlans';
import { useApp } from '@/store/AppContext';
import { shopForCurrentUser } from './supabaseSellerAuth';

// The plan a visitor picked on « Devenir vendeur » (/devenir-vendeur), kept
// across every signup step (login or account creation, e-mail confirmation in
// a new tab, shop creation) until the seller space applies it once. It is
// only a preference shown back to the seller: nothing is activated or charged
// from it — the trial still asks for its own confirmation
// (activate_seller_trial, server-side) and a subscription still goes through
// its own payment page.
export type SellerIntent =
  | { kind: 'free' }
  | { kind: 'trial' }
  | { kind: 'subscribe'; period: BillingPeriod };

const KEY = 'ezial-seller-intent';
// localStorage, not sessionStorage: the confirmation e-mail opens a new tab.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveSellerIntent(intent: SellerIntent | null): void {
  try {
    if (intent) localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), intent }));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: the seller simply chooses again */ }
}

export function readSellerIntent(): SellerIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; intent: SellerIntent };
    if (Date.now() - parsed.at > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
    const i = parsed.intent;
    if (i?.kind === 'free' || i?.kind === 'trial') return i;
    if (i?.kind === 'subscribe' && (i.period === 'quarterly' || i.period === 'annual')) return i;
    return null;
  } catch {
    return null;
  }
}

export function clearSellerIntent(): void {
  saveSellerIntent(null);
}

// Ezial Pro's sign-in screen, opened on login or on shop creation.
export const SELLER_LOGIN_ROUTE = '/pro?vue=connexion';
export const SELLER_SIGNUP_ROUTE = '/pro?vue=inscription';
export const BECOME_SELLER_ROUTE = '/devenir-vendeur';

// « Ma boutique » and the « Devenir vendeur » buttons. Who gets where is
// decided from the real session and the real shop (shops.owner_id =
// auth.uid(), read under RLS) — never from a flag kept in the browser. The
// seller pages themselves stay protected server-side (RLS) whatever this
// returns.
export function useSellerEntry() {
  const { customerUser, navigate } = useApp();
  const [busy, setBusy] = useState(false);

  const ownsShop = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      return (await shopForCurrentUser()) !== null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** « Ma boutique »: seller space, sign-in, or « Devenir vendeur ». */
  const openMyShop = useCallback(async () => {
    if (!customerUser) { navigate(SELLER_LOGIN_ROUTE); return; }
    navigate((await ownsShop()) ? '/pro' : BECOME_SELLER_ROUTE);
  }, [customerUser, navigate, ownsShop]);

  /** A « Créer ma boutique » / plan button of « Devenir vendeur ». A seller
   * who already has a shop is taken to it — never offered a second one. */
  const startSelling = useCallback(async (intent: SellerIntent | null) => {
    saveSellerIntent(intent);
    if (!customerUser) { navigate(SELLER_SIGNUP_ROUTE); return; }
    navigate((await ownsShop()) ? '/pro' : SELLER_SIGNUP_ROUTE);
  }, [customerUser, navigate, ownsShop]);

  return { openMyShop, startSelling, busy };
}
