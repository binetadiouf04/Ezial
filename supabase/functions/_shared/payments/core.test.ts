// Tests du cœur des paiements — aucun appel réseau, aucune API réelle.
// Lancer : node --test supabase/functions/_shared/payments/core.test.ts
//
// Les faux adaptateurs ci-dessous n'existent QUE dans ce fichier : ils ne
// sont pas accessibles depuis la configuration des Edge Functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_AVAILABLE_MESSAGE,
  OrangeMoneyCollection,
  OrangeMoneyDisbursement,
  UserFacingError,
  WaveCollection,
  WaveDisbursement,
  createAdapters,
  handleCollectionWebhook,
  initiatePayment,
  maskPhone,
  redactPhones,
  runPayouts,
} from './core.ts';
import type {
  AdapterStatus,
  Adapters,
  BalanceResult,
  Capability,
  CheckoutRequest,
  CheckoutResult,
  CollectionAdapter,
  DisbursementAdapter,
  PaymentStatus,
  PaymentStatusResult,
  PaymentsDb,
  PayoutOutcome,
  PayoutRequest,
  PayoutResult,
  PayoutRow,
  PayoutStatusResult,
  Provider,
  RecordEventInput,
  TransactionRow,
  WebhookVerification,
} from './core.ts';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TX_ID = '33333333-3333-4333-8333-333333333333';
// Numéros fictifs (format valide, jamais contactés).
const WAVE_PHONE = '+221770000001';
const OM_PHONE = '+221780000002';

const quiet = { log: () => {} };

// ---------------------------------------------------------------------------
// Faux adaptateurs (tests uniquement)
// ---------------------------------------------------------------------------

class FakeCollection implements CollectionAdapter {
  provider: Provider;
  checkouts: CheckoutRequest[] = [];
  statusChecks: string[] = [];
  webhook: WebhookVerification = { valid: false };
  realStatus: PaymentStatusResult = { status: 'pending', amount: null };

  constructor(provider: Provider) {
    this.provider = provider;
  }

  status(): AdapterStatus {
    return { configured: true, ready: true };
  }

  createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    this.checkouts.push(req);
    return Promise.resolve({ ok: true, providerReference: 'ref_1', checkoutUrl: 'https://paiement.example.test/session/1', expiresAt: null });
  }

  verifyWebhook(): Promise<WebhookVerification> {
    return Promise.resolve(this.webhook);
  }

  getPaymentStatus(ref: string): Promise<PaymentStatusResult> {
    this.statusChecks.push(ref);
    return Promise.resolve(this.realStatus);
  }
}

type SendMode = 'accepted' | 'rejected' | 'uncertain' | 'retryable_before_send' | 'throw';

class FakeDisbursement implements DisbursementAdapter {
  provider: Provider;
  ready = true;
  balance: BalanceResult = { ok: true, available: 1_000_000 };
  sendMode: SendMode = 'accepted';
  /** Statut renvoyé par getPayoutStatus, par clé d'idempotence (défaut : pending). */
  remote: Record<string, PayoutStatusResult> = {};
  sent: PayoutRequest[] = [];
  statusChecks: string[] = [];

  constructor(provider: Provider) {
    this.provider = provider;
  }

  status(): AdapterStatus {
    return this.ready ? { configured: true, ready: true } : { configured: false, ready: false, reason: 'non prêt' };
  }

  getBalance(): Promise<BalanceResult> {
    return Promise.resolve(this.balance);
  }

  sendPayout(req: PayoutRequest): Promise<PayoutResult> {
    this.sent.push(req);
    switch (this.sendMode) {
      case 'accepted':
        return Promise.resolve({ outcome: 'accepted', providerReference: `${this.provider}_tr_${this.sent.length}` });
      case 'rejected':
        return Promise.resolve({ outcome: 'rejected', error: 'Compte destinataire refusé.' });
      case 'uncertain':
        return Promise.resolve({ outcome: 'uncertain', error: 'Délai dépassé.' });
      case 'retryable_before_send':
        return Promise.resolve({ outcome: 'retryable_before_send', error: 'Service momentanément indisponible.' });
      default:
        return Promise.reject(new Error(`Connexion interrompue vers ${WAVE_PHONE}`));
    }
  }

  getPayoutStatus(req: { providerReference: string | null; idempotencyKey: string }): Promise<PayoutStatusResult> {
    this.statusChecks.push(req.idempotencyKey);
    return Promise.resolve(this.remote[req.idempotencyKey] ?? { status: 'pending' });
  }
}

