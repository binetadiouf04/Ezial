// Tests de l'adaptateur Wave Checkout avec un FAUX serveur Wave :
// aucun appel réseau, aucune transaction réelle, aucune clé réelle (toutes les valeurs ci-dessous sont fictives).
// Lancer : node --experimental-strip-types --test supabase/functions/_shared/payments/wave.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { WAVE_BASE_URL, WAVE_ENV, WaveCollection, mapWaveSession } from './wave.ts';
import type { FetchLike } from './orange-money.ts';
import { createAdapters, handleCollectionWebhook } from './core.ts';
import type { PaymentStatus, PaymentStatusResult, RecordEventInput, WebhookDb } from './core.ts';

const API_KEY = 'wave_sn_test_CLEFFICTIVE0123456789';
const PROD_KEY = 'wave_sn_prod_CLEFFICTIVE0123456789';
const SIGNING = 'wave_sn_AKS_SECRETFICTIFSIGNATURE01';
const WEBHOOK = 'wave_sn_WHS_SECRETFICTIFWEBHOOK0001';
const ENV = { WAVE_COLLECTION_API_KEY: API_KEY, WAVE_WEBHOOK_SECRET: WEBHOOK };
const ENV_SIGNED = { ...ENV, WAVE_COLLECTION_SIGNING_SECRET: SIGNING };
const ALL_SECRETS = [API_KEY, PROD_KEY, SIGNING, WEBHOOK];
const TX = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-11-21T10:00:00Z');
const now = () => NOW;
const RETURN_URL = 'https://www.ezial.net/compte/commande/EZI-261121-000001?paiement=retour';
const CANCEL_URL = 'https://www.ezial.net/compte/commande/EZI-261121-000001?paiement=annule';
const quiet = { log: () => {} };

type Req = { method: string; url: string; headers: Record<string, string>; body?: string; signal?: AbortSignal };
type Reply = { status: number; body?: unknown } | 'network';

/** Faux serveur Wave : réponses programmables par « MÉTHODE chemin » (sans la requête), journal des requêtes. */
class FakeWave {
  requests: Req[] = [];
  routes: Record<string, Reply[]> = {};
  fetch: FetchLike = async (url, init) => {
    this.requests.push({ method: init.method, url, headers: init.headers, body: init.body, signal: init.signal });
    const path = new URL(url).pathname;
    const queue = this.routes[`${init.method} ${path}`] ?? [];
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (!reply) return resp(404, { code: 'not-found', message: 'Not found' });
    if (reply === 'network') throw new Error(`connexion interrompue (clé ${API_KEY})`);
    return resp(reply.status, reply.body);
  };
  on(method: string, path: string, ...replies: Reply[]) {
    this.routes[`${method} ${path}`] = replies;
    return this;
  }
  by(method: string, path: string): Req[] {
    return this.requests.filter((r) => r.method === method && new URL(r.url).pathname === path);
  }
}
function resp(status: number, body?: unknown) {
  return Promise.resolve({ status, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)) });
}

const SEARCH = '/v1/checkout/sessions/search';
const CREATE = '/v1/checkout/sessions';

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'cos-18qq25rgr100a',
    amount: '31500',
    checkout_status: 'open',
    client_reference: TX,
    currency: 'XOF',
    payment_status: 'processing',
    transaction_id: 'T_ABC123',
    wave_launch_url: 'https://pay.wave.com/c/cos-18qq25rgr100a',
    when_created: '2026-11-21T09:59:00Z',
    when_expires: '2026-11-21T10:29:00Z',
    ...over,
  };
}
const found = (...sessions: unknown[]): Reply => ({ status: 200, body: { result: sessions } });

function wave(fake: FakeWave, env: Record<string, string> = ENV, environment: 'sandbox' | 'production' = 'sandbox') {
  return new WaveCollection(environment, env, fake.fetch, now);
}
const checkoutReq = (over: Record<string, unknown> = {}) => ({
  transactionId: TX, idempotencyKey: 'pay_x', amount: 31500, currency: 'XOF' as const, orderNumber: 'EZI-261121-000001',
  returnUrl: RETURN_URL, cancelUrl: CANCEL_URL, ...over,
});
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');

function assertNoSecret(text: string) {
  for (const s of ALL_SECRETS) assert.ok(!text.includes(s), `un secret apparaît dans : ${text}`);
}

