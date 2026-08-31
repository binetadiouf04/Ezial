export type Role = 'admin' | 'seller' | 'driver';

export type ShopPlan = 'founder' | 'standard';
// active=ACTIVE, pending=nouvelle boutique en attente d'approbation,
// flagged=SIGNALÉE, suspended=SUSPENDUE, inactive=DÉSACTIVÉE
export type ShopStatus = 'active' | 'pending' | 'flagged' | 'suspended' | 'inactive';
// pending=EN ATTENTE, published=ACTIF, flagged=SIGNALÉ,
// changes_requested=REFUSÉ, inactive=DÉSACTIVÉ (draft/out_of_stock are seller-side states)
export type ProductStatus = 'draft' | 'pending' | 'published' | 'flagged' | 'changes_requested' | 'out_of_stock' | 'inactive';
export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'waiting_collection'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'return_requested'
  | 'refunded';
export type DriverStatus = 'available' | 'on_delivery' | 'offline' | 'suspended';
export type PayoutStatus = 'pending' | 'available' | 'paid';
export type FulfillmentType = 'delivery' | 'pickup';
export type DeliveryStep =
  | 'accepted'
  | 'to_collection'
  | 'collected'
  | 'all_collected'
  | 'to_customer'
  | 'arrived'
  | 'delivered';

// ---- Moderation (shops & products) ----
// A ModerationEntry is an immutable log line: it is only ever appended,
// never edited or removed, so the trail is preserved even after a target
// is reactivated. `vendorMessage` is shown to the seller; `internalNote`
// is admin-only and must never reach seller-facing screens.
export type ModerationTargetType = 'shop' | 'product';
export type ModerationAction =
  | 'created'
  | 'validated'
  | 'flagged'
  | 'refused'
  | 'suspended'
  | 'reactivated'
  | 'deactivated';

export const moderationActionLabels: Record<ModerationAction, string> = {
  created: 'Créé',
  validated: 'Validé',
  flagged: 'Signalé',
  refused: 'Refusé',
  suspended: 'Suspendu',
  reactivated: 'Réactivé',
  deactivated: 'Désactivé',
};

export const shopModerationReasons = [
  'Informations incorrectes',
  'Produits non conformes',
  'Contrefaçon suspectée',
  'Problème avec des commandes',
  'Plaintes clients',
  'Non-respect des règles Ezial',
  'Activité suspecte',
  'Autre',
];

export const productModerationReasons = [
  'Mauvaise catégorie',
  'Description incorrecte',
  'Photos non conformes',
  'Prix incohérent',
  'Produit interdit/non autorisé',
  'Contrefaçon suspectée',
  'Informations trompeuses',
  'Rupture/problème de disponibilité',
  'Autre',
];

export interface ModerationEntry {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  action: ModerationAction;
  reason?: string;
  /** Visible to the seller on the shop/product. */
  vendorMessage?: string;
  /** Admin-only — never shown to the seller. */
  internalNote?: string;
  adminName: string;
  date: string; // ISO datetime
}

// ---- Blog ----
export type BlogStatus = 'draft' | 'scheduled' | 'published' | 'unpublished';

export const blogCategories = ['Mode', 'Beauté', 'Cheveux', 'Actualités Ezial', 'Conseils'];

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  category: string;
  excerpt: string;
  content: string;
  sources?: string;
  author: string;
  publishDate: string; // ISO date, may be in the future when scheduled
  updatedDate?: string; // ISO date
  seoTitle?: string;
  metaDescription?: string;
  status: BlogStatus;
}

export interface Shop {
  id: string;
  name: string;
  logo: string;
  banner: string;
  description: string;
  categoryFocus: string;
  contact: string;
  pickupAddress: string;
  pickupEnabled: boolean;
  pickupDelay: '4h' | '24h';
  deliveryEnabled: boolean;
  plan: ShopPlan;
  status: ShopStatus;
  sellerId: string;
  /** 4-digit PIN chosen by the seller, used with `sellerId` to log in. Unset until the seller picks one (e.g. a pending shop not yet activated). Never rendered in clear once set. */
  pin?: string;
  productCount: number;
  orderCount: number;
  followers: number;
  rating: number;
  reviewCount: number;
  joinDate: string;
  weeklyGross: number;
  yearlyNet: number;
}

export interface Product {
  id: string;
  reference: string;
  name: string;
  shopId: string;
  category: string;
  price: number;
  oldPrice?: number;
  image: string;
  stock: number;
  status: ProductStatus;
  variants: { name: string; values: string[] }[];
  description: string;
  submittedDate?: string;
}

export interface SubOrder {
  shopId: string;
  shopName: string;
  status: OrderStatus;
  items: { productId: string; productName: string; quantity: number; variants: Record<string, string> }[];
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  total: number;
  deliveryFee: number;
  status: OrderStatus;
  date: string;
  fulfillment: FulfillmentType;
  subOrders: SubOrder[];
  zone: string;
  slot?: string;
  driverId?: string;
  paymentMethod?: 'wave' | 'orange_money';
}

export interface Driver {
  id: string;
  name: string;
  identifier: string;
  phone: string;
  status: DriverStatus;
  todayMissions: number;
  completedToday: number;
  weeklyDeliveries: number;
  weeklyEarnings: number;
  yearlyEarnings: number;
  joinDate: string;
}

