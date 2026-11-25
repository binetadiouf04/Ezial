// Annulation d'une commande par la boutique : règles et textes purs (sans réseau), testés par sellerCancelCore.test.mjs.
// Le serveur (docs/sql/vendeur-annulation.sql) décide de tout ; ce fichier ne fait qu'afficher fidèlement.

export type CancelReason = 'out_of_stock' | 'item_unavailable' | 'other';

export const cancelReasonLabels: Record<CancelReason, string> = {
  out_of_stock: 'Rupture de stock',
  item_unavailable: 'Article indisponible',
  other: 'Autre raison',
};

/** Tant que le colis n'est pas récupéré par le livreur ni remis au client (le serveur revérifie tout). */
export function canSellerCancel(status: string): boolean {
  return ['confirmed', 'preparing', 'ready', 'ready_for_pickup'].includes(status);
}

/** La fonction serveur est-elle absente (migration pas encore exécutée) ? */
export function isMissingCancelFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? ''));
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

export type RefundStatus = 'none' | 'to_refund' | 'refunded';

/** Phrases montrées au client pour une part annulée par sa boutique. */
export function customerCancellationLines(c: { shopName: string; reason: CancelReason; note: string | null; refundStatus: RefundStatus; partAmount: number }): string[] {
  const reason = cancelReasonLabels[c.reason].toLowerCase();
  const lines = [`${c.shopName} ne peut pas honorer cette partie de votre commande. Motif : ${reason}.`];
  if (c.note) lines.push(`« ${c.note} »`);
  lines.push(
    c.refundStatus === 'refunded' ? `Vous avez été remboursé de ${fcfa(c.partAmount)}.`
      : c.refundStatus === 'to_refund' ? `Vous serez remboursé de ${fcfa(c.partAmount)} : Ezial vous contactera.`
        : 'Vous n’avez rien à payer pour cette partie.',
  );
  return lines;
}

// --- Remboursements (administration) ---

export type RefundMethod = 'orange_money' | 'wave' | 'virement' | 'autre';
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  orange_money: 'Orange Money', wave: 'Wave', virement: 'Virement', autre: 'Autre',
};

export interface RefundRow {
  id: string; orderId: string; orderNumber: string; shopId: string; shopName: string; amount: number;
  paymentMethod: string | null; paymentReference: string | null; customerName: string; customerPhone: string | null;
  reason: string; note: string | null; cancelledAt: string; refundStatus: 'to_refund' | 'refunded';
  refundedAt: string | null; refundMethod: RefundMethod | null; refundReference: string | null; refundNote: string | null;
}

export interface RawRefund {
  id: string; order_id: string; order_number: string | null; shop_id: string; shop_name: string | null; amount: number;
  payment_method: string | null; payment_reference: string | null; customer_name: string | null; customer_phone: string | null;
  reason: string; note: string | null; cancelled_at: string; refund_status: 'to_refund' | 'refunded'; refunded_at: string | null;
  refund_method: RefundMethod | null; refund_reference: string | null; refund_note: string | null;
}

export function mapRefund(r: RawRefund): RefundRow {
  return {
    id: r.id, orderId: r.order_id, orderNumber: r.order_number ?? '', shopId: r.shop_id, shopName: r.shop_name ?? 'Boutique',
    amount: r.amount ?? 0, paymentMethod: r.payment_method, paymentReference: r.payment_reference,
    customerName: r.customer_name?.trim() || 'Client', customerPhone: r.customer_phone,
    reason: r.reason, note: r.note, cancelledAt: r.cancelled_at, refundStatus: r.refund_status,
    refundedAt: r.refunded_at, refundMethod: r.refund_method, refundReference: r.refund_reference, refundNote: r.refund_note,
  };
}
