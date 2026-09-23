import { supabase } from './supabaseClient';
import type { Order, ShopFulfillment, DeliveryStepStatus, ShopPrepStatus, PickupStepStatus } from '@/store/AppContext';

// Real order history for "Mes commandes" — orders.customer_id = auth.uid()
// (see the RLS migration this feature ships with). Mapped into the exact
// same `Order` shape a freshly-placed order already gets from
// CheckoutPage.mapToLocalOrder(), so OrderConfirmationPage/OrderTrackingPage/
// OrderDetailPage/ProfilePage need no changes at all to read a fetched
// historical order.

interface OrderRow {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  products_subtotal: number;
  delivery_fee: number;
  payment_method: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  neighborhood?: string;
  delivery_notes?: string;
  preferred_delivery_date?: string | null;
  preferred_delivery_slot?: string | null;
  [key: string]: unknown;
}

interface OrderShopRow {
  id: string;
  order_id: string;
  shop_id: string;
  fulfillment_type: 'delivery' | 'pickup';
  status: string;
  pickup_code: string | null;
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
}

// Real order_shops.status spans the full delivery/pickup flow — collapsed
// here into the simpler customer-facing ShopPrepStatus/PickupStepStatus
// this app already displays via ProfilePage/OrderTrackingPage.
function toShopPrepStatus(realStatus: string): ShopPrepStatus {
  if (['picked_up', 'delivering', 'delivered', 'collected'].includes(realStatus)) return 'collected';
  if (['ready', 'ready_for_pickup'].includes(realStatus)) return 'ready';
  return 'preparing';
}

function toPickupStepStatus(realStatus: string): PickupStepStatus {
  if (['picked_up', 'delivering', 'delivered', 'collected'].includes(realStatus)) return 'picked_up';
  if (['ready', 'ready_for_pickup'].includes(realStatus)) return 'ready_for_pickup';
  return 'preparing';
}

export async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  const { data: orderRows, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error || !orderRows || orderRows.length === 0) return [];

  const orders = orderRows as OrderRow[];
  const orderIds = orders.map((o) => o.id);

  const { data: shopRows } = await supabase.from('order_shops').select('*').in('order_id', orderIds);
  const orderShops = (shopRows ?? []) as OrderShopRow[];
  const orderShopIds = orderShops.map((s) => s.id);

  const { data: itemRows } = orderShopIds.length > 0
    ? await supabase.from('order_items').select('*').in('order_shop_id', orderShopIds)
    : { data: [] };
  const items = (itemRows ?? []) as OrderItemRow[];

  return orders.map((o): Order => {
    const shopsForOrder = orderShops.filter((s) => s.order_id === o.id);
    const fulfillments: ShopFulfillment[] = shopsForOrder.map((s) => ({
      shopId: s.shop_id,
      type: s.fulfillment_type,
      deliveryFee: 0,
      pickupCode: s.pickup_code ?? undefined,
      status: toShopPrepStatus(s.status),
      pickupStatus: s.fulfillment_type === 'pickup' ? toPickupStepStatus(s.status) : undefined,
    }));
    const orderShopIdsForOrder = new Set(shopsForOrder.map((s) => s.id));
    const orderItems = items.filter((it) => orderShopIdsForOrder.has(it.order_shop_id));
    const shopIdByOrderShopId = new Map(shopsForOrder.map((s) => [s.id, s.shop_id]));

    return {
      id: o.order_number,
      supabaseOrderId: o.id,
      date: o.created_at,
      customer: {
        firstName: o.first_name ?? '',
        lastName: o.last_name ?? '',
        phone: o.phone ?? '',
        quartier: o.neighborhood ?? '',
        instructions: o.delivery_notes ?? undefined,
      },
      items: orderItems.map((it) => ({
        productId: it.product_id,
        shopId: shopIdByOrderShopId.get(it.order_shop_id) ?? '',
        quantity: it.quantity,
        variants: it.selected_options ?? {},
        unitPrice: it.unit_price,
        variantId: it.variant_id ?? undefined,
        // Snapshotted at purchase time — lets this line still render its
        // real name even once the product itself is archived/removed from
        // the live catalog (see the order pages' fallback for this exact
        // case).
        productName: it.product_name,
      })),
      subtotal: o.products_subtotal,
      delivery: o.delivery_fee,
      total: o.total_amount,
      shopFulfillments: fulfillments,
      preference: o.preferred_delivery_date || o.preferred_delivery_slot
        ? { type: 'preferred', date: o.preferred_delivery_date ?? undefined, window: o.preferred_delivery_slot ?? undefined }
        : { type: 'none' },
      payment: o.payment_method,
      status: (o.status as DeliveryStepStatus) ?? 'confirmed',
    };
  });
}
