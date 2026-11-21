import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDeliveryDay, formatDeliveryWish } from './deliveryDay.ts';

test('jour de livraison : date du calendrier en clair, jamais décalée', () => {
  assert.equal(formatDeliveryDay('2026-11-22'), 'dimanche 22 novembre');
  assert.equal(formatDeliveryDay('2026-12-31'), 'jeudi 31 décembre');
  assert.equal(formatDeliveryDay('2026-02-30'), '2026-02-30'); // date impossible : laissée telle quelle
  assert.equal(formatDeliveryDay('demain'), 'demain');
  assert.equal(formatDeliveryDay(null), '');
  assert.equal(formatDeliveryWish('2026-11-22', '09h–12h'), 'dimanche 22 novembre · 09h–12h');
  assert.equal(formatDeliveryWish(null, '09h–12h'), '09h–12h');
});
