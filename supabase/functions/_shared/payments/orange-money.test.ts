// Tests de l'adaptateur Orange Money « QR CODE – OM » avec un FAUX serveur Orange :
// aucun appel réseau, aucune transaction réelle, aucun identifiant réel.
// Lancer : node --experimental-strip-types --test supabase/functions/_shared/payments/orange-money.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrangeMoneyCollection, fetchSandboxTestNumbers, mapOrangeStatus, sanitizeMerchantName, summarizeTransactions, ORANGE_BASE_URLS } from './orange-money.ts';
import type { FetchLike } from './orange-money.ts';
import { createAdapters, handleCollectionWebhook, initiatePayment, reconcileCollections } from './core.ts';
import type { CheckoutData, InitiateDb, PaymentStatus, ReconcileCandidate, ReconcileDb, RecordEventInput, TransactionRow, WebhookDb } from './core.ts';

const CALLBACK_KEY = 'cle-de-callback-fictive-0123456789abcdef';
const ENV = {
  ORANGE_MONEY_CLIENT_ID: 'client-fictif',
  ORANGE_MONEY_CLIENT_SECRET: 'secret-fictif',
  ORANGE_MONEY_MERCHANT_CODE: '123456',
  ORANGE_MONEY_MERCHANT_NAME: 'Ézial Boutique — Dakar !',
  ORANGE_MONEY_CALLBACK_API_KEY: CALLBACK_KEY,
};
const TX = '33333333-3333-4333-8333-333333333333';
const ORDER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_MSISDN = '786258731';
const quiet = { log: () => {} };

type Req = { method: string; url: string; headers: Record<string, string>; body?: string };
type Reply = { status: number; body: unknown } | 'network';

/** Faux serveur Orange : réponses programmables par chemin, journal des requêtes. */
class FakeOrange {
  requests: Req[] = [];
  tokenCalls = 0;
  tokenTtl = 3600;
  routes: Record<string, Reply[]> = {};
  fetch: FetchLike = async (url, init) => {
    const req: Req = { method: init.method, url, headers: init.headers, body: init.body };
    this.requests.push(req);
    const path = new URL(url).pathname;
    if (path === '/oauth/v1/token') {
      this.tokenCalls += 1;
      return resp(200, { access_token: `jeton-${this.tokenCalls}`, token_type: 'bearer', expires_in: this.tokenTtl, scope: 'x' });
    }
    const queue = this.routes[`${init.method} ${path}`] ?? [];
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (!reply) return resp(404, { code: '60', detail: 'Resource not found' });
    if (reply === 'network') throw new Error('connexion interrompue');
    return resp(reply.status, reply.body);
  };
  on(method: string, path: string, ...replies: Reply[]) {
    this.routes[`${method} ${path}`] = replies;
    return this;
  }
  last(path: string): Req {
    const r = [...this.requests].reverse().find((x) => new URL(x.url).pathname === path);
    assert.ok(r, `aucune requête vers ${path}`);
    return r;
  }
}
function resp(status: number, body: unknown) {
  return Promise.resolve({ status, text: () => Promise.resolve(JSON.stringify(body)) });
}

const QR_OK = {
  status: 200,
  body: {
    deepLink: 'https://sugu.orange-sonatel.com/mp/123456789',
    deepLinks: { MAXIT: 'https://sugu.orange-sonatel.com/mp/maxit', OM: 'https://sugu.orange-sonatel.com/mp/om' },
    qrCode: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    validity: 1200,
    shortLink: 'https://s.orange-sonatel.com/aBc123',
    qrId: 'dFhuPYHJi4BCoCx64L2s',
    validFor: { startDateTime: '2026-11-20T10:00:00.000Z', endDateTime: '2026-11-20T10:20:00.000Z' },
  },
};

function adapter(fake: FakeOrange, env: Record<string, string> = ENV, environment: 'sandbox' | 'production' = 'sandbox', now = () => Date.parse('2026-11-20T10:00:00Z')) {
  return new OrangeMoneyCollection(environment, env, fake.fetch, now);
}
const checkoutReq = (validitySeconds?: number) => ({
  transactionId: TX, idempotencyKey: 'pay_x', amount: 31500, currency: 'XOF' as const, orderNumber: 'EZI-261120-000007',
  returnUrl: 'https://www.ezial.net/compte/commande/EZI-261120-000007?paiement=retour',
  cancelUrl: 'https://www.ezial.net/compte/commande/EZI-261120-000007?paiement=annule', validitySeconds,
});

