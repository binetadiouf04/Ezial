import { supabase } from './supabaseClient';

// Places a real order by calling the create_order(payload) Postgres
// function (security definer) — never by inserting into orders/order_items
// directly from the client. The function relights prices, promo, stock and
// the delivery fee itself from products/product_variants/shops; the
// frontend only ever supplies WHAT was ordered (product/variant ids,
// quantities, selected options) and WHERE (customer info, coordinates),
// never HOW MUCH anything costs.

export interface CreateOrderItemInput {
  productId: string;
  // Prefer this whenever the cart line resolved a real product_variants
  // row (see getVariantPrice's returned variantId) — create_order() only
  // falls back to matching selectedOptions by value when it's absent.
  variantId?: string | null;
  selectedOptions: Record<string, string>;
  quantity: number;
}

export interface CreateOrderShopFulfillmentInput {
  type: 'delivery' | 'pickup';
  date?: string | null;
  window?: string | null;
}

export interface CreateOrderPayload {
  customerId?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  neighborhood?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  // Required by create_order() the moment any shop in the cart is set to
  // 'delivery' — see the Geolocation capture in CheckoutPage. Never
  // fabricated client-side when unavailable.
  latitude?: number | null;
  longitude?: number | null;
  preferredDeliveryDate?: string | null;
  preferredDeliverySlot?: string | null;
  paymentMethod: string;
  // Gift order — when isGift is true, deliveryAddress/neighborhood/
  // deliveryNotes/latitude/longitude above are the RECIPIENT's, never the
  // buyer's own (firstName/lastName/phone/email always stay the buyer's).
  // giftWrapFee is never sent — create_order() derives it itself from
  // giftWrap and adds it to the real total_amount.
  isGift?: boolean;
  giftRecipientName?: string;
  giftRecipientPhone?: string;
  giftShowBuyerName?: boolean;
  giftMessage?: string;
  giftWrap?: boolean;
  // Promo code — create_order() re-validates it itself (existence/active/
  // dates/minimum) via validate_promo_code() and computes the real
  // discount server-side; never trust a discount amount computed here.
  promoCode?: string;
  shopFulfillments: Record<string, CreateOrderShopFulfillmentInput>;
  items: CreateOrderItemInput[];
}

// Raw shapes returned by create_order() — snake_case Postgres rows, kept
// as loosely typed records since they're only read (never re-sent) by the
// frontend, then immediately mapped into the app's existing Order shape.
export interface CreatedOrderRow {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  fulfillment_type: string;
  payment_method: string;
  products_subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  total_amount: number;
  is_gift?: boolean;
  gift_recipient_name?: string | null;
  gift_recipient_phone?: string | null;
  gift_show_buyer_name?: boolean;
  gift_message?: string | null;
  gift_wrap?: boolean;
  gift_wrap_fee?: number;
  // The promo-code discount is folded into discount_amount (same column
  // product promotions already used) — no separate column, reusing the
  // real existing schema rather than inventing a new one.
  promo_code?: string | null;
  [key: string]: unknown;
}
export interface CreatedOrderShopRow {
  id: string;
  shop_id: string;
  fulfillment_type: 'delivery' | 'pickup';
  status: string;
  pickup_code: string | null;
  subtotal: number;
  [key: string]: unknown;
}
export interface CreatedOrderItemRow {
  id: string;
  order_shop_id: string;
  shop_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  selected_options: Record<string, string>;
  quantity: number;
  unit_price: number;
  line_total: number;
  [key: string]: unknown;
}

export interface CreatedOrderResult {
  order: CreatedOrderRow;
  shops: CreatedOrderShopRow[];
  items: CreatedOrderItemRow[];
}

export async function createOrderInSupabase(
  payload: CreateOrderPayload,
): Promise<{ result: CreatedOrderResult } | { error: string }> {
  const { data, error } = await supabase.rpc('create_order', { payload });
  if (error) {
    // create_order() raises plain exceptions for every rejection case
    // (produit indisponible, stock insuffisant, coordonnées manquantes...)
    // — error.message is already a clear, user-facing sentence in French.
    return { error: error.message };
  }
  return { result: data as CreatedOrderResult };
}

// Version string for the CGV currently shown at checkout — bump this the
// day the CGV text actually changes, so every past consent stays tied to
// the version the customer really saw.
export const CGV_VERSION = 'v2026-10-11';

// Called right after create_order() succeeds, once we have a real order id
// to attach the consent to. Never blocks the order itself: the order is
// already placed by the time this runs, so a failure here is logged, not
// shown to the customer as a checkout error.
export async function recordOrderCgvConsent(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('record_order_cgv_consent', { p_order_id: orderId, p_cgv_version: CGV_VERSION });
  return error ? { error: error.message } : {};
}

export async function fetchOrderDeliveryCode(orderId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_order_delivery_code', { p_order_id: orderId });
  if (error || !data) return null;
  return data as string;
}

// orders.status is never updated after create_order() writes it once — the
// only real signal of delivery progress lives on delivery_missions, which
// customers have no direct RLS access to (by design). This is the one
// narrow read of it they get, mirroring fetchOrderDeliveryCode.
export async function fetchOrderDeliveryMissionStatus(orderId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_order_delivery_status', { p_order_id: orderId });
  if (error) return null;
  return (data as string | null) ?? null;
}