// ── Configuration et règle clé / environnement ──────────────────────────────
test('configuration : sans secrets -> non prêt, noms des variables manquantes', () => {
  const s = new WaveCollection('sandbox', {}, new FakeWave().fetch, now).status();
  assert.equal(s.ready, false);
  assert.equal(s.configured, false);
  assert.equal(s.reason, 'Wave : configuration incomplète (WAVE_COLLECTION_API_KEY, WAVE_WEBHOOK_SECRET).');
  assert.match(new WaveCollection('sandbox', { WAVE_COLLECTION_API_KEY: API_KEY }, new FakeWave().fetch, now).status().reason ?? '', /\(WAVE_WEBHOOK_SECRET\)/);
  assert.match(new WaveCollection('sandbox', { WAVE_WEBHOOK_SECRET: WEBHOOK }, new FakeWave().fetch, now).status().reason ?? '', /\(WAVE_COLLECTION_API_KEY\)/);
  assert.deepEqual(wave(new FakeWave()).status(), { configured: true, ready: true });
  // Le secret de signature des requêtes est facultatif.
  assert.equal(wave(new FakeWave(), ENV_SIGNED).status().ready, true);
  assert.deepEqual(WAVE_ENV, { apiKey: 'WAVE_COLLECTION_API_KEY', signingSecret: 'WAVE_COLLECTION_SIGNING_SECRET', webhookSecret: 'WAVE_WEBHOOK_SECRET' });
});

test('sécurité : clé de production en mode test (ou l\'inverse, ou format inconnu) -> non prêt, sans révéler la clé', () => {
  const cases: [Record<string, string>, 'sandbox' | 'production', RegExp][] = [
    [{ ...ENV, WAVE_COLLECTION_API_KEY: PROD_KEY }, 'sandbox', /WAVE_COLLECTION_API_KEY ne correspond pas au mode test \(sandbox\) \(clé de production fournie, clé de test/],
    [ENV, 'production', /WAVE_COLLECTION_API_KEY ne correspond pas au mode production \(clé de test fournie, clé de production/],
    [{ ...ENV, WAVE_COLLECTION_API_KEY: 'sk_live_autre0123456789' }, 'production', /clé dans un format inconnu fournie/],
  ];
  for (const [env, mode, re] of cases) {
    const s = new WaveCollection(mode, env, new FakeWave().fetch, now).status();
    assert.equal(s.ready, false);
    assert.equal(s.configured, false);
    assert.match(s.reason ?? '', re);
    for (const v of Object.values(env)) assert.ok(!(s.reason ?? '').includes(v), 'la valeur du secret ne doit pas apparaître');
  }
  assert.equal(wave(new FakeWave(), { ...ENV, WAVE_COLLECTION_API_KEY: PROD_KEY }, 'production').status().ready, true);
});

test('sécurité : une clé refusée ne déclenche AUCUN appel réseau', async () => {
  const fake = new FakeWave();
  const a = wave(fake, { ...ENV, WAVE_COLLECTION_API_KEY: PROD_KEY }, 'sandbox');
  assert.equal((await a.createCheckout(checkoutReq())).ok, false);
  assert.ok('error' in (await a.getPaymentStatus('cos-abc')));
  assert.deepEqual(await a.verifyWebhook('{}', { 'wave-signature': 't=1,v1=00' }), { valid: false });
  assert.deepEqual(await a.expireSession('cos-abc'), { outcome: 'error', retryable: false });
  assert.equal(fake.requests.length, 0);
});

test('createAdapters : Wave lit ses secrets ; le décaissement Wave reste non configuré', () => {
  const a = createAdapters({ ...ENV, PAYMENTS_ENVIRONMENT: 'sandbox' }, new FakeWave().fetch);
  assert.equal(a.collection.wave.status().ready, true);
  assert.equal(a.disbursement.wave.status().ready, false);
  assert.equal(createAdapters({ ...ENV, PAYMENTS_ENVIRONMENT: 'production' }).collection.wave.status().ready, false, 'clé de test en production');
});

// ── Création : forme des requêtes ───────────────────────────────────────────
test('création : recherche d\'abord, puis POST avec montant en CHAÎNE, devise, client_reference, adresses https, Bearer', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session() });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.deepEqual(res, {
    ok: true, providerReference: 'cos-18qq25rgr100a', checkoutUrl: 'https://pay.wave.com/c/cos-18qq25rgr100a', expiresAt: '2026-11-21T10:29:00.000Z',
  });
  assert.deepEqual(fake.requests.map((r) => r.method), ['GET', 'POST'], 'la recherche précède toujours la création');
  const search = fake.requests[0];
  assert.equal(search.url, `${WAVE_BASE_URL}/v1/checkout/sessions/search?client_reference=${TX}`);
  assert.equal(search.body, undefined);
  const post = fake.requests[1];
  assert.equal(post.url, `${WAVE_BASE_URL}/v1/checkout/sessions`);
  assert.equal(post.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(post.headers['Content-Type'], 'application/json');
  assert.equal(search.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(search.headers['Content-Type'], undefined);
  assert.deepEqual(JSON.parse(post.body ?? ''), {
    amount: '31500', currency: 'XOF', client_reference: TX, success_url: RETURN_URL, error_url: CANCEL_URL,
  });
  assert.equal(typeof JSON.parse(post.body ?? '').amount, 'string');
  assert.ok(!('restrict_payer_mobile' in JSON.parse(post.body ?? '')));
  assert.ok(post.signal instanceof AbortSignal, 'délai de 15 s via AbortController');
});

test('création : référence cliente encodée dans l\'adresse de recherche', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session({ client_reference: 'a b&c' }) });
  await wave(fake).createCheckout(checkoutReq({ transactionId: 'a b&c' }));
  assert.equal(fake.requests[0].url, `${WAVE_BASE_URL}/v1/checkout/sessions/search?client_reference=a%20b%26c`);
});