// ── Configuration ───────────────────────────────────────────────────────────
test('configuration : sans secrets -> non prêt, noms des secrets manquants (jamais leurs valeurs)', () => {
  const s = new OrangeMoneyCollection('sandbox', {}, new FakeOrange().fetch).status();
  assert.equal(s.ready, false);
  assert.match(s.reason ?? '', /ORANGE_MONEY_CLIENT_ID/);
  const bad = new OrangeMoneyCollection('sandbox', { ...ENV, ORANGE_MONEY_MERCHANT_CODE: '12345', ORANGE_MONEY_CALLBACK_API_KEY: 'court' }, new FakeOrange().fetch).status();
  assert.equal(bad.ready, false);
  assert.match(bad.reason ?? '', /MERCHANT_CODE \(6 chiffres\)/);
  assert.match(bad.reason ?? '', /CALLBACK_API_KEY \(24 caractères minimum\)/);
  assert.ok(!(bad.reason ?? '').includes('secret-fictif'));
  assert.equal(adapter(new FakeOrange()).status().ready, true);
});

test('configuration : bac à sable / production = adresses officielles Orange Sonatel', async () => {
  for (const env of ['sandbox', 'production'] as const) {
    const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
    await adapter(fake, ENV, env).createCheckout(checkoutReq());
    assert.ok(fake.requests.every((r) => r.url.startsWith(ORANGE_BASE_URLS[env] + '/')));
  }
  assert.equal(ORANGE_BASE_URLS.sandbox, 'https://api.sandbox.orange-sonatel.com');
  assert.equal(ORANGE_BASE_URLS.production, 'https://api.orange-sonatel.com');
});

test('createAdapters : l\'adaptateur Orange lit ses secrets ; Wave reste non configuré', () => {
  const a = createAdapters({ ...ENV, PAYMENTS_ENVIRONMENT: 'sandbox' }, new FakeOrange().fetch);
  assert.equal(a.collection.orange_money.status().ready, true);
  assert.equal(a.collection.wave.status().ready, false);
  assert.equal(a.disbursement.orange_money.status().ready, false);
});

// ── Jeton OAuth ─────────────────────────────────────────────────────────────
test('jeton : POST /oauth/v1/token en formulaire client_credentials, mis en cache', async () => {
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  const a = adapter(fake);
  await a.createCheckout(checkoutReq());
  await a.createCheckout(checkoutReq());
  const t = fake.last('/oauth/v1/token');
  assert.equal(t.method, 'POST');
  assert.equal(t.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(t.body);
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('client_id'), 'client-fictif');
  assert.equal(form.get('client_secret'), 'secret-fictif');
  assert.equal(fake.tokenCalls, 1, 'un seul jeton pour deux appels');
  assert.equal(fake.last('/api/eWallet/v4/qrcode').headers.Authorization, 'Bearer jeton-1');
});

test('jeton : renouvelé avant expiration, et après un 401 (une seule nouvelle tentative)', async () => {
  let clock = Date.parse('2026-11-20T10:00:00Z');
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  fake.tokenTtl = 120;
  const a = new OrangeMoneyCollection('sandbox', ENV, fake.fetch, () => clock);
  await a.createCheckout(checkoutReq());
  clock += 90 * 1000;                                   // moins de 60 s restantes : renouvellement
  await a.createCheckout(checkoutReq());
  assert.equal(fake.tokenCalls, 2);
  const fake2 = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', { status: 401, body: { code: '10' } }, QR_OK);
  const r = await adapter(fake2).createCheckout(checkoutReq());
  assert.equal(r.ok, true);
  assert.equal(fake2.tokenCalls, 2, 'jeton redemandé après 401');
  const fake3 = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', { status: 401, body: { code: '10' } });
  const r3 = await adapter(fake3).createCheckout(checkoutReq());
  assert.equal(r3.ok, false);
  assert.equal(fake3.requests.filter((x) => x.url.includes('qrcode')).length, 2, 'jamais plus d\'une nouvelle tentative');
});