function fakeAdapters() {
  const adapters = {
    collection: { wave: new FakeCollection('wave'), orange_money: new FakeCollection('orange_money') },
    disbursement: { wave: new FakeDisbursement('wave'), orange_money: new FakeDisbursement('orange_money') },
  };
  return adapters;
}

// ---------------------------------------------------------------------------
// Fausse base : reproduit les règles des fonctions SQL utiles aux tests
// ---------------------------------------------------------------------------

class FakeDb implements PaymentsDb {
  createCalls = 0;
  tx: TransactionRow | null = null;
  pending: { id: string; ref: string; url: string }[] = [];
  fails: { id: string; status: string; reason: string }[] = [];
  confirms: { id: string; ref: string; amount: number }[] = [];
  events = new Map<string, { id: string; processed?: string; input: RecordEventInput }>();
  providerStatus: { provider: Provider; capability: Capability; ready: boolean; balance: number | null }[] = [];
  payouts: PayoutRow[] = [];
  results: { id: string; outcome: PayoutOutcome; ref: string | null; error: string | null }[] = [];
  claimCalls = 0;
  prepareCalls = 0;
  txByRef: Record<string, { id: string; amount: number; status: string }> = { ref_1: { id: TX_ID, amount: 25000, status: 'pending' } };

  createTransaction(orderId: string, provider: Provider): Promise<TransactionRow> {
    this.createCalls += 1;
    this.tx = {
      id: TX_ID, order_id: orderId, provider, status: 'initiated', amount: 25000, currency: 'XOF',
      idempotency_key: 'pay_abc', provider_reference: null, checkout_url: null, expires_at: null,
    };
    return Promise.resolve(this.tx);
  }
  getOrderNumber(): Promise<string | null> {
    return Promise.resolve('EZ-0042');
  }
  setPending(id: string, ref: string, url: string): Promise<void> {
    this.pending.push({ id, ref, url });
    return Promise.resolve();
  }
  fail(id: string, status: string, reason: string): Promise<string> {
    this.fails.push({ id, status, reason });
    return Promise.resolve(status);
  }
  recordEvent(input: RecordEventInput): Promise<{ new: boolean; id: string | null; processed: boolean }> {
    const key = `${input.provider}:${input.capability}:${input.providerEventId}`;
    const existing = this.events.get(key);
    if (existing) return Promise.resolve({ new: false, id: existing.id, processed: existing.processed !== undefined });
    const id = `evt_${this.events.size + 1}`;
    this.events.set(key, { id, input });
    return Promise.resolve({ new: true, id, processed: false });
  }
  markEventProcessed(id: string, result: string): Promise<void> {
    for (const e of this.events.values()) if (e.id === id) e.processed = result;
    return Promise.resolve();
  }
  findTransactionByReference(_provider: Provider, ref: string) {
    return Promise.resolve(this.txByRef[ref] ?? null);
  }
  confirm(id: string, ref: string, amount: number): Promise<string> {
    if (this.confirms.some((c) => c.id === id)) return Promise.resolve('already_confirmed');
    this.confirms.push({ id, ref, amount });
    return Promise.resolve('confirmed');
  }
  recordProviderStatus(provider: Provider, capability: Capability, _configured: boolean, ready: boolean, balance: number | null): Promise<void> {
    this.providerStatus.push({ provider, capability, ready, balance });
    return Promise.resolve();
  }
  // payouts_to_reconcile : « unknown » ou « processing » (ancien).
  toReconcile(): Promise<PayoutRow[]> {
    return Promise.resolve(this.payouts.filter((p) => p.status === 'unknown' || p.status === 'processing').map((p) => ({ ...p })));
  }
  prepareDue(): Promise<number> {
    this.prepareCalls += 1;
    return Promise.resolve(0);
  }
  // payouts_claim_batch : seulement « scheduled » / « blocked », passent « processing ».
  claimBatch(limit: number): Promise<PayoutRow[]> {
    this.claimCalls += 1;
    const due = this.payouts.filter((p) => p.status === 'scheduled' || p.status === 'blocked').slice(0, limit);
    for (const p of due) {
      p.status = 'processing';
      p.attempts += 1;
    }
    return Promise.resolve(due.map((p) => ({ ...p })));
  }
  recordPayoutResult(id: string, outcome: PayoutOutcome, ref: string | null, error: string | null): Promise<string> {
    this.results.push({ id, outcome, ref, error });
    const p = this.payouts.find((x) => x.id === id);
    if (!p) return Promise.resolve('not_found');
    if (['succeeded', 'failed', 'cancelled'].includes(p.status)) return Promise.resolve(p.status);
    p.status = outcome === 'retry' ? 'scheduled' : outcome;
    if (ref) p.provider_reference = ref;
    return Promise.resolve(p.status);
  }
}

