// Nom du fournisseur public : un nom, jamais de coordonnées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupplierName, supplierNameError } from './supplierName.ts';

test('noms valides (dont les fournisseurs actuels)', () => {
  for (const ok of ['Diwaanu Wakana', 'Diwaanu wakana', 'Ezial', 'Atelier Ndeye, Thiès', 'Boutique Aminata', 'Atelier 221']) assert.equal(supplierNameError(ok), null, ok);
});

test('vide = aucun fournisseur, sans erreur', () => {
  assert.equal(supplierNameError(''), null);
  assert.equal(supplierNameError('   '), null);
});

test('coordonnées refusées : e-mail, lien, téléphone', () => {
  assert.ok(supplierNameError('contact@fournisseur.sn'));
  assert.ok(supplierNameError('www.fournisseur.sn'));
  assert.ok(supplierNameError('https://x.sn'));
  assert.ok(supplierNameError('Moussa 77 123 45 67'));
  assert.ok(supplierNameError('+221771234567'));
});

test('longueur : 2 à 80 caractères', () => {
  assert.ok(supplierNameError('x'));
  assert.equal(supplierNameError('xy'), null);
  assert.equal(supplierNameError('x'.repeat(80)), null);
  assert.ok(supplierNameError('x'.repeat(81)));
});

test('espaces nettoyés', () => {
  assert.equal(normalizeSupplierName('  Diwaanu   Wakana '), 'Diwaanu Wakana');
});
