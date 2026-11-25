import test from 'node:test';
import assert from 'node:assert/strict';
import { productMatchesTargets, freeDeliveryFor, freeDeliveryConditions } from './promotionEligibility.ts';

const parfum = { id: 'p1', shopId: 's1', category: 'parfums', subcategory: 'parfums-femme' };
const robe = { id: 'p2', shopId: 's2', category: 'vetements', subcategory: 'femme' };
const promo = (extra = {}) => ({ id: 'c1', name: 'Livraison offerte', kind: 'free_delivery', minAmount: 0, deliveryCap: null, endsAt: '2099-01-01T00:00:00Z', targets: [], neighborhoods: [], ...extra });

test('cibles : aucune = tout le catalogue ; sinon produit, boutique, catégorie ou sous-catégorie', () => {
  assert.equal(productMatchesTargets(parfum, []), true);
  assert.equal(productMatchesTargets(parfum, [{ type: 'product', ref: 'p1' }]), true);
  assert.equal(productMatchesTargets(robe, [{ type: 'product', ref: 'p1' }]), false);
  assert.equal(productMatchesTargets(robe, [{ type: 'shop', ref: 's2' }]), true);
  assert.equal(productMatchesTargets(parfum, [{ type: 'category', ref: 'parfums' }]), true);
  assert.equal(productMatchesTargets(parfum, [{ type: 'subcategory', ref: 'parfums/parfums-femme' }]), true);
  assert.equal(productMatchesTargets(parfum, [{ type: 'subcategory', ref: 'parfums/parfums-homme' }]), false);
});

test('« Livraison offerte » seulement pour une campagne de livraison en cours qui vise le produit', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  assert.equal(freeDeliveryFor(robe, [promo({ targets: [{ type: 'category', ref: 'parfums' }] })], now), null);
  assert.equal(freeDeliveryFor(parfum, [promo({ targets: [{ type: 'category', ref: 'parfums' }] })], now)?.id, 'c1');
  assert.equal(freeDeliveryFor(parfum, [promo({ kind: 'percent' })], now), null);
  assert.equal(freeDeliveryFor(parfum, [promo({ endsAt: '2026-11-21T11:00:00Z' })], now), null);
});

test('conditions affichées', () => {
  const fmt = (n) => `${n} FCFA`;
  assert.equal(freeDeliveryConditions(promo(), fmt), '');
  assert.equal(freeDeliveryConditions(promo({ minAmount: 15000, deliveryCap: 1500, neighborhoods: ['Plateau'] }), fmt),
    "dès 15000 FCFA d'articles concernés, jusqu'à 1500 FCFA de livraison");
});