function payout(id: string, provider: Provider, amount = 10000, status: PayoutRow['status'] = 'scheduled'): PayoutRow {
  return {
    id, shop_id: `shop_${id}`, provider, recipient_phone: provider === 'wave' ? WAVE_PHONE : OM_PHONE, amount, status,
    idempotency_key: `payout_${id}`, provider_reference: null, attempts: 0,
  };
}

const ENABLED = { collections_enabled: true, payouts_enabled: true };
const URLS = { returnUrl: 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=retour', cancelUrl: 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=annule' };

function webhookEvent(status: PaymentStatus, eventId = 'evt_provider_1') {
  return { valid: true, event: { eventId, type: 'payment', providerReference: 'ref_1', status, amount: 25000 } };
}

// ---------------------------------------------------------------------------
// Adaptateurs non configurés (état réel aujourd'hui)
// ---------------------------------------------------------------------------

test('createAdapters : les quatre adaptateurs sont non configurés, quel que soit env', async () => {
  const a: Adapters = createAdapters({ PAYMENTS_ENVIRONMENT: 'production', WAVE_PROVIDER: 'test', PAYMENTS_PROVIDER: 'test' });
  assert.equal(a.environment, 'production');
  assert.equal(createAdapters({}).environment, 'sandbox');
  assert.equal(createAdapters({ PAYMENTS_ENVIRONMENT: 'n_importe' }).environment, 'sandbox');
  assert.equal(a.collection.wave instanceof WaveCollection, true);
  assert.equal(a.collection.orange_money instanceof OrangeMoneyCollection, true);
  assert.equal(a.disbursement.wave instanceof WaveDisbursement, true);
  assert.equal(a.disbursement.orange_money instanceof OrangeMoneyDisbursement, true);
  for (const ad of [a.collection.wave, a.collection.orange_money, a.disbursement.wave, a.disbursement.orange_money]) {
    const s = ad.status();
    assert.equal(s.configured, false);
    assert.equal(s.ready, false);
    assert.match(s.reason ?? '', /^API officielle (Wave|Orange Money) (encaissement|décaissement) non intégrée\.$/);
  }
  assert.equal(a.collection.wave.status().reason, 'API officielle Wave encaissement non intégrée.');
  assert.equal(a.disbursement.orange_money.status().reason, 'API officielle Orange Money décaissement non intégrée.');
  // Les opérations ne font rien et n'aboutissent jamais.
  assert.deepEqual(await a.collection.wave.verifyWebhook('{}', {}), { valid: false });
  assert.equal((await a.collection.orange_money.createCheckout({} as CheckoutRequest)).ok, false);
  assert.ok('error' in (await a.collection.wave.getPaymentStatus('x')));
  assert.equal((await a.disbursement.wave.getBalance()).ok, false);
  assert.equal((await a.disbursement.orange_money.sendPayout({} as PayoutRequest)).outcome, 'retryable_before_send');
  assert.ok('error' in (await a.disbursement.wave.getPayoutStatus({ providerReference: null, idempotencyKey: 'k' })));
});

test('initiatePayment : adaptateur non configuré → not_available, aucune transaction créée', async () => {
  const db = new FakeDb();
  for (const adapter of Object.values(createAdapters({}).collection)) {
    const res = await initiatePayment(db, adapter, { orderId: ORDER_ID, provider: adapter.provider, userId: USER_ID, ...URLS }, { settings: ENABLED, ...quiet });
    assert.deepEqual(res, { ok: false, code: 'not_available', message: NOT_AVAILABLE_MESSAGE });
  }
  assert.equal(db.createCalls, 0);
});

test('initiatePayment : encaissements désactivés → not_available, aucune transaction', async () => {
  const db = new FakeDb();
  const res = await initiatePayment(db, new FakeCollection('wave'), { orderId: ORDER_ID, provider: 'wave', userId: USER_ID, ...URLS },
    { settings: { collections_enabled: false }, ...quiet });
  assert.equal(res.ok, false);
  assert.equal(db.createCalls, 0);
});

