import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { products as allProducts, type Product } from '@/data/products';
import { shops as mockShops, registerSupabaseShops, type Shop } from '@/data/shops';
import { fetchActiveCatalogFromSupabase } from '@/lib/supabaseCatalog';
import {
  signUpCustomer, signInCustomer, restoreCustomerSession, signOutCustomer,
  updateCustomerProfile, requestCustomerPasswordReset, resendCustomerConfirmation,
  type CustomerProfile, type SignUpCustomerInput, type SignUpCustomerResult, type UpdateCustomerProfileInput,
} from '@/lib/supabaseCustomerAuth';
import { deleteMyAccount } from '@/lib/supabaseAccountDeletion';
import { fetchFavoriteIds, addFavorite, removeFavorite, mergeLocalFavoritesIntoAccount } from '@/lib/supabaseFavorites';
import { fetchCustomerOrders } from '@/lib/supabaseCustomerOrders';
import { fetchReviewStatsForProducts } from '@/lib/supabaseReviews';
import { isRealCatalogId } from '@/data/products';

export interface CartItem { productId: string; shopId: string; quantity: number; variants: Record<string, string>; unitPrice?: number; variantId?: string; }
export interface SavedItem { productId: string; shopId: string; quantity: number; variants: Record<string, string>; unitPrice?: number; variantId?: string; }

export type ShopPrepStatus = 'preparing' | 'ready' | 'collected';
export type PickupStepStatus = 'preparing' | 'ready_for_pickup' | 'picked_up';
export type DeliveryStepStatus = 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivering' | 'delivered';

export interface DeliveryZone { id: string; label: string; fee: number; eta: string; }
export interface DeliveryPreference { type: 'none' | 'preferred'; date?: string; window?: string; }

export interface Address {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  quartier: string;
  details: string;
  isDefault: boolean;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  quartier: string;
  landmark: string;
}

export interface ShopFulfillment {
  shopId: string;
  type: 'delivery' | 'pickup';
  deliveryFee: number;
  zone?: DeliveryZone;
  pickupCode?: string;
  status: ShopPrepStatus;
  pickupStatus?: PickupStepStatus;
}

export interface Order {
  // The human-readable order number (e.g. "EZI-000123") — for a real
  // Supabase order this is orders.order_number, generated server-side by
  // create_order(), never locally. Used as the display/routing id exactly
  // like the old locally-generated id was, so every page that already
  // reads order.id keeps working unchanged.
  id: string;
  // Real Supabase orders.id (uuid) — absent for anything not yet backed
  // by a real order. Not read by any page today; kept for future use
  // (e.g. re-fetching the order) without another shape change.
  supabaseOrderId?: string;
  date: string;
  customer: { firstName: string; lastName: string; phone: string; quartier: string; landmark?: string; instructions?: string };
  items: CartItem[];
  subtotal: number;
  delivery: number;
  total: number;
  shopFulfillments: ShopFulfillment[];
  preference?: DeliveryPreference;
  payment: string;
  status: DeliveryStepStatus;
}