test('signature des requêtes : absente sans secret ; avec secret, HMAC(t + corps) en POST et HMAC(t) seul en GET', async () => {
  const plain = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session() });
  await wave(plain).createCheckout(checkoutReq());
  assert.ok(plain.requests.every((r) => !('Wave-Signature' in r.headers)));

  const signed = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session() });
  await wave(signed, ENV_SIGNED).createCheckout(checkoutReq());
  const t = String(Math.floor(NOW / 1000));
  const [get, post] = signed.requests;
  assert.equal(get.headers['Wave-Signature'], `t=${t},v1=${hmac(SIGNING, t)}`, 'GET : le message est l\'horodatage seul');
  assert.equal(post.headers['Wave-Signature'], `t=${t},v1=${hmac(SIGNING, t + (post.body ?? ''))}`, 'POST : horodatage + corps exact envoyé');
  assert.ok((post.body ?? '').length > 0);
  // Lecture et expiration sont signées aussi (corps vide).
  const more = new FakeWave().on('GET', '/v1/checkout/sessions/cos-abc1', { status: 200, body: session({ id: 'cos-abc1' }) }).on('POST', '/v1/checkout/sessions/cos-abc1/expire', { status: 200 });
  const a = wave(more, ENV_SIGNED);
  await a.getPaymentStatus('cos-abc1');
  await a.expireSession('cos-abc1');
  for (const r of more.requests) assert.equal(r.headers['Wave-Signature'], `t=${t},v1=${hmac(SIGNING, t)}`);
});

test('création : montant, adresses de retour et référence invalides refusés sans appel réseau', async () => {
  const fake = new FakeWave();
  const a = wave(fake);
  for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 10.5 }, { returnUrl: 'http://www.ezial.net/x' }, { cancelUrl: '/relatif' }, { transactionId: '' }, { transactionId: 'x'.repeat(256) }]) {
    const r = await a.createCheckout(checkoutReq(bad));
    assert.equal(r.ok, false);
    assert.equal((r as { retryable: boolean }).retryable, false);
  }
  assert.equal(fake.requests.length, 0);
});

// ── Création : idempotence par recherche ────────────────────────────────────
test('création : session ouverte du même montant trouvée -> réutilisée, aucune nouvelle session', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found(session()));
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.deepEqual(res, {
    ok: true, providerReference: 'cos-18qq25rgr100a', checkoutUrl: 'https://pay.wave.com/c/cos-18qq25rgr100a', expiresAt: '2026-11-21T10:29:00.000Z',
  });
  assert.equal(fake.by('POST', CREATE).length, 0);
  assert.equal(fake.requests.length, 1);
});

test('création : réutilisation même si le paiement a été annulé ou est en cours (la session reste ouverte)', async () => {
  for (const payment_status of ['cancelled', 'processing']) {
    const fake = new FakeWave().on('GET', SEARCH, found(session({ payment_status })));
    const res = await wave(fake).createCheckout(checkoutReq());
    assert.equal(res.ok, true);
    assert.equal(fake.by('POST', CREATE).length, 0);
  }
});

test('création : la recherche ignore les sessions d\'une autre référence cliente ou à identifiant invalide', async () => {
  const fake = new FakeWave()
    .on('GET', SEARCH, found(session({ client_reference: 'autre' }), session({ id: 'xyz-1' }), 'pas-un-objet'))
    .on('POST', CREATE, { status: 200, body: session({ id: 'cos-new1' }) });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal((res as { providerReference: string }).providerReference, 'cos-new1');
  assert.equal(fake.by('POST', CREATE).length, 1);
});

test('création : session ouverte mais expirée côté horloge -> nouvelle session', async () => {
  const fake = new FakeWave()
    .on('GET', SEARCH, found(session({ when_expires: '2026-11-21T09:59:59Z' })))
    .on('POST', CREATE, { status: 200, body: session({ id: 'cos-new2' }) });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal((res as { providerReference: string }).providerReference, 'cos-new2');
  assert.equal(fake.by('POST', CREATE).length, 1);
});

test('création : session expirée ou fermée trouvée -> nouvelle session', async () => {
  const fake = new FakeWave()
    .on('GET', SEARCH, found(session({ checkout_status: 'expired', payment_status: 'cancelled' })))
    .on('POST', CREATE, { status: 200, body: session({ id: 'cos-new3' }) });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal((res as { providerReference: string }).providerReference, 'cos-new3');
});

test('création : session ouverte d\'un autre montant -> nouvelle session et fermeture de l\'ancienne (au mieux)', async () => {
  const fake = new FakeWave()
    .on('GET', SEARCH, found(session({ id: 'cos-old1', amount: '1000' })))
    .on('POST', '/v1/checkout/sessions/cos-old1/expire', { status: 200 })
    .on('POST', CREATE, { status: 200, body: session({ id: 'cos-new4' }) });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal((res as { providerReference: string }).providerReference, 'cos-new4');
  assert.equal(fake.by('POST', '/v1/checkout/sessions/cos-old1/expire').length, 1);
});