export interface Mission {
  id: string;
  orderId: string;
  driverId?: string;
  collections: { shopId: string; shopName: string; area: string; address: string; status: OrderStatus; collected: boolean; collectedAt?: string; parcelCount: number }[];
  destination: string;
  destinationAddress?: string;
  slot: string;
  distance: string;
  step: DeliveryStep;
  earnings: number;
  customerName: string;
  customerPhone: string;
  date: string;
  deliveryCode?: string;
  proofPhoto?: string;
  deliveredAt?: string;
  incident?: { phase: 'collection' | 'delivery'; shopId?: string; reason: string; comment?: string; reportedAt: string };
}

export interface Transaction {
  id: string;
  orderId: string;
  shopName: string;
  gross: number;
  commission: number;
  net: number;
  date: string;
  payout: PayoutStatus;
}

export interface DriverTransaction {
  id: string;
  missionId: string;
  date: string;
  status: 'delivered' | 'failed' | 'cancelled';
  earnings: number;
  zones: string;
}

export interface Campaign {
  id: string;
  shopName: string;
  type: string;
  platform: 'Meta' | 'Google' | 'TikTok' | 'YouTube';
  budget: number;
  status: 'active' | 'paused' | 'ended';
  startDate: string;
  endDate: string;
}

export interface CollectiveCampaign {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'scheduled' | 'ended';
  products: number;
  shops: number;
  startDate: string;
}

// ---- Mock shops ----
const SHOP_IMG = {
  fatou: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop',
  beauty: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop',
  naya: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop',
  senteur: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop',
  hair: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=300&w=300&fit=crop',
};
const SHOP_BANNER = {
  fatou: 'https://images.pexels.com/photos/8743972/pexels-photo-8743972.jpeg?auto=compress&cs=tinysrgb&h=400&w=900',
  beauty: 'https://images.pexels.com/photos/27781696/pexels-photo-27781696.jpeg?auto=compress&cs=tinysrgb&h=400&w=900',
  naya: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=400&w=900',
  senteur: 'https://images.pexels.com/photos/30405427/pexels-photo-30405427.jpeg?auto=compress&cs=tinysrgb&h=400&w=900',
  hair: 'https://images.pexels.com/photos/13734819/pexels-photo-13734819.jpeg?auto=compress&cs=tinysrgb&h=400&w=900',
};

export const shops: Shop[] = [
  {
    id: 'maison-fatou', name: 'Maison Fatou', logo: SHOP_IMG.fatou, banner: SHOP_BANNER.fatou,
    description: 'Mode féminine contemporaine & essentiels africains.', categoryFocus: 'Vêtements',
    contact: '+221 77 123 45 67', pickupAddress: '15 rue Exemple, Plateau, Dakar',
    pickupEnabled: true, pickupDelay: '24h', deliveryEnabled: true, plan: 'founder', status: 'active',
    sellerId: 'MAISONFATOU4827', pin: '1234', productCount: 22, orderCount: 148, followers: 12480, rating: 4.8, reviewCount: 312,
    joinDate: '2026-01-15', weeklyGross: 200000, yearlyNet: 2450000,
  },
  {
    id: 'dakar-beauty', name: 'Dakar Beauty', logo: SHOP_IMG.beauty, banner: SHOP_BANNER.beauty,
    description: 'Skincare, maquillage & parfums pour peaux métissées et noires.', categoryFocus: 'Beauté',
    contact: '+221 77 234 56 78', pickupAddress: '42 Rue KA, Mermoz, Dakar',
    pickupEnabled: false, pickupDelay: '24h', deliveryEnabled: true, plan: 'founder', status: 'active',
    sellerId: 'DAKARBEAUTY3816', pin: '2345', productCount: 18, orderCount: 207, followers: 8900, rating: 4.9, reviewCount: 428,
    joinDate: '2026-01-20', weeklyGross: 175000, yearlyNet: 1980000,
  },
  {
    id: 'atelier-naya', name: 'Atelier Naya', logo: SHOP_IMG.naya, banner: SHOP_BANNER.naya,
    description: 'Maroquinerie structurée & sacs d\'atelier. Cuir véritable.', categoryFocus: 'Sacs & Maroquinerie',
    contact: '+221 77 345 67 89', pickupAddress: '8 Rue NG, Almadies, Dakar',
    pickupEnabled: true, pickupDelay: '4h', deliveryEnabled: true, plan: 'standard', status: 'active',
    sellerId: 'ATELIERNAYA5723', pin: '3456', productCount: 14, orderCount: 89, followers: 5630, rating: 4.7, reviewCount: 156,
    joinDate: '2026-02-10', weeklyGross: 120000, yearlyNet: 1320000,
  },
  {
    id: 'maison-senteur', name: 'Maison Senteur', logo: SHOP_IMG.senteur, banner: SHOP_BANNER.senteur,
    description: 'Parfums, brumes & encens. Senteurs qui voyagent.', categoryFocus: 'Parfums & Senteurs',
    contact: '+221 77 456 78 90', pickupAddress: '25 Rue LM, Plateau, Dakar',
    pickupEnabled: false, pickupDelay: '24h', deliveryEnabled: true, plan: 'standard', status: 'active',
    sellerId: 'MAISONSENTEUR1947', pin: '4567', productCount: 12, orderCount: 64, followers: 4210, rating: 4.8, reviewCount: 198,
    joinDate: '2026-03-01', weeklyGross: 85000, yearlyNet: 920000,
  },
  {
    id: 'hair-studio-dakar', name: 'Hair Studio Dakar', logo: SHOP_IMG.hair, banner: SHOP_BANNER.hair,
    description: 'Perruques premium, mèches & Blend Hair. Qualité salon.', categoryFocus: 'Cheveux',
    contact: '+221 77 567 89 01', pickupAddress: '10 Rue HI, Yoff, Dakar',
    pickupEnabled: true, pickupDelay: '24h', deliveryEnabled: true, plan: 'founder', status: 'active',
    sellerId: 'HAIRSTUDIO2641', pin: '5678', productCount: 16, orderCount: 112, followers: 9870, rating: 4.6, reviewCount: 267,
    joinDate: '2026-01-28', weeklyGross: 160000, yearlyNet: 1750000,
  },
  {
    id: 'boutique-nour', name: 'Boutique Nour', logo: SHOP_IMG.fatou, banner: SHOP_BANNER.fatou,
    description: 'Mode modeste & accessoires élégants.', categoryFocus: 'Vêtements',
    contact: '+221 77 678 90 12', pickupAddress: '3 Rue OP, Parcelles, Dakar',
    pickupEnabled: false, pickupDelay: '24h', deliveryEnabled: true, plan: 'standard', status: 'pending',
    sellerId: 'BOUTIQUENOUR8351', productCount: 0, orderCount: 0, followers: 0, rating: 0, reviewCount: 0,
    joinDate: '2026-08-20', weeklyGross: 0, yearlyNet: 0,
  },
];