test('initiatePayment : adaptateur prêt → transaction, page de paiement, statut pending', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  const res = await initiatePayment(db, adapter, { orderId: ORDER_ID, provider: 'wave', userId: USER_ID, ...URLS }, { settings: ENABLED, ...quiet });
  assert.deepEqual(res, { ok: true, checkoutUrl: 'https://paiement.example.test/session/1', transactionId: TX_ID });
  assert.equal(db.createCalls, 1);
  assert.equal(adapter.checkouts[0].amount, 25000);
  assert.equal(adapter.checkouts[0].idempotencyKey, 'pay_abc');
  assert.equal(adapter.checkouts[0].returnUrl, 'https://www.ezial.net/compte/commande/EZ-0042?paiement=retour');
  assert.deepEqual(db.pending, [{ id: TX_ID, ref: 'ref_1', url: 'https://paiement.example.test/session/1' }]);
});

test('initiatePayment : refus métier de la base → message français transmis', async () => {
  const db = new FakeDb();
  db.createTransaction = () => Promise.reject(new UserFacingError('Cette commande est déjà payée.'));
  const res = await initiatePayment(db, new FakeCollection('wave'), { orderId: ORDER_ID, provider: 'wave', userId: USER_ID, ...URLS }, { settings: ENABLED, ...quiet });
  assert.deepEqual(res, { ok: false, code: 'refused', message: 'Cette commande est déjà payée.' });
});

// ---------------------------------------------------------------------------
// Webhooks d'encaissement
// ---------------------------------------------------------------------------

test('webhook : adaptateur non configuré → 503, rien enregistré', async () => {
  const db = new FakeDb();
  const res = await handleCollectionWebhook(db, createAdapters({}).collection.wave, '{}', {}, quiet);
  assert.equal(res.status, 503);
  assert.equal(db.events.size, 0);
});

test('webhook : signature invalide → 401, ni enregistrement ni confirmation', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = { valid: false, event: webhookEvent('confirmed').event };
  adapter.realStatus = { status: 'confirmed', amount: 25000 };
  const res = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(res.status, 401);
  assert.equal(db.events.size, 0);
  assert.equal(db.confirms.length, 0);
  assert.equal(adapter.statusChecks.length, 0);
});

test('webhook confirmé + statut réel confirmé → payments_confirm une fois, montant du fournisseur', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = { valid: true, event: { ...webhookEvent('confirmed').event, amount: 999999 } };
  adapter.realStatus = { status: 'confirmed', amount: 25000 };
  const res = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(res.status, 200);
  assert.deepEqual(db.confirms, [{ id: TX_ID, ref: 'ref_1', amount: 25000 }]);
  assert.deepEqual(adapter.statusChecks, ['ref_1']);
  assert.equal([...db.events.values()][0].processed, 'confirm:confirmed');
});

test('webhook en double → « duplicate », aucune seconde confirmation', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('orange_money');
  adapter.webhook = webhookEvent('confirmed');
  adapter.realStatus = { status: 'confirmed', amount: 25000 };
  await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  const second = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.deepEqual(second, { status: 200, body: { ok: true, result: 'duplicate' } });
  assert.equal(db.confirms.length, 1);
  assert.equal(adapter.statusChecks.length, 1);
});

test('webhook renvoyé après une vérification impossible → retraité, confirmé une seule fois', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = webhookEvent('confirmed');
  adapter.realStatus = { error: 'API indisponible', retryable: true };
  const first = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(first.status, 503);
  assert.equal([...db.events.values()][0].processed, undefined);
  adapter.realStatus = { status: 'confirmed', amount: 25000 };
  const second = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(second.status, 200);
  assert.equal(db.confirms.length, 1);
  const third = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.deepEqual(third, { status: 200, body: { ok: true, result: 'duplicate' } });
  assert.equal(db.confirms.length, 1);
});

test('webhook « confirmé » mais statut réel « pending » → aucune confirmation', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = webhookEvent('confirmed');
  adapter.realStatus = { status: 'pending', amount: null };
  const res = await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(res.status, 200);
  assert.equal(db.confirms.length, 0);
  assert.equal(db.fails.length, 0);
});

test('webhook confirmé sans montant fourni par l’API → aucune confirmation', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = webhookEvent('confirmed');
  adapter.realStatus = { status: 'confirmed', amount: null };
  await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(db.confirms.length, 0);
});

test('webhook paiement échoué (vérifié) → payments_fail', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = webhookEvent('failed');
  adapter.realStatus = { status: 'failed', amount: null };
  await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(db.confirms.length, 0);
  assert.deepEqual(db.fails.map((f) => [f.id, f.status]), [[TX_ID, 'failed']]);
});

