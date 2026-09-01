import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { Role, DeliveryStep, ShopStatus, ProductStatus, ModerationEntry, ModerationTargetType, ModerationAction, BlogPost, BlogStatus } from './data';
import { missions as initialMissions, type Mission, type Product, type Shop, type Driver, type DriverTransaction, type Order, type Transaction } from './data';
import { shops as initialShops, products as initialProducts, transactions as initialTransactions, driverTransactions as initialDriverTransactions, orders as initialOrders, drivers as initialDrivers, moderationHistory as initialModerationHistory, blogPosts as initialBlogPosts } from './data';
import { assignShopPrefixes, nextReferenceForShop } from '@/utils/reference';

type Route = string;

interface SellerProduct extends Product {
  images?: string[];
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

interface ProState extends AuthState {
  route: Route;
  navigate: (r: Route) => void;
  login: (role: Role, identifier: string, name: string) => void;
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
  addSellerProduct: (product: Omit<SellerProduct, 'reference'>) => void;
  updateSellerProduct: (id: string, product: SellerProduct) => void;
  deleteSellerProduct: (id: string) => void;
  // Seller shop editing
  sellerShop: Shop | null;
  updateSellerShop: (edit: ShopEdit) => void;
  updateSellerPin: (newPin: string) => boolean;
  // Seller login — checks identifier + PIN against shop data, including any
  // PIN the seller has since set from their settings (see updateSellerPin).
  verifySellerLogin: (identifier: string, pin: string) => { shop: { sellerId: string; name: string } } | { error: string };
  // Seller transactions
  sellerTransactions: typeof initialTransactions;
  // Driver state
  driverAvailable: boolean;
  setDriverAvailable: (available: boolean) => void;
  driverMissions: Mission[];
  availableMissions: Mission[];
  activeMission: Mission | null;
  completedMissions: Mission[];
  driverTransactions: DriverTransaction[];
  collectParcel: (missionId: string, shopId: string) => void;
  startDelivery: (missionId: string) => void;
  completeDelivery: (missionId: string, code: string, proofPhoto: string) => boolean;
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
  // sellerId -> PIN the seller has set from their settings, overriding the
  // mock default in data.ts. Session-only, matching the rest of this prototype's
  // mock state; a real backend would store this per-shop instead.
  const [sellerPinOverrides, setSellerPinOverrides] = useState<Record<string, string>>({});
  const [sellerTransactions] = useState(initialTransactions);
  const [driverAvailable, setDriverAvailable] = useState(true);

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

  useEffect(() => {
    const saved = sessionStorage.getItem('ezial-pro-auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRole(parsed.role);
        setIdentifier(parsed.identifier);
        setName(parsed.name);
        setRoute(parsed.role === 'admin' ? '/admin' : parsed.role === 'seller' ? '/seller' : '/driver');
        if (parsed.role === 'seller') {
          const shop = initialShops.find((s) => s.sellerId === parsed.identifier);
          setSellerShop(shop ?? null);
        }
      } catch { /* ignore */ }
    }
  }, []);

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const login = useCallback((r: Role, id: string, n: string) => {
    setRole(r);
    setIdentifier(id);
    setName(n);
    const homeRoute = r === 'admin' ? '/admin' : r === 'seller' ? '/seller' : '/driver';
    setRoute(homeRoute);
    if (r === 'seller') {
      const shop = initialShops.find((s) => s.sellerId === id);
      setSellerShop(shop ?? null);
    }
    sessionStorage.setItem('ezial-pro-auth', JSON.stringify({ role: r, identifier: id, name: n }));
  }, []);

  const logout = useCallback(() => {
    setRole(null);
    setIdentifier('');
    setName('');
    setRoute('/');
    setSellerShop(null);
    sessionStorage.removeItem('ezial-pro-auth');
  }, []);

  const acceptMission = useCallback((id: string) => {
    setMissions((prev) => prev.map((m) => (m.id === id ? { ...m, driverId: 'me', step: 'to_collection' } : m)));
  }, []);

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

  const addSellerProduct = useCallback((product: Omit<SellerProduct, 'reference'>) => {
    setSellerProducts((prev) => {
      const reference = nextReferenceForShop(shopPrefixes, prev, product.shopId);
      return [{ ...product, reference }, ...prev];
    });
  }, [shopPrefixes]);

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

  // Exactly 4 digits required. The PIN is never read back from state by any
  // UI — this is a write-only update, matching "never shown in clear once saved".
  const updateSellerPin = useCallback((newPin: string): boolean => {
    if (!/^\d{4}$/.test(newPin)) return false;
    setSellerShop((prev) => prev ? { ...prev, pin: newPin } : prev);
    if (identifier) setSellerPinOverrides((prev) => ({ ...prev, [identifier]: newPin }));
    return true;
  }, [identifier]);

  const verifySellerLogin = useCallback((rawIdentifier: string, pin: string): { shop: { sellerId: string; name: string } } | { error: string } => {
    const id = rawIdentifier.trim().toUpperCase();
    const shop = initialShops.find((s) => s.sellerId === id);
    if (!shop) return { error: 'Identifiant introuvable.' };
    const effectivePin = sellerPinOverrides[shop.sellerId] ?? shop.pin;
    if (!effectivePin) return { error: "Aucun PIN n'est configuré pour cette boutique. Contactez EZIAL." };
    if (effectivePin !== pin.trim()) return { error: 'Identifiant ou PIN incorrect.' };
    return { shop: { sellerId: shop.sellerId, name: shop.name } };
  }, [sellerPinOverrides]);

  // === Driver actions ===

  const collectParcel = useCallback((missionId: string, shopId: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== missionId) return m;
        const collections = m.collections.map((c) =>
          c.shopId === shopId ? { ...c, collected: true, collectedAt: new Date().toISOString() } : c,
        );
        const allCollected = collections.every((c) => c.collected);
        return {
          ...m,
          collections,
          step: allCollected ? 'all_collected' : 'to_collection',
        };
      }),
    );
  }, []);

  const startDelivery = useCallback((missionId: string) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, step: 'to_customer' } : m)),
    );
  }, []);

  const completeDelivery = useCallback((missionId: string, code: string, proofPhoto: string): boolean => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return false;
    if (code !== (mission.deliveryCode ?? '')) return false;
    if (!proofPhoto) return false;

    setMissions((prev) =>
      prev.map((m) =>
        m.id === missionId
          ? { ...m, step: 'delivered', deliveredAt: new Date().toISOString(), proofPhoto }
          : m,
      ),
    );
    return true;
  }, [missions]);

  const reportIncident = useCallback((missionId: string, incident: Incident) => {
    setMissions((prev) =>
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

  // Derived driver mission lists
  const driverMissions = missions.filter((m) => m.driverId === 'me' || m.driverId === 'abdou');
  const activeMission = driverMissions.find((m) => m.step !== 'delivered') ?? null;
  const availableMissions = missions.filter(
    (m) => !m.driverId && m.collections.every((c) => c.status === 'ready') && m.step === 'accepted',
  );
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
    verifySellerLogin,
    sellerTransactions,
    driverAvailable,
    setDriverAvailable,
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