// ── Création du QR ──────────────────────────────────────────────────────────
test('QR : requête conforme à la documentation (code, nom ASCII, montant XOF, validité, référence)', async () => {
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  const r = await adapter(fake).createCheckout(checkoutReq(1200));
  const req = fake.last('/api/eWallet/v4/qrcode');
  const body = JSON.parse(req.body ?? '{}');
  assert.equal(req.method, 'POST');
  assert.equal(body.code, '123456');
  assert.equal(body.name, 'Ezial Boutique Dakar');
  assert.deepEqual(body.amount, { value: 31500, unit: 'XOF' });
  assert.equal(body.validity, 1200);
  assert.equal(body.reference, TX, 'la référence = identifiant de la tentative Ezial');
  assert.equal(body.metadata.orderNumber, 'EZI-261120-000007');
  assert.match(body.callbackSuccessUrl, /^https:\/\/www\.ezial\.net\//);
  assert.equal(req.headers['X-Callback-Url'], undefined, 'pas d\'en-tête de callback sans configuration');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.checkoutUrl, null, 'pas de page hébergée : QR et liens');
  assert.equal(r.providerReference, TX);
  assert.equal(r.expiresAt, '2026-11-20T10:20:00.000Z');
  const d = r.checkoutData as CheckoutData;
  assert.equal(d.qrCode, QR_OK.body.qrCode);
  assert.equal(d.deepLinks.maxit, 'https://sugu.orange-sonatel.com/mp/maxit');
  assert.equal(d.deepLinks.om, 'https://sugu.orange-sonatel.com/mp/om');
  assert.equal(d.shortLink, 'https://s.orange-sonatel.com/aBc123');
});

