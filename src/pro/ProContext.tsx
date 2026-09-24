import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { Role, DeliveryStep, ShopStatus, ProductStatus, ModerationEntry, ModerationTargetType, ModerationAction, BlogPost, BlogStatus } from './data';
import { missions as initialMissions, type Mission, type Product, type Shop, type Driver, type DriverTransaction, type Order, type Transaction } from './data';
import { shops as initialShops, products as initialProducts, transactions as initialTransactions, driverTransactions as initialDriverTransactions, orders as initialOrders, drivers as initialDrivers, moderationHistory as initialModerationHistory, blogPosts as initialBlogPosts } from './data';
import { assignShopPrefixes, nextReferenceForShop } from '@/utils/reference';
import { signInSeller, restoreSellerSession, signOutSeller, signUpSeller, requestSellerPasswordReset, resendSellerConfirmation, type SignUpSellerInput, type SignUpSellerResult } from '@/lib/supabaseSellerAuth';
import { deleteMyAccount } from '@/lib/supabaseAccountDeletion';
import { signInAdmin, restoreAdminSession } from '@/lib/supabaseAdminAuth';
import { signInDriver, restoreDriverSession } from '@/lib/supabaseDriverAuth';
import { fetchDriverMissions, acceptDeliveryMission, markStopCollected, startMissionDelivery, completeMissionDelivery } from '@/lib/supabaseDriverMissions';
import { supabase } from '@/lib/supabaseClient';

type Route = string;

interface SellerProduct extends Product {
  images?: string[];
  // Set once a product has been created in the real Supabase backend —
  // absent for products that only exist in this session's local mock state.
  supabaseProductId?: string;
}

interface ShopEdit {
  name: string;
  description: string;
  contact: string;
  pickupAddress: string;
  banner: string;
  logo: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  hours: string;
}

export interface Incident {
  phase: 'collection' | 'delivery';
  shopId?: string;
  reason: string;
  comment?: string;
  reportedAt: string;
}

/** Shared payload for a shop/product moderation action (flag, refuse, deactivate...). */
export interface ModerationInput {
  reason?: string;
  vendorMessage?: string;
  internalNote?: string;
}

interface AuthState {
  role: Role | null;
  identifier: string;
  name: string;
}

interface NewShopInput {
  name: string;
  ownerFirstName: string;
  ownerLastName: string;
  phone: string;
  address: string;
  description: string;
  logo?: string;
  banner?: string;
}

interface NewDriverInput {
  firstName: string;
  lastName: string;
  phone: string;
}

export interface SellerShopInfo {
  supabaseShopId: string;
  isOfficial: boolean;
}

