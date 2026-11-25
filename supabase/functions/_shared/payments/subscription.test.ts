// Tests du paiement d'abonnement — aucun appel réseau. Lancer : node --test supabase/functions/_shared/payments/subscription.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserFacingError, handleCollectionWebhook, reconcileCollections } from './core.ts';
import type { CheckoutData, CheckoutRequest, CheckoutResult, CollectionAdapter, PaymentStatusResult, Provider, WebhookDb, ReconcileDb } from './core.ts';
import { initiateSubscriptionPayment, isBillingPeriod, subscriptionLabel } from './subscription.ts';
import type { SubscriptionAttemptRow, SubscriptionInitiateDb } from './subscription.ts';

const SHOP = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const ATT = '33333333-3333-4333-8333-333333333333';
const quiet = { log: () => {} };
const RET = 'https://www.ezial.net/abonnement/retour?paiement=retour&ref={transactionId}';
const CAN = 'https://www.ezial.net/abonnement/retour?paiement=annule&ref={transactionId}';
const DATA: CheckoutData = { kind: 'orange_money_qr', qrCode: 'QUJD', deepLink: 'https://maxit.example.test/x', deepLinks: { maxit: 'https://maxit.example.test/x', om: null }, shortLink: null, qrId: 'q', validUntil: '2030-01-01T00:00:00.000Z' };

class Fake implements CollectionAdapter {
  provider: Provider = 'orange_money';
  ready = true; checkouts: CheckoutRequest[] = []; result: CheckoutResult = { ok: true, providerReference: ATT, checkoutUrl: null, checkoutData: DATA, expiresAt: '2030-01-01T00:00:00.000Z' };
  status() { return { configured: true, ready: this.ready, reason: 'non prêt' }; }
  createCheckout(r: CheckoutRequest) { this.checkouts.push(r); return Promise.resolve(this.result); }
  verifyWebhook() { return Promise.resolve({ valid: true, event: { eventId: 'e1', type: 't', providerReference: ATT, status: 'confirmed' as const, amount: 6000 } }); }
  getPaymentStatus(): Promise<PaymentStatusResult> { return Promise.resolve({ status: 'confirmed', amount: 6000, providerTransactionId: 'MP1' }); }
}
function fakeDb(row: Partial<SubscriptionAttemptRow> = {}, err?: Error) {
  const calls: string[] = [];
  const attempt: SubscriptionAttemptRow = { id: ATT, shop_id: SHOP, provider: 'orange_money', billing_period: 'quarterly', status: 'initiated', amount: 6000, currency: 'XOF', idempotency_key: 'k', provider_reference: null, checkout_url: null, expires_at: null, ...row };
  const db: SubscriptionInitiateDb & { args: unknown[] } = {
    args: [],
    createAttempt: (...a) => { db.args = a; calls.push('create'); return err ? Promise.reject(err) : Promise.resolve(attempt); },
    saveCheckoutData: () => { calls.push('save'); return Promise.resolve(); },
    setPending: () => { calls.push('pending'); return Promise.resolve(); },
    fail: () => { calls.push('fail'); return Promise.resolve('failed'); },
  };
  return { db, calls };
}
const input = { shopId: SHOP, billingPeriod: 'quarterly' as const, provider: 'orange_money' as const, userId: USER, returnUrl: RET, cancelUrl: CAN };
const on = { settings: { collections_enabled: false, orange_money_enabled: true }, ...quiet };

