import { supabase } from './supabaseClient';

// Real per-shop financial history for the seller's own "Finances" page —
// reads the same public.seller_transactions table supabaseAdminFinances.ts
// already documents (id/shop_id/order_id/type/gross_amount/
// commission_amount/net_amount/status/created_at), scoped to this seller's
// own shop_id (RLS-enforced: a seller can only ever see their own shop's
// rows). Real 'sale' rows are written by create_order() itself, one per
// order_shop, with the commission already computed server-side product by
// product from the promotion actually in effect — this file only ever
// reads that stored figure, never recomputes a commission rate itself.
//
// Replaces the previous mock data source (usePro().sellerTransactions,
// filtered by a hardcoded shopName === 'Maison Fatou') which showed a real
// seller's own Finances page as permanently empty.

export interface SellerTransactionRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  gross: number;
  commission: number;
  net: number;
  date: string;
  payout: 'pending' | 'available' | 'paid' | 'cancelled';
}

export interface SellerFinanceSummary {
  transactions: SellerTransactionRow[];
  grossTotal: number;
  commissionTotal: number;
  netTotal: number;
  availableBalance: number;
  alreadyPaid: number;
}

export async function fetchSellerFinances(shopId: string): Promise<SellerFinanceSummary> {
  const [{ data: saleRows }, { data: payoutRows }] = await Promise.all([
    supabase
      .from('seller_transactions')
      .select('id, order_id, gross_amount, commission_amount, net_amount, status, created_at')
      .eq('shop_id', shopId)
      .eq('type', 'sale')
      .order('created_at', { ascending: false }),
    supabase
      .from('seller_transactions')
      .select('net_amount')
      .eq('shop_id', shopId)
      .eq('type', 'payout')
      .eq('status', 'paid'),
  ]);

  const orderIds = [...new Set((saleRows ?? []).map((r) => r.order_id as string).filter(Boolean))];
  const { data: orderRows } = orderIds.length > 0
    ? await supabase.from('orders').select('id, order_number').in('id', orderIds)
    : { data: [] };
  const orderNumberById = new Map((orderRows ?? []).map((o) => [o.id as string, o.order_number as string]));

  const transactions: SellerTransactionRow[] = (saleRows ?? []).map((r) => ({
    id: r.id as string,
    orderId: (r.order_id as string | null) ?? null,
    orderNumber: r.order_id ? (orderNumberById.get(r.order_id as string) ?? null) : null,
    gross: (r.gross_amount as number) ?? 0,
    commission: (r.commission_amount as number) ?? 0,
    net: (r.net_amount as number) ?? 0,
    date: (r.created_at as string) ?? '',
    payout: (r.status as SellerTransactionRow['payout']) ?? 'pending',
  }));

  const grossTotal = transactions.reduce((sum, t) => sum + t.gross, 0);
  const commissionTotal = transactions.reduce((sum, t) => sum + t.commission, 0);
  const netTotal = transactions.reduce((sum, t) => sum + t.net, 0);
  const availableBalance = transactions.filter((t) => t.payout === 'available').reduce((sum, t) => sum + t.net, 0);
  const alreadyPaid = (payoutRows ?? []).reduce((sum, r) => sum + ((r.net_amount as number) ?? 0), 0);

  return { transactions, grossTotal, commissionTotal, netTotal, availableBalance, alreadyPaid };
}