interface ProState extends AuthState {
  route: Route;
  navigate: (r: Route) => void;
  login: (role: Role, identifier: string, name: string, shopInfo?: SellerShopInfo) => void;
  logout: () => void;
  missions: Mission[];
  acceptMission: (id: string) => void;
  advanceMission: (id: string) => void;
  advanceSubOrder: (orderId: string, shopId: string, fulfillment: 'delivery' | 'pickup') => void;
  getSubOrderStatus: (orderId: string, shopId: string, original: string) => string;
  setProductStatus: (productId: string, status: ProductStatus) => void;
  productStatusUpdates: Record<string, ProductStatus>;
  // Seller product management
  sellerProducts: SellerProduct[];
  // Returns the reference the product was saved with, synchronously. Pass
  // forcedReference to use an already-known value (e.g. one just confirmed
  // by a real Supabase insert) instead of generating one from local mock
  // state — local generation must never be the source of truth once a
  // product is actually backed by Supabase.
  addSellerProduct: (product: Omit<SellerProduct, 'reference'>, forcedReference?: string) => string;
  updateSellerProduct: (id: string, product: SellerProduct) => void;
  deleteSellerProduct: (id: string) => void;
  // Seller shop editing
  sellerShop: Shop | null;
  updateSellerShop: (edit: ShopEdit) => void;
  updateSellerPin: (newPin: string) => boolean;
  // The seller's real Supabase shop id (shops.id, matched via
  // shops.owner_id = auth.uid()) — null until a real Supabase Auth session
  // has been verified to own a real shop. This is the id product-creation
  // code must use; never a hardcoded/mock shop id.
  sellerSupabaseShopId: string | null;
  // From shops.is_official for the signed-in seller's real shop — never a
  // hardcoded id/slug/name. Drives removing the active-product limit for
  // the official Ezial shop (SellerProducts, SellerDashboard).
  sellerShopIsOfficial: boolean;
  // Seller login — authenticates seller_code + password against Supabase
  // Auth, then verifies the account owns a real shop (shops.owner_id =
  // auth.uid()) before granting access.
  verifySellerLogin: (identifier: string, password: string) => Promise<{ shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { error: string }>;
  // Self-service shop signup (new sellers only) — creates the real
  // Supabase Auth user + a 'draft' shop row in one step.
  signUpSellerAccount: (input: SignUpSellerInput) => Promise<{ status: 'confirmed'; shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { status: 'pending_confirmation' } | { error: string }>;
  requestSellerPasswordReset: (email: string) => Promise<{ error?: string }>;
  resendSellerConfirmationEmail: (email: string) => Promise<{ error?: string }>;
  deleteSellerAccount: () => Promise<{ error?: string }>;
  // Admin login — authenticates a real email + password against Supabase
  // Auth, then verifies the account is listed in public.admins before
  // granting access. Needed so RLS on manually-managed content (Hero,
  // "À découvrir") can actually restrict writes to admins.
  verifyAdminLogin: (email: string, password: string) => Promise<{ name: string } | { error: string }>;
  // Driver login — authenticates a real email + password against Supabase
  // Auth, then verifies profiles.role = 'driver' before granting access.
  verifyDriverLogin: (email: string, password: string) => Promise<{ name: string } | { error: string }>;
  // Seller transactions
  sellerTransactions: typeof initialTransactions;
  // Driver state — backed by real delivery_missions/delivery_stops/orders
  // once a real driver session is active; empty until then, never mock.
  driverAvailable: boolean;
  setDriverAvailable: (available: boolean) => void;
  // Every mission visible to the signed-in driver under RLS (their own +
  // still-unclaimed ones) — used by DriverMissionDetail to look a mission
  // up by id, including ones not yet accepted.
  driverVisibleMissions: Mission[];
  isDriverMissionsLoading: boolean;
  driverActionError: string | null;
  clearDriverActionError: () => void;
  driverMissions: Mission[];
  availableMissions: Mission[];
  activeMission: Mission | null;
  completedMissions: Mission[];
  driverTransactions: DriverTransaction[];
  collectParcel: (missionId: string, shopId: string) => void;
  startDelivery: (missionId: string) => void;
  completeDelivery: (missionId: string, code: string, proofPhotoFile: File) => Promise<{ error?: string }>;
  reportIncident: (missionId: string, incident: Incident) => void;
  // Admin state
  allOrders: Order[];
  allShops: Shop[];
  allDrivers: Driver[];
  allProducts: Product[];
  allTransactions: Transaction[];
  allDriverTransactions: DriverTransaction[];
  cancelledOrders: string[];
  refundedOrders: string[];
  resolvedIncidents: string[];
  payoutStatuses: Record<string, 'pending' | 'available' | 'paid'>;
  driverPayoutStatuses: Record<string, 'pending' | 'available' | 'paid'>;
  // Moderation history — append-only log for shops & products
  moderationHistory: ModerationEntry[];
  getModerationHistory: (targetType: ModerationTargetType, targetId: string) => ModerationEntry[];
  getLatestModeration: (targetType: ModerationTargetType, targetId: string) => ModerationEntry | null;
  // Admin actions — products
  validateProduct: (productId: string) => void;
  refuseProduct: (productId: string, input: ModerationInput) => void;
  flagProduct: (productId: string, input: ModerationInput) => void;
  deactivateProduct: (productId: string, input: ModerationInput) => void;
  reactivateProduct: (productId: string, input?: ModerationInput) => void;
  // Admin actions — shops
  deactivateShop: (shopId: string, input: ModerationInput) => void;
  flagShop: (shopId: string, input: ModerationInput) => void;
  reactivateShop: (shopId: string, input?: ModerationInput) => void;
  updateShopInfo: (shopId: string, edit: Partial<Pick<Shop, 'name' | 'description' | 'contact' | 'pickupAddress' | 'categoryFocus' | 'logo' | 'banner'>>) => void;
  // Admin actions — orders & payouts
  cancelOrder: (orderId: string) => void;
  refundOrder: (orderId: string) => void;
  resolveIncident: (missionId: string) => void;
  markSellerPaid: (transactionId: string) => void;
  markDriverPaid: (driverId: string) => void;
  createShop: (input: NewShopInput) => Shop;
  createDriver: (input: NewDriverInput) => Driver;
  toggleDriverStatus: (driverId: string, status: 'active' | 'suspended') => void;
  // Blog
  blogPosts: BlogPost[];
  createBlogPost: (post: Omit<BlogPost, 'id'>) => BlogPost;
  updateBlogPost: (id: string, post: Omit<BlogPost, 'id'>) => void;
  deleteBlogPost: (id: string) => void;
  publishBlogPost: (id: string) => void;
  unpublishBlogPost: (id: string) => void;
  scheduleBlogPost: (id: string, publishDate: string) => void;
}

const ProContext = createContext<ProState | null>(null);

export function usePro(): ProState {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error('usePro must be used within ProProvider');
  return ctx;
}

const deliverySteps: DeliveryStep[] = ['accepted', 'to_collection', 'collected', 'all_collected', 'to_customer', 'arrived', 'delivered'];

const deliveryFlow = ['confirmed', 'preparing', 'ready'];
const pickupFlow = ['confirmed', 'preparing', 'ready_for_pickup', 'picked_up'];

function generateIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z]/g, '').toUpperCase().replace(/\s+/g, '');
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${cleaned}${digits}`;
}

// Read once per page load — the QR code on a delivery label encodes
// #/pro?driver_order=<orderId>, so scanning it after the driver is already
// authenticated jumps straight to that mission instead of the plain
// dashboard. Never trusted on its own: the caller only uses this once role
// is actually 'driver', and DriverMissionDetail's own isAssigned/isAvailable
// checks still gate what that screen actually shows.
function pendingDriverOrderId(): string | null {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('driver_order');
}

export function ProProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [route, setRoute] = useState('/');
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [productStatusUpdates, setProductStatusUpdates] = useState<Record<string, ProductStatus>>({});
  const [orderUpdates, setOrderUpdates] = useState<Record<string, string>>({});
  const [sellerProducts, setSellerProducts] = useState<SellerProduct[]>(initialProducts);
  const [sellerShop, setSellerShop] = useState<Shop | null>(null);
  const [sellerSupabaseShopId, setSellerSupabaseShopId] = useState<string | null>(null);
  const [sellerShopIsOfficial, setSellerShopIsOfficial] = useState(false);
  const [sellerTransactions] = useState(initialTransactions);
  const [driverAvailable, setDriverAvailable] = useState(true);
  // Real, Supabase-backed missions visible to the signed-in driver — starts
  // empty and is only ever populated by loadDriverMissions(); never falls
  // back to the mock `missions` array below (that one stays admin-only).
  const [driverVisibleMissions, setDriverVisibleMissions] = useState<Mission[]>([]);
  const [isDriverMissionsLoading, setIsDriverMissionsLoading] = useState(false);
  const [driverActionError, setDriverActionError] = useState<string | null>(null);

  // Admin state
  const [allShops, setAllShops] = useState<Shop[]>(initialShops);
  const [allDrivers, setAllDrivers] = useState<Driver[]>(initialDrivers);

  // Stable EZ-XXX-#### prefix per shop, used to generate product references.
  const shopPrefixes = useMemo(
    () => assignShopPrefixes(allShops.map((s) => ({ id: s.id, name: s.name }))),
    [allShops],
  );
  const [moderationHistory, setModerationHistory] = useState<ModerationEntry[]>(initialModerationHistory);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(initialBlogPosts);
  const [cancelledOrders, setCancelledOrders] = useState<string[]>([]);
  const [refundedOrders, setRefundedOrders] = useState<string[]>([]);
  const [resolvedIncidents, setResolvedIncidents] = useState<string[]>([]);
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, 'pending' | 'available' | 'paid'>>({});
  const [driverPayoutStatuses, setDriverPayoutStatuses] = useState<Record<string, 'pending' | 'available' | 'paid'>>({});

  // Fetches the real Supabase missions visible to the signed-in driver and
  // replaces local state with them — the single place that state is ever
  // written, so login/session-restore/every mutation stay consistent.
  const loadDriverMissions = useCallback(async (): Promise<Mission[]> => {
    setIsDriverMissionsLoading(true);
    const real = await fetchDriverMissions();
    setDriverVisibleMissions(real);
    setIsDriverMissionsLoading(false);
    return real;
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('ezial-pro-auth');
    if (!saved) return;
    let parsed: { role: Role; identifier: string; name: string };
    try {
      parsed = JSON.parse(saved);
    } catch {
      return;
    }

    if (parsed.role === 'driver') {
      // Driver sessions are never trusted from sessionStorage alone — the
      // real Supabase session must still exist AND profiles.role must still
      // be 'driver' before the driver area opens.
      (async () => {
        const driver = await restoreDriverSession();
        if (!driver) {
          sessionStorage.removeItem('ezial-pro-auth');
          return;
        }
        setRole('driver');
        setIdentifier(parsed.identifier);
        setName(driver.name);
        const real = await loadDriverMissions();
        const pendingOrderId = pendingDriverOrderId();
        const pendingMission = pendingOrderId ? real.find((m) => m.orderId === pendingOrderId) : undefined;
        setRoute(pendingMission ? `/driver/livraisons/${pendingMission.id}` : '/driver');
      })();
      return;
    }

    if (parsed.role === 'admin') {
      // Admin sessions are never trusted from sessionStorage alone — the
      // real Supabase session must still exist AND still be listed in
      // public.admins before the admin area opens.
      (async () => {
        const admin = await restoreAdminSession();
        if (!admin) {
          sessionStorage.removeItem('ezial-pro-auth');
          return;
        }
        setRole('admin');
        setIdentifier(parsed.identifier);
        setName(admin.name);
        setRoute('/admin');
      })();
      return;
    }

    // Seller sessions are never trusted from sessionStorage alone — the
    // real Supabase session must still exist AND still own a real shop
    // (shops.owner_id = auth.uid()) before the seller area opens.
    (async () => {
      const shop = await restoreSellerSession();
      if (!shop) {
        sessionStorage.removeItem('ezial-pro-auth');
        return;
      }
      setRole('seller');
      setIdentifier(parsed.identifier);
      setName(shop.shopName);
      setSellerSupabaseShopId(shop.shopId);
      setSellerShopIsOfficial(shop.isOfficial);
      setRoute('/seller');
      const mockShop = initialShops.find((s) => s.sellerId === parsed.identifier);
      setSellerShop(mockShop ?? null);
    })();
    // Deliberately mount-only — re-running this on every `missions` update
    // (e.g. after collectParcel) would re-navigate the driver back to a
    // stale deep link on each unrelated state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const login = useCallback((r: Role, id: string, n: string, shopInfo?: SellerShopInfo) => {
    setRole(r);
    setIdentifier(id);
    setName(n);
    setRoute(r === 'admin' ? '/admin' : r === 'seller' ? '/seller' : '/driver');
    if (r === 'seller') {
      const shop = initialShops.find((s) => s.sellerId === id);
      setSellerShop(shop ?? null);
      setSellerSupabaseShopId(shopInfo?.supabaseShopId ?? null);
      setSellerShopIsOfficial(shopInfo?.isOfficial ?? false);
    }
    if (r === 'driver') {
      // The QR-code deep link (#/pro?driver_order=...) can only be resolved
      // once real missions are fetched — jump there once they land instead
      // of blocking the initial navigation on the network round trip.
      void loadDriverMissions().then((real) => {
        const pendingOrderId = pendingDriverOrderId();
        const pendingMission = pendingOrderId ? real.find((m) => m.orderId === pendingOrderId) : undefined;
        if (pendingMission) setRoute(`/driver/livraisons/${pendingMission.id}`);
      });
    }
    sessionStorage.setItem('ezial-pro-auth', JSON.stringify({ role: r, identifier: id, name: n }));
  }, [loadDriverMissions]);

  const logout = useCallback(() => {
    setRole(null);
    setIdentifier('');
    setName('');
    setRoute('/');
    setSellerShop(null);
    setSellerSupabaseShopId(null);
    setSellerShopIsOfficial(false);
    setDriverVisibleMissions([]);
    setDriverActionError(null);
    sessionStorage.removeItem('ezial-pro-auth');
    // Fire-and-forget: the local session is already cleared above regardless
    // of whether the Supabase sign-out call itself succeeds.
    void signOutSeller();
  }, []);

  const clearDriverActionError = useCallback(() => setDriverActionError(null), []);

  const acceptMission = useCallback((id: string) => {
    setDriverActionError(null);
    void acceptDeliveryMission(id).then(({ error }) => {
      if (error) {
        setDriverActionError(error);
        return;
      }
      void loadDriverMissions();
    });
  }, [loadDriverMissions]);

  const advanceMission = useCallback((id: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const currentIdx = deliverySteps.indexOf(m.step);
        const nextStep = deliverySteps[Math.min(currentIdx + 1, deliverySteps.length - 1)];
        return { ...m, step: nextStep };
      }),
    );
  }, []);

  const advanceSubOrder = useCallback((orderId: string, shopId: string, fulfillment: 'delivery' | 'pickup') => {
    setOrderUpdates((prev) => {
      const key = `${orderId}:${shopId}`;
      const flow = fulfillment === 'pickup' ? pickupFlow : deliveryFlow;
      const current = prev[key] ?? 'confirmed';
      const idx = flow.indexOf(current);
      const next = flow[Math.min(idx + 1, flow.length - 1)];
      return { ...prev, [key]: next };
    });
  }, []);

  const getSubOrderStatus = useCallback((orderId: string, shopId: string, original: string): string => {
    const key = `${orderId}:${shopId}`;
    return orderUpdates[key] ?? original;
  }, [orderUpdates]);

  const setProductStatus = useCallback((productId: string, status: ProductStatus) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: status }));
  }, []);

  const addSellerProduct = useCallback((product: Omit<SellerProduct, 'reference'>, forcedReference?: string): string => {
    const reference = forcedReference ?? nextReferenceForShop(shopPrefixes, sellerProducts, product.shopId);
    setSellerProducts((prev) => [{ ...product, reference }, ...prev]);
    return reference;
  }, [shopPrefixes, sellerProducts]);

  // The reference is assigned once at creation and can never be changed by
  // the seller — always keep the original, regardless of what is passed in.
  const updateSellerProduct = useCallback((id: string, updated: SellerProduct) => {
    setSellerProducts((prev) => prev.map((p) => (p.id === id ? { ...updated, reference: p.reference } : p)));
  }, []);

  const deleteSellerProduct = useCallback((id: string) => {
    setSellerProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateSellerShop = useCallback((edit: ShopEdit) => {
    setSellerShop((prev) => prev ? { ...prev, name: edit.name, description: edit.description, contact: edit.contact, pickupAddress: edit.pickupAddress, banner: edit.banner, logo: edit.logo, pickupEnabled: edit.pickupEnabled, deliveryEnabled: edit.deliveryEnabled } : prev);
  }, []);

  // Cosmetic only: this PIN has no bearing on real authentication anymore —
  // seller login goes through Supabase Auth (seller_code + real password).
  // Kept so the seller settings page keeps working unchanged; a real
  // password-change/reset flow (by the seller or an admin) is a separate,
  // not-yet-built feature.
  const updateSellerPin = useCallback((newPin: string): boolean => {
    if (!/^\d{4}$/.test(newPin)) return false;
    setSellerShop((prev) => prev ? { ...prev, pin: newPin } : prev);
    return true;
  }, []);

  const verifySellerLogin = useCallback(async (rawIdentifier: string, password: string): Promise<{ shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { error: string }> => {
    const id = rawIdentifier.trim();
    const result = await signInSeller(id, password);
    if ('error' in result) return { error: result.error };
    return { shop: { sellerId: id.toUpperCase(), name: result.shopName, supabaseShopId: result.shopId, isOfficial: result.isOfficial } };
  }, []);

  const signUpSellerAccount = useCallback(async (input: SignUpSellerInput): Promise<{ status: 'confirmed'; shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { status: 'pending_confirmation' } | { error: string }> => {
    const result: SignUpSellerResult = await signUpSeller(input);
    if ('error' in result) return { error: result.error };
    if (result.status === 'pending_confirmation') return { status: 'pending_confirmation' };
    return { status: 'confirmed', shop: { sellerId: input.username.trim().toLowerCase(), name: result.shop.shopName, supabaseShopId: result.shop.shopId, isOfficial: result.shop.isOfficial } };
  }, []);

  const requestSellerPasswordResetAction = useCallback(async (email: string) => requestSellerPasswordReset(email), []);
  const resendSellerConfirmationEmail = useCallback(async (email: string) => resendSellerConfirmation(email), []);

  const deleteSellerAccount = useCallback(async (): Promise<{ error?: string }> => {
    if (!sellerSupabaseShopId) return { error: 'Aucune boutique associée à ce compte.' };
    const result = await deleteMyAccount();
    if (result.error) return result;
    logout();
    return {};
  }, [sellerSupabaseShopId, logout]);

  const verifyAdminLogin = useCallback(async (email: string, password: string): Promise<{ name: string } | { error: string }> => {
    const result = await signInAdmin(email.trim(), password);
    if ('error' in result) return { error: result.error };
    return { name: result.name };
  }, []);

  const verifyDriverLogin = useCallback(async (email: string, password: string): Promise<{ name: string } | { error: string }> => {
    const result = await signInDriver(email.trim(), password);
    if ('error' in result) return { error: result.error };
    return { name: result.name };
  }, []);

  // === Driver actions — every mutation writes to Supabase first, then
  // refetches so local state always reflects what was actually persisted
  // (never an optimistic guess that could drift from the real row). ===

  const collectParcel = useCallback((missionId: string, shopId: string) => {
    setDriverActionError(null);
    const mission = driverVisibleMissions.find((m) => m.id === missionId);
    const stopId = mission?.collections.find((c) => c.shopId === shopId)?.stopId;
    if (!stopId) {
      setDriverActionError('Point de collecte introuvable.');
      return;
    }
    void markStopCollected(stopId).then(({ error }) => {
      if (error) {
        setDriverActionError(error);
        return;
      }
      void loadDriverMissions();
    });
  }, [driverVisibleMissions, loadDriverMissions]);

  const startDelivery = useCallback((missionId: string) => {
    setDriverActionError(null);
    void startMissionDelivery(missionId).then(({ error }) => {
      if (error) {
        setDriverActionError(error);
        return;
      }
      void loadDriverMissions();
    });
  }, [loadDriverMissions]);

  const completeDelivery = useCallback(async (missionId: string, code: string, proofPhotoFile: File): Promise<{ error?: string }> => {
    const { data: userData } = await supabase.auth.getUser();
    const driverAuthId = userData.user?.id;
    if (!driverAuthId) return { error: 'Session expirée, reconnectez-vous.' };
    const result = await completeMissionDelivery(missionId, driverAuthId, code, proofPhotoFile);
    if (!result.error) await loadDriverMissions();
    return result;
  }, [loadDriverMissions]);

  // Local-only for now: delivery_missions has no incident-persistence
  // column yet (a minimal additive migration was proposed and is pending
  // confirmation) — the report is visible in this session but does not
  // survive a refresh.
  const reportIncident = useCallback((missionId: string, incident: Incident) => {
    setDriverVisibleMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, incident } : m)),
    );
  }, []);

  // === Admin actions ===

  // Appends one immutable line to the moderation log. This is the single
  // place a ModerationEntry is ever created — never mutated afterwards, so
  // the trail survives status changes in either direction.
  const logModeration = useCallback((targetType: ModerationTargetType, targetId: string, action: ModerationAction, input?: ModerationInput) => {
    const entry: ModerationEntry = {
      id: `mh-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      targetType,
      targetId,
      action,
      reason: input?.reason,
      vendorMessage: input?.vendorMessage,
      internalNote: input?.internalNote,
      adminName: name || 'Admin EZIAL',
      date: new Date().toISOString(),
    };
    setModerationHistory((prev) => [entry, ...prev]);
  }, [name]);

  // Always sorted newest first by date — never relies on array/insertion order,
  // so mock data can be authored chronologically without breaking "latest".
  const getModerationHistory = useCallback((targetType: ModerationTargetType, targetId: string) =>
    moderationHistory
      .filter((e) => e.targetType === targetType && e.targetId === targetId)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  [moderationHistory]);

  const getLatestModeration = useCallback((targetType: ModerationTargetType, targetId: string) =>
    getModerationHistory(targetType, targetId)[0] ?? null, [getModerationHistory]);

  // --- Products ---

  const validateProduct = useCallback((productId: string) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'published' }));
    logModeration('product', productId, 'validated');
  }, [logModeration]);

  const refuseProduct = useCallback((productId: string, input: ModerationInput) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'changes_requested' }));
    logModeration('product', productId, 'refused', input);
  }, [logModeration]);

  const flagProduct = useCallback((productId: string, input: ModerationInput) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'flagged' }));
    logModeration('product', productId, 'flagged', input);
  }, [logModeration]);

  const deactivateProduct = useCallback((productId: string, input: ModerationInput) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'inactive' }));
    logModeration('product', productId, 'deactivated', input);
  }, [logModeration]);

  const reactivateProduct = useCallback((productId: string, input?: ModerationInput) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'published' }));
    logModeration('product', productId, 'reactivated', input);
  }, [logModeration]);

  // --- Shops ---

  const deactivateShop = useCallback((shopId: string, input: ModerationInput) => {
    setAllShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status: 'inactive' as ShopStatus } : s)));
    logModeration('shop', shopId, 'deactivated', input);
  }, [logModeration]);

  const flagShop = useCallback((shopId: string, input: ModerationInput) => {
    setAllShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status: 'flagged' as ShopStatus } : s)));
    logModeration('shop', shopId, 'flagged', input);
  }, [logModeration]);

  const reactivateShop = useCallback((shopId: string, input?: ModerationInput) => {
    setAllShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status: 'active' as ShopStatus } : s)));
    logModeration('shop', shopId, 'reactivated', input);
  }, [logModeration]);

  const updateShopInfo = useCallback((shopId: string, edit: Partial<Pick<Shop, 'name' | 'description' | 'contact' | 'pickupAddress' | 'categoryFocus' | 'logo' | 'banner'>>) => {
    setAllShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, ...edit } : s)));
  }, []);

  // --- Blog ---

  const createBlogPost = useCallback((post: Omit<BlogPost, 'id'>): BlogPost => {
    const newPost: BlogPost = { ...post, id: `b-${Date.now()}` };
    setBlogPosts((prev) => [newPost, ...prev]);
    return newPost;
  }, []);

  const updateBlogPost = useCallback((id: string, post: Omit<BlogPost, 'id'>) => {
    setBlogPosts((prev) => prev.map((p) => (p.id === id ? { ...post, id } : p)));
  }, []);

  const deleteBlogPost = useCallback((id: string) => {
    setBlogPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const setBlogStatus = useCallback((id: string, status: BlogStatus, publishDate?: string) => {
    setBlogPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status, ...(publishDate ? { publishDate } : {}), updatedDate: new Date().toISOString().split('T')[0] } : p)));
  }, []);

  const publishBlogPost = useCallback((id: string) => {
    setBlogStatus(id, 'published', new Date().toISOString().split('T')[0]);
  }, [setBlogStatus]);

  const unpublishBlogPost = useCallback((id: string) => {
    setBlogStatus(id, 'unpublished');
  }, [setBlogStatus]);

  const scheduleBlogPost = useCallback((id: string, publishDate: string) => {
    setBlogStatus(id, 'scheduled', publishDate);
  }, [setBlogStatus]);

  const cancelOrder = useCallback((orderId: string) => {
    setCancelledOrders((prev) => [...prev, orderId]);
  }, []);

  const refundOrder = useCallback((orderId: string) => {
    setRefundedOrders((prev) => [...prev, orderId]);
  }, []);

  const resolveIncident = useCallback((missionId: string) => {
    setResolvedIncidents((prev) => [...prev, missionId]);
  }, []);

  const markSellerPaid = useCallback((transactionId: string) => {
    setPayoutStatuses((prev) => ({ ...prev, [transactionId]: 'paid' }));
  }, []);

  const markDriverPaid = useCallback((driverId: string) => {
    setDriverPayoutStatuses((prev) => ({ ...prev, [driverId]: 'paid' }));
  }, []);

  const createShop = useCallback((input: NewShopInput): Shop => {
    const sellerId = generateIdentifier(input.name);
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const existingIds = new Set(allShops.map((s) => s.id));
    const id = !slug || existingIds.has(slug) ? `shop-${Date.now()}` : slug;
    const defaultLogo = 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop';
    const defaultBanner = 'https://images.pexels.com/photos/8743972/pexels-photo-8743972.jpeg?auto=compress&cs=tinysrgb&h=400&w=900';
    const newShop: Shop = {
      id,
      name: input.name,
      logo: input.logo || defaultLogo,
      banner: input.banner || defaultBanner,
      description: input.description,
      categoryFocus: '—',
      contact: input.phone,
      pickupAddress: input.address,
      pickupEnabled: false,
      pickupDelay: '24h',
      deliveryEnabled: true,
      plan: 'standard',
      status: 'pending',
      sellerId,
      productCount: 0,
      orderCount: 0,
      followers: 0,
      rating: 0,
      reviewCount: 0,
      joinDate: new Date().toISOString().split('T')[0],
      weeklyGross: 0,
      yearlyNet: 0,
    };
    setAllShops((prev) => [...prev, newShop]);
    return newShop;
  }, [allShops]);

  const createDriver = useCallback((input: NewDriverInput): Driver => {
    const driverIdentifier = generateIdentifier(input.firstName);
    const newDriver: Driver = {
      id: `driver-${Date.now()}`,
      name: `${input.firstName} ${input.lastName}`.trim(),
      identifier: driverIdentifier,
      phone: input.phone,
      status: 'available',
      todayMissions: 0,
      completedToday: 0,
      weeklyDeliveries: 0,
      weeklyEarnings: 0,
      yearlyEarnings: 0,
      joinDate: new Date().toISOString().split('T')[0],
    };
    setAllDrivers((prev) => [...prev, newDriver]);
    return newDriver;
  }, []);

  const toggleDriverStatus = useCallback((driverId: string, status: 'active' | 'suspended') => {
    setAllDrivers((prev) => prev.map((d) => (d.id === driverId ? { ...d, status: status === 'active' ? 'available' : 'suspended' as const } : d)));
  }, []);

  // Build the effective product list (with status overrides)
  const allProducts: Product[] = sellerProducts.map((p) => ({
    ...p,
    status: productStatusUpdates[p.id] ?? p.status,
  }));

  // Build effective orders (with cancellation/refund overrides)
  const allOrders: Order[] = initialOrders.map((o) => {
    if (cancelledOrders.includes(o.id)) return { ...o, status: 'cancelled' as const };
    if (refundedOrders.includes(o.id)) return { ...o, status: 'refunded' as const };
    return o;
  });

  // Build effective transactions (with payout overrides)
  const allTransactions: Transaction[] = initialTransactions.map((t) => ({
    ...t,
    payout: payoutStatuses[t.id] ?? t.payout,
  }));

  // Derived driver mission lists — sourced from the real, Supabase-backed
  // driverVisibleMissions. RLS already only ever returns this driver's own
  // missions or still-unclaimed ones, so a non-null driverId here can only
  // mean "assigned to me".
  const driverMissions = driverVisibleMissions.filter((m) => Boolean(m.driverId));
  const activeMission = driverMissions.find((m) => m.step !== 'delivered') ?? null;
  const availableMissions = driverVisibleMissions.filter((m) => !m.driverId);
  const completedMissions = driverMissions.filter((m) => m.step === 'delivered');

  const value: ProState = {
    role,
    identifier,
    name,
    route,
    navigate,
    login,
    logout,
    missions,
    acceptMission,
    advanceMission,
    advanceSubOrder,
    getSubOrderStatus,
    setProductStatus,
    productStatusUpdates,
    sellerProducts,
    addSellerProduct,
    updateSellerProduct,
    deleteSellerProduct,
    sellerShop,
    updateSellerShop,
    updateSellerPin,
    sellerSupabaseShopId,
    sellerShopIsOfficial,
    verifySellerLogin,
    signUpSellerAccount,
    requestSellerPasswordReset: requestSellerPasswordResetAction,
    resendSellerConfirmationEmail,
    deleteSellerAccount,
    verifyAdminLogin,
    verifyDriverLogin,
    sellerTransactions,
    driverAvailable,
    setDriverAvailable,
    driverVisibleMissions,
    isDriverMissionsLoading,
    driverActionError,
    clearDriverActionError,
    driverMissions,
    availableMissions,
    activeMission,
    completedMissions,
    driverTransactions: initialDriverTransactions,
    collectParcel,
    startDelivery,
    completeDelivery,
    reportIncident,
    // Admin
    allOrders,
    allShops,
    allDrivers,
    allProducts,
    allTransactions,
    allDriverTransactions: initialDriverTransactions,
    cancelledOrders,
    refundedOrders,
    resolvedIncidents,
    payoutStatuses,
    driverPayoutStatuses,
    moderationHistory,
    getModerationHistory,
    getLatestModeration,
    validateProduct,
    refuseProduct,
    flagProduct,
    deactivateProduct,
    reactivateProduct,
    deactivateShop,
    flagShop,
    reactivateShop,
    updateShopInfo,
    cancelOrder,
    refundOrder,
    resolveIncident,
    markSellerPaid,
    markDriverPaid,
    createShop,
    createDriver,
    toggleDriverStatus,
    blogPosts,
    createBlogPost,
    updateBlogPost,
    deleteBlogPost,
    publishBlogPost,
    unpublishBlogPost,
    scheduleBlogPost,
  };

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}
