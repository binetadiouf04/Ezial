import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentPhase, canResumePayment, paymentBadge, formatRemaining, isHandheld, isOrangeLink } from './orderPayment.ts';

const NOW = Date.parse('2026-11-20T10:00:00Z');
const om = (extra = {}) => ({ paymentRequired: true, paymentStatus: 'pending', orderStatus: 'confirmed', paymentDeadline: '2026-11-20T10:20:00Z', ...extra });

test('phases : payé, en attente, vérification, annulée, hors paiement en ligne', () => {
  assert.equal(paymentPhase(om({ paymentStatus: 'paid' }), NOW), 'paid');
  assert.equal(paymentPhase(om(), NOW), 'awaiting');
  assert.equal(paymentPhase(om({ paymentDeadline: '2026-11-20T09:59:00Z' }), NOW), 'verifying', 'délai passé : vérification, jamais « échoué » sans preuve');
  assert.equal(paymentPhase(om({ paymentDeadline: null }), NOW), 'verifying');
  assert.equal(paymentPhase(om({ orderStatus: 'cancelled', paymentStatus: 'failed' }), NOW), 'cancelled');
  assert.equal(paymentPhase({ paymentRequired: false, paymentStatus: 'pending' }, NOW), 'offline');
  assert.equal(paymentPhase({}, NOW), 'offline');
});

test('badges : jamais « Paiement confirmé » sans paiement confirmé', () => {
  assert.deepEqual(paymentBadge(om({ paymentStatus: 'paid' }), NOW), { label: 'Paiement confirmé', tone: 'success' });
  assert.equal(paymentBadge(om(), NOW).label, 'En attente de paiement');
  assert.equal(paymentBadge(om({ paymentDeadline: '2026-11-20T09:00:00Z' }), NOW).label, 'Vérification du paiement');
  assert.equal(paymentBadge(om({ orderStatus: 'cancelled' }), NOW).label, 'Annulée, paiement non reçu');
  assert.equal(paymentBadge({ paymentStatus: 'pending' }, NOW).label, 'Paiement non confirmé', 'ancienne commande non payée : pas « Paiement confirmé »');
  assert.equal(paymentBadge({ paymentStatus: 'paid' }, NOW).label, 'Paiement confirmé');
  assert.equal(paymentBadge({ paymentStatus: 'refunded' }, NOW).label, 'Remboursé');
  for (const o of [om(), om({ orderStatus: 'cancelled' }), {}, { paymentStatus: 'pending' }]) assert.notEqual(paymentBadge(o, NOW).label, 'Paiement confirmé');
});

test('reprise du paiement : seulement s\'il reste au moins une minute', () => {
  assert.equal(canResumePayment(om(), NOW), true);
  assert.equal(canResumePayment(om({ paymentDeadline: '2026-11-20T10:00:59Z' }), NOW), false);
  assert.equal(canResumePayment(om({ paymentStatus: 'paid' }), NOW), false);
  assert.equal(canResumePayment(om({ orderStatus: 'cancelled' }), NOW), false);
  assert.equal(canResumePayment({ paymentRequired: false }, NOW), false);
});

test('compte à rebours', () => {
  assert.equal(formatRemaining(28 * 60_000 + 5_000), '28:05');
  assert.equal(formatRemaining(3_725_000), '1:02:05');
  assert.equal(formatRemaining(-5_000), '0:00');
});

test('appareil : téléphone / tablette -> ouvrir l\'application ; ordinateur -> QR', () => {
  assert.equal(isHandheld('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true), true);
  assert.equal(isHandheld('Mozilla/5.0 (Linux; Android 14; SM-A546B) Mobile', true), true);
  assert.equal(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true), true, 'iPad en version ordinateur');
  assert.equal(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false), false);
  assert.equal(isHandheld('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false), false);
  assert.equal(isHandheld('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', true), false, 'PC tactile : QR');
});

test('liens : seulement https et domaine orange-sonatel.com', () => {
  assert.equal(isOrangeLink('https://sugu.orange-sonatel.com/mp/123'), true);
  assert.equal(isOrangeLink('https://s.orange-sonatel.com/aBc'), true);
  assert.equal(isOrangeLink('http://sugu.orange-sonatel.com/mp/123'), false);
  assert.equal(isOrangeLink('https://orange-sonatel.com.pirate.example/x'), false);
  assert.equal(isOrangeLink('javascript:alert(1)'), false);
  assert.equal(isOrangeLink(null), false);
});