test('QR : validité bornée (60 s à 86 400 s, 30 min par défaut), callback et X-Api-Key si configurés', async () => {
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  const a = adapter(fake, { ...ENV, ORANGE_MONEY_CALLBACK_URL: 'https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=orange_money', ORANGE_MONEY_API_KEY: 'cle-api' });
  await a.createCheckout(checkoutReq(5));
  assert.equal(JSON.parse(fake.last('/api/eWallet/v4/qrcode').body ?? '{}').validity, 60);
  await a.createCheckout(checkoutReq(999999));
  assert.equal(JSON.parse(fake.last('/api/eWallet/v4/qrcode').body ?? '{}').validity, 86400);
  await a.createCheckout(checkoutReq());
  const last = fake.last('/api/eWallet/v4/qrcode');
  assert.equal(JSON.parse(last.body ?? '{}').validity, 1800);
  assert.match(last.headers['X-Callback-Url'], /^https:\/\/lkqezdrdbogtborgjvlw\.supabase\.co\//);
  assert.equal(last.headers['X-Api-Key'], 'cle-api');
});

test('QR : erreurs classées (refus définitif / nouvelle tentative possible), sans numéro en clair', async () => {
  const cases: [Reply, boolean][] = [
    [{ status: 400, body: { code: '2041', detail: 'Transaction not allowed 771234567' } }, false],
    [{ status: 403, body: { code: '11' } }, false],
    [{ status: 429, body: { code: '9' } }, true],
    [{ status: 500, body: { code: '51' } }, true],
    [{ status: 503, body: { code: '5' } }, true],
    ['network', true],
  ];
  for (const [reply, retryable] of cases) {
    const r = await adapter(new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', reply)).createCheckout(checkoutReq());
    assert.equal(r.ok, false);
    if (r.ok) continue;
    assert.equal(r.retryable, retryable, JSON.stringify(reply));
    assert.ok(!r.error.includes('771234567'), 'numéro masqué');
  }
  const incomplete = await adapter(new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', { status: 200, body: { deepLink: 'http://pas-https', qrCode: '' } })).createCheckout(checkoutReq());
  assert.equal(incomplete.ok, false, 'lien non https et QR vide : refusé');
  const notConfigured = await new OrangeMoneyCollection('sandbox', {}, new FakeOrange().fetch).createCheckout(checkoutReq());
  assert.equal(notConfigured.ok, false);
});

// ── Callback ────────────────────────────────────────────────────────────────
const CALLBACK_BODY = JSON.stringify({
  amount: { value: 31500, unit: 'XOF' }, partner: { idType: 'CODE', id: '123456' }, customer: { idType: 'MSISDN', id: CUSTOMER_MSISDN },
  reference: TX, type: 'MERCHANT_PAYMENT', channel: 'API', transactionId: 'MP220928.1029.C58502', paymentMethod: 'QRCODE', status: 'SUCCESS',
});

test('callback : clé « Basic » obligatoire et exacte, sinon rejeté', async () => {
  const a = adapter(new FakeOrange());
  assert.equal((await a.verifyWebhook(CALLBACK_BODY, {})).valid, false);
  assert.equal((await a.verifyWebhook(CALLBACK_BODY, { authorization: 'Basic mauvaise-cle' })).valid, false);
  assert.equal((await a.verifyWebhook(CALLBACK_BODY, { authorization: `Bearer ${CALLBACK_KEY}` })).valid, false);
  const ok = await a.verifyWebhook(CALLBACK_BODY, { authorization: `Basic ${CALLBACK_KEY}` });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.event, { eventId: 'MP220928.1029.C58502:SUCCESS', type: 'MERCHANT_PAYMENT', providerReference: TX, status: 'confirmed', amount: 31500 });
  assert.ok(!JSON.stringify(ok.event).includes(CUSTOMER_MSISDN), 'le numéro du client n\'est pas conservé');
  assert.equal((await a.verifyWebhook('pas du json', { authorization: `Basic ${CALLBACK_KEY}` })).valid, false);
  assert.equal((await a.verifyWebhook(JSON.stringify({ status: 'SUCCESS' }), { authorization: `Basic ${CALLBACK_KEY}` })).valid, false);
});

// ── Vérification du statut (source de vérité) ───────────────────────────────
test('statuts : correspondance Orange -> Ezial', () => {
  assert.equal(mapOrangeStatus('SUCCESS'), 'confirmed');
  for (const s of ['FAILED', 'REJECTED']) assert.equal(mapOrangeStatus(s), 'failed');
  assert.equal(mapOrangeStatus('CANCELLED'), 'cancelled');
  for (const s of ['PENDING', 'ACCEPTED', 'INITIATED', 'PRE_INITIATED']) assert.equal(mapOrangeStatus(s), 'pending');
  assert.equal(mapOrangeStatus('NOUVEAU'), 'unknown');
  assert.equal(sanitizeMerchantName('Ézial — Boutique ! '), 'Ezial Boutique');
});

test('vérification : recherche par référence et type MERCHANT_PAYMENT ; résumés', async () => {
  const tx = (status: string, extra: Record<string, unknown> = {}) => ({ reference: TX, type: 'MERCHANT_PAYMENT', status, transactionId: 'MP1', amount: { value: 31500, unit: 'XOF' }, ...extra });
  const fake = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: [tx('SUCCESS')] });
  const r = await adapter(fake).getPaymentStatus(TX);
  const q = new URL(fake.last('/api/eWallet/v1/transactions').url).searchParams;
  assert.equal(q.get('reference'), TX);
  assert.equal(q.get('type'), 'MERCHANT_PAYMENT');
  assert.deepEqual(r, { status: 'confirmed', amount: 31500, providerTransactionId: 'MP1', successCount: 1 });
  assert.deepEqual(summarizeTransactions([]), { status: 'not_found', amount: null, providerTransactionId: null });
  assert.equal((summarizeTransactions([tx('PENDING')]) as { status: PaymentStatus }).status, 'pending');
  assert.equal((summarizeTransactions([tx('FAILED')]) as { status: PaymentStatus }).status, 'failed');
  assert.equal((summarizeTransactions([tx('FAILED'), tx('SUCCESS')]) as { status: PaymentStatus }).status, 'confirmed', 'un paiement réussi l\'emporte');
  assert.equal((summarizeTransactions([tx('SUCCESS', { amount: { value: 31500, unit: 'EUR' } })]) as { amount: number | null }).amount, null, 'devise autre que XOF : pas de montant, donc pas de confirmation');
  assert.equal((summarizeTransactions([tx('SUCCESS'), tx('SUCCESS')]) as { successCount?: number }).successCount, 2);
  const err = await adapter(new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 503, body: { code: '5' } })).getPaymentStatus(TX);
  assert.deepEqual(err, { error: 'recherche refusée (HTTP 503, code 5)', retryable: true });
});

