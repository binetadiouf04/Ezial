import { supabase } from './supabaseClient';
import { resolveImageUrl } from './supabaseCatalog';

// Real Supabase-backed admin data — orders/order_shops/order_items/shops/
// products read directly, scoped to a verified admin (see the RLS
// migration handed back alongside this feature: admins get their own
// read policies on these tables, additive to whatever already exists —
// nothing here bypasses RLS from the frontend).
//
// Column names certain from create_order()'s own returned shape
// (supabaseOrders.ts): orders.order_number/created_at/status/
// fulfillment_type/payment_method/products_subtotal/delivery_fee/
// total_amount; order_shops.id/order_id/shop_id/fulfillment_type/status/
// subtotal; order_items.id/order_shop_id/product_name/selected_options/
// quantity/unit_price/line_total. Customer name/phone columns on `orders`
// were not directly inspectable from this environment, so they're read
// defensively (a couple of plausible snake_case names tried in order).

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  [key: string]: unknown;
}

function customerNameFrom(order: OrderRow): string {
  const first = firstString(order.first_name, order.customer_first_name);
  const last = firstString(order.last_name, order.customer_last_name);
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return firstString(order.customer_name, order.full_name) ?? 'Client';
}

// === Dashboard ===

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  totalAmount: number;
  fulfillmentType: string;
  status: string;
}

function mapOrderSummary(row: OrderRow): AdminOrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number ?? '',
    createdAt: row.created_at ?? '',
    customerName: customerNameFrom(row),
    totalAmount: (row.total_amount as number) ?? 0,
    fulfillmentType: (row.fulfillment_type as string) ?? 'delivery',
    status: (row.status as string) ?? 'confirmed',
  };
}

export interface AdminDashboardStats {
  totalOrders: number;
  totalShops: number;
  activeProducts: number;
  recentOrders: AdminOrderSummary[];
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [ordersCountRes, shopsCountRes, productsCountRes, recentRes] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('shops').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  return {
    totalOrders: ordersCountRes.count ?? 0,
    totalShops: shopsCountRes.count ?? 0,
    activeProducts: productsCountRes.count ?? 0,
    recentOrders: ((recentRes.data ?? []) as OrderRow[]).map(mapOrderSummary),
  };
}

// === Orders ===

export async function fetchAdminOrders(): Promise<AdminOrderSummary[]> {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrderSummary);
}

export interface AdminOrderItem {
  id: string;
  productName: string;
  selectedOptions: Record<string, string>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AdminOrderShopGroup {
  orderShopId: string;
  shopId: string;
  shopName: string;
  fulfillmentType: 'delivery' | 'pickup';
  status: string;
  subtotal: number;
  items: AdminOrderItem[];
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  paymentMethod: string;
  fulfillmentType: string;
  productsSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  shops: AdminOrderShopGroup[];
  // Delivery-only info (fulfillmentType === 'delivery'), read defensively —
  // see the header note on uncertain `orders` column names.
  deliveryNeighborhood: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  preferredDeliveryDate: string | null;
  preferredDeliverySlot: string | null;
}

export async function fetchAdminOrderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  const { data: orderRow, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !orderRow) return null;
  const order = orderRow as OrderRow;

  const { data: shopRows } = await supabase.from('order_shops').select('*').eq('order_id', orderId);
  const orderShopRows = shopRows ?? [];
  const orderShopIds = orderShopRows.map((r) => r.id as string);
  const shopIds = [...new Set(orderShopRows.map((r) => r.shop_id as string))];

  const [{ data: itemRows }, { data: shopNameRows }] = await Promise.all([
    orderShopIds.length > 0 ? supabase.from('order_items').select('*').in('order_shop_id', orderShopIds) : Promise.resolve({ data: [] }),
    shopIds.length > 0 ? supabase.from('shops').select('id, name').in('id', shopIds) : Promise.resolve({ data: [] }),
  ]);

  const shopNameById = new Map<string, string>((shopNameRows ?? []).map((s) => [s.id as string, s.name as string]));
  const items = itemRows ?? [];

  const shopsGrouped: AdminOrderShopGroup[] = orderShopRows.map((sr) => ({
    orderShopId: sr.id as string,
    shopId: sr.shop_id as string,
    shopName: shopNameById.get(sr.shop_id as string) ?? sr.shop_id as string,
    fulfillmentType: (sr.fulfillment_type as 'delivery' | 'pickup') ?? 'delivery',
    status: (sr.status as string) ?? 'confirmed',
    subtotal: (sr.subtotal as number) ?? 0,
    items: items
      .filter((it) => it.order_shop_id === sr.id)
      .map((it) => ({
        id: it.id as string,
        productName: (it.product_name as string) ?? '',
        selectedOptions: (it.selected_options as Record<string, string>) ?? {},
        quantity: (it.quantity as number) ?? 0,
        unitPrice: (it.unit_price as number) ?? 0,
        lineTotal: (it.line_total as number) ?? 0,
      })),
  }));