test('création : session déjà payée -> refus non réessayable, aucune création', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found(session({ checkout_status: 'complete', payment_status: 'succeeded' })));
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal(res.ok, false);
  assert.equal((res as { retryable: boolean }).retryable, false);
  assert.match((res as { error: string }).error, /déjà payée/);
  assert.equal(fake.by('POST', CREATE).length, 0);
  // Même si une autre session ouverte existe : la payée l'emporte.
  const fake2 = new FakeWave().on('GET', SEARCH, found(session(), session({ id: 'cos-paid1', checkout_status: 'complete', payment_status: 'succeeded' })));
  assert.equal((await wave(fake2).createCheckout(checkoutReq())).ok, false);
  assert.equal(fake2.by('POST', CREATE).length, 0);
});

test('création : session réutilisable avec une adresse de paiement non conforme -> refus, aucune création', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found(session({ wave_launch_url: 'https://evil.example.com/c/cos-1' })));
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal(res.ok, false);
  assert.equal(fake.by('POST', CREATE).length, 0);
});

test('création : when_expires illisible -> repli à maintenant + 30 minutes', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session({ when_expires: 'demain' }) });
  const res = await wave(fake).createCheckout(checkoutReq());
  assert.equal((res as { expiresAt: string }).expiresAt, new Date(NOW + 30 * 60 * 1000).toISOString());
  const fake2 = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: (() => { const s = session() as Record<string, unknown>; delete s.when_expires; return s; })() });
  assert.equal(((await wave(fake2).createCheckout(checkoutReq())) as { expiresAt: string }).expiresAt, new Date(NOW + 30 * 60 * 1000).toISOString());
});

// ── Création : validation de la réponse ─────────────────────────────────────
test('réponse : adresse de paiement non https, hors wave.com ou ressemblante -> refusée (non réessayable)', async () => {
  const bad = [
    'http://pay.wave.com/c/cos-1', 'https://evil.example.com/c/cos-1', 'https://wave.com.evil.net/c/cos-1', 'https://evilwave.com/c/cos-1',
    'https://pay.wave.com@evil.net/c', 'https://user:pw@pay.wave.com/c', 'javascript:alert(1)', '', null, 42, 'pas une adresse',
  ];
  for (const wave_launch_url of bad) {
    const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session({ wave_launch_url }) });
    const res = await wave(fake).createCheckout(checkoutReq());
    assert.equal(res.ok, false, String(wave_launch_url));
    assert.equal((res as { retryable: boolean }).retryable, false);
  }
  for (const good of ['https://pay.wave.com/c/cos-1', 'https://wave.com/c/cos-1']) {
    const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session({ wave_launch_url: good }) });
    assert.equal((await wave(fake).createCheckout(checkoutReq())).ok, true, good);
  }
});

test('réponse : identifiant de session invalide, référence ou montant différents -> refusée', async () => {
  for (const over of [{ id: 'sess-123' }, { id: 'cos-' }, { id: 'cos-a/../b' }, { id: undefined }, { client_reference: 'autre' }, { amount: '1' }, { amount: 'abc' }]) {
    const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200, body: session(over) });
    const res = await wave(fake).createCheckout(checkoutReq());
    assert.equal(res.ok, false, JSON.stringify(over));
    assert.equal((res as { retryable: boolean }).retryable, false);
  }
  const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, { status: 200 });
  assert.equal((await wave(fake).createCheckout(checkoutReq())).ok, false, 'corps vide');
});

// ── Création : classification des erreurs ───────────────────────────────────
test('erreurs : réseau, 429 et 5xx à la création -> réessayable ; autres 4xx -> non réessayable, code dans le message', async () => {
  for (const [reply, retryable] of [
    ['network', true], [{ status: 429, body: { code: 'rate-limit' } }, true], [{ status: 500 }, true], [{ status: 503, body: { code: 'unavailable' } }, true],
    [{ status: 401, body: { code: 'invalid-auth', message: 'Bad key' } }, false], [{ status: 403, body: { code: 'forbidden' } }, false],
    [{ status: 404, body: { code: 'not-found' } }, false], [{ status: 422, body: { code: 'request-validation-error', message: 'amount invalid' } }, false],
  ] as [Reply, boolean][]) {
    const fake = new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, reply);
    const res = await wave(fake).createCheckout(checkoutReq());
    assert.equal(res.ok, false);
    assert.equal((res as { retryable: boolean }).retryable, retryable, JSON.stringify(reply));
    const err = (res as { error: string }).error;
    if (reply !== 'network' && reply.body && (reply.body as { code?: string }).code) assert.ok(err.includes((reply.body as { code: string }).code), err);
    if (reply !== 'network') assert.ok(err.includes(`HTTP ${reply.status}`), err);
  }
});