interface AppState {
  route: string; navigate: (route: string) => void;
  // Real Supabase catalog merged with the still-temporary mock catalog —
  // fetched once here (not per-page) so Home, Promotions, Tendances,
  // Sélection personnalisée and the shops listing all see the same real
  // products/shops instead of each re-fetching independently.
  catalogProducts: Product[]; catalogShops: Shop[];
  favorites: string[]; toggleFavorite: (productId: string) => void; isFavorite: (productId: string) => boolean;
  cart: CartItem[]; addToCart: (item: CartItem) => void; removeFromCart: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void; clearCart: () => void;
  saveForLater: (index: number) => void; moveToCart: (index: number) => void; removeFromSaved: (index: number) => void;
  savedItems: SavedItem[];
  cartCount: number; cartSubtotal: number;
  cartOpen: boolean; setCartOpen: (open: boolean) => void;
  categoryDrawerOpen: boolean; setCategoryDrawerOpen: (open: boolean) => void;
  orders: Order[]; addOrder: (order: Order) => void;
  addresses: Address[]; addAddress: (addr: Address) => void; updateAddress: (id: string, addr: Address) => void; deleteAddress: (id: string) => void; setDefaultAddress: (id: string) => void;
  customerInfo: CustomerInfo; updateCustomerInfo: (info: CustomerInfo) => void;
  // Real customer auth (Supabase) — null while signed out or while the
  // initial session check (authLoading) hasn't resolved yet. A signed-out
  // visitor can still browse/cart/checkout as a guest; only "Mon compte"
  // itself gates on this.
  customerUser: CustomerProfile | null;
  authLoading: boolean;
  signUpCustomerAccount: (input: SignUpCustomerInput) => Promise<{ status: 'confirmed' | 'pending_confirmation' } | { error: string }>;
  signInCustomerAccount: (email: string, password: string) => Promise<{ error?: string }>;
  signOutCustomerAccount: () => void;
  updateCustomerAccount: (input: UpdateCustomerProfileInput) => Promise<{ error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  resendConfirmationEmail: (email: string) => Promise<{ error?: string }>;
  deleteCustomerAccount: () => Promise<{ error?: string }>;
}

const AppContext = createContext<AppState | null>(null);
export function useApp(): AppState { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used within AppProvider'); return ctx; }

function getInitialRoute(): string { const hash = window.location.hash.replace(/^#/, ''); return hash || '/'; }

// Anonymous cart persistence — survives refresh/tab close so a visitor
// never loses their cart just by closing the browser. Never fails loudly:
// a blocked/unavailable localStorage (private browsing, quota, etc.) just
// means the cart doesn't survive a refresh, not a crash.
const CART_STORAGE_KEY = 'ezial-cart-v1';

function loadStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCart(cart: CartItem[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Ignore — the cart still works for the current session, it just won't
    // survive a refresh.
  }
}

// Guest (signed-out) favorites — same survives-refresh treatment as the
// cart. A signed-in customer's favorites live in Supabase instead (see
// supabaseFavorites.ts); this local copy is only ever the source of truth
// while signed out, and is merged into the account (never overwritten) the
// moment the visitor signs in or signs up.
const FAVORITES_STORAGE_KEY = 'ezial-favorites-v1';

function loadStoredFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistFavorites(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore — favorites still work for the current session.
  }
}

export const deliveryZones: DeliveryZone[] = [
  // Zone 1 — central Dakar (2 000 FCFA)
  { id: 'plateau', label: 'Plateau', fee: 2000, eta: '4–48 h' },
  { id: 'medina', label: 'Médina', fee: 2000, eta: '4–48 h' },
  { id: 'gueule-tapee', label: 'Gueule Tapée', fee: 2000, eta: '4–48 h' },
  { id: 'fass', label: 'Fass', fee: 2000, eta: '4–48 h' },
  { id: 'colobane', label: 'Colobane', fee: 2000, eta: '4–48 h' },
  { id: 'hlm', label: 'HLM', fee: 2000, eta: '4–48 h' },
  { id: 'grand-dakar', label: 'Grand Dakar', fee: 2000, eta: '4–48 h' },
  // Zone 2 — mid-distance (2 500 FCFA)
  { id: 'liberte1', label: 'Liberté 1', fee: 2500, eta: '4–48 h' },
  { id: 'liberte2', label: 'Liberté 2', fee: 2500, eta: '4–48 h' },
  { id: 'liberte3', label: 'Liberté 3', fee: 2500, eta: '4–48 h' },
  { id: 'liberte4', label: 'Liberté 4', fee: 2500, eta: '4–48 h' },
  { id: 'liberte5', label: 'Liberté 5', fee: 2500, eta: '4–48 h' },
  { id: 'liberte6', label: 'Liberté 6', fee: 2500, eta: '4–48 h' },
  { id: 'sicap-baobab', label: 'Sicap Baobab', fee: 2500, eta: '4–48 h' },
  { id: 'sicap-amitie', label: 'Sicap Amitié', fee: 2500, eta: '4–48 h' },
  { id: 'pointe', label: 'Point E', fee: 2500, eta: '4–48 h' },
  { id: 'fann', label: 'Fann', fee: 2500, eta: '4–48 h' },
  { id: 'mermoz', label: 'Mermoz', fee: 2500, eta: '4–48 h' },
  { id: 'sacrecoeur1', label: 'Sacré-Cœur 1', fee: 2500, eta: '4–48 h' },
  { id: 'sacrecoeur2', label: 'Sacré-Cœur 2', fee: 2500, eta: '4–48 h' },
  { id: 'sacrecoeur3', label: 'Sacré-Cœur 3', fee: 2500, eta: '4–48 h' },
  { id: 'cite-mixta', label: 'Cité Mixta', fee: 2500, eta: '4–48 h' },
  { id: 'patte-doie', label: "Patte d'Oie", fee: 2500, eta: '4–48 h' },
  // Zone 3 — coastal / further (3 000 FCFA)
  { id: 'ouakam', label: 'Ouakam', fee: 3000, eta: '4–48 h' },
  { id: 'mamelles', label: 'Mamelles', fee: 3000, eta: '4–48 h' },
  { id: 'almadies', label: 'Almadies', fee: 3000, eta: '4–48 h' },
  { id: 'ngor', label: 'Ngor', fee: 3000, eta: '4–48 h' },
  { id: 'yoff', label: 'Yoff', fee: 3000, eta: '4–48 h' },
  { id: 'ouest-foire', label: 'Ouest Foire', fee: 3000, eta: '4–48 h' },
  { id: 'nord-foire', label: 'Nord Foire', fee: 3000, eta: '4–48 h' },
  { id: 'sud-foire', label: 'Sud Foire', fee: 3000, eta: '4–48 h' },
  { id: 'camberene', label: 'Cambérène', fee: 3000, eta: '4–48 h' },
  { id: 'hann-maristes', label: 'Hann Maristes', fee: 3000, eta: '4–48 h' },
  // Zone 4 — suburbs (3 500 FCFA)
  { id: 'parcelles', label: 'Parcelles Assainies', fee: 3500, eta: '48–72 h' },
  { id: 'grand-yoff', label: 'Grand Yoff', fee: 3500, eta: '48–72 h' },
  // Zone 5 — greater Dakar (4 000 FCFA)
  { id: 'pikine', label: 'Pikine', fee: 4000, eta: '48–72 h' },
  { id: 'guediawaye', label: 'Guédiawaye', fee: 4000, eta: '48–72 h' },
  { id: 'thiaroye', label: 'Thiaroye', fee: 4000, eta: '48–72 h' },
  // Zone 6 — distant (5 000 FCFA)
  { id: 'keur-massar', label: 'Keur Massar', fee: 5000, eta: '48–72 h' },
  { id: 'rufisque', label: 'Rufisque', fee: 5000, eta: '48–72 h' },
  { id: 'mbao', label: 'Mbao', fee: 5000, eta: '48–72 h' },
];

export const quartierToZone: Record<string, DeliveryZone> = deliveryZones.reduce(
  (acc, z) => ({ ...acc, [z.label]: z }),
  {} as Record<string, DeliveryZone>,
);

export const quartiers = Object.keys(quartierToZone);

export const deliveryWindows = ['09h–12h', '12h–15h', '15h–18h', '18h–20h'];

export function generateAddressId(): string {
  return `addr-${Math.floor(1000 + Math.random() * 9000)}`;
}

const defaultCustomerInfo: CustomerInfo = {
  firstName: 'Bineta',
  lastName: 'Diouf',
  phone: '+221 77 123 45 67',
  email: 'bineta.diouf@example.com',
  quartier: 'Yoff',
  landmark: "Près de la route de l'aéroport, porte bleue",
};

// TEMPORARY LAUNCH GATE — before real sellers are onboarded, the public
// marketplace (Home, Catégories, Recherche, Boutiques) shows only the
// official Ezial shop and its own real products, never the old static
// demo catalog (src/data/products.ts / src/data/shops.ts) that used to be
// merged in permanently to keep the app looking populated. This sits on
// top of the existing approval workflow (products.status/shops.status,
// already filtered to 'active' by fetchActiveCatalogFromSupabase) without
// changing it — lifting this gate once real approved sellers should start
// appearing publicly is exactly flipping this one constant.
const PUBLIC_CATALOG_OFFICIAL_SHOP_ONLY = true;

function publicShopsFrom(supabaseShops: Shop[]): Shop[] {
  const filtered = PUBLIC_CATALOG_OFFICIAL_SHOP_ONLY ? supabaseShops.filter((s) => s.isOfficial) : supabaseShops;
  // Never leave the marketplace looking empty if the real fetch came back
  // thin (e.g. right after a fresh Supabase project, before is_official is
  // even set on any shop) — falls back to the old demo catalog exactly
  // like a total fetch failure already does.
  return filtered.length > 0 ? filtered : mockShops;
}

function publicProductsFrom(supabaseProducts: Product[], publicShops: Shop[]): Product[] {
  const publicShopIds = new Set(publicShops.map((s) => s.id));
  const filtered = supabaseProducts.filter((p) => publicShopIds.has(p.shopId));
  return filtered.length > 0 ? filtered : allProducts;
}

// Merges a real Supabase order-history fetch into whatever's already in
// local state (e.g. an order just placed this same session, via addOrder,
// slightly ahead of the fetch) — the fetched copy always wins for any id
// both sides share, since it reflects the real, current Supabase state.
function mergeOrders(prev: Order[], fetched: Order[]): Order[] {
  const fetchedIds = new Set(fetched.map((o) => o.id));
  const localOnly = prev.filter((o) => !fetchedIds.has(o.id));
  return [...localOnly, ...fetched].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState(getInitialRoute());
  // The demo catalog renders immediately; once the Supabase catalog fetch
  // succeeds, it replaces this with the real, official-shop-only public
  // catalog (see publicShopsFrom/publicProductsFrom above). On failure (or
  // while still loading), the demo catalog stays as-is — never left empty.
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(allProducts);
  const [catalogShops, setCatalogShops] = useState<Shop[]>(mockShops);
  const [favorites, setFavorites] = useState<string[]>(loadStoredFavorites);
  const [cart, setCart] = useState<CartItem[]>(loadStoredCart);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([
    { id: 'addr-1', firstName: 'Bineta', lastName: 'Diouf', phone: '+221 77 123 45 67', quartier: 'Yoff', details: 'Près de la route de l\'aéroport, porte bleue', isDefault: true },
  ]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(defaultCustomerInfo);
  const [customerUser, setCustomerUser] = useState<CustomerProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => { persistCart(cart); }, [cart]);

  // Guest favorites persist locally; once signed in, Supabase is the source
  // of truth instead (see the sign-in/sign-up handlers below), so writing
  // the fetched list back to localStorage here would be redundant, never
  // harmful — kept simple by just always mirroring current state.
  useEffect(() => { if (!customerUser) persistFavorites(favorites); }, [favorites, customerUser]);

  // Session restore on load — never trusts anything cached locally alone;
  // restoreCustomerSession() re-validates the real Supabase session and
  // re-fetches the profile row every time, exactly like the seller/admin
  // session restores already do.
  useEffect(() => {
    let cancelled = false;
    restoreCustomerSession().then(async (profile) => {
      if (cancelled) return;
      setCustomerUser(profile);
      setAuthLoading(false);
      if (profile) {
        const [favIds, realOrders] = await Promise.all([fetchFavoriteIds(profile.id), fetchCustomerOrders(profile.id)]);
        if (cancelled) return;
        setFavorites(favIds);
        setOrders((prev) => mergeOrders(prev, realOrders));
      }
    }).catch(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchActiveCatalogFromSupabase()
      .then((result) => {
        if (cancelled) return;
        // Use whatever came back even if `errors` isn't empty —
        // fetchActiveCatalogFromSupabase already documents its errors as
        // non-fatal (e.g. only the product_images or product_variants
        // query failed), and publicShopsFrom/publicProductsFrom are safe
        // with a partial or empty Supabase array (they fall back to the
        // demo catalog only when the real one is genuinely empty). Gating
        // this behind zero errors would discard good shop/product data over
        // a single unrelated sub-query hiccup.
        //
        // registerSupabaseShops keeps every real shop resolvable by id
        // (a seller viewing their own shop, an admin, a direct link) — the
        // official-only gate below only decides what's publicly *listed*.
        registerSupabaseShops(result.shops);
        const publicShops = publicShopsFrom(result.shops);
        const publicProducts = publicProductsFrom(result.products, publicShops);
        setCatalogProducts(publicProducts);
        setCatalogShops(publicShops);

        // Real review stats enrich the (already-rendered) catalog in a
        // second pass — never blocks the initial catalog paint, and a
        // mock demo product (non-uuid id) is never queried for reviews.
        const realIds = publicProducts.map((p) => p.id).filter(isRealCatalogId);
        if (realIds.length > 0) {
          fetchReviewStatsForProducts(realIds).then((stats) => {
            if (cancelled || stats.size === 0) return;
            setCatalogProducts((prev) => prev.map((p) => {
              const s = stats.get(p.id);
              return s ? { ...p, rating: s.average, reviewCount: s.count } : p;
            }));
          });
        }
      })
      .catch(() => {
        // Fetch itself failed unexpectedly — keep the mock catalog as-is.
      });
    return () => { cancelled = true; };
  }, []);

  const navigate = useCallback((r: string) => {
    window.location.hash = r; setRoute(r);
    setCategoryDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((prev) => {
      const isRemoving = prev.includes(productId);
      const next = isRemoving ? prev.filter((id) => id !== productId) : [...prev, productId];
      // Optimistic locally; the Supabase write below never blocks the UI
      // and its own failure is non-fatal (the toggle just won't survive a
      // refresh for that one product, exactly like a failed cart write).
      if (customerUser) {
        if (isRemoving) void removeFavorite(customerUser.id, productId);
        else void addFavorite(customerUser.id, productId);
      }
      return next;
    });
  }, [customerUser]);
  const isFavorite = useCallback((productId: string) => favorites.includes(productId), [favorites]);

  const signUpCustomerAccount = useCallback(async (input: SignUpCustomerInput): Promise<{ status: 'confirmed' | 'pending_confirmation' } | { error: string }> => {
    const result: SignUpCustomerResult = await signUpCustomer(input);
    if ('error' in result) return { error: result.error };
    if (result.status === 'pending_confirmation') return { status: 'pending_confirmation' };
    setCustomerUser(result.profile);
    await mergeLocalFavoritesIntoAccount(result.profile.id, favorites);
    const [favIds, realOrders] = await Promise.all([fetchFavoriteIds(result.profile.id), fetchCustomerOrders(result.profile.id)]);
    setFavorites(favIds);
    setOrders((prev) => mergeOrders(prev, realOrders));
    return { status: 'confirmed' };
  }, [favorites]);

  const signInCustomerAccount = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    const result = await signInCustomer(email, password);
    if ('error' in result) return { error: result.error };
    setCustomerUser(result);
    await mergeLocalFavoritesIntoAccount(result.id, favorites);
    const [favIds, realOrders] = await Promise.all([fetchFavoriteIds(result.id), fetchCustomerOrders(result.id)]);
    setFavorites(favIds);
    setOrders((prev) => mergeOrders(prev, realOrders));
    return {};
  }, [favorites]);

  const signOutCustomerAccount = useCallback(() => {
    setCustomerUser(null);
    setFavorites(loadStoredFavorites());
    setOrders([]);
    void signOutCustomer();
  }, []);

  const updateCustomerAccount = useCallback(async (input: UpdateCustomerProfileInput): Promise<{ error?: string }> => {
    if (!customerUser) return { error: 'Non connecté.' };
    const result = await updateCustomerProfile(customerUser.id, input);
    if (result.error) return result;
    setCustomerUser({ ...customerUser, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim() || null, email: input.email.trim() || null, quartier: input.quartier || null, landmark: input.landmark.trim() || null });
    return {};
  }, [customerUser]);

  const requestPasswordReset = useCallback(async (email: string) => requestCustomerPasswordReset(email), []);
  const resendConfirmationEmail = useCallback(async (email: string) => resendCustomerConfirmation(email), []);

  const deleteCustomerAccount = useCallback(async (): Promise<{ error?: string }> => {
    if (!customerUser) return { error: 'Non connecté.' };
    const result = await deleteMyAccount();
    if (result.error) return result;
    setCustomerUser(null);
    setFavorites(loadStoredFavorites());
    setOrders([]);
    return {};
  }, [customerUser]);

  // Never opens CartDrawer and never navigates — only the cart badge count
  // should visibly react. "Acheter maintenant" calls this then navigates to
  // checkout itself; a plain "Ajouter au panier" click does nothing more.
  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === item.productId && JSON.stringify(i.variants) === JSON.stringify(item.variants));
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity }; return next; }
      return [...prev, item];
    });
  }, []);

  const removeFromCart = useCallback((index: number) => setCart((prev) => prev.filter((_, i) => i !== index)), []);

  const updateQuantity = useCallback((index: number, quantity: number) =>
    setCart((prev) => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, quantity) } : item)), []);

  const clearCart = useCallback(() => setCart([]), []);

  const saveForLater = useCallback((index: number) => {
    setCart((prev) => {
      const item = prev[index];
      if (!item) return prev;
      setSavedItems((s) => [...s, { productId: item.productId, shopId: item.shopId, quantity: item.quantity, variants: item.variants, variantId: item.variantId }]);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const moveToCart = useCallback((index: number) => {
    setSavedItems((prev) => {
      const item = prev[index];
      if (!item) return prev;
      setCart((c) => {
        const idx = c.findIndex((i) => i.productId === item.productId && JSON.stringify(i.variants) === JSON.stringify(item.variants));
        if (idx >= 0) { const next = [...c]; next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity }; return next; }
        return [...c, { productId: item.productId, shopId: item.shopId, quantity: item.quantity, variants: item.variants, variantId: item.variantId }];
      });
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const removeFromSaved = useCallback((index: number) => setSavedItems((prev) => prev.filter((_, i) => i !== index)), []);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cart.reduce((sum, i) => { const p = catalogProducts.find((p) => p.id === i.productId); return sum + (p ? (i.unitPrice ?? p.price) * i.quantity : 0); }, 0);
  const addOrder = useCallback((order: Order) => setOrders((prev) => [order, ...prev]), []);

  const addAddress = useCallback((addr: Address) => {
    setAddresses((prev) => {
      if (addr.isDefault) return [...prev.map((a) => ({ ...a, isDefault: false })), addr];
      return [...prev, addr];
    });
  }, []);

  const updateAddress = useCallback((id: string, updated: Address) => {
    setAddresses((prev) => {
      if (updated.isDefault) {
        return prev.map((a) => a.id === id ? updated : { ...a, isDefault: false });
      }
      return prev.map((a) => a.id === id ? updated : a);
    });
  }, []);

  const deleteAddress = useCallback((id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const setDefaultAddress = useCallback((id: string) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  }, []);

  const updateCustomerInfo = useCallback((info: CustomerInfo) => setCustomerInfo(info), []);

  const value: AppState = {
    route, navigate, catalogProducts, catalogShops, favorites, toggleFavorite, isFavorite,
    cart, addToCart, removeFromCart, updateQuantity, clearCart,
    saveForLater, moveToCart, removeFromSaved, savedItems,
    cartCount, cartSubtotal, cartOpen, setCartOpen, categoryDrawerOpen, setCategoryDrawerOpen,
    orders, addOrder,
    addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress,
    customerInfo, updateCustomerInfo,
    customerUser, authLoading,
    signUpCustomerAccount, signInCustomerAccount, signOutCustomerAccount, resendConfirmationEmail, deleteCustomerAccount,
    updateCustomerAccount, requestPasswordReset,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export type { Product };
