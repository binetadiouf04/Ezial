// Tests de sécurité des contrôles partagés des fonctions Edge.
// Lancer : npm run test:security
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, checkSharedSecret, isUuid, safeInternalPath, parsePushPayload, isWithinServiceArea, parseDeliveryFeeRequest } from './guards.ts';

const SECRET = 'un-secret-de-test-assez-long-0123456789';
const UID = '11111111-2222-4333-8444-555555555555';

test('secret partagé : refuse tout quand le secret attendu est vide ou trop court', () => {
  assert.equal(checkSharedSecret('', ''), 'unconfigured');
  assert.equal(checkSharedSecret(null, ''), 'unconfigured');
  assert.equal(checkSharedSecret('court', 'court'), 'unconfigured');
});

test('secret partagé : en-tête absent, vide ou différent refusé', () => {
  assert.equal(checkSharedSecret(null, SECRET), 'invalid');
  assert.equal(checkSharedSecret(undefined, SECRET), 'invalid');
  assert.equal(checkSharedSecret('', SECRET), 'invalid');
  assert.equal(checkSharedSecret(SECRET.slice(0, -1), SECRET), 'invalid');
  assert.equal(checkSharedSecret(SECRET + 'x', SECRET), 'invalid');
  assert.equal(checkSharedSecret(SECRET.toUpperCase(), SECRET), 'invalid');
});

test('secret partagé : bon secret accepté', () => {
  assert.equal(checkSharedSecret(SECRET, SECRET), 'ok');
  assert.equal(safeEqual('é€', 'é€'), true);
  assert.equal(safeEqual('a', 'b'), false);
});

test('identifiants : seuls les UUID passent', () => {
  assert.equal(isUuid(UID), true);
  for (const bad of ['', '1', `${UID} or 1=1`, `${UID}\n`, null, 42, {}, ['x']]) assert.equal(isUuid(bad), false);
});

test('notification : adresse de clic toujours interne', () => {
  assert.equal(safeInternalPath('/commande/123'), '/commande/123');
  assert.equal(safeInternalPath('/pro/seller/abonnement?x=1'), '/pro/seller/abonnement?x=1');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'commande', '', null, undefined, 12, '/a\nb', '/' + 'a'.repeat(400)]) {
    assert.equal(safeInternalPath(bad), '/');
  }
});

test('notification : contenu validé et borné', () => {
  assert.deepEqual(parsePushPayload({ userId: UID, title: 'Bonjour', body: 'Texte', url: '/profil' }), { userId: UID, title: 'Bonjour', body: 'Texte', url: '/profil' });
  assert.equal(parsePushPayload({ userId: 'pas-un-uuid', title: 'x' }), null);
  assert.equal(parsePushPayload({ userId: UID, title: '   ' }), null);
  assert.equal(parsePushPayload({ userId: UID, title: 'x', body: { a: 1 } }), null);
  assert.equal(parsePushPayload(null), null);
  assert.equal(parsePushPayload('texte'), null);
  const long = parsePushPayload({ userId: UID, title: 't'.repeat(500), body: 'b'.repeat(5000), url: 'https://evil.example' });
  assert.equal(long.title.length, 120);
  assert.equal(long.body.length, 400);
  assert.equal(long.url, '/');
});

test('frais de livraison : zone de service', () => {
  assert.equal(isWithinServiceArea(14.6937, -17.4441), true); // Dakar
  assert.equal(isWithinServiceArea(14.79, -16.93), true); // Thiès
  assert.equal(isWithinServiceArea(48.85, 2.35), false); // Paris
  assert.equal(isWithinServiceArea(0, 0), false);
  assert.equal(isWithinServiceArea(NaN, -17), false);
  assert.equal(isWithinServiceArea(Infinity, -17), false);
  assert.equal(isWithinServiceArea('14.7', '-17.4'), false);
});

test('frais de livraison : demande validée', () => {
  assert.deepEqual(parseDeliveryFeeRequest({ shopIds: [UID], clientLat: 14.7, clientLng: -17.4 }, 6), { shopIds: [UID], clientLat: 14.7, clientLng: -17.4 });
  const bad = [
    null, 'x', {},
    { shopIds: [], clientLat: 14.7, clientLng: -17.4 },
    { shopIds: ['abc'], clientLat: 14.7, clientLng: -17.4 },
    { shopIds: [UID, UID], clientLat: 14.7, clientLng: -17.4 },
    { shopIds: Array(7).fill(UID), clientLat: 14.7, clientLng: -17.4 },
    { shopIds: [UID], clientLat: 48.85, clientLng: 2.35 },
    { shopIds: [UID], clientLat: '14.7', clientLng: -17.4 },
    { shopIds: [`${UID},id.neq.x`], clientLat: 14.7, clientLng: -17.4 },
  ];
  for (const input of bad) assert.ok('error' in parseDeliveryFeeRequest(input, 6), JSON.stringify(input));
});
