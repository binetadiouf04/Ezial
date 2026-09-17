import { supabase } from './supabaseClient';

// Real seller financial tracking, built on the pre-existing
// public.seller_transactions table (schema confirmed with the user before
// writing any of this: id/shop_id/order_id/type/gross_amount/
// commission_amount/net_amount/status/created_at, type in
// ('sale','commission','payout','refund','adjustment'), status in
// ('pending','available','paid','cancelled')).
//
// Sales/commission/net figures are computed live from the real
// order_shops.subtotal (never from delivery_fee — commission is 8% on
// product sales only) rather than from seller_transactions, since nothing
// currently writes 'sale' rows into that table. Payouts are the one thing
// actually stored there, and only ever written through the
// record_seller_payout() RPC (security definer) — never inserted directly
// from the client, so the "amount can't exceed what's owed" rule is
// enforced in the database, not trusted from the frontend.

const COMMISSION_RATE = 0.08;

function commissionOf(gross: number): number {
  return Math.round(gross * COMMISSION_RATE);
}

export interface AdminShopFinanceSummary {
  shopId: string;
  shopName: string;
  logoUrl: string;
  sales: number;
  commission: number;
  netToSeller: number;
  alreadyPaid: number;
  remaining: number;
  status: 'no_sales' | 'settled' | 'owing';
}

export interface AdminFinanceOverview {
  totalSales: number;
  totalCommission: number;
  totalPaid: number;
  totalRemaining: number;
  shops: AdminShopFinanceSummary[];
}

function statusFor(netToSeller: number, remaining: number): AdminShopFinanceSummary['status'] {
  if (netToSeller <= 0) return 'no_sales';
  return remaining <= 0 ? 'settled' : 'owing';
}

export async function fetchAdminFinanceOverview(): Promise<AdminFinanceOverview> {
  const [{ data: shopRows }, { data: orderShopRows }, { data: payoutRows }] = await Promise.all([
    supabase.from('shops').select('id, name, logo_url').order('name', { ascending: true }),
    supabase.from('order_shops').select('shop_id, subtotal'),
    supabase.from('seller_transactions').select('shop_id, net_amount').eq('type', 'payout').eq('status', 'paid'),
  ]);

  const grossByShop = new Map<string, number>();
  for (const row of orderShopRows ?? []) {
    const sid = row.shop_id as string;
    grossByShop.set(sid, (grossByShop.get(sid) ?? 0) + ((row.subtotal as number) ?? 0));
  }

  const paidByShop = new Map<string, number>();
  for (const row of payoutRows ?? []) {
    const sid = row.shop_id as string;
    paidByShop.set(sid, (paidByShop.get(sid) ?? 0) + ((row.net_amount as number) ?? 0));
  }

  const shops: AdminShopFinanceSummary[] = (shopRows ?? []).map((s) => {
    const sales = grossByShop.get(s.id as string) ?? 0;
    const commission = commissionOf(sales);
    const netToSeller = sales - commission;
    const alreadyPaid = paidByShop.get(s.id as string) ?? 0;
    const remaining = netToSeller - alreadyPaid;
    return {
      shopId: s.id as string,
      shopName: (s.name as string) ?? '',
      logoUrl: (s.logo_url as string) ?? '',
      sales,
      commission,
      netToSeller,
      alreadyPaid,
      remaining,
      status: statusFor(netToSeller, remaining),
    };
  });

  return {
    totalSales: shops.reduce((sum, s) => sum + s.sales, 0),
    totalCommission: shops.reduce((sum, s) => sum + s.commission, 0),
    totalPaid: shops.reduce((sum, s) => sum + s.alreadyPaid, 0),
    totalRemaining: shops.reduce((sum, s) => sum + s.remaining, 0),
    shops,
  };
}

export interface FinanceHistoryEntry {
  id: string;
  date: string;
  kind: 'sale' | 'payout';
  orderNumber: string | null;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
}

export interface AdminShopFinanceDetail {
  shopId: string;
  shopName: string;
  logoUrl: string;
  sales: number;
  commission: number;
  netToSeller: number;
  alreadyPaid: number;
  remaining: number;
  history: FinanceHistoryEntry[];
}

export async function fetchAdminShopFinanceDetail(shopId: string): Promise<AdminShopFinanceDetail | null> {
  const { data: shopRow, error } = await supabase.from('shops').select('id, name, logo_url').eq('id', shopId).maybeSingle();
  if (error || !shopRow) return null;

  const [{ data: orderShopRows }, { data: payoutRows }] = await Promise.all([
    supabase.from('order_shops').select('id, order_id, subtotal').eq('shop_id', shopId),
    supabase.from('seller_transactions').select('id, net_amount, status, created_at').eq('shop_id', shopId).eq('type', 'payout').order('created_at', { ascending: false }),
  ]);

  const orderIds = [...new Set((orderShopRows ?? []).map((r) => r.order_id as string).filter(Boolean))];
  const { data: orderRows } = orderIds.length > 0
    ? await supabase.from('orders').select('id, order_number, created_at').in('id', orderIds)
    : { data: [] };
  const orderById = new Map<string, { order_number: string; created_at: string }>(
    (orderRows ?? []).map((o) => [o.id as string, { order_number: o.order_number as string, created_at: o.created_at as string }]),
  );

  const saleEntries: FinanceHistoryEntry[] = (orderShopRows ?? []).map((os) => {
    const gross = (os.subtotal as number) ?? 0;
    const commission = commissionOf(gross);
    const order = orderById.get(os.order_id as string);
    return {
      id: `sale-${os.id}`,
      date: order?.created_at ?? '',
      kind: 'sale' as const,
      orderNumber: order?.order_number ?? null,
      grossAmount: gross,
      commissionAmount: commission,
      netAmount: gross - commission,
    };
  });

  const paidPayouts = (payoutRows ?? []).filter((p) => p.status === 'paid');
  const payoutEntries: FinanceHistoryEntry[] = paidPayouts.map((p) => ({
    id: `payout-${p.id}`,
    date: (p.created_at as string) ?? '',
    kind: 'payout' as const,
    orderNumber: null,
    grossAmount: 0,
    commissionAmount: 0,
    netAmount: (p.net_amount as number) ?? 0,
  }));

  const history = [...saleEntries, ...payoutEntries].sort((a, b) => (a.date < b.date ? 1 : -1));

  const sales = saleEntries.reduce((sum, e) => sum + e.grossAmount, 0);
  const commission = commissionOf(sales);
  const netToSeller = sales - commission;
  const alreadyPaid = payoutEntries.reduce((sum, e) => sum + e.netAmount, 0);
  const remaining = netToSeller - alreadyPaid;

  return {
    shopId: shopRow.id as string,
    shopName: (shopRow.name as string) ?? '',
    logoUrl: (shopRow.logo_url as string) ?? '',
    sales,
    commission,
    netToSeller,
    alreadyPaid,
    remaining,
    history,
  };
}

export async function recordSellerPayout(shopId: string, amount: number): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('record_seller_payout', { p_shop_id: shopId, p_amount: amount });
  if (error) return { error: error.message };
  return {};
}
