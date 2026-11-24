// Option « Autre » + précision, et « Tous types de peau » exclusif.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOtherValue, parseOtherValue, splitOtherValues, joinOtherValues, toggleSkinType, ALL_SKIN_TYPES, OTHER_DETAIL_MAX_LENGTH } from './otherOption.ts';

test('« Autre » sans précision reste « Autre » (forme déjà enregistrée par les montres)', () => {
  assert.equal(formatOtherValue(''), 'Autre');
  assert.equal(formatOtherValue('   '), 'Autre');
  assert.equal(formatOtherValue(undefined), 'Autre');
});

test('précision : une ligne, espaces réduits, 60 caractères au plus', () => {
  assert.equal(formatOtherValue('  turban\n en   wax '), 'Autre (turban en wax)');
  const long = formatOtherValue('x'.repeat(200));
  assert.equal(long, `Autre (${'x'.repeat(OTHER_DETAIL_MAX_LENGTH)})`);
});

test('lecture : seules « Autre » et « Autre (…) » sont reconnues', () => {
  assert.equal(parseOtherValue('Autre'), '');
  assert.equal(parseOtherValue('Autre (turban en wax)'), 'turban en wax');
  assert.equal(parseOtherValue('Autre (foulard (soie))'), 'foulard (soie)');
  assert.equal(parseOtherValue('Autre tissu'), null);
  assert.equal(parseOtherValue('Sèche'), null);
  assert.equal(parseOtherValue('autre'), null);
});

test('aller-retour formulaire ↔ base sans perte, valeurs existantes inchangées', () => {
  const saved = joinOtherValues(['French', 'Autre'], 'motif tressé');
  assert.deepEqual(saved, ['French', 'Autre (motif tressé)']);
  assert.deepEqual(splitOtherValues(saved), { values: ['French', 'Autre'], detail: 'motif tressé' });
  assert.deepEqual(splitOtherValues(['Métal']), { values: ['Métal'], detail: '' });
  assert.deepEqual(splitOtherValues(['Autre']), { values: ['Autre'], detail: '' });
  assert.deepEqual(joinOtherValues(['Cuir'], 'ignoré'), ['Cuir']);
});

test('« Tous types de peau » exclut les autres choix, dans les deux sens', () => {
  assert.deepEqual(toggleSkinType(['Sèche', 'Mixte'], ALL_SKIN_TYPES), [ALL_SKIN_TYPES]);
  assert.deepEqual(toggleSkinType([ALL_SKIN_TYPES], 'Grasse'), ['Grasse']);
  assert.deepEqual(toggleSkinType(['Sèche'], 'Mixte'), ['Sèche', 'Mixte']);
  assert.deepEqual(toggleSkinType(['Sèche', 'Mixte'], 'Sèche'), ['Mixte']);
  assert.deepEqual(toggleSkinType([ALL_SKIN_TYPES], ALL_SKIN_TYPES), []);
  // Produit enregistré avant le choix multiple : une seule valeur, lisible telle quelle.
  assert.deepEqual(toggleSkinType(['Grasse'], 'Sensible'), ['Grasse', 'Sensible']);
});
