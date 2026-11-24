// Stock d'une ligne de panier / d'une variante choisie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { availableStock, lineStockIssue, lineStockMessage, findVariant } from './cartStock.ts';

const product = {
  stock: 3,
  variantPrices: [
    { id: 'a', conditions: { Taille: 'S' }, stock: 0 },
    { id: 'b', conditions: { Taille: 'M' }, stock: 3 },
  ],
};

test('variante choisie : son propre stock, par identifiant ou par attributs', () => {
  assert.equal(availableStock(product, { Taille: 'S' }), 0);
  assert.equal(availableStock(product, { Taille: 'M' }), 3);
  assert.equal(availableStock(product, {}, 'a'), 0);
  assert.equal(findVariant(product, { Taille: 'L' }), undefined);
});

test('sans variante connue : stock total du produit ; stock inconnu : null (rien d’inventé)', () => {
  assert.equal(availableStock({ stock: 5 }, {}), 5);
  assert.equal(availableStock({}, {}), null);
  assert.equal(availableStock({ stock: Number.NaN }, {}), null);
  assert.equal(availableStock({ variantPrices: [{ conditions: {} }] }, {}), null);
});

test('ligne de panier : épuisée, quantité trop grande, ou commandable', () => {
  assert.deepEqual(lineStockIssue(product, { quantity: 1, variants: { Taille: 'S' }, variantId: 'a' }), { kind: 'out' });
  assert.deepEqual(lineStockIssue(product, { quantity: 4, variants: { Taille: 'M' }, variantId: 'b' }), { kind: 'exceeds', available: 3 });
  assert.equal(lineStockIssue(product, { quantity: 3, variants: { Taille: 'M' }, variantId: 'b' }), null);
  assert.equal(lineStockIssue(undefined, { quantity: 1, variants: {} }), null);
  // Produit sans variante, totalement épuisé.
  assert.deepEqual(lineStockIssue({ stock: 0, variantPrices: [{ conditions: {}, stock: 0 }] }, { quantity: 1, variants: {} }), { kind: 'out' });
});

test('messages en français', () => {
  assert.equal(lineStockMessage({ kind: 'out' }), 'Épuisé : retirez cet article pour commander.');
  assert.ok(lineStockMessage({ kind: 'exceeds', available: 1 }).includes('un seul'));
  assert.ok(lineStockMessage({ kind: 'exceeds', available: 2 }).includes('Plus que 2'));
});
