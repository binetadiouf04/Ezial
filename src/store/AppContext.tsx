import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { products as allProducts, type Product } from '@/data/products';

export interface CartItem { productId: string; shopId: string; quantity: number; variants: Record<string, string>; unitPrice?: number; }
export interface SavedItem { productId: string; shopId: string; quantity: number; variants: Record<string, string>; unitPrice?: number; }

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
  id: string;
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
}

const AppContext = createContext<AppState | null>(null);
export function useApp(): AppState { const ctx = useContext(AppContext); if (!ctx) throw new Error('useApp must be used within AppProvider'); return ctx; }

function getInitialRoute(): string { const hash = window.location.hash.replace(/^#/, ''); return hash || '/'; }

export const deliveryZones: DeliveryZone[] = [
  // Zone 1 — central Dakar (2 000 FCFA)
  { id: 'plateau', label: 'Plateau', fee: 2000, eta: '24–48 h' },
  { id: 'medina', label: 'Médina', fee: 2000, eta: '24–48 h' },
  { id: 'gueule-tapee', label: 'Gueule Tapée', fee: 2000, eta: '24–48 h' },
  { id: 'fass', label: 'Fass', fee: 2000, eta: '24–48 h' },
  { id: 'colobane', label: 'Colobane', fee: 2000, eta: '24–48 h' },
  { id: 'hlm', label: 'HLM', fee: 2000, eta: '24–48 h' },
  { id: 'grand-dakar', label: 'Grand Dakar', fee: 2000, eta: '24–48 h' },
  // Zone 2 — mid-distance (2 500 FCFA)
  { id: 'liberte1', label: 'Liberté 1', fee: 2500, eta: '24–48 h' },
  { id: 'liberte2', label: 'Liberté 2', fee: 2500, eta: '24–48 h' },
  { id: 'liberte3', label: 'Liberté 3', fee: 2500, eta: '24–48 h' },
  { id: 'liberte4', label: 'Liberté 4', fee: 2500, eta: '24–48 h' },
  { id: 'liberte5', label: 'Liberté 5', fee: 2500, eta: '24–48 h' },
  { id: 'liberte6', label: 'Liberté 6', fee: 2500, eta: '24–48 h' },
  { id: 'sicap-baobab', label: 'Sicap Baobab', fee: 2500, eta: '24–48 h' },
  { id: 'sicap-amitie', label: 'Sicap Amitié', fee: 2500, eta: '24–48 h' },
  { id: 'pointe', label: 'Point E', fee: 2500, eta: '24–48 h' },
  { id: 'fann', label: 'Fann', fee: 2500, eta: '24–48 h' },
  { id: 'mermoz', label: 'Mermoz', fee: 2500, eta: '24–48 h' },
  { id: 'sacrecoeur1', label: 'Sacré-Cœur 1', fee: 2500, eta: '24–48 h' },
  { id: 'sacrecoeur2', label: 'Sacré-Cœur 2', fee: 2500, eta: '24–48 h' },
  { id: 'sacrecoeur3', label: 'Sacré-Cœur 3', fee: 2500, eta: '24–48 h' },
  { id: 'cite-mixta', label: 'Cité Mixta', fee: 2500, eta: '24–48 h' },
  { id: 'patte-doie', label: "Patte d'Oie", fee: 2500, eta: '24–48 h' },
  // Zone 3 — coastal / further (3 000 FCFA)
  { id: 'ouakam', label: 'Ouakam', fee: 3000, eta: '24–48 h' },
  { id: 'mamelles', label: 'Mamelles', fee: 3000, eta: '24–48 h' },
  { id: 'almadies', label: 'Almadies', fee: 3000, eta: '24–48 h' },
  { id: 'ngor', label: 'Ngor', fee: 3000, eta: '24–48 h' },
  { id: 'yoff', label: 'Yoff', fee: 3000, eta: '24–48 h' },
  { id: 'ouest-foire', label: 'Ouest Foire', fee: 3000, eta: '24–48 h' },
  { id: 'nord-foire', label: 'Nord Foire', fee: 3000, eta: '24–48 h' },
  { id: 'sud-foire', label: 'Sud Foire', fee: 3000, eta: '24–48 h' },
  { id: 'camberene', label: 'Cambérène', fee: 3000, eta: '24–48 h' },
  { id: 'hann-maristes', label: 'Hann Maristes', fee: 3000, eta: '24–48 h' },
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

export function generatePickupCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function generateOrderId(): string {
  return `EZI-${Math.floor(10000 + Math.random() * 90000)}`;
}

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState(getInitialRoute());
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([
    { id: 'addr-1', firstName: 'Bineta', lastName: 'Diouf', phone: '+221 77 123 45 67', quartier: 'Yoff', details: 'Près de la route de l\'aéroport, porte bleue', isDefault: true },
  ]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(defaultCustomerInfo);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: string) => {
    window.location.hash = r; setRoute(r);
    setCategoryDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]);
  }, []);
  const isFavorite = useCallback((productId: string) => favorites.includes(productId), [favorites]);

  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === item.productId && JSON.stringify(i.variants) === JSON.stringify(item.variants));
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity }; return next; }
      return [...prev, item];
    });
    setCartOpen(true);
  }, []);

  const removeFromCart = useCallback((index: number) => setCart((prev) => prev.filter((_, i) => i !== index)), []);

  const updateQuantity = useCallback((index: number, quantity: number) =>
    setCart((prev) => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, quantity) } : item)), []);

  const clearCart = useCallback(() => setCart([]), []);

  const saveForLater = useCallback((index: number) => {
    setCart((prev) => {
      const item = prev[index];
      if (!item) return prev;
      setSavedItems((s) => [...s, { productId: item.productId, shopId: item.shopId, quantity: item.quantity, variants: item.variants }]);
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
        return [...c, { productId: item.productId, shopId: item.shopId, quantity: item.quantity, variants: item.variants }];
      });
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const removeFromSaved = useCallback((index: number) => setSavedItems((prev) => prev.filter((_, i) => i !== index)), []);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cart.reduce((sum, i) => { const p = allProducts.find((p) => p.id === i.productId); return sum + (p ? (i.unitPrice ?? p.price) * i.quantity : 0); }, 0);
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
    route, navigate, favorites, toggleFavorite, isFavorite,
    cart, addToCart, removeFromCart, updateQuantity, clearCart,
    saveForLater, moveToCart, removeFromSaved, savedItems,
    cartCount, cartSubtotal, cartOpen, setCartOpen, categoryDrawerOpen, setCategoryDrawerOpen,
    orders, addOrder,
    addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress,
    customerInfo, updateCustomerInfo,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export type { Product };