test('erreurs : la recherche en échec empêche toute création (pas de doublon possible)', async () => {
  for (const [reply, retryable] of [['network', true], [{ status: 429 }, true], [{ status: 502 }, true], [{ status: 401, body: { code: 'invalid-auth' } }, false], [{ status: 200, body: { oups: 1 } }, true]] as [Reply, boolean][]) {
    const fake = new FakeWave().on('GET', SEARCH, reply).on('POST', CREATE, { status: 200, body: session() });
    const res = await wave(fake).createCheckout(checkoutReq());
    assert.equal(res.ok, false);
    assert.equal((res as { retryable: boolean }).retryable, retryable, JSON.stringify(reply));
    assert.equal(fake.by('POST', CREATE).length, 0);
  }
});

test('erreurs : après un POST perdu (réseau), le nouvel essai retrouve la session par la recherche', async () => {
  const fake = new FakeWave().on('GET', SEARCH, found(), found(session())).on('POST', CREATE, 'network');
  const a = wave(fake);
  const first = await a.createCheckout(checkoutReq());
  assert.equal((first as { retryable: boolean }).retryable, true);
  const second = await a.createCheckout(checkoutReq());
  assert.equal(second.ok, true);
  assert.equal(fake.by('POST', CREATE).length, 1, 'une seule création au total');
});

test('erreurs : aucun secret ni numéro de téléphone dans les messages, même renvoyés par Wave ou par le réseau', async () => {
  const echo = { code: 'boom', message: `clé ${API_KEY} signature ${SIGNING} webhook ${WEBHOOK} client 221786258731` };
  const texts: string[] = [];
  const collect = (r: unknown) => {
    const o = r as { error?: string; reason?: string };
    if (o && typeof o === 'object') texts.push(String(o.error ?? ''));
  };
  for (const reply of ['network', { status: 400, body: echo }, { status: 500, body: echo }, { status: 429, body: echo }] as Reply[]) {
    collect(await wave(new FakeWave().on('GET', SEARCH, reply), ENV_SIGNED).createCheckout(checkoutReq()));
    collect(await wave(new FakeWave().on('GET', SEARCH, found()).on('POST', CREATE, reply), ENV_SIGNED).createCheckout(checkoutReq()));
    collect(await wave(new FakeWave().on('GET', '/v1/checkout/sessions/cos-abc1', reply), ENV_SIGNED).getPaymentStatus('cos-abc1'));
  }
  collect(await wave(new FakeWave(), { ...ENV_SIGNED, WAVE_COLLECTION_API_KEY: PROD_KEY }).createCheckout(checkoutReq()));
  texts.push(new WaveCollection('sandbox', { ...ENV_SIGNED, WAVE_COLLECTION_API_KEY: PROD_KEY }, undefined, now).status().reason ?? '');
  texts.push(new WaveCollection('production', ENV_SIGNED, undefined, now).status().reason ?? '');
  assert.ok(texts.filter(Boolean).length >= 12);
  for (const t of texts) {
    assertNoSecret(t);
    assert.ok(!t.includes('221786258731'), t);
    assert.ok(!/wave_sn_[A-Za-z0-9_]{8,}/.test(t), t); // le seul « wave_sn_… » toléré est l'indication de format (préfixe), jamais une valeur
  }
});

// ── Webhook ─────────────────────────────────────────────────────────────────
function signedWebhook(body: string, over: { secret?: string; t?: number; extra?: string[]; header?: string } = {}) {
  const t = String(over.t ?? Math.floor(NOW / 1000));
  const v1 = hmac(over.secret ?? WEBHOOK, t + body);
  return { 'wave-signature': over.header ?? ['t=' + t, ...(over.extra ?? []).map((e) => 'v1=' + e), 'v1=' + v1].join(',') };
}
const EVENT = JSON.stringify({ id: 'AE_evt123', type: 'checkout.session.completed', data: session({ checkout_status: 'complete', payment_status: 'succeeded' }) });

test('webhook : signature valide -> événement traduit (type, session, statut, montant)', async () => {
  const v = await wave(new FakeWave()).verifyWebhook(EVENT, signedWebhook(EVENT));
  assert.deepEqual(v, {
    valid: true,
    event: { eventId: 'AE_evt123', type: 'checkout.session.completed', providerReference: 'cos-18qq25rgr100a', status: 'confirmed', amount: 31500 },
  });
});

test('webhook : sans identifiant d\'événement -> « {session}:{type} » ; session au premier niveau tolérée', async () => {
  const noId = JSON.stringify({ type: 'checkout.session.completed', data: session() });
  const v1 = await wave(new FakeWave()).verifyWebhook(noId, signedWebhook(noId));
  assert.equal(v1.event?.eventId, 'cos-18qq25rgr100a:checkout.session.completed');
  assert.equal(v1.event?.status, 'pending');
  const flat = JSON.stringify(session({ checkout_status: 'expired', payment_status: 'cancelled' }));
  const v2 = await wave(new FakeWave()).verifyWebhook(flat, signedWebhook(flat));
  assert.equal(v2.valid, true);
  assert.equal(v2.event?.eventId, 'cos-18qq25rgr100a:checkout.session.completed', 'l\'id du premier niveau est celui de la session, pas un id d\'événement');
  assert.equal(v2.event?.status, 'expired');
  const odd = JSON.stringify({ data: session({ amount: '12.5' }), id: 12 });
  const v3 = await wave(new FakeWave()).verifyWebhook(odd, signedWebhook(odd));
  assert.equal(v3.event?.amount, null, 'montant non entier : null');
  assert.equal(v3.event?.eventId, 'cos-18qq25rgr100a:checkout.session.completed');
});