test('vérification groupée : UNE recherche pour plusieurs références ; recherche incomplète -> « unknown », jamais « not_found »', async () => {
  const ref = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const fake = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: [
    { reference: ref(1), type: 'MERCHANT_PAYMENT', status: 'SUCCESS', transactionId: 'MPA', amount: { value: 5000, unit: 'XOF' } },
    { reference: ref(2), type: 'MERCHANT_PAYMENT', status: 'PENDING', transactionId: 'MPB' },
    { reference: 'autre-marchand', type: 'MERCHANT_PAYMENT', status: 'SUCCESS' },
  ] });
  const res = await adapter(fake).getPaymentStatuses([ref(1), ref(2), ref(3)], '2026-11-20T09:00:00.000Z');
  assert.ok(res instanceof Map);
  if (!(res instanceof Map)) return;
  assert.equal(fake.requests.filter((r) => r.url.includes('/transactions')).length, 1, 'une seule recherche');
  assert.equal((res.get(ref(1)) as { status: string }).status, 'confirmed');
  assert.equal((res.get(ref(2)) as { status: string }).status, 'pending');
  assert.equal((res.get(ref(3)) as { status: string }).status, 'not_found');
  const full = Array.from({ length: 500 }, (_, i) => ({ reference: `x${i}`, type: 'MERCHANT_PAYMENT', status: 'SUCCESS' }));
  const big = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: full });
  const res2 = await adapter(big).getPaymentStatuses([ref(3)], '2026-11-20T09:00:00.000Z');
  assert.ok(res2 instanceof Map);
  if (res2 instanceof Map) assert.equal((res2.get(ref(3)) as { status: string }).status, 'unknown', 'pages non toutes lues : on ne conclut pas');
});