export const shopMap = shops.reduce((acc, s) => ({ ...acc, [s.id]: s }), {} as Record<string, Shop>);
export const getShop = (id: string) => shopMap[id];

// ---- Mock products ----
const P_IMG = {
  dress: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  bag: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  shoe: 'https://images.pexels.com/photos/31450733/pexels-photo-31450733.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  serum: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  perfume: 'https://images.pexels.com/photos/7364096/pexels-photo-7364096.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  hair: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  jewelry: 'https://images.pexels.com/photos/8165653/pexels-photo-8165653.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
  makeup: 'https://images.pexels.com/photos/7256145/pexels-photo-7256145.jpeg?auto=compress&cs=tinysrgb&h=400&w=400&fit=crop',
};

export const products: Product[] = [
  { id: 'p1', reference: 'EZ-MAI-0001', name: 'Robe longue satinée - Bordeaux', shopId: 'maison-fatou', category: 'Vêtements', price: 29900, oldPrice: 35000, image: P_IMG.dress, stock: 6, status: 'published', variants: [{ name: 'Couleur', values: ['Noir', 'Bordeaux', 'Ivoire'] }, { name: 'Taille', values: ['S', 'M', 'L', 'XL'] }], description: 'Robe longue en satin fluide, coupe drapée.' },
  { id: 'p2', reference: 'EZ-MAI-0002', name: 'Ensemble femme moderne', shopId: 'maison-fatou', category: 'Vêtements', price: 35000, image: P_IMG.dress, stock: 4, status: 'published', variants: [{ name: 'Couleur', values: ['Terracotta', 'Noir'] }, { name: 'Taille', values: ['S', 'M', 'L'] }], description: 'Ensemble deux pièces, top fluide et pantalon taille haute.' },
  { id: 'p3', reference: 'EZ-ATE-0001', name: 'Sac à main structuré', shopId: 'atelier-naya', category: 'Sacs & Maroquinerie', price: 24900, image: P_IMG.bag, stock: 8, status: 'published', variants: [{ name: 'Couleur', values: ['Camel', 'Noir', 'Cognac'] }], description: 'Sac structuré en cuir véritable, format moyen.' },
  { id: 'p4', reference: 'EZ-DAK-0001', name: 'Sérum hydratant visage', shopId: 'dakar-beauty', category: 'Beauté', price: 12500, image: P_IMG.serum, stock: 14, status: 'published', variants: [{ name: 'Contenance', values: ['30 ml', '50 ml'] }], description: 'Acide hyaluronique + vitamine E.' },
  { id: 'p5', reference: 'EZ-HAI-0001', name: 'Perruque Body Wave 22"', shopId: 'hair-studio-dakar', category: 'Cheveux', price: 85000, oldPrice: 95000, image: P_IMG.hair, stock: 4, status: 'published', variants: [{ name: 'Texture', values: ['Body Wave', 'Straight'] }, { name: 'Longueur', values: ['18"', '20"', '22"'] }, { name: 'Densité', values: ['150%', '180%', '200%'] }], description: 'Lace frontale, cheveux 100% naturels.' },
  { id: 'p6', reference: 'EZ-AIS-0001', name: 'Parfum femme 100ml', shopId: 'maison-senteur', category: 'Parfums & Senteurs', price: 32000, image: P_IMG.perfume, stock: 11, status: 'published', variants: [{ name: 'Volume', values: ['30ml', '50ml', '100ml'] }], description: 'Sillage floral chaleureux.' },
  { id: 'p7', reference: 'EZ-ATE-0002', name: 'Bracelet doré minimal', shopId: 'atelier-naya', category: 'Bijoux & Accessoires', price: 15000, oldPrice: 18000, image: P_IMG.jewelry, stock: 12, status: 'published', variants: [{ name: 'Finition', values: ['Doré', 'Argenté'] }], description: 'Bracelet fin plaqué or.' },
  { id: 'p8', reference: 'EZ-MAI-0003', name: 'Escarpins talons hauts', shopId: 'maison-fatou', category: 'Chaussures', price: 21000, image: P_IMG.shoe, stock: 3, status: 'published', variants: [{ name: 'Couleur', values: ['Nude', 'Noir'] }, { name: 'Taille', values: ['36', '37', '38', '39', '40'] }], description: 'Escarpins élégants, talon 8 cm.' },
  { id: 'p9', reference: 'EZ-DAK-0002', name: 'Palette maquillage nude', shopId: 'dakar-beauty', category: 'Beauté', price: 19500, image: P_IMG.makeup, stock: 7, status: 'pending', submittedDate: '2026-08-24', variants: [{ name: 'Teinte', values: ['Nude', 'Warm', 'Deep'] }], description: 'Palette 12 teintes, finis mats et satinés.' },
  { id: 'p10', reference: 'EZ-AIS-0002', name: 'Brume parfumée fleur de tiaré', shopId: 'maison-senteur', category: 'Parfums & Senteurs', price: 9500, image: P_IMG.perfume, stock: 18, status: 'pending', submittedDate: '2026-08-25', variants: [{ name: 'Volume', values: ['100ml'] }], description: 'Brume légère fleur de tiaré.' },
  { id: 'p11', reference: 'EZ-ATE-0003', name: 'Sandales en cuir minimales', shopId: 'atelier-naya', category: 'Chaussures', price: 16500, image: P_IMG.shoe, stock: 2, status: 'published', variants: [{ name: 'Couleur', values: ['Camel', 'Noir'] }, { name: 'Taille', values: ['36', '37', '38', '39'] }], description: 'Sandales fines en cuir.' },
  { id: 'p12', reference: 'EZ-DAK-0003', name: 'Crème anti-imperfections', shopId: 'dakar-beauty', category: 'Beauté', price: 14000, image: P_IMG.serum, stock: 0, status: 'out_of_stock', variants: [{ name: 'Contenance', values: ['40 ml'] }], description: 'Niacinamide, cible les imperfections.' },
  { id: 'p13', reference: 'EZ-ATE-0004', name: 'Collier plaqué or', shopId: 'atelier-naya', category: 'Bijoux & Accessoires', price: 22000, image: P_IMG.jewelry, stock: 6, status: 'changes_requested', submittedDate: '2026-08-22', variants: [{ name: 'Longueur', values: ['40 cm', '45 cm'] }], description: 'Collier fin plaqué or 18k.' },
  { id: 'p14', reference: 'EZ-HAI-0002', name: 'Mèches naturelles pré-tressées', shopId: 'hair-studio-dakar', category: 'Cheveux', price: 32000, image: P_IMG.hair, stock: 15, status: 'draft', variants: [{ name: 'Longueur', values: ['24"', '28"', '32"'] }], description: 'Mèches pré-tressées prêtes à poser.' },
  { id: 'p15', reference: 'EZ-AIS-0003', name: 'Encens oud premium', shopId: 'maison-senteur', category: 'Parfums & Senteurs', price: 7500, image: P_IMG.perfume, stock: 0, status: 'published', variants: [{ name: 'Quantité', values: ['50g', '100g'] }], description: 'Encens naturel au oud.' },
];