  return {
    id: order.id,
    orderNumber: order.order_number ?? '',
    createdAt: order.created_at ?? '',
    status: (order.status as string) ?? 'confirmed',
    customerName: customerNameFrom(order),
    customerPhone: firstString(order.phone, order.customer_phone),
    paymentMethod: (order.payment_method as string) ?? '',
    fulfillmentType: (order.fulfillment_type as string) ?? 'delivery',
    productsSubtotal: (order.products_subtotal as number) ?? 0,
    deliveryFee: (order.delivery_fee as number) ?? 0,
    totalAmount: (order.total_amount as number) ?? 0,
    shops: shopsGrouped,
    deliveryNeighborhood: firstString(order.neighborhood, order.delivery_neighborhood),
    deliveryAddress: firstString(order.delivery_address, order.address),
    deliveryNotes: firstString(order.delivery_notes, order.notes),
    preferredDeliveryDate: firstString(order.preferred_delivery_date, order.delivery_date),
    preferredDeliverySlot: firstString(order.preferred_delivery_slot, order.delivery_slot),
  };
}

// === Shops ===

export interface AdminShopSummary {
  id: string;
  name: string;
  logoUrl: string;
  status: string;
  sellerCode: string | null;
  activeProductCount: number;
}

export async function fetchAdminShops(): Promise<AdminShopSummary[]> {
  const { data: shopRows, error } = await supabase.from('shops').select('*').order('name', { ascending: true });
  if (error || !shopRows) return [];

  const shopIds = shopRows.map((s) => s.id as string);
  const { data: productRows } = shopIds.length > 0
    ? await supabase.from('products').select('shop_id').eq('status', 'active').in('shop_id', shopIds)
    : { data: [] };

  const countByShop = new Map<string, number>();
  for (const p of productRows ?? []) {
    const sid = p.shop_id as string;
    countByShop.set(sid, (countByShop.get(sid) ?? 0) + 1);
  }

  return shopRows.map((s) => ({
    id: s.id as string,
    name: (s.name as string) ?? '',
    logoUrl: (s.logo_url as string) ?? '',
    status: (s.status as string) ?? 'active',
    sellerCode: (s.seller_code as string | null) ?? null,
    activeProductCount: countByShop.get(s.id as string) ?? 0,
  }));
}

export interface AdminProductSummary {
  id: string;
  name: string;
  imageUrl: string;
  shopId: string;
  shopName: string;
  price: number;
  stock: number;
  status: string;
}

export interface AdminShopDetail {
  id: string;
  name: string;
  logoUrl: string;
  bannerUrl: string;
  status: string;
  sellerCode: string | null;
  description: string;
  phone: string | null;
  neighborhood: string | null;
  address: string | null;
  products: AdminProductSummary[];
}

export async function fetchAdminShopDetail(shopId: string): Promise<AdminShopDetail | null> {
  const { data: shopRow, error } = await supabase.from('shops').select('*').eq('id', shopId).maybeSingle();
  if (error || !shopRow) return null;

  const products = await fetchAdminProducts(shopId);

  return {
    id: shopRow.id as string,
    name: (shopRow.name as string) ?? '',
    logoUrl: (shopRow.logo_url as string) ?? '',
    bannerUrl: (shopRow.cover_url as string) ?? '',
    status: (shopRow.status as string) ?? 'active',
    sellerCode: (shopRow.seller_code as string | null) ?? null,
    description: (shopRow.description as string) ?? '',
    phone: firstString(shopRow.phone),
    neighborhood: firstString(shopRow.neighborhood),
    address: firstString(shopRow.address_text),
    products,
  };
}

// === Products ===

// Scoped to one shop when shopId is given (used by the shop detail page);
// otherwise every product across every shop (the admin Produits list).
export async function fetchAdminProducts(shopId?: string): Promise<AdminProductSummary[]> {
  let query = supabase.from('products').select('*').order('created_at', { ascending: false });
  if (shopId) query = query.eq('shop_id', shopId);
  const { data: productRows, error } = await query;
  if (error || !productRows || productRows.length === 0) return [];

  const productIds = productRows.map((p) => p.id as string);
  const shopIds = [...new Set(productRows.map((p) => p.shop_id as string))];

  const [{ data: variantRows }, { data: imageRows }, { data: shopRows }] = await Promise.all([
    supabase.from('product_variants').select('product_id, stock').in('product_id', productIds),
    supabase.from('product_images').select('product_id, storage_path, is_primary, sort_order').in('product_id', productIds),
    shopId ? Promise.resolve({ data: null }) : supabase.from('shops').select('id, name').in('id', shopIds),
  ]);

  const stockByProduct = new Map<string, number>();
  for (const v of variantRows ?? []) {
    const pid = v.product_id as string;
    stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + ((v.stock as number) ?? 0));
  }

  const imagesByProduct = new Map<string, { storagePath: string; isPrimary: boolean; sortOrder: number }[]>();
  for (const img of imageRows ?? []) {
    const pid = img.product_id as string;
    const list = imagesByProduct.get(pid) ?? [];
    list.push({ storagePath: (img.storage_path as string) ?? '', isPrimary: Boolean(img.is_primary), sortOrder: (img.sort_order as number) ?? 0 });
    imagesByProduct.set(pid, list);
  }

  const shopNameById = new Map<string, string>((shopRows ?? []).map((s) => [s.id as string, s.name as string]));

  return productRows.map((p) => {
    const pid = p.id as string;
    const images = (imagesByProduct.get(pid) ?? []).sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder);
    return {
      id: pid,
      name: (p.name as string) ?? '',
      imageUrl: images[0] ? resolveImageUrl(images[0].storagePath) : '',
      shopId: p.shop_id as string,
      shopName: shopId ? '' : (shopNameById.get(p.shop_id as string) ?? ''),
      price: (p.base_price as number) ?? 0,
      stock: stockByProduct.get(pid) ?? 0,
      status: (p.status as string) ?? 'draft',
    };
  });
}