test('webhook : mauvais secret, corps modifié, ou secret des requêtes au lieu de celui des webhooks -> invalide', async () => {
  const a = wave(new FakeWave(), ENV_SIGNED);
  assert.deepEqual(await a.verifyWebhook(EVENT, signedWebhook(EVENT, { secret: 'wave_sn_WHS_AUTRESECRET' })), { valid: false });
  assert.deepEqual(await a.verifyWebhook(EVENT, signedWebhook(EVENT, { secret: SIGNING })), { valid: false });
  const headers = signedWebhook(EVENT);
  assert.deepEqual(await a.verifyWebhook(EVENT.replace('31500', '1'), headers), { valid: false });
  assert.deepEqual(await a.verifyWebhook(EVENT + ' ', headers), { valid: false });
  assert.equal((await a.verifyWebhook(EVENT, headers)).valid, true);
});

test('webhook : horodatage trop ancien ou trop dans le futur -> invalide ; limites acceptées', async () => {
  const a = wave(new FakeWave());
  const ts = Math.floor(NOW / 1000);
  assert.equal((await a.verifyWebhook(EVENT, signedWebhook(EVENT, { t: ts - 301 }))).valid, false, 'plus de 5 min');
  assert.equal((await a.verifyWebhook(EVENT, signedWebhook(EVENT, { t: ts + 31 }))).valid, false, 'plus de 30 s dans le futur');
  assert.equal((await a.verifyWebhook(EVENT, signedWebhook(EVENT, { t: ts - 299 }))).valid, true);
  assert.equal((await a.verifyWebhook(EVENT, signedWebhook(EVENT, { t: ts + 29 }))).valid, true);
});

test('webhook : en-tête absent ou mal formé -> invalide', async () => {
  const a = wave(new FakeWave());
  const t = String(Math.floor(NOW / 1000));
  const good = hmac(WEBHOOK, t + EVENT);
  const bad: (Record<string, string>)[] = [
    {}, { 'wave-signature': '' }, { 'Wave-Signature': `t=${t},v1=${good}` } /* clé non minuscule : les en-têtes sont normalisés avant */,
    { 'wave-signature': `v1=${good}` }, { 'wave-signature': `t=${t}` }, { 'wave-signature': `t=${t},v1=` }, { 'wave-signature': `t=abc,v1=${good}` },
    { 'wave-signature': `t=${t},t=${t},v1=${good}` }, { 'wave-signature': `${t},${good}` }, { 'wave-signature': `t=${t},v1=zzzz` },
    { 'wave-signature': `t=${t};v1=${good}` }, { 'wave-signature': `t=-${t},v1=${good}` }, { 'wave-signature': 'x'.repeat(2000) },
  ];
  for (const h of bad) assert.equal((await a.verifyWebhook(EVENT, h)).valid, false, JSON.stringify(h).slice(0, 80));
});

test('webhook : deux v1 (rotation de secret) dont un seul valide -> accepté, quel que soit l\'ordre ; aucun valide -> refusé', async () => {
  const a = wave(new FakeWave());
  const wrong = 'a'.repeat(64);
  const t = String(Math.floor(NOW / 1000));
  const good = hmac(WEBHOOK, t + EVENT);
  assert.equal((await a.verifyWebhook(EVENT, { 'wave-signature': `t=${t},v1=${wrong},v1=${good}` })).valid, true);
  assert.equal((await a.verifyWebhook(EVENT, { 'wave-signature': `t=${t},v1=${good},v1=${wrong}` })).valid, true);
  assert.equal((await a.verifyWebhook(EVENT, { 'wave-signature': `t=${t},v1=${wrong},v1=${'b'.repeat(64)}` })).valid, false);
  assert.equal((await a.verifyWebhook(EVENT, { 'wave-signature': ` t=${t} , v1=${good.toUpperCase()} ` })).valid, true, 'espaces et majuscules hexadécimales tolérés');
});

test('webhook : la signature est contrôlée AVANT la lecture du contenu (corps illisible signé -> invalide, corps illisible non signé -> invalide)', async () => {
  const a = wave(new FakeWave());
  for (const body of ['pas du json', '[]', 'null', '{}', JSON.stringify({ data: { id: 'sess-9' } })]) {
    assert.equal((await a.verifyWebhook(body, signedWebhook(body))).valid, false, body);
  }
  assert.deepEqual(await a.verifyWebhook('pas du json', {}), { valid: false });
});

test('webhook : adaptateur non configuré -> invalide', async () => {
  const a = new WaveCollection('sandbox', {}, new FakeWave().fetch, now);
  assert.deepEqual(await a.verifyWebhook(EVENT, signedWebhook(EVENT)), { valid: false });
});

