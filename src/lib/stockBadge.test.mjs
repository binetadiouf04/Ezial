// Badge de stock des cartes produits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stockBadge } from './stockBadge.ts';

test('1 à 3 unités : « Plus que X ! »', () => {
  assert.deepEqual(stockBadge({ stock: 1 }), { kind: 'low', label: 'Plus que 1 !' });
  assert.deepEqual(stockBadge({ stock: 2 }), { kind: 'low', label: 'Plus que 2 !' });
  assert.deepEqual(stockBadge({ stock: 3 }), { kind: 'low', label: 'Plus que 3 !' });
});

test('4 unités ou plus : aucun badge', () => {
  assert.equal(stockBadge({ stock: 4 }), null);
  assert.equal(stockBadge({ stock: 12 }), null);
  assert.equal(stockBadge({ stock: 99999 }), null);
});

test('stock nul : « Épuisé »', () => {
  assert.deepEqual(stockBadge({ stock: 0 }), { kind: 'out', label: 'Épuisé' });
});

test('stock inconnu ou invalide : aucun badge (jamais d’information inventée)', () => {
  assert.equal(stockBadge({}), null);
  assert.equal(stockBadge({ stock: null }), null);
  assert.equal(stockBadge({ stock: undefined }), null);
  assert.equal(stockBadge({ stock: Number.NaN }), null);
  assert.equal(stockBadge({ stock: -2 }), null);
});

test('tissus : seul « Épuisé » s’applique, jamais « Plus que X ! »', () => {
  assert.equal(stockBadge({ stock: 1, saleMode: 'piece' }), null);
  assert.equal(stockBadge({ stock: 2, saleMode: 'metre' }), null);
  assert.deepEqual(stockBadge({ stock: 0, saleMode: 'metre' }), { kind: 'out', label: 'Épuisé' });
});

test('stock = somme des variantes : une variante vide ne suffit pas à rendre « Épuisé »', () => {
  const variants = [{ stock: 0 }, { stock: 2 }, { stock: 0 }];
  const stock = variants.reduce((s, v) => s + v.stock, 0);
  assert.deepEqual(stockBadge({ stock }), { kind: 'low', label: 'Plus que 2 !' });
  assert.deepEqual(stockBadge({ stock: [{ stock: 0 }, { stock: 0 }].reduce((s, v) => s + v.stock, 0) }), { kind: 'out', label: 'Épuisé' });
  assert.equal(stockBadge({ stock: [{ stock: 2 }, { stock: 3 }].reduce((s, v) => s + v.stock, 0) }), null);
});
