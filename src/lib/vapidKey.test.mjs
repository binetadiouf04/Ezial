import test from 'node:test';
import assert from 'node:assert/strict';
import { checkVapidPublicKey, cleanVapidKey } from './vapidKey.ts';

const GOOD = 'BLkU5CqvLqREMLYdwYWhI8pHcID9Ke-FiUCA_zZmfmVUMXhgM2q8DR5CWXnQlgWRNOyLmQv61s-xXeO4YvJZIVk';

test('une clé correcte est acceptée', () => {
  assert.equal(GOOD.length, 87);
  assert.deepEqual(checkVapidPublicKey(GOOD), { ok: true, key: GOOD });
});

test('espaces, retours à la ligne et guillemets collés par erreur sont retirés', () => {
  assert.equal(cleanVapidKey(`  "${GOOD.slice(0, 31)}\n${GOOD.slice(31)}" \n`), GOOD);
  assert.equal(checkVapidPublicKey(`${GOOD.slice(0, 31)}\n${GOOD.slice(31)}\n`).ok, true);
});

test('une clé coupée est refusée avec sa longueur', () => {
  const r = checkVapidPublicKey(GOOD.slice(0, 64));
  assert.equal(r.ok, false); assert.equal(r.length, 64); assert.equal(r.reason, 'incomplète');
});

test('une clé absente, avec un caractère interdit ou qui n\'est pas une clé publique est refusée', () => {
  assert.equal(checkVapidPublicKey(undefined).ok, false);
  assert.equal(checkVapidPublicKey('').ok, false);
  assert.equal(checkVapidPublicKey(GOOD.slice(0, 86) + '!').ok, false);
  assert.equal(checkVapidPublicKey('A' + GOOD.slice(1)).ok, false); // ne commence pas par l'octet 0x04
});
