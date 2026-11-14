// Les moyens de paiement proposés au client doivent être acceptés par la
// base : create_order() refuse tout autre identifiant (« Mode de paiement
// invalide. »). Régression du 14 novembre 2026 : « orange » était envoyé au
// lieu de « orange_money ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentMethods, paymentLabels } from './payments.ts';

const ACCEPTED_BY_DATABASE = ['wave', 'orange_money', 'paypal'];

test('chaque moyen de paiement proposé est accepté par create_order()', () => {
  assert.ok(paymentMethods.length >= 2);
  for (const m of paymentMethods) assert.ok(ACCEPTED_BY_DATABASE.includes(m.id), `identifiant refusé par la base : ${m.id}`);
});

test('Wave et Orange Money sont proposés, avec leur nom lisible', () => {
  assert.equal(paymentLabels.wave, 'Wave');
  assert.equal(paymentLabels.orange_money, 'Orange Money');
});