export const productMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Product>);
export const getProduct = (id: string) => productMap[id];
export const productsByShop = (shopId: string) => products.filter((p) => p.shopId === shopId);

// ---- Mock orders ----
export const orders: Order[] = [
  {
    id: 'EZI-10482', customerName: 'Awa Ndiaye', customerPhone: '+221 77 111 22 33',
    total: 72000, deliveryFee: 3500, status: 'preparing', date: '2026-08-26T10:30:00',
    fulfillment: 'delivery', zone: 'Yoff', slot: '15h–18h', paymentMethod: 'wave',
    subOrders: [
      { shopId: 'maison-fatou', shopName: 'Maison Fatou', status: 'ready', items: [{ productId: 'p1', productName: 'Robe longue satinée - Bordeaux', quantity: 1, variants: { Couleur: 'Bordeaux', Taille: 'M' } }] },
      { shopId: 'dakar-beauty', shopName: 'Dakar Beauty', status: 'preparing', items: [{ productId: 'p4', productName: 'Sérum hydratant visage', quantity: 2, variants: { Contenance: '50 ml' } }] },
      { shopId: 'hair-studio-dakar', shopName: 'Hair Studio Dakar', status: 'ready', items: [{ productId: 'p5', productName: 'Perruque Body Wave 22"', quantity: 1, variants: { Texture: 'Body Wave', Longueur: '22"', Densité: '180%' } }] },
    ],
  },
  {
    id: 'EZI-10483', customerName: 'Mamadou Sy', customerPhone: '+221 77 222 33 44',
    total: 45000, deliveryFee: 2500, status: 'confirmed', date: '2026-08-26T11:15:00',
    fulfillment: 'delivery', zone: 'Plateau', slot: '12h–15h', paymentMethod: 'orange_money',
    subOrders: [
      { shopId: 'maison-fatou', shopName: 'Maison Fatou', status: 'confirmed', items: [{ productId: 'p2', productName: 'Ensemble femme moderne', quantity: 1, variants: { Couleur: 'Terracotta', Taille: 'L' } }] },
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', status: 'confirmed', items: [{ productId: 'p3', productName: 'Sac à main structuré', quantity: 1, variants: { Couleur: 'Camel' } }] },
    ],
  },
  {
    id: 'EZI-10484', customerName: 'Fatou Diop', customerPhone: '+221 77 333 44 55',
    total: 15000, deliveryFee: 0, status: 'ready', date: '2026-08-26T09:00:00',
    fulfillment: 'pickup', zone: 'Almadies', paymentMethod: 'wave',
    subOrders: [
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', status: 'waiting_collection', items: [{ productId: 'p7', productName: 'Bracelet doré minimal', quantity: 1, variants: { Finition: 'Doré' } }] },
    ],
  },
  {
    id: 'EZI-10485', customerName: 'Cheikh Fall', customerPhone: '+221 77 444 55 66',
    total: 53000, deliveryFee: 3000, status: 'out_for_delivery', date: '2026-08-26T08:00:00',
    fulfillment: 'delivery', zone: 'Parcelles', slot: '09h–12h', driverId: 'abdou', paymentMethod: 'orange_money',
    subOrders: [
      { shopId: 'maison-senteur', shopName: 'Maison Senteur', status: 'out_for_delivery', items: [{ productId: 'p6', productName: 'Parfum femme 100ml', quantity: 1, variants: { Volume: '100ml' } }] },
      { shopId: 'dakar-beauty', shopName: 'Dakar Beauty', status: 'out_for_delivery', items: [{ productId: 'p4', productName: 'Sérum hydratant visage', quantity: 1, variants: { Contenance: '50 ml' } }] },
    ],
  },
  {
    id: 'EZI-10486', customerName: 'Aïcha Mbaye', customerPhone: '+221 77 555 66 77',
    total: 32000, deliveryFee: 2500, status: 'confirmed', date: '2026-08-26T12:00:00',
    fulfillment: 'delivery', zone: 'Médina', slot: '15h–18h', paymentMethod: 'wave',
    subOrders: [
      { shopId: 'maison-senteur', shopName: 'Maison Senteur', status: 'confirmed', items: [{ productId: 'p6', productName: 'Parfum femme 100ml', quantity: 1, variants: { Volume: '50ml' } }] },
    ],
  },
  {
    id: 'EZI-10480', customerName: 'Khady Sow', customerPhone: '+221 77 666 77 88',
    total: 85000, deliveryFee: 3500, status: 'delivered', date: '2026-08-25T14:00:00',
    fulfillment: 'delivery', zone: 'Almadies', slot: '15h–18h', driverId: 'abdou', paymentMethod: 'wave',
    subOrders: [
      { shopId: 'hair-studio-dakar', shopName: 'Hair Studio Dakar', status: 'delivered', items: [{ productId: 'p5', productName: 'Perruque Body Wave 22"', quantity: 1, variants: { Texture: 'Body Wave', Longueur: '20"', Densité: '150%' } }] },
    ],
  },
  {
    id: 'EZI-10478', customerName: 'Ousmane Diallo', customerPhone: '+221 77 777 88 99',
    total: 24900, deliveryFee: 0, status: 'delivered', date: '2026-08-25T10:00:00',
    fulfillment: 'pickup', zone: 'Almadies', paymentMethod: 'orange_money',
    subOrders: [
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', status: 'delivered', items: [{ productId: 'p3', productName: 'Sac à main structuré', quantity: 1, variants: { Couleur: 'Noir' } }] },
    ],
  },
  {
    id: 'EZI-10475', customerName: 'Ndeye Kane', customerPhone: '+221 77 888 99 00',
    total: 18000, deliveryFee: 3000, status: 'return_requested', date: '2026-08-24T16:00:00',
    fulfillment: 'delivery', zone: 'Pikine', paymentMethod: 'wave',
    subOrders: [
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', status: 'return_requested', items: [{ productId: 'p7', productName: 'Bracelet doré minimal', quantity: 1, variants: { Finition: 'Argenté' } }] },
    ],
  },
];