// ── Statut réel ─────────────────────────────────────────────────────────────
test('statut : table de correspondance Wave -> Ezial', async () => {
  const table: [Record<string, unknown>, PaymentStatus, number | null][] = [
    [{ checkout_status: 'complete', payment_status: 'succeeded' }, 'confirmed', 31500],
    [{ checkout_status: 'expired', payment_status: 'cancelled' }, 'expired', null],
    [{ checkout_status: 'expired', payment_status: 'processing' }, 'expired', null],
    [{ checkout_status: 'expired', payment_status: undefined }, 'expired', null],
    [{ checkout_status: 'open', payment_status: 'processing' }, 'pending', null],
    [{ checkout_status: 'open', payment_status: 'cancelled' }, 'pending', null],
    [{ checkout_status: 'open', payment_status: undefined }, 'pending', null],
    [{ checkout_status: 'complete', payment_status: 'cancelled' }, 'unknown', null],
    [{ checkout_status: 'complete', payment_status: 'processing' }, 'unknown', null],
    [{ checkout_status: 'expired', payment_status: 'succeeded' }, 'unknown', null],
    [{ checkout_status: 'inconnu', payment_status: 'succeeded' }, 'unknown', null],
    [{ checkout_status: undefined, payment_status: undefined }, 'unknown', null],
  ];
  for (const [over, status, amount] of table) {
    const fake = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session(over) });
    const r = await wave(fake).getPaymentStatus('cos-18qq25rgr100a') as Extract<PaymentStatusResult, { status: PaymentStatus }>;
    assert.equal(r.status, status, JSON.stringify(over));
    assert.equal(r.amount, amount, JSON.stringify(over));
  }
  assert.equal(mapWaveSession({ checkoutStatus: 'open', paymentStatus: 'cancelled' }), 'pending');
});

test('statut : montant ou devise incohérents sur un paiement réussi -> « unknown », jamais confirmé', async () => {
  for (const over of [{ amount: '12.5' }, { amount: '0' }, { amount: '-100' }, { amount: '1e3' }, { amount: ' 100' }, { amount: '' }, { amount: 5000 }, { amount: undefined }, { currency: 'EUR' }, { currency: undefined }]) {
    const fake = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session({ checkout_status: 'complete', payment_status: 'succeeded', ...over }) });
    const r = await wave(fake).getPaymentStatus('cos-18qq25rgr100a') as { status: PaymentStatus; amount: number | null };
    assert.equal(r.status, 'unknown', JSON.stringify(over));
    assert.equal(r.amount, null);
  }
});

test('statut : référence cliente et identifiant de transaction Wave exposés ; requête GET sur la session', async () => {
  const fake = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session({ checkout_status: 'complete', payment_status: 'succeeded' }) });
  const r = await wave(fake).getPaymentStatus('cos-18qq25rgr100a');
  assert.deepEqual(r, { status: 'confirmed', amount: 31500, providerTransactionId: 'T_ABC123', clientReference: TX });
  assert.equal(fake.requests[0].method, 'GET');
  assert.equal(fake.requests[0].url, `${WAVE_BASE_URL}/v1/checkout/sessions/cos-18qq25rgr100a`);
  // Session sans client_reference : null (le cœur refusera d'enregistrer).
  const fake2 = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session({ client_reference: undefined }) });
  assert.equal(((await wave(fake2).getPaymentStatus('cos-18qq25rgr100a')) as { clientReference: string | null }).clientReference, null);
});

test('statut : référence invalide -> erreur non réessayable sans appel ; erreurs HTTP classées ; session inattendue refusée', async () => {
  const fake = new FakeWave();
  for (const bad of ['', 'cos-', 'cos-abc/../x', 'cos-abc?x=1', 'sess-123', 'COS-abc', 'cos-ab c', TX]) {
    assert.deepEqual(await wave(fake).getPaymentStatus(bad), { error: 'Référence de session Wave invalide.', retryable: false }, bad);
  }
  assert.equal(fake.requests.length, 0);
  const path = '/v1/checkout/sessions/cos-abc1';
  for (const [reply, retryable] of [['network', true], [{ status: 429 }, true], [{ status: 500 }, true], [{ status: 404, body: { code: 'not-found' } }, false], [{ status: 401 }, false], [{ status: 403 }, false]] as [Reply, boolean][]) {
    const r = await wave(new FakeWave().on('GET', path, reply)).getPaymentStatus('cos-abc1');
    assert.ok('error' in r, JSON.stringify(reply));
    assert.equal((r as { retryable: boolean }).retryable, retryable, JSON.stringify(reply));
  }
  const other = await wave(new FakeWave().on('GET', path, { status: 200, body: session({ id: 'cos-autre9' }) })).getPaymentStatus('cos-abc1');
  assert.ok('error' in other, 'la session renvoyée doit être celle demandée');
});

