import { supabase } from './supabaseClient';
import { resolveImageUrl } from './supabaseCatalog';

// Real Supabase-backed seller order list/detail — orders/order_shops/
// order_items are read directly (never through create_order(), which is
// write-only), scoped to the signed-in seller's own shop.
//
// Column names for orders/order_items follow the pre-existing historical
// schema; order_shops is the newer table added alongside create_order().
// The columns used below that come straight from create_order()'s own
// returned shape (CreatedOrderRow/CreatedOrderShopRow/CreatedOrderItemRow
// in supabaseOrders.ts) are certain: orders.order_number/created_at,
// order_shops.id/order_id/shop_id/fulfillment_type/status/pickup_code/
// subtotal, order_items.id/order_shop_id/product_id/variant_id/
// product_name/selected_options/quantity/unit_price/line_total. Customer
// contact/delivery-detail column names on `orders` were not directly
// inspectable from this environment, so they're read defensively here
// (a couple of plausible snake_case names tried in order) rather than
// assumed outright — if a field renders empty, the actual column is
// likely named differently and this mapping should be adjusted.

export type SellerOrderStatus =
  | 'confirmed' | 'preparing' | 'ready' | 'ready_for_pickup'
  | 'picked_up' | 'delivering' | 'delivered' | 'collected';

interface OrderShopRow {
  id: string;
  order_id: string;
  shop_id: string;
  fulfillment_type: 'delivery' | 'pickup';
  status: string;
  pickup_code: string | null;
  subtotal: number;
  created_at?: string;
  [key: string]: unknown;
}

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  [key: string]: unknown;
}

interface OrderItemRow {
  id: string;
  order_shop_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  selected_options: Record<string, string> | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function customerNameFrom(order: OrderRow): string {
  const first = firstString(order.first_name, order.customer_first_name);
  const last = firstString(order.last_name, order.customer_last_name);
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return firstString(order.customer_name, order.full_name) ?? 'Client';
}

function customerPhoneFrom(order: OrderRow): string | null {
  return firstString(order.phone, order.customer_phone);
}

export interface SellerOrderSummary {
  orderShopId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  itemCount: number;
  shopSubtotal: number;
  fulfillmentType: 'delivery' | 'pickup';
  status: string;
}

// Every order that includes this shop, newest first. Scoped by
// shop_id — combined with the RLS policy on order_shops (see the
// migration handed back alongside this feature), a seller can only ever
// resolve rows for shops they actually own.
export async function fetchSellerOrders(shopId: string): Promise<SellerOrderSummary[]> {
  const { data: shopRows, error } = await supabase
    .from('order_shops')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error || !shopRows || shopRows.length === 0) return [];

  const rows = shopRows as OrderShopRow[];
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const orderShopIds = rows.map((r) => r.id);

  const [{ data: orderRows }, { data: itemRows }] = await Promise.all([
    supabase.from('orders').select('*').in('id', orderIds),
    supabase.from('order_items').select('id, order_shop_id, quantity').in('order_shop_id', orderShopIds),
  ]);

  const orderById = new Map<string, OrderRow>((orderRows ?? []).map((o) => [o.id as string, o as OrderRow]));
  const itemCountByShop = new Map<string, number>();
  for (const item of (itemRows ?? []) as { order_shop_id: string; quantity: number }[]) {
    itemCountByShop.set(item.order_shop_id, (itemCountByShop.get(item.order_shop_id) ?? 0) + (item.quantity ?? 0));
  }

