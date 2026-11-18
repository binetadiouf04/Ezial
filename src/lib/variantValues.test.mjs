// Tests des combinaisons de couleurs saisies par le vendeur (montres).
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsCustomColorCombos, normalizeCustomColor, addCustomColor } from './variantValues.ts';

test('combinaisons libres : uniquement pour Bijoux > Montres', () => {
  assert.equal(allowsCustomColorCombos('bijoux', 'montres'), true);
  for (const [c, s] of [['bijoux', 'colliers'], ['bijoux', 'lunettes'], ['vetements', 'femme'], ['bijoux', '']]) {
    assert.equal(allowsCustomColorCombos(c, s), false, `${c}/${s}`);
  }
});

test('saisie nettoyée : espaces, « / », majuscule', () => {
  assert.equal(normalizeCustomColor('  cadran blanc/bracelet   noir '), 'Cadran blanc / Bracelet noir');
  assert.equal(normalizeCustomColor('noir intégral'), 'Noir intégral');
  assert.equal(normalizeCustomColor('Cadran bleu / Bracelet doré'), 'Cadran bleu / Bracelet doré');
});

test('saisies refusées : vide, trop longue, séparateur interne', () => {
  for (const bad of ['', '   ', ' / ', 'Noir | Blanc', 'x'.repeat(41)]) {
    assert.equal(normalizeCustomColor(bad), null, JSON.stringify(bad));
  }
});

test('pas de doublon (casse et accents ignorés)', () => {
  const r1 = addCustomColor(['Noir', 'Cadran blanc / Bracelet noir'], 'cadran blanc / bracelet NOIR');
  assert.deepEqual(r1.values, ['Noir', 'Cadran blanc / Bracelet noir']);
  assert.equal(r1.added, null);
  const r2 = addCustomColor(['Noir intégral'], 'noir integral');
  assert.equal(r2.added, null);
  const r3 = addCustomColor(['Noir'], 'Cadran bleu / Bracelet doré');
  assert.deepEqual(r3.values, ['Noir', 'Cadran bleu / Bracelet doré']);
  assert.equal(r3.added, 'Cadran bleu / Bracelet doré');
});