export const orderMap = orders.reduce((acc, o) => ({ ...acc, [o.id]: o }), {} as Record<string, Order>);
export const getOrder = (id: string) => orderMap[id];

// ---- Mock drivers ----
export const drivers: Driver[] = [
  { id: 'abdou', name: 'Abdou', identifier: 'ABDOU7314', phone: '+221 77 200 11 22', status: 'on_delivery', todayMissions: 2, completedToday: 1, weeklyDeliveries: 14, weeklyEarnings: 47250, yearlyEarnings: 472500, joinDate: '2026-02-01' },
  { id: 'cheikh', name: 'Cheikh', identifier: 'CHEIKH2948', phone: '+221 77 200 33 44', status: 'available', todayMissions: 0, completedToday: 0, weeklyDeliveries: 11, weeklyEarnings: 37800, yearlyEarnings: 378000, joinDate: '2026-02-15' },
  { id: 'moussa', name: 'Moussa', identifier: 'MOUSSA5821', phone: '+221 77 200 55 66', status: 'offline', todayMissions: 0, completedToday: 0, weeklyDeliveries: 9, weeklyEarnings: 29700, yearlyEarnings: 297000, joinDate: '2026-03-10' },
  { id: 'fatou', name: 'Fatou', identifier: 'FATOU4107', phone: '+221 77 200 77 88', status: 'available', todayMissions: 0, completedToday: 0, weeklyDeliveries: 16, weeklyEarnings: 54000, yearlyEarnings: 540000, joinDate: '2026-01-25' },
];

export const driverMap = drivers.reduce((acc, d) => ({ ...acc, [d.id]: d }), {} as Record<string, Driver>);
export const getDriver = (id: string) => driverMap[id];

