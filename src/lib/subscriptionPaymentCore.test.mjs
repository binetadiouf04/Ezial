import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRenewalDue, renewalDaysLeft, returnCopy, isSubscriptionPayState } from './subscriptionPaymentCore.ts';

const now = Date.parse('2026-12-01T10:00:00Z');
const day = 86_400_000;
test('rappel de renouvellement : à 7 jours ou moins, jamais après la fin ni sans date', () => {
  assert.equal(isRenewalDue(new Date(now + 7 * day).toISOString(), now), true);
  assert.equal(isRenewalDue(new Date(now + 8 * day).toISOString(), now), false);
  assert.equal(isRenewalDue(new Date(now - 1000).toISOString(), now), false);
  assert.equal(isRenewalDue(null, now), false);
  assert.equal(renewalDaysLeft(new Date(now + 3 * day - 1000).toISOString(), now), 3);
});
test('textes de retour : « Abonnement activé, merci ! » seulement pour paid', () => {
  assert.equal(returnCopy('paid', 'retour').title, 'Abonnement activé, merci !');
  for (const s of ['pending', 'failed', 'expired', 'loading', 'neutral']) assert.notEqual(returnCopy(s, 'retour').title, 'Abonnement activé, merci !');
  assert.match(returnCopy('pending', 'annule').title, /non finalisé/);
  assert.ok(isSubscriptionPayState('paid') && !isSubscriptionPayState('confirmed'));
});