  return rows
    .map((row): SellerOrderSummary | null => {
      const order = orderById.get(row.order_id);
      if (!order) return null;
      return {
        orderShopId: row.id,
        orderNumber: order.order_number ?? '',
        createdAt: order.created_at ?? row.created_at ?? '',
        customerName: customerNameFrom(order),
        itemCount: itemCountByShop.get(row.id) ?? 0,
        shopSubtotal: row.subtotal ?? 0,
        fulfillmentType: row.fulfillment_type ?? 'delivery',
        status: row.status ?? 'confirmed',
      };
    })
    .filter((r): r is SellerOrderSummary => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface SellerOrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  imageUrl: string;
  selectedOptions: Record<string, string>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SellerOrderDetail {
  orderShopId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  fulfillmentType: 'delivery' | 'pickup';
  status: string;
  pickupCode: string | null;
  shopSubtotal: number;
  deliveryAddress: string | null;
  neighborhood: string | null;
  preferredDate: string | null;
  preferredSlot: string | null;
  deliveryNotes: string | null;
  // Gift order — deliveryAddress/neighborhood/deliveryNotes above are
  // already the RECIPIENT's when isGift (create_order() stores them that
  // way). customerName/customerPhone above always stay the buyer's.
  isGift: boolean;
  giftRecipientName: string | null;
  giftRecipientPhone: string | null;
  giftMessage: string | null;
  giftWrap: boolean;
  giftWrapFee: number;
  items: SellerOrderItem[];
}

// Scoped to the seller's own shop both by RLS and by this explicit
// .eq('shop_id', shopId) — a second, defense-in-depth check so a wrong or
// stale orderShopId (e.g. a link shared between sellers) can never
// resolve a different shop's order, even if the RLS policy were ever
// misconfigured. Also guarantees an order with several shops never
// exposes another shop's items here — order_items is fetched by this
// exact order_shop_id only, never the whole order.
export async function fetchSellerOrderDetail(shopId: string, orderShopId: string): Promise<SellerOrderDetail | null> {
  const { data: shopRow, error } = await supabase
    .from('order_shops')
    .select('*')
    .eq('id', orderShopId)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error || !shopRow) return null;
  const row = shopRow as OrderShopRow;

  const [{ data: orderRow }, { data: itemRows }] = await Promise.all([
    supabase.from('orders').select('*').eq('id', row.order_id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_shop_id', orderShopId),
  ]);
  if (!orderRow) return null;
  const order = orderRow as OrderRow;
  const items = (itemRows ?? []) as OrderItemRow[];

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: imageRows } = productIds.length > 0
    ? await supabase.from('product_images').select('product_id, storage_path, is_primary, sort_order').in('product_id', productIds)
    : { data: [] };

  const primaryImageByProduct = new Map<string, string>();
  const sortedImages = [...(imageRows ?? [])].sort(
    (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  for (const img of sortedImages) {
    const pid = img.product_id as string;
    if (!primaryImageByProduct.has(pid)) primaryImageByProduct.set(pid, resolveImageUrl(img.storage_path as string));
  }

  return {
    orderShopId: row.id,
    orderNumber: order.order_number ?? '',
    createdAt: order.created_at ?? row.created_at ?? '',
    customerName: customerNameFrom(order),
    customerPhone: customerPhoneFrom(order),
    fulfillmentType: row.fulfillment_type ?? 'delivery',
    status: row.status ?? 'confirmed',
    pickupCode: row.pickup_code ?? null,
    shopSubtotal: row.subtotal ?? 0,
    deliveryAddress: firstString(order.delivery_address, order.address),
    neighborhood: firstString(order.neighborhood),
    preferredDate: firstString(order.preferred_delivery_date, order.delivery_date),
    preferredSlot: firstString(order.preferred_delivery_slot, order.delivery_slot, order.delivery_window),
    deliveryNotes: firstString(order.delivery_notes, order.notes, order.instructions),
    isGift: Boolean(order.is_gift),
    giftRecipientName: firstString(order.gift_recipient_name),
    giftRecipientPhone: firstString(order.gift_recipient_phone),
    giftMessage: firstString(order.gift_message),
    giftWrap: Boolean(order.gift_wrap),
    giftWrapFee: (order.gift_wrap_fee as number) ?? 0,
    items: items.map((it) => ({
      id: it.id,
      productId: it.product_id,
      variantId: it.variant_id ?? null,
      productName: it.product_name ?? '',
      imageUrl: primaryImageByProduct.get(it.product_id) ?? '',
      selectedOptions: it.selected_options ?? {},
      quantity: it.quantity ?? 0,
      unitPrice: it.unit_price ?? 0,
      lineTotal: it.line_total ?? 0,
    })),
  };
}

// Seller-facing MVP progression only — never advances into the delivery
// system's own steps (picked_up/delivering/delivered/collected), which
// are driven elsewhere.
export function nextSellerStatus(fulfillmentType: 'delivery' | 'pickup', status: string): SellerOrderStatus | null {
  if (status === 'confirmed') return 'preparing';
  if (status === 'preparing') return fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'ready';
  return null;
}

export function sellerActionLabel(fulfillmentType: 'delivery' | 'pickup', status: string): string | null {
  if (status === 'confirmed') return 'Commencer la préparation';
  if (status === 'preparing') return fulfillmentType === 'pickup' ? 'Marquer comme prête à récupérer' : 'Marquer comme prête';
  return null;
}

export async function advanceOrderShopStatus(orderShopId: string, nextStatus: SellerOrderStatus): Promise<{ error?: string }> {
  const { error } = await supabase.from('order_shops').update({ status: nextStatus }).eq('id', orderShopId);
  return error ? { error: error.message } : {};
}