// ── Intégration avec le cœur des paiements ──────────────────────────────────
class Db implements InitiateDb, WebhookDb, ReconcileDb {
  deadline: string | null = '2026-11-20T10:20:00.000Z';
  saved: CheckoutData[] = [];
  pending: { ref: string; url: string | null; expires: string | null }[] = [];
  verifications: { id: string; status: PaymentStatus; amount: number | null; txId: string | null }[] = [];
  events = new Map<string, { id: string; processed?: string }>();
  cands: ReconcileCandidate[] = [];
  createTransaction(): Promise<TransactionRow> {
    return Promise.resolve({ id: TX, order_id: ORDER, provider: 'orange_money', status: 'initiated', amount: 31500, currency: 'XOF', idempotency_key: 'pay_x', provider_reference: null, checkout_url: null, expires_at: null });
  }
  getOrderNumber() { return Promise.resolve('EZI-261120-000007'); }
  getPaymentDeadline() { return Promise.resolve(this.deadline); }
  saveCheckoutData(_id: string, d: CheckoutData) { this.saved.push(d); return Promise.resolve(); }
  setPending(_id: string, ref: string, url: string | null, expires: string | null) { this.pending.push({ ref, url, expires }); return Promise.resolve(); }
  fail() { return Promise.resolve('failed'); }
  recordEvent(input: RecordEventInput) {
    const e = this.events.get(input.providerEventId);
    if (e) return Promise.resolve({ new: false, id: e.id, processed: e.processed !== undefined });
    const id = `evt_${this.events.size + 1}`;
    this.events.set(input.providerEventId, { id });
    return Promise.resolve({ new: true, id, processed: false });
  }
  markEventProcessed(id: string, result: string) { for (const e of this.events.values()) if (e.id === id) e.processed = result; return Promise.resolve(); }
  findTransactionByReference(_p: string, ref: string) { return Promise.resolve(ref === TX ? { id: TX, amount: 31500, status: 'pending' } : null); }
  confirm(): Promise<string> { throw new Error('confirm ne doit pas être appelé directement'); }
  recordVerification(id: string, status: PaymentStatus, amount: number | null, txId: string | null) {
    this.verifications.push({ id, status, amount, txId });
    return Promise.resolve(status === 'confirmed' ? (amount === null ? 'amount_missing' : 'confirm:confirmed') : 'waiting');
  }
  candidates() { return Promise.resolve(this.cands); }
}
const URLS = { returnUrl: 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=retour', cancelUrl: 'https://www.ezial.net/compte/commande/{orderNumber}?paiement=annule' };
const NOW = () => Date.parse('2026-11-20T10:00:00Z');

test('lancement : interrupteur Orange éteint -> rien n\'est créé ; Wave reste piloté par son propre réglage', async () => {
  const db = new Db();
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  const off = await initiatePayment(db, adapter(fake), { orderId: ORDER, provider: 'orange_money', userId: USER, ...URLS }, { settings: { collections_enabled: true, orange_money_enabled: false }, ...quiet, now: NOW });
  assert.equal(off.ok, false);
  assert.equal(fake.requests.length, 0, 'aucun appel à Orange');
});

test('lancement : QR valable jusqu\'à la fin du délai de la commande, données enregistrées, aucune page hébergée', async () => {
  const db = new Db();
  const fake = new FakeOrange().on('POST', '/api/eWallet/v4/qrcode', QR_OK);
  const res = await initiatePayment(db, adapter(fake), { orderId: ORDER, provider: 'orange_money', userId: USER, ...URLS }, { settings: { collections_enabled: false, orange_money_enabled: true }, ...quiet, now: NOW });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(JSON.parse(fake.last('/api/eWallet/v4/qrcode').body ?? '{}').validity, 1200, '20 minutes restantes -> QR de 20 minutes');
  assert.equal(res.checkoutUrl, null);
  assert.equal(res.checkoutData?.deepLinks.maxit, 'https://sugu.orange-sonatel.com/mp/maxit');
  assert.equal(res.expiresAt, '2026-11-20T10:20:00.000Z');
  assert.equal(db.saved.length, 1);
  assert.deepEqual(db.pending, [{ ref: TX, url: null, expires: '2026-11-20T10:20:00.000Z' }]);
  db.deadline = '2026-11-20T10:00:30.000Z';
  const late = await initiatePayment(db, adapter(new FakeOrange()), { orderId: ORDER, provider: 'orange_money', userId: USER, ...URLS }, { settings: { collections_enabled: false, orange_money_enabled: true }, ...quiet, now: NOW });
  assert.deepEqual(late, { ok: false, code: 'refused', message: 'Le délai de paiement est dépassé.' });
});

test('callback : le statut et le montant viennent de l\'API Orange, jamais du callback', async () => {
  const db = new Db();
  const logs: string[] = [];
  const fake = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: [{ reference: TX, type: 'MERCHANT_PAYMENT', status: 'PENDING', transactionId: 'MP220928.1029.C58502' }] });
  const res = await handleCollectionWebhook(db, adapter(fake), CALLBACK_BODY, { authorization: `Basic ${CALLBACK_KEY}` }, { log: (l) => logs.push(l) });
  assert.equal(res.status, 200);
  assert.deepEqual(db.verifications, [{ id: TX, status: 'pending', amount: null, txId: 'MP220928.1029.C58502' }], 'callback « SUCCESS » mais API « PENDING » : pas de confirmation');
  assert.ok(logs.every((l) => !l.includes(CUSTOMER_MSISDN)), 'numéro du client absent des journaux');
  const again = await handleCollectionWebhook(db, adapter(fake), CALLBACK_BODY, { authorization: `Basic ${CALLBACK_KEY}` }, quiet);
  assert.equal(again.body.result, 'duplicate', 'même notification : traitée une seule fois');
});

test('callback : confirmation avec le montant de l\'API ; clé invalide -> 401 sans rien enregistrer', async () => {
  const db = new Db();
  const fake = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: [{ reference: TX, type: 'MERCHANT_PAYMENT', status: 'SUCCESS', transactionId: 'MPX', amount: { value: 31500, unit: 'XOF' } }] });
  const res = await handleCollectionWebhook(db, adapter(fake), CALLBACK_BODY, { authorization: `Basic ${CALLBACK_KEY}` }, quiet);
  assert.equal(res.body.result, 'verify:confirm:confirmed');
  assert.deepEqual(db.verifications, [{ id: TX, status: 'confirmed', amount: 31500, txId: 'MPX' }]);
  const db2 = new Db();
  const forged = await handleCollectionWebhook(db2, adapter(fake), CALLBACK_BODY, { authorization: 'Basic fausse-cle' }, quiet);
  assert.equal(forged.status, 401);
  assert.equal(db2.events.size + db2.verifications.length, 0);
});

