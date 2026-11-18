// Disponibilité (En stock / Sur commande) et fournisseur public.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAvailabilityMode, availabilityLabel, validatePreparationDays, validatePublicSupplier,
  maxPreparationDays, earliestDeliveryDateISO, preparationSentence,
} from './productAvailability.ts';

test('par défaut : en stock (produits existants, colonne absente)', () => {
  assert.equal(normalizeAvailabilityMode(undefined), 'in_stock');
  assert.equal(normalizeAvailabilityMode(null), 'in_stock');
  assert.equal(normalizeAvailabilityMode('n’importe quoi'), 'in_stock');
  assert.equal(normalizeAvailabilityMode('on_order'), 'on_order');
});

test('libellés adaptés au produit', () => {
  assert.equal(availabilityLabel('in_stock'), 'En stock');
  assert.equal(availabilityLabel('on_order'), 'Sur commande');
  assert.equal(availabilityLabel('on_order', { handmade: true }), 'Fabriqué sur commande');
  assert.match(preparationSentence(1), /1 jour environ/);
  assert.match(preparationSentence(10), /10 jours environ/);
});

test('sur commande : délai obligatoire, entier, 1 à 60 jours', () => {
  assert.equal(validatePreparationDays('in_stock', ''), null);
  assert.ok(validatePreparationDays('on_order', ''));
  assert.ok(validatePreparationDays('on_order', '0'));
  assert.ok(validatePreparationDays('on_order', '61'));
  assert.ok(validatePreparationDays('on_order', '2,5'));
  assert.equal(validatePreparationDays('on_order', '7'), null);
  assert.equal(validatePreparationDays('on_order', 60), null);
});

test('fournisseur public : un nom, jamais de coordonnées', () => {
  assert.deepEqual(validatePublicSupplier('  Atelier   Ndeye, Thiès '), { value: 'Atelier Ndeye, Thiès', error: null });
  assert.deepEqual(validatePublicSupplier(''), { value: null, error: null });
  assert.ok(validatePublicSupplier('contact@fournisseur.sn').error);
  assert.ok(validatePublicSupplier('www.fournisseur.sn').error);
  assert.ok(validatePublicSupplier('https://x.sn').error);
  assert.ok(validatePublicSupplier('Moussa 77 123 45 67').error);
  assert.equal(validatePublicSupplier('Atelier 221').error, null);
  assert.ok(validatePublicSupplier('x'.repeat(81)).error);
});

test('un fournisseur renseigné ne rend jamais un produit « sur commande »', () => {
  // Le mode vient uniquement de la déclaration du vendeur.
  assert.equal(maxPreparationDays([{ availabilityMode: 'in_stock', preparationDays: null }]), 0);
});

test('panier : délai le plus long des articles sur commande', () => {
  assert.equal(maxPreparationDays([]), 0);
  assert.equal(maxPreparationDays([{ availabilityMode: 'in_stock' }, { availabilityMode: 'on_order', preparationDays: 5 }, { availabilityMode: 'on_order', preparationDays: 12 }]), 12);
});

test('date de livraison souhaitée : jamais avant la fin de la préparation', () => {
  assert.equal(earliestDeliveryDateISO('2026-11-18', 0), '2026-11-19');
  assert.equal(earliestDeliveryDateISO('2026-11-18', 7), '2026-11-26');
  assert.equal(earliestDeliveryDateISO('2026-12-30', 5), '2027-01-05');
});