// ---- Mock missions ----
export const missions: Mission[] = [
  // Abdou's current active mission — en route vers le client
  {
    id: 'EZI-2048', orderId: 'EZI-10485', driverId: 'abdou',
    collections: [
      { shopId: 'maison-senteur', shopName: 'Maison Senteur', area: 'Plateau', address: '25 Rue LM, Plateau, Dakar', status: 'ready', collected: true, collectedAt: '2026-08-27T08:15:00', parcelCount: 1 },
      { shopId: 'dakar-beauty', shopName: 'Dakar Beauty', area: 'Mermoz', address: '42 Rue KA, Mermoz, Dakar', status: 'ready', collected: true, collectedAt: '2026-08-27T08:35:00', parcelCount: 1 },
    ],
    destination: 'Parcelles', destinationAddress: 'Sacré-Cœur 3, Parcelles Assainies, Dakar',
    slot: '09h–12h', distance: '12 km', step: 'to_customer',
    earnings: 2700, customerName: 'Cheikh Fall', customerPhone: '+221 77 444 55 66', date: '2026-08-27T08:00:00',
    deliveryCode: '4821',
  },
  // Available multi-shop mission — all portions ready (EZI-10482 with 2 shops per spec)
  {
    id: 'EZI-2049', orderId: 'EZI-10482', driverId: undefined,
    collections: [
      { shopId: 'maison-fatou', shopName: 'Maison Fatou', area: 'Sicap Liberté', address: 'Sicap Liberté 6, Dakar', status: 'ready', collected: false, parcelCount: 1 },
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', area: 'Almadies', address: '8 Rue NG, Almadies, Dakar', status: 'ready', collected: false, parcelCount: 1 },
    ],
    destination: 'Sacré-Cœur 3', destinationAddress: 'Sacré-Cœur 3, Yoff, Dakar',
    slot: '15h–18h', distance: '18 km', step: 'accepted',
    earnings: 3150, customerName: 'Awa Ndiaye', customerPhone: '+221 77 111 22 33', date: '2026-08-27T10:30:00',
    deliveryCode: '2074',
  },
  // Available single-shop mission
  {
    id: 'EZI-2051', orderId: 'EZI-10486', driverId: undefined,
    collections: [
      { shopId: 'maison-senteur', shopName: 'Maison Senteur', area: 'Plateau', address: '25 Rue LM, Plateau, Dakar', status: 'ready', collected: false, parcelCount: 1 },
    ],
    destination: 'Médina', destinationAddress: 'Rue 10 x Corniche, Médina, Dakar',
    slot: '15h–18h', distance: '6 km', step: 'accepted',
    earnings: 2250, customerName: 'Aïcha Mbaye', customerPhone: '+221 77 555 66 77', date: '2026-08-27T12:00:00',
    deliveryCode: '6158',
  },
  // Not yet available — seller portion still preparing
  {
    id: 'EZI-2050', orderId: 'EZI-10483', driverId: undefined,
    collections: [
      { shopId: 'maison-fatou', shopName: 'Maison Fatou', area: 'Sicap Liberté', address: 'Sicap Liberté 6, Dakar', status: 'preparing', collected: false, parcelCount: 1 },
      { shopId: 'atelier-naya', shopName: 'Atelier Naya', area: 'Almadies', address: '8 Rue NG, Almadies, Dakar', status: 'ready', collected: false, parcelCount: 1 },
    ],
    destination: 'Plateau', destinationAddress: 'Rue 12, Plateau, Dakar',
    slot: '12h–15h', distance: '8 km', step: 'accepted',
    earnings: 2250, customerName: 'Mamadou Sy', customerPhone: '+221 77 222 33 44', date: '2026-08-27T11:15:00',
    deliveryCode: '3391',
  },
  // Completed delivery by Abdou
  {
    id: 'EZI-2045', orderId: 'EZI-10480', driverId: 'abdou',
    collections: [
      { shopId: 'hair-studio-dakar', shopName: 'Hair Studio Dakar', area: 'Yoff', address: '10 Rue HI, Yoff, Dakar', status: 'delivered', collected: true, collectedAt: '2026-08-26T13:30:00', parcelCount: 1 },
    ],
    destination: 'Almadies', destinationAddress: 'Zone 10, Almadies, Dakar',
    slot: '15h–18h', distance: '5 km', step: 'delivered',
    earnings: 3150, customerName: 'Khady Sow', customerPhone: '+221 77 666 77 88', date: '2026-08-26T14:00:00',
    deliveredAt: '2026-08-26T15:45:00', proofPhoto: 'mock-proof-1',
  },
];

export const missionMap = missions.reduce((acc, m) => ({ ...acc, [m.id]: m }), {} as Record<string, Mission>);

// ---- Mock transactions (seller finance) ----
export const transactions: Transaction[] = [
  { id: 't1', orderId: 'EZI-10480', shopName: 'Hair Studio Dakar', gross: 85000, commission: 6800, net: 78200, date: '2026-08-25', payout: 'available' },
  { id: 't2', orderId: 'EZI-10478', shopName: 'Atelier Naya', gross: 24900, commission: 1992, net: 22908, date: '2026-08-25', payout: 'available' },
  { id: 't3', orderId: 'EZI-10482', shopName: 'Maison Fatou', gross: 29900, commission: 2392, net: 27508, date: '2026-08-26', payout: 'pending' },
  { id: 't4', orderId: 'EZI-10483', shopName: 'Maison Fatou', gross: 35000, commission: 2800, net: 32200, date: '2026-08-26', payout: 'pending' },
  { id: 't5', orderId: 'EZI-10485', shopName: 'Maison Senteur', gross: 32000, commission: 2560, net: 29440, date: '2026-08-26', payout: 'pending' },
  { id: 't6', orderId: 'EZI-10471', shopName: 'Dakar Beauty', gross: 12500, commission: 1000, net: 11500, date: '2026-08-24', payout: 'paid' },
];