test('webhook pour une référence inconnue → aucune écriture', async () => {
  const db = new FakeDb();
  const adapter = new FakeCollection('wave');
  adapter.webhook = { valid: true, event: { ...webhookEvent('confirmed').event, providerReference: 'ref_inconnue' } };
  adapter.realStatus = { status: 'confirmed', amount: 25000 };
  await handleCollectionWebhook(db, adapter, '{}', {}, quiet);
  assert.equal(db.confirms.length, 0);
});

// ---------------------------------------------------------------------------
// Versements
// ---------------------------------------------------------------------------

test('runPayouts : versements désactivés → rien réservé ni envoyé, état des API enregistré', async () => {
  const db = new FakeDb();
  db.payouts = [payout('p1', 'wave')];
  const adapters = fakeAdapters();
  const s = await runPayouts(db, adapters, { collections_enabled: true, payouts_enabled: false }, quiet);
  assert.equal(s.enabled, false);
  assert.equal(db.claimCalls, 0);
  assert.equal(db.prepareCalls, 0);
  assert.equal(adapters.disbursement.wave.sent.length, 0);
  assert.equal(db.providerStatus.length, 4);
});

test('runPayouts : adaptateurs réels (non configurés) → rien réservé, même si activé', async () => {
  const db = new FakeDb();
  db.payouts = [payout('p1', 'wave')];
  const s = await runPayouts(db, createAdapters({}), ENABLED, quiet);
  assert.equal(db.claimCalls, 0);
  assert.equal(db.prepareCalls, 0);
  assert.equal(s.reason, 'Aucune API de décaissement prête.');
  assert.deepEqual(db.providerStatus.map((x) => x.ready), [false, false, false, false]);
});

test('runPayouts : versement Wave et Orange Money acceptés → unknown → rapprochés « succeeded »', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave', 15000), payout('po', 'orange_money', 8000)];
  const adapters = fakeAdapters();

  const run1 = await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(run1.accepted, 2);
  assert.equal(adapters.disbursement.wave.sent.length, 1);
  assert.equal(adapters.disbursement.orange_money.sent.length, 1);
  assert.equal(adapters.disbursement.wave.sent[0].idempotencyKey, 'payout_pw');
  assert.equal(adapters.disbursement.orange_money.sent[0].amount, 8000);
  // Acceptés ≠ réussis : « unknown » tant que le fournisseur ne confirme pas.
  assert.deepEqual(db.payouts.map((p) => p.status), ['unknown', 'unknown']);

  adapters.disbursement.wave.remote.payout_pw = { status: 'succeeded' };
  adapters.disbursement.orange_money.remote.payout_po = { status: 'succeeded' };
  const run2 = await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(run2.reconciled, 2);
  assert.deepEqual(db.payouts.map((p) => p.status), ['succeeded', 'succeeded']);
  // Aucun second envoi.
  assert.equal(adapters.disbursement.wave.sent.length, 1);
  assert.equal(adapters.disbursement.orange_money.sent.length, 1);
});

test('runPayouts : confirmation immédiate après acceptation → succeeded dans le même passage', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.remote.payout_pw = { status: 'succeeded', providerReference: 'wave_tr_1' };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'succeeded');
  assert.deepEqual(db.results.map((r) => r.outcome), ['unknown', 'succeeded']);
});

test('runPayouts : fonds insuffisants → bloqué, aucun envoi', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave', 50000)];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.balance = { ok: true, available: 10000 };
  const s = await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(s.blocked, 1);
  assert.equal(adapters.disbursement.wave.sent.length, 0);
  assert.deepEqual(db.results[0], { id: 'pw', outcome: 'blocked', ref: null, error: 'Fonds insuffisants sur le compte Wave' });
});

test('runPayouts : solde indisponible → bloqué, aucun envoi', async () => {
  const db = new FakeDb();
  db.payouts = [payout('po', 'orange_money')];
  const adapters = fakeAdapters();
  adapters.disbursement.orange_money.balance = { ok: false, error: 'indisponible' };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(adapters.disbursement.orange_money.sent.length, 0);
  assert.equal(db.results[0].outcome, 'blocked');
  assert.match(db.results[0].error ?? '', /API Orange Money indisponible/);
});

test('runPayouts : fonds Wave et Orange Money séparés (solde Wave vide n’empêche pas Orange Money)', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave', 20000), payout('po', 'orange_money', 20000)];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.balance = { ok: true, available: 0 };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(adapters.disbursement.wave.sent.length, 0);
  assert.equal(adapters.disbursement.orange_money.sent.length, 1);
  assert.equal(db.payouts[0].status, 'blocked');
});

