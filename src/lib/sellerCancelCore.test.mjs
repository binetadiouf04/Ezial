// Tests de l'annulation par la boutique (règles et textes purs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canSellerCancel, cancelReasonLabels, customerCancellationLines, isMissingCancelFunction, mapRefund } from './sellerCancelCore.ts';

test('bouton disponible tant que le colis n\'est pas récupéré ni remis', () => {
  for (const s of ['confirmed', 'preparing', 'ready', 'ready_for_pickup']) assert.equal(canSellerCancel(s), true, s);
  for (const s of ['picked_up', 'delivering', 'delivered', 'collected', 'cancelled']) assert.equal(canSellerCancel(s), false, s);
});

test('trois motifs, en français', () => {
  assert.deepEqual(Object.keys(cancelReasonLabels), ['out_of_stock', 'item_unavailable', 'other']);
  assert.equal(cancelReasonLabels.out_of_stock, 'Rupture de stock');
});

test('fonction serveur absente (migration pas exécutée) : reconnue pour masquer le bouton', () => {
  assert.equal(isMissingCancelFunction({ code: 'PGRST202', message: 'x' }), true);
  assert.equal(isMissingCancelFunction({ code: '42883' }), true);
  assert.equal(isMissingCancelFunction({ message: 'Could not find the function public.seller_cancel_order_shop' }), true);
  assert.equal(isMissingCancelFunction({ code: 'P0001', message: 'Choisissez un motif d\'annulation.' }), false);
  assert.equal(isMissingCancelFunction(null), false);
});

test('texte client : boutique, motif, et remboursement selon le cas', () => {
  const base = { shopName: 'Boutique Un', reason: 'out_of_stock', note: null, partAmount: 11500 };
  const aRembourser = customerCancellationLines({ ...base, refundStatus: 'to_refund' });
  assert.match(aRembourser[0], /Boutique Un ne peut pas honorer.*rupture de stock/);
  assert.match(aRembourser.at(-1), /Vous serez remboursé de 11.500 FCFA : Ezial vous contactera\./);
  assert.match(customerCancellationLines({ ...base, refundStatus: 'refunded' }).at(-1), /Vous avez été remboursé de/);
  assert.equal(customerCancellationLines({ ...base, refundStatus: 'none' }).at(-1), 'Vous n’avez rien à payer pour cette partie.');
  const avecNote = customerCancellationLines({ ...base, note: 'plus de taille M', refundStatus: 'none' });
  assert.equal(avecNote[1], '« plus de taille M »');
});

test('administration : ligne de remboursement relue sans rien inventer', () => {
  const r = mapRefund({
    id: 'r1', order_id: 'o1', order_number: 'EZ-1', shop_id: 's1', shop_name: null, amount: 20000, payment_method: 'orange_money',
    payment_reference: 'MP1', customer_name: '  ', customer_phone: '+221770000000', reason: 'other', note: null,
    cancelled_at: '2026-11-25T10:00:00Z', refund_status: 'to_refund', refunded_at: null, refund_method: null, refund_reference: null, refund_note: null,
  });
  assert.equal(r.customerName, 'Client');
  assert.equal(r.shopName, 'Boutique');
  assert.equal(r.amount, 20000);
  assert.equal(r.refundStatus, 'to_refund');
  assert.equal(r.customerPhone, '+221770000000');
});