export const driverTransactions: DriverTransaction[] = [
  { id: 'dt1', missionId: 'EZI-2045', date: '2026-08-26', status: 'delivered', earnings: 3150, zones: 'Plateau → Almadies' },
  { id: 'dt2', missionId: 'EZI-2046', date: '2026-08-25', status: 'delivered', earnings: 3600, zones: 'Mermoz → Yoff' },
  { id: 'dt3', missionId: 'EZI-2047', date: '2026-08-25', status: 'delivered', earnings: 2250, zones: 'Plateau → Médina' },
  { id: 'dt4', missionId: 'EZI-2044', date: '2026-08-24', status: 'delivered', earnings: 2700, zones: 'Almadies → Parcelles' },
  { id: 'dt5', missionId: 'EZI-2043', date: '2026-08-24', status: 'failed', earnings: 0, zones: 'Plateau → Pikine' },
  { id: 'dt6', missionId: 'EZI-2042', date: '2026-08-23', status: 'delivered', earnings: 3150, zones: 'Mermoz → Almadies' },
];

// ---- Mock campaigns ----
export const collectiveCampaigns: CollectiveCampaign[] = [
  { id: 'c1', name: 'Tendances de la semaine', type: 'Sélection produits', status: 'active', products: 12, shops: 4, startDate: '2026-08-20' },
  { id: 'c2', name: 'Sélection Beauté', type: 'Catégorie', status: 'active', products: 8, shops: 2, startDate: '2026-08-18' },
  { id: 'c3', name: 'Sélection Korité', type: 'Saisonnière', status: 'scheduled', products: 0, shops: 0, startDate: '2026-09-01' },
  { id: 'c4', name: 'Nouveautés', type: 'Sélection produits', status: 'active', products: 5, shops: 3, startDate: '2026-08-22' },
];

export const shopCampaigns: Campaign[] = [
  { id: 'sc1', shopName: 'Maison Fatou', type: 'Boost produits', platform: 'Meta', budget: 50000, status: 'active', startDate: '2026-08-20', endDate: '2026-09-20' },
  { id: 'sc2', shopName: 'Dakar Beauty', type: 'Boost boutique', platform: 'TikTok', budget: 35000, status: 'active', startDate: '2026-08-22', endDate: '2026-09-22' },
  { id: 'sc3', shopName: 'Hair Studio Dakar', type: 'Boost produits', platform: 'Google', budget: 25000, status: 'paused', startDate: '2026-08-15', endDate: '2026-08-30' },
];

// ---- Mock moderation history ----
export const moderationHistory: ModerationEntry[] = [
  {
    id: 'mh1', targetType: 'product', targetId: 'p8', action: 'deactivated',
    reason: 'Photos non conformes',
    vendorMessage: 'Merci de remplacer les deux premières photos par des photos montrant clairement le produit.',
    internalNote: 'Photos trop sombres, difficile de juger la qualité réelle du produit.',
    adminName: 'Admin EZIAL', date: '2026-08-30T11:20:00',
  },
  {
    id: 'mh2', targetType: 'product', targetId: 'p8', action: 'reactivated',
    adminName: 'Admin EZIAL', date: '2026-08-31T09:05:00',
  },
  {
    id: 'mh3', targetType: 'product', targetId: 'p13', action: 'refused',
    reason: 'Description incorrecte',
    vendorMessage: 'La description ne précise pas le grammage exact du plaqué or. Merci de préciser avant nouvelle soumission.',
    adminName: 'Admin EZIAL', date: '2026-08-23T14:40:00',
  },
  {
    id: 'mh4', targetType: 'shop', targetId: 'atelier-naya', action: 'flagged',
    reason: 'Plaintes clients',
    internalNote: '2 clientes signalent un délai de préparation anormalement long cette semaine.',
    adminName: 'Admin EZIAL', date: '2026-08-28T16:10:00',
  },
  {
    id: 'mh5', targetType: 'shop', targetId: 'atelier-naya', action: 'reactivated',
    vendorMessage: 'Merci pour votre réactivité, situation résolue.',
    adminName: 'Admin EZIAL', date: '2026-08-29T10:00:00',
  },
];

