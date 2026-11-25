import { supabase } from './supabaseClient';
import { normalizeStoredWaist } from '@/lib/waistMeasure';
import { splitDeliveryNotes } from '@/lib/recentDeliveryPlaces';
import { urgentFeeOfRow } from '@/lib/urgentDelivery';
import type { Order, ShopFulfillment, ShopCancellation, DeliveryStepStatus, ShopPrepStatus, PickupStepStatus } from '@/store/AppContext';

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
  discount_amount: number;
  delivery_fee: number;
  delivery_discount?: number | null;
  payment_method: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  neighborhood?: string;
  delivery_notes?: string;
  delivery_address?: string | null;
  preferred_delivery_date?: string | null;
  preferred_delivery_slot?: string | null;
  payment_status?: string;
  payment_required?: boolean;
  payment_deadline?: string | null;
  payment_grace_until?: string | null;
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
  // Tour de taille (Baya), enregistré avec la commande ; null pour tout autre article.
  waist_cm?: number | string | null;
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

interface CancellationRow {
  order_shop_id: string;
  order_id: string;
  shop_id: string;
  reason: ShopCancellation['reason'];
  note: string | null;
  cancelled_at: string;
  order_was_paid: boolean;
  part_amount: number;
  refund_status: ShopCancellation['refundStatus'];
}

// Parts annulées par leur boutique. Table absente (migration pas encore exécutée) ou erreur : liste vide, rien ne casse.
async function fetchCancellations(orderIds: string[]): Promise<CancellationRow[]> {
  const { data, error } = await supabase
    .from('order_shop_cancellations')
    .select('order_shop_id, order_id, shop_id, reason, note, cancelled_at, order_was_paid, part_amount, refund_status')
    .in('order_id', orderIds);
  if (error || !data) return [];
  return data as CancellationRow[];
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

  const [{ data: shopRows }, cancellationRows] = await Promise.all([
    supabase.from('order_shops').select('*').in('order_id', orderIds),
    fetchCancellations(orderIds),
  ]);
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
      orderShopId: s.id,
      type: s.fulfillment_type,
      deliveryFee: 0,
      pickupCode: s.pickup_code ?? undefined,
      status: toShopPrepStatus(s.status),
      pickupStatus: s.fulfillment_type === 'pickup' ? toPickupStepStatus(s.status) : undefined,
      cancelled: s.status === 'cancelled' ? true : undefined,
    }));
    const orderShopIdsForOrder = new Set(shopsForOrder.map((s) => s.id));
    const orderItems = items.filter((it) => orderShopIdsForOrder.has(it.order_shop_id));
    const shopIdByOrderShopId = new Map(shopsForOrder.map((s) => [s.id, s.shop_id]));

    const notes = splitDeliveryNotes(o.delivery_notes);
    return {
      id: o.order_number,
      supabaseOrderId: o.id,
      date: o.created_at,
      customer: {
        firstName: o.first_name ?? '',
        lastName: o.last_name ?? '',
        phone: o.phone ?? '',
        quartier: o.neighborhood ?? '',
        // « Point de repère : X. instructions » (format écrit à la commande) → deux champs.
        landmark: notes.landmark || undefined,
        instructions: notes.instructions || undefined,
        address: typeof o.delivery_address === 'string' && o.delivery_address.trim() ? o.delivery_address.trim() : undefined,
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
        orderItemId: it.id,
        waistCm: normalizeStoredWaist(it.waist_cm),
      })),
      subtotal: o.products_subtotal,
      discount: o.discount_amount ?? 0,
      delivery: o.delivery_fee,
      deliveryDiscount: o.delivery_discount ?? 0,
      urgentFee: urgentFeeOfRow(o),
      total: o.total_amount,
      shopFulfillments: fulfillments,
      preference: o.preferred_delivery_date || o.preferred_delivery_slot
        ? { type: 'preferred', date: o.preferred_delivery_date ?? undefined, window: o.preferred_delivery_slot ?? undefined }
        : { type: 'none' },
      payment: o.payment_method,
      status: (o.status as DeliveryStepStatus) ?? 'confirmed',
      paymentStatus: o.payment_status as Order['paymentStatus'],
      paymentRequired: o.payment_required === true,
      paymentDeadline: o.payment_deadline ?? null,
      paymentGraceUntil: o.payment_grace_until ?? null,
      orderStatus: o.status,
      cancellations: cancellationRows.filter((c) => c.order_id === o.id).map((c): ShopCancellation => ({
        orderShopId: c.order_shop_id, shopId: c.shop_id, reason: c.reason, note: c.note, cancelledAt: c.cancelled_at,
        wasPaid: c.order_was_paid, partAmount: c.part_amount, refundStatus: c.refund_status,
      })),
    };
  });
}