test('QR créé : montant de la base, validité 30 min, adresse de retour avec ref non devinable', async () => {
  const a = new Fake(); const { db, calls } = fakeDb();
  const r = await initiateSubscriptionPayment(db, a, input, on);
  assert.ok(r.ok && r.amount === 6000 && r.transactionId === ATT && r.checkoutData);
  assert.deepEqual(calls, ['create', 'save', 'pending']);
  assert.equal(a.checkouts[0].amount, 6000);
  assert.equal(a.checkouts[0].validitySeconds, 1800);
  assert.equal(a.checkouts[0].returnUrl, `https://www.ezial.net/abonnement/retour?paiement=retour&ref=${ATT}`);
  assert.equal(a.checkouts[0].orderNumber, subscriptionLabel(ATT));
  assert.deepEqual(db.args, [SHOP, 'quarterly', 'orange_money', USER]);
});
test('le montant ne vient jamais de la requête : champ amount ignoré', async () => {
  const a = new Fake(); const { db } = fakeDb({ amount: 20000, billing_period: 'annual' });
  const r = await initiateSubscriptionPayment(db, a, { ...input, billingPeriod: 'annual', amount: 1 } as never, on);
  assert.ok(r.ok && r.amount === 20000); assert.equal(a.checkouts[0].amount, 20000);
});
test('plan de test test_25 : refusé hors testeur sans rien écrire, accepté pour un testeur (25 FCFA)', async () => {
  const a = new Fake(); let f = fakeDb();
  let r = await initiateSubscriptionPayment(f.db, a, { ...input, billingPeriod: 'test_25' }, { ...on, isTester: false });
  assert.ok(!r.ok && r.code === 'refused' && /testeurs/.test(r.message)); assert.deepEqual(f.calls, []);
  r = await initiateSubscriptionPayment(f.db, a, { ...input, billingPeriod: 'test_25' }, on);
  assert.ok(!r.ok && f.calls.length === 0);
  f = fakeDb({ amount: 25, billing_period: 'test_25' });
  r = await initiateSubscriptionPayment(f.db, a, { ...input, billingPeriod: 'test_25' }, { ...on, isTester: true });
  assert.ok(r.ok && r.amount === 25 && a.checkouts[0].amount === 25 && a.checkouts[0].validitySeconds === 1800);
  assert.ok(isBillingPeriod('test_25'));
});
test('QR encore valable réutilisé : aucun second QR', async () => {
  const a = new Fake(); const { db, calls } = fakeDb({ status: 'pending', checkout_data: DATA, expires_at: '2030-01-01T00:00:00.000Z' });
  const r = await initiateSubscriptionPayment(db, a, input, on);
  assert.ok(r.ok); assert.equal(a.checkouts.length, 0); assert.deepEqual(calls, ['create']);
});
test('interrupteur éteint, adaptateur non prêt, Wave : rien n\'est écrit', async () => {
  for (const [adapter, opts, inp] of [
    [new Fake(), { settings: { collections_enabled: false, orange_money_enabled: false }, ...quiet }, input],
    [Object.assign(new Fake(), { ready: false }), on, input],
    [new Fake(), on, { ...input, provider: 'wave' as const }],
  ] as const) {
    const { db, calls } = fakeDb();
    const r = await initiateSubscriptionPayment(db, adapter, inp, opts);
    assert.ok(!r.ok && r.code === 'not_available'); assert.deepEqual(calls, []);
  }
});
test('requête invalide et adresses non https', async () => {
  const { db, calls } = fakeDb();
  assert.ok(!(await initiateSubscriptionPayment(db, new Fake(), { ...input, shopId: 'x' }, on)).ok);
  assert.ok(!(await initiateSubscriptionPayment(db, new Fake(), { ...input, billingPeriod: 'mensuel' as never }, on)).ok);
  const r = await initiateSubscriptionPayment(db, new Fake(), { ...input, returnUrl: 'http://x' }, on);
  assert.ok(!r.ok && r.code === 'not_available'); assert.deepEqual(calls, []);
  assert.ok(isBillingPeriod('annual') && !isBillingPeriod('especes'));
});
test('refus de la base (boutique d\'un autre) : message métier, 409', async () => {
  const { db } = fakeDb({}, new UserFacingError('Boutique introuvable.'));
  const r = await initiateSubscriptionPayment(db, new Fake(), input, on);
  assert.ok(!r.ok && r.code === 'refused' && r.message === 'Boutique introuvable.');
});
test('boutique officielle : le refus de la base (plans réels) est renvoyé tel quel ; test_25 testeur passe jusqu\'à la base', async () => {
  const a = new Fake();
  let f = fakeDb({}, new UserFacingError('La boutique officielle Ezial est déjà toujours Ezial Plus.'));
  let r = await initiateSubscriptionPayment(f.db, a, input, on);
  assert.ok(!r.ok && r.code === 'refused' && /déjà toujours Ezial Plus/.test(r.message));
  f = fakeDb({ amount: 25, billing_period: 'test_25' });
  r = await initiateSubscriptionPayment(f.db, a, { ...input, billingPeriod: 'test_25' }, { ...on, isTester: true });
  assert.ok(r.ok && r.amount === 25 && f.calls[0] === 'create');
});
test('Orange refuse : tentative close si définitif, gardée si passager', async () => {
  const a = new Fake(); a.result = { ok: false, retryable: false, error: 'refusé' };
  let f = fakeDb(); let r = await initiateSubscriptionPayment(f.db, a, input, on);
  assert.ok(!r.ok && r.code === 'provider_error'); assert.deepEqual(f.calls, ['create', 'fail']);
  a.result = { ok: false, retryable: true, error: 'réseau' };
  f = fakeDb(); r = await initiateSubscriptionPayment(f.db, a, input, on); assert.deepEqual(f.calls, ['create']);
});
test('webhook et rapprochement : une tentative d\'abonnement est vérifiée par la fonction d\'abonnement', async () => {
  const seen: string[] = [];
  const wdb = {
    recordEvent: () => Promise.resolve({ new: true, id: 'ev', processed: false }), markEventProcessed: () => Promise.resolve(),
    findTransactionByReference: () => Promise.resolve({ id: ATT, amount: 6000, status: 'pending', kind: 'subscription' as const }),
    confirm: () => Promise.reject(new Error('non')), fail: () => Promise.reject(new Error('non')),
    recordVerification: (_i: string, _s: string, _a: number | null, _p: string | null, kind?: string) => { seen.push(`w:${kind}`); return Promise.resolve('confirm:confirmed'); },
  } as unknown as WebhookDb;
  const res = await handleCollectionWebhook(wdb, new Fake(), '{}', {}, quiet);
  assert.equal(res.status, 200); assert.deepEqual(seen, ['w:subscription']);
  const rdb: ReconcileDb = {
    candidates: () => Promise.resolve([{ transaction_id: ATT, order_id: null, kind: 'subscription', reference: ATT, status: 'pending', expires_at: null, created_at: new Date().toISOString(), check_count: 0 },
      { transaction_id: SHOP, order_id: USER, reference: SHOP, status: 'pending', expires_at: null, created_at: new Date().toISOString(), check_count: 0 }]),
    recordVerification: (_i, _s, _a, _p, kind) => { seen.push(`r:${kind}`); return Promise.resolve('ok'); },
  };
  const fa = new Fake(); (fa as unknown as { getPaymentStatuses: unknown }).getPaymentStatuses = (refs: string[]) => Promise.resolve(new Map(refs.map((x) => [x, { status: 'confirmed', amount: 6000 } as PaymentStatusResult])));
  await reconcileCollections(rdb, fa, quiet);
  assert.deepEqual(seen.slice(1), ['r:subscription', 'r:undefined']);
});
