// Tour de taille des baya.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineNeedsWaist, isBayaProduct, parseWaistCm, waistError, normalizeStoredWaist, formatWaistCm, optionsLine, sameCartLine, WAIST_MIN_CM, WAIST_MAX_CM } from './waistMeasure.ts';

test('seule la sous-catégorie Baya de Bijoux demande la mesure', () => {
  assert.equal(isBayaProduct({ category: 'bijoux', subcategory: 'baya' }), true);
  for (const sub of ['colliers', 'bracelets', 'bagues', 'montres', 'bijoux-de-taille', 'ensemble-parure']) assert.equal(isBayaProduct({ category: 'bijoux', subcategory: sub }), false, sub);
  assert.equal(isBayaProduct({ category: 'vetements', subcategory: 'baya' }), false);
  assert.equal(isBayaProduct(null), false);
});

test('mesures valides : entiers, une décimale, virgule ou point, « cm » toléré', () => {
  assert.equal(parseWaistCm('82'), 82);
  assert.equal(parseWaistCm(' 82,5 '), 82.5);
  assert.equal(parseWaistCm('82.5'), 82.5);
  assert.equal(parseWaistCm('82 cm'), 82);
  assert.equal(parseWaistCm('82cm'), 82);
  assert.equal(parseWaistCm(String(WAIST_MIN_CM)), WAIST_MIN_CM);
  assert.equal(parseWaistCm(String(WAIST_MAX_CM)), WAIST_MAX_CM);
});

test('mesures refusées : vide, texte, hors plage, trop de décimales, négatif', () => {
  for (const bad of ['', '   ', 'abc', '39', '39.9', '201', '0', '-80', '82,55', '8 2', '1e2', '82cm cm', '＋82', null, undefined]) assert.equal(parseWaistCm(bad), null, String(bad));
});

test('messages : obligatoire (vide) ou invalide', () => {
  assert.match(waistError(''), /Indiquez votre tour de taille/);
  assert.match(waistError('abc'), /entre 40 et 200 cm/);
  assert.equal(waistError('80'), null);
});

test('valeur enregistrée : nombre valide conservé, le reste ignoré', () => {
  assert.equal(normalizeStoredWaist(82), 82);
  assert.equal(normalizeStoredWaist('82.5'), 82.5);
  assert.equal(normalizeStoredWaist(5), undefined);
  assert.equal(normalizeStoredWaist(null), undefined);
  assert.equal(normalizeStoredWaist(Number.NaN), undefined);
});

test('affichage', () => {
  assert.equal(formatWaistCm(82), '82 cm');
  assert.equal(formatWaistCm(82.5), '82,5 cm');
  assert.equal(optionsLine({ Couleur: 'Noir' }, 82), 'Couleur : Noir · Tour de taille : 82 cm');
  assert.equal(optionsLine({}, 90), 'Tour de taille : 90 cm');
  assert.equal(optionsLine({ Couleur: 'Noir' }), 'Couleur : Noir');
  assert.equal(optionsLine({}, undefined), '');
});

test('panier : jamais de fusion de deux mesures différentes', () => {
  const base = { productId: 'p1', variants: { Couleur: 'Noir' } };
  assert.equal(sameCartLine({ ...base, waistCm: 80 }, { ...base, waistCm: 80 }), true);
  assert.equal(sameCartLine({ ...base, waistCm: 80 }, { ...base, waistCm: 85 }), false);
  assert.equal(sameCartLine({ ...base, waistCm: 80 }, { ...base }), false);
  assert.equal(sameCartLine({ ...base }, { ...base }), true);
  assert.equal(sameCartLine({ ...base, waistCm: 80 }, { productId: 'p2', variants: base.variants, waistCm: 80 }), false);
  assert.equal(sameCartLine({ ...base, waistCm: 80 }, { productId: 'p1', variants: { Couleur: 'Blanc' }, waistCm: 80 }), false);
});

test('commande bloquée tant qu’un baya n’a pas de mesure valide', () => {
  const baya = { category: 'bijoux', subcategory: 'baya' };
  assert.equal(lineNeedsWaist({}, baya), true);
  assert.equal(lineNeedsWaist({ waistCm: 5 }, baya), true);
  assert.equal(lineNeedsWaist({ waistCm: 82 }, baya), false);
  assert.equal(lineNeedsWaist({}, { category: 'bijoux', subcategory: 'bagues' }), false);
});