// ---- Mock blog posts ----
export const blogPosts: BlogPost[] = [
  {
    id: 'b1',
    title: 'Comment bien choisir sa perruque lace',
    slug: 'comment-bien-choisir-sa-perruque-lace',
    coverImage: 'https://images.pexels.com/photos/6923241/pexels-photo-6923241.jpeg?auto=compress&cs=tinysrgb&h=700&w=1200',
    category: 'Cheveux',
    excerpt: 'Texture, densité, matière : les critères essentiels pour un rendu naturel et durable.',
    content: 'Choisir une perruque lace ne se résume pas à la couleur. La texture doit correspondre à vos cheveux naturels si vous voulez un effet indétectable, la densité change complètement le volume perçu, et la matière (cheveux naturels, Raw Hair, Romance...) détermine la durée de vie et l\'entretien. Dans cet article, on décortique chaque critère pour vous aider à choisir sereinement sur Ezial.',
    sources: 'Entretiens avec les vendeuses Hair Studio Dakar, guide interne Ezial.',
    author: 'Équipe Ezial',
    publishDate: '2026-08-18',
    updatedDate: '2026-08-20',
    seoTitle: 'Comment choisir sa perruque lace | Guide Ezial',
    metaDescription: 'Le guide complet pour choisir la perruque lace idéale : texture, densité, matière et entretien.',
    status: 'published',
  },
  {
    id: 'b2',
    title: '5 essentiels beauté pour la saison sèche',
    slug: '5-essentiels-beaute-saison-seche',
    coverImage: 'https://images.pexels.com/photos/8101511/pexels-photo-8101511.jpeg?auto=compress&cs=tinysrgb&h=700&w=1200',
    category: 'Beauté',
    excerpt: 'Sérum, crème riche, brume hydratante : la routine qui sauve votre peau pendant l\'harmattan.',
    content: 'La saison sèche met la peau à rude épreuve. Voici 5 produits disponibles sur Ezial pour garder une peau souple et éclatante : un sérum à l\'acide hyaluronique, une crème riche en fin de routine, une brume hydratante à réappliquer dans la journée, un baume à lèvres nourrissant et une huile corporelle pour sceller l\'hydratation.',
    author: 'Équipe Ezial',
    publishDate: '2026-08-10',
    status: 'published',
  },
  {
    id: 'b3',
    title: 'Tendances mode Korité 2026',
    slug: 'tendances-mode-korite-2026',
    coverImage: 'https://images.pexels.com/photos/38277759/pexels-photo-38277759.jpeg?auto=compress&cs=tinysrgb&h=700&w=1200',
    category: 'Mode',
    excerpt: 'Wax revisité, coupes corporate et ensembles modestes : ce qui se portera pour la Korité.',
    content: 'Cette année, nos boutiques partenaires misent sur un wax revisité aux coupes modernes, des ensembles corporate pour les femmes actives et des tenues modestes travaillées dans des matières nobles. Tour d\'horizon des pièces à shopper avant la fête.',
    author: 'Équipe Ezial',
    publishDate: '2026-09-05',
    seoTitle: 'Tendances mode Korité 2026 | Ezial',
    metaDescription: 'Les tendances mode à shopper pour la Korité 2026 sur Ezial : wax, corporate et modeste.',
    status: 'scheduled',
  },
  {
    id: 'b4',
    title: 'Portrait : Maison Fatou, l\'atelier qui monte',
    slug: 'portrait-maison-fatou',
    coverImage: 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=700&w=1200',
    category: 'Actualités Ezial',
    excerpt: 'Rencontre avec la boutique qui a conquis des milliers de clientes sur Ezial.',
    content: 'Brouillon — interview à finaliser avec la fondatrice de Maison Fatou.',
    author: 'Équipe Ezial',
    publishDate: '2026-09-15',
    status: 'draft',
  },
  {
    id: 'b5',
    title: 'Offre de lancement Ezial — bilan',
    slug: 'offre-de-lancement-ezial-bilan',
    coverImage: 'https://images.pexels.com/photos/7953286/pexels-photo-7953286.jpeg?auto=compress&cs=tinysrgb&h=700&w=1200',
    category: 'Actualités Ezial',
    excerpt: 'Retour sur notre première campagne de lancement à Dakar.',
    content: 'Article retiré car l\'offre promotionnelle qu\'il décrivait n\'est plus disponible.',
    author: 'Équipe Ezial',
    publishDate: '2026-07-01',
    updatedDate: '2026-08-05',
    status: 'unpublished',
  },
];

export const blogPostMap = blogPosts.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, BlogPost>);
export const getBlogPost = (id: string) => blogPostMap[id];

// ---- Admin summary data ----
export const adminSummary = {
  ordersToday: 12,
  ordersPreparing: 3,
  ordersReady: 2,
  deliveriesInProgress: 1,
  activeShops: 5,
  activeProducts: 68,
  openReturns: 1,
};

export const adminActions = [
  { label: '3 nouvelles boutiques à valider', href: '/admin/boutiques', priority: 'high' },
  { label: '5 produits en attente de validation', href: '/admin/produits', priority: 'high' },
  { label: '2 commandes bloquées', href: '/admin/commandes', priority: 'medium' },
  { label: '4 retours à examiner', href: '/admin/retours', priority: 'medium' },
  { label: '3 livreurs actuellement en mission', href: '/admin/livreurs', priority: 'low' },
];

// ---- Finance summary ----
export const adminFinance = {
  gmv: 18500000,
  totalCommissions: 1480000,
  sellerBalances: 4250000,
  sellerPayouts: 3200000,
  driverPayments: 890000,
  refunds: 45000,
  subscriptionRevenue: 120000,
  adRevenue: 110000,
};

// ---- Helpers ----
export function formatFCFA(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function commissionAmount(gross: number): number {
  return Math.round(gross * 0.08);
}

export function driverEarning(deliveryFee: number): number {
  return Math.round(deliveryFee * 0.9);
}

export function ezialDeliveryCommission(deliveryFee: number): number {
  return Math.round(deliveryFee * 0.1);
}

export function netAmount(gross: number): number {
  return gross - commissionAmount(gross);
}
