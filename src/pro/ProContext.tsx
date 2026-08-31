import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Role, DeliveryStep } from './data';
import { missions as initialMissions, type Mission, type Product, type Shop, type Driver, type DriverTransaction, type Order, type Transaction } from './data';
import { shops as initialShops, products as initialProducts, transactions as initialTransactions, driverTransactions as initialDriverTransactions, orders as initialOrders, drivers as initialDrivers, formatFCFA } from './data';

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

export interface ProductRefusal {
  productId: string;
  reason: string;
  comment?: string;
  date: string;
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
  reportProblem: (id: string, reason: string, comment: string) => void;
  advanceSubOrder: (orderId: string, shopId: string, fulfillment: 'delivery' | 'pickup') => void;
  getSubOrderStatus: (orderId: string, shopId: string, original: string) => string;
  setProductStatus: (productId: string, status: 'published' | 'changes_requested' | 'inactive') => void;
  productStatusUpdates: Record<string, 'published' | 'changes_requested' | 'inactive'>;
  // Seller product management
  sellerProducts: SellerProduct[];
  addSellerProduct: (product: SellerProduct) => void;
  updateSellerProduct: (id: string, product: SellerProduct) => void;
  deleteSellerProduct: (id: string) => void;
  // Seller shop editing
  sellerShop: Shop | null;
  updateSellerShop: (edit: ShopEdit) => void;
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
  productRefusals: Record<string, ProductRefusal>;
  cancelledOrders: string[];
  refundedOrders: string[];
  resolvedIncidents: string[];
  payoutStatuses: Record<string, 'pending' | 'available' | 'paid'>;
  driverPayoutStatuses: Record<string, 'pending' | 'available' | 'paid'>;
  // Admin actions
  validateProduct: (productId: string) => void;
  refuseProduct: (productId: string, reason: string, comment?: string) => void;
  cancelOrder: (orderId: string) => void;
  refundOrder: (orderId: string) => void;
  resolveIncident: (missionId: string) => void;
  markSellerPaid: (transactionId: string) => void;
  markDriverPaid: (driverId: string) => void;
  createShop: (input: NewShopInput) => Shop;
  createDriver: (input: NewDriverInput) => Driver;
  toggleShopStatus: (shopId: string, status: 'active' | 'suspended') => void;
  toggleDriverStatus: (driverId: string, status: 'active' | 'suspended') => void;
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
  const [productStatusUpdates, setProductStatusUpdates] = useState<Record<string, 'published' | 'changes_requested' | 'inactive'>>({});
  const [orderUpdates, setOrderUpdates] = useState<Record<string, string>>({});
  const [sellerProducts, setSellerProducts] = useState<SellerProduct[]>(initialProducts);
  const [sellerShop, setSellerShop] = useState<Shop | null>(null);
  const [sellerTransactions] = useState(initialTransactions);
  const [driverAvailable, setDriverAvailable] = useState(true);

  // Admin state
  const [allShops, setAllShops] = useState<Shop[]>(initialShops);
  const [allDrivers, setAllDrivers] = useState<Driver[]>(initialDrivers);
  const [productRefusals, setProductRefusals] = useState<Record<string, ProductRefusal>>({});
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

  const reportProblem = useCallback((_id: string, _reason: string, _comment: string) => {
    // Legacy: in a real app this would notify admin
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
  }, []);

  const setProductStatus = useCallback((productId: string, status: 'published' | 'changes_requested' | 'inactive') => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: status }));
  }, []);

  const addSellerProduct = useCallback((product: SellerProduct) => {
    setSellerProducts((prev) => [product, ...prev]);
  }, []);

  const updateSellerProduct = useCallback((id: string, updated: SellerProduct) => {
    setSellerProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const deleteSellerProduct = useCallback((id: string) => {
    setSellerProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateSellerShop = useCallback((edit: ShopEdit) => {
    setSellerShop((prev) => prev ? { ...prev, name: edit.name, description: edit.description, contact: edit.contact, pickupAddress: edit.pickupAddress, banner: edit.banner, logo: edit.logo, pickupEnabled: edit.pickupEnabled, deliveryEnabled: edit.deliveryEnabled } : prev);
  }, []);

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

  const validateProduct = useCallback((productId: string) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'published' }));
  }, []);

  const refuseProduct = useCallback((productId: string, reason: string, comment?: string) => {
    setProductStatusUpdates((prev) => ({ ...prev, [productId]: 'changes_requested' }));
    setProductRefusals((prev) => ({
      ...prev,
      [productId]: { productId, reason, comment, date: new Date().toISOString() },
    }));
  }, []);

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
    const id = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const defaultLogo = 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop';
    const defaultBanner = 'https://images.pexels.com/photos/8743972/pexels-photo-8743972.jpeg?auto=compress&cs=tinysrgb&h=400&w=900';
    const newShop: Shop = {
      id: `shop-${Date.now()}`,
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
  }, []);

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

  const toggleShopStatus = useCallback((shopId: string, status: 'active' | 'suspended') => {
    setAllShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, status } : s)));
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
    reportProblem,
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
    productRefusals,
    cancelledOrders,
    refundedOrders,
    resolvedIncidents,
    payoutStatuses,
    driverPayoutStatuses,
    validateProduct,
    refuseProduct,
    cancelOrder,
    refundOrder,
    resolveIncident,
    markSellerPaid,
    markDriverPaid,
    createShop,
    createDriver,
    toggleShopStatus,
    toggleDriverStatus,
  };

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}