test('runPayouts : API d’un seul fournisseur prête → l’autre est bloqué sans envoi', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave'), payout('po', 'orange_money')];
  const adapters = fakeAdapters();
  adapters.disbursement.orange_money.ready = false;
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(adapters.disbursement.wave.sent.length, 1);
  assert.equal(adapters.disbursement.orange_money.sent.length, 0);
  assert.equal(db.payouts[1].status, 'blocked');
});

test('runPayouts : refus définitif → failed', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.sendMode = 'rejected';
  const s = await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(s.failed, 1);
  assert.equal(db.payouts[0].status, 'failed');
});

test('runPayouts : erreur avant envoi → retry (re-planifié)', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.sendMode = 'retryable_before_send';
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.results[0].outcome, 'retry');
  assert.equal(db.payouts[0].status, 'scheduled');
});

test('runPayouts : réponse incertaine → unknown, jamais renvoyé avant rapprochement', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.sendMode = 'uncertain';
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'unknown');

  // Passages suivants : le fournisseur dit « pending » → toujours pas renvoyé.
  adapters.disbursement.wave.sendMode = 'accepted';
  await runPayouts(db, adapters, ENABLED, quiet);
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(adapters.disbursement.wave.sent.length, 1);
  assert.equal(db.payouts[0].status, 'unknown');

  // Le fournisseur confirme : réussi, toujours un seul envoi.
  adapters.disbursement.wave.remote.payout_pw = { status: 'succeeded', providerReference: 'wave_tr_x' };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'succeeded');
  assert.equal(db.payouts[0].provider_reference, 'wave_tr_x');
  assert.equal(adapters.disbursement.wave.sent.length, 1);
});

test('runPayouts : exception pendant l’envoi → unknown (pas de renvoi), numéro masqué dans les journaux', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.sendMode = 'throw';
  const lines: string[] = [];
  await runPayouts(db, adapters, ENABLED, { log: (l) => lines.push(l) });
  assert.equal(db.payouts[0].status, 'unknown');
  assert.ok(!lines.join('\n').includes(WAVE_PHONE));
  assert.ok(!(db.results[0].error ?? '').includes(WAVE_PHONE));
  assert.ok(lines.some((l) => l.includes(maskPhone(WAVE_PHONE))));
});

test('runPayouts : rapprochement « not_found » → reste unknown, jamais renvoyé ni échoué', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave', 10000, 'unknown')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.remote.payout_pw = { status: 'not_found' };
  await runPayouts(db, adapters, ENABLED, quiet);
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'unknown');
  assert.equal(adapters.disbursement.wave.sent.length, 0);
  assert.ok(!db.results.some((r) => r.outcome === 'failed'));
});

test('runPayouts : « processing » ancien (passage interrompu) → rapproché, jamais renvoyé', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave', 10000, 'processing')];
  const adapters = fakeAdapters();
  adapters.disbursement.wave.remote.payout_pw = { status: 'not_found' };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'unknown');
  assert.equal(adapters.disbursement.wave.sent.length, 0);
});

test('runPayouts : rapprochement « failed » explicite → failed', async () => {
  const db = new FakeDb();
  db.payouts = [payout('po', 'orange_money', 10000, 'unknown')];
  const adapters = fakeAdapters();
  adapters.disbursement.orange_money.remote.payout_po = { status: 'failed' };
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(db.payouts[0].status, 'failed');
  assert.equal(adapters.disbursement.orange_money.sent.length, 0);
});

test('runPayouts : double passage / double réservation → un même versement n’est jamais envoyé deux fois', async () => {
  const db = new FakeDb();
  db.payouts = [payout('pw', 'wave')];
  const adapters = fakeAdapters();
  // Base défaillante qui renverrait deux fois le même versement dans un lot.
  const original = db.claimBatch.bind(db);
  db.claimBatch = async (limit: number) => {
    const rows = await original(limit);
    return [...rows, ...rows];
  };
  await runPayouts(db, adapters, ENABLED, quiet);
  await runPayouts(db, adapters, ENABLED, quiet);
  assert.equal(adapters.disbursement.wave.sent.length, 1);
});

test('maskPhone / redactPhones : aucun numéro complet', () => {
  assert.equal(maskPhone(WAVE_PHONE), '+22177•••01');
  assert.ok(!redactPhones(`échec pour ${OM_PHONE} et 77 000 00 01`).includes('780000002'));
});