test('vérification périodique : une recherche, chaque tentative enregistrée ; Orange indisponible -> aucune écriture', async () => {
  const db = new Db();
  const cand = (n: number): ReconcileCandidate => ({ transaction_id: `t${n}`, order_id: ORDER, reference: `r${n}`, status: 'pending', expires_at: null, created_at: '2026-11-20T09:50:00Z', check_count: 0 });
  db.cands = [cand(1), cand(2), cand(3)];
  const fake = new FakeOrange().on('GET', '/api/eWallet/v1/transactions', { status: 200, body: [
    { reference: 'r1', type: 'MERCHANT_PAYMENT', status: 'SUCCESS', transactionId: 'M1', amount: { value: 31500, unit: 'XOF' } },
    { reference: 'r2', type: 'MERCHANT_PAYMENT', status: 'FAILED', transactionId: 'M2' },
  ] });
  const sum = await reconcileCollections(db, adapter(fake), quiet);
  assert.equal(fake.requests.filter((r) => r.url.includes('/transactions')).length, 1);
  assert.equal(new URL(fake.last('/api/eWallet/v1/transactions').url).searchParams.get('fromDateTime'), '2026-11-20T09:48:00.000Z');
  assert.deepEqual(db.verifications.map((v) => [v.id, v.status, v.amount]), [['t1', 'confirmed', 31500], ['t2', 'failed', null], ['t3', 'not_found', null]]);
  assert.equal(sum.checked, 3);
  const db2 = new Db();
  db2.cands = [cand(1)];
  const down = await reconcileCollections(db2, adapter(new FakeOrange().on('GET', '/api/eWallet/v1/transactions', 'network')), quiet);
  assert.equal(down.error, 'provider_unavailable');
  assert.equal(db2.verifications.length, 0, 'aucune conclusion sans réponse d\'Orange');
  const off = await reconcileCollections(new Db(), new OrangeMoneyCollection('sandbox', {}, new FakeOrange().fetch), quiet);
  assert.equal(off.error, 'not_configured');
});

test('enregistrement du callback marchand : code, nom, adresse https et clé', async () => {
  const fake = new FakeOrange().on('POST', '/api/notification/v1/merchantcallback', { status: 201, body: {} });
  const ok = await adapter(fake).registerCallback('https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=orange_money');
  assert.deepEqual(ok, { ok: true });
  const body = JSON.parse(fake.last('/api/notification/v1/merchantcallback').body ?? '{}');
  assert.equal(body.code, '123456');
  assert.equal(body.apiKey, CALLBACK_KEY);
  assert.match(body.callbackUrl, /^https:\/\//);
  assert.equal((await adapter(fake).registerCallback('http://pas-https')).ok, false);
});

test('mode test : numéros de test Orange (sandbox uniquement, identifiants seuls)', async () => {
  const o = new FakeOrange();
  o.routes['GET /api/assignments/v1/partner/sim-cards'] = [{ status: 200, body: [{ type: 'MERCHANT', msisdn: '770000000', code: '654321' }] }];
  const ok = await fetchSandboxTestNumbers({ ORANGE_MONEY_CLIENT_ID: 'c', ORANGE_MONEY_CLIENT_SECRET: 's' }, o.fetch);
  assert.deepEqual(ok, { ok: true, body: [{ type: 'MERCHANT', msisdn: '770000000', code: '654321' }] });
  assert.ok(o.requests.every((r) => r.url.startsWith(ORANGE_BASE_URLS.sandbox)), 'uniquement la sandbox');
  assert.equal(o.requests[1].headers.Authorization, 'Bearer jeton-1');
  const prod = await fetchSandboxTestNumbers({ PAYMENTS_ENVIRONMENT: 'production', ORANGE_MONEY_CLIENT_ID: 'c', ORANGE_MONEY_CLIENT_SECRET: 's' }, o.fetch);
  assert.equal(prod.ok, false, 'refusé en production');
  const none = await fetchSandboxTestNumbers({}, o.fetch);
  assert.equal(none.ok, false, 'identifiants requis');
  assert.equal(o.requests.length, 2, 'aucun appel sans identifiants ni en production');
});
