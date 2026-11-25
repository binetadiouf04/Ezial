import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptView, isReturnState, parseReturnParams, RETRY_AFTER_MS } from './paymentReturn.ts';

const REF = '0206ea40-54a8-40b8-b180-ea41f19e2868';
const NOW = Date.parse('2026-11-25T15:13:00Z');

test('adresse de retour : seuls paiement=retour|annule et un uuid sont lus', () => {
  assert.deepEqual(parseReturnParams(`?paiement=retour&ref=${REF}`), { kind: 'retour', ref: REF });
  assert.deepEqual(parseReturnParams(`?paiement=annule&ref=${REF.toUpperCase()}`), { kind: 'annule', ref: REF });
  assert.deepEqual(parseReturnParams('?paiement=retour'), { kind: 'retour', ref: null }, 'ancienne adresse sans ref');
  assert.deepEqual(parseReturnParams('?paiement=retour&ref=EZI-261125-000059'), { kind: 'retour', ref: null }, 'jamais le numéro de commande');
  assert.deepEqual(parseReturnParams("?paiement=<script>&ref=1' or 1=1"), { kind: null, ref: null });
  assert.deepEqual(parseReturnParams(''), { kind: null, ref: null });
});

test('états renvoyés par la base : liste fermée', () => {
  for (const s of ['paid', 'pending', 'failed', 'expired']) assert.equal(isReturnState(s), true);
  for (const s of ['confirmed', '', null, undefined, 'PAID']) assert.equal(isReturnState(s), false);
});

const base = { loaded: true, status: 'pending', hasValidQr: true, launchedAt: null, now: NOW };

test('jamais « Payer maintenant » avant la première lecture', () => {
  assert.equal(attemptView({ ...base, loaded: false }), 'loading');
});

test('paiement lancé et non confirmé : vérification, sans bouton de paiement', () => {
  assert.equal(attemptView({ ...base, launchedAt: NOW - 30_000 }), 'verifying');
  assert.equal(attemptView({ ...base, launchedAt: NOW - RETRY_AFTER_MS + 1000 }), 'verifying');
  assert.equal(attemptView({ ...base, hasValidQr: false, launchedAt: NOW - 30_000 }), 'verifying');
});

test('« Réessayer » seulement après 5 min sans confirmation, ou sur échec réel', () => {
  assert.equal(attemptView({ ...base, launchedAt: NOW - RETRY_AFTER_MS }), 'verifying_retry');
  for (const status of ['failed', 'cancelled', 'expired']) assert.equal(attemptView({ ...base, status, launchedAt: NOW - 1000 }), 'failed');
});

test('tentative confirmée chez le fournisseur, commande pas encore à jour : vérification', () => {
  assert.equal(attemptView({ ...base, status: 'confirmed' }), 'verifying');
});

test('pas encore lancé : QR / Max It ; aucune tentative : lancement', () => {
  assert.equal(attemptView(base), 'qr');
  assert.equal(attemptView({ ...base, status: null, hasValidQr: false }), 'start');
  assert.equal(attemptView({ ...base, status: 'initiated', hasValidQr: false }), 'start');
  assert.equal(attemptView({ ...base, hasValidQr: false }), 'start');
});
