// Tests des règles du geste « tirer vers le bas pour actualiser » (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pullDirection, dampedPull, refreshBlockReason, isUnsavedEntryField, PULL_THRESHOLD_PX, PULL_MAX_PX } from './pullToRefreshCore.ts';

test('direction : seul un mouvement nettement vertical vers le bas est un « tirer pour actualiser »', () => {
  assert.equal(pullDirection(2, 5), 'pending');
  assert.equal(pullDirection(0, 30), 'pull');
  assert.equal(pullDirection(10, 40), 'pull');
  assert.equal(pullDirection(40, 30), 'ignore'); // carrousel horizontal
  assert.equal(pullDirection(-40, 10), 'ignore');
  assert.equal(pullDirection(20, 25), 'ignore'); // diagonale : on laisse le défilement natif
  assert.equal(pullDirection(0, -30), 'ignore'); // vers le haut : défilement normal
});

test('amortissement : moitié du doigt, plafonné, jamais négatif', () => {
  assert.equal(dampedPull(-20), 0);
  assert.equal(dampedPull(Number.NaN), 0);
  assert.equal(dampedPull(100), 50);
  assert.equal(dampedPull(10_000), PULL_MAX_PX);
  assert.ok(dampedPull(PULL_THRESHOLD_PX * 2) >= PULL_THRESHOLD_PX);
});

test('jamais d\'actualisation au paiement, sur une commande, une saisie vendeur ou un formulaire modifié', () => {
  for (const p of ['/checkout', '/commande/abc', '/suivi/abc', '/panier', '/pro/seller/produits/ajouter', '/pro/seller/abonnement/paiement', '/seller/produits/modifier/x']) {
    assert.equal(refreshBlockReason(p, false), 'sensitive', p);
  }
  assert.equal(refreshBlockReason('/profil', true), 'unsaved');
  assert.equal(refreshBlockReason('/pro/driver', true), 'unsaved');
  for (const p of ['/', '/boutiques', '/produit/robe', '/pro/seller/commandes', '/pro/driver', '/commandes']) {
    assert.equal(refreshBlockReason(p, false), null, p);
  }
});

test('saisies qui comptent comme modifications non enregistrées', () => {
  assert.equal(isUnsavedEntryField('INPUT', 'text'), true);
  assert.equal(isUnsavedEntryField('input', 'tel'), true);
  assert.equal(isUnsavedEntryField('INPUT', 'file'), true);
  assert.equal(isUnsavedEntryField('INPUT', null), true);
  assert.equal(isUnsavedEntryField('TEXTAREA', null), true);
  assert.equal(isUnsavedEntryField('DIV', null, true), true);
  // Filtres et recherche : ne bloquent pas.
  assert.equal(isUnsavedEntryField('INPUT', 'checkbox'), false);
  assert.equal(isUnsavedEntryField('INPUT', 'radio'), false);
  assert.equal(isUnsavedEntryField('INPUT', 'range'), false);
  assert.equal(isUnsavedEntryField('INPUT', 'search'), false);
  assert.equal(isUnsavedEntryField('SELECT', null), false);
  assert.equal(isUnsavedEntryField('DIV', null), false);
});