// ── Expiration ──────────────────────────────────────────────────────────────
test('expiration : 200 -> expired ; 409 -> already_closed ; 404 -> not_found ; 403, 429, 5xx, réseau -> error', async () => {
  const path = '/v1/checkout/sessions/cos-abc1/expire';
  const cases: [Reply, { outcome: string; retryable?: boolean }][] = [
    [{ status: 200 }, { outcome: 'expired' }], [{ status: 409, body: { code: 'already-completed-or-expired' } }, { outcome: 'already_closed' }],
    [{ status: 404 }, { outcome: 'not_found' }], [{ status: 403 }, { outcome: 'error', retryable: false }],
    [{ status: 429 }, { outcome: 'error', retryable: true }], [{ status: 503 }, { outcome: 'error', retryable: true }], ['network', { outcome: 'error', retryable: true }],
  ];
  for (const [reply, expected] of cases) {
    const fake = new FakeWave().on('POST', path, reply);
    assert.deepEqual(await wave(fake).expireSession('cos-abc1'), expected, JSON.stringify(reply));
    assert.equal(fake.requests[0].method, 'POST');
    assert.equal(fake.requests[0].body, undefined);
    assert.equal(fake.requests[0].url, WAVE_BASE_URL + path);
  }
  const none = new FakeWave();
  assert.deepEqual(await wave(none).expireSession('cos-../x'), { outcome: 'error', retryable: false });
  assert.equal(none.requests.length, 0);
});

test('findByClientReference : renvoie les sessions de la référence, erreurs classées', async () => {
  const ok = await wave(new FakeWave().on('GET', SEARCH, found(session(), session({ id: 'cos-zz1', client_reference: 'autre' })))).findByClientReference(TX);
  assert.ok(ok.ok);
  assert.deepEqual((ok as { sessions: { id: string }[] }).sessions.map((s) => s.id), ['cos-18qq25rgr100a']);
  const down = await wave(new FakeWave().on('GET', SEARCH, { status: 500 })).findByClientReference(TX);
  assert.deepEqual(down.ok === false && down.retryable, true);
  const refused = await wave(new FakeWave().on('GET', SEARCH, { status: 403, body: { code: 'forbidden' } })).findByClientReference(TX);
  assert.equal(refused.ok === false && refused.retryable, false);
});

// ── Intégration avec le cœur (webhook -> vérification réelle -> écriture) ───
function webhookDb() {
  const verifications: { id: string; status: PaymentStatus; amount: number | null; pid: string | null }[] = [];
  const events = new Map<string, { id: string; processed?: string; input: RecordEventInput }>();
  const db: WebhookDb = {
    recordEvent(input) {
      const key = input.providerEventId;
      const existing = events.get(key);
      if (existing) return Promise.resolve({ new: false, id: existing.id, processed: existing.processed !== undefined });
      const id = `evt_${events.size + 1}`;
      events.set(key, { id, input });
      return Promise.resolve({ new: true, id, processed: false });
    },
    markEventProcessed(id, result) { for (const e of events.values()) if (e.id === id) e.processed = result; return Promise.resolve(); },
    findTransactionByReference(_p, ref) { return Promise.resolve(ref === 'cos-18qq25rgr100a' ? { id: TX, amount: 31500, status: 'pending' } : null); },
    confirm() { throw new Error('non utilisé'); },
    fail() { throw new Error('non utilisé'); },
    recordVerification(id, status, amount, pid) { verifications.push({ id, status, amount, pid }); return Promise.resolve(status); },
  };
  return { db, verifications, events };
}

test('intégration : webhook signé -> session relue chez Wave -> statut enregistré avec le montant de Wave', async () => {
  const fake = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session({ checkout_status: 'complete', payment_status: 'succeeded' }) });
  const { db, verifications } = webhookDb();
  const forged = JSON.stringify({ id: 'AE_1', type: 'checkout.session.completed', data: session({ checkout_status: 'complete', payment_status: 'succeeded', amount: '999999' }) });
  const res = await handleCollectionWebhook(db, wave(fake), forged, signedWebhook(forged), quiet);
  assert.equal(res.status, 200);
  assert.deepEqual(verifications, [{ id: TX, status: 'confirmed', amount: 31500, pid: 'T_ABC123' }], 'montant de l\'API, pas celui du webhook');
  const bad = await handleCollectionWebhook(db, wave(fake), forged, signedWebhook(forged, { secret: 'mauvais' }), quiet);
  assert.equal(bad.status, 401);
  assert.equal(verifications.length, 1);
});

test('intégration : session Wave rattachée à une autre transaction -> client_reference_mismatch, rien enregistré', async () => {
  const fake = new FakeWave().on('GET', '/v1/checkout/sessions/cos-18qq25rgr100a', { status: 200, body: session({ checkout_status: 'complete', payment_status: 'succeeded', client_reference: '44444444-4444-4444-8444-444444444444' }) });
  const { db, verifications } = webhookDb();
  const res = await handleCollectionWebhook(db, wave(fake), EVENT, signedWebhook(EVENT), quiet);
  assert.deepEqual(res, { status: 200, body: { ok: true, result: 'client_reference_mismatch' } });
  assert.equal(verifications.length, 0);
});
