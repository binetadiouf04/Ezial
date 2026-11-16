// Tests de la règle « pas de bijoux en or véritable » (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionsRealGold, isGoldMaterialValue, isRealGoldJewelry, foldText } from './goldJewelry.ts';

// Mêmes cas que ceux rejoués côté base (docs/sql/bijoux-or-interdit.sql).
export const BLOCKED = [
  'Parure collier & bracelet motif feuilles Or 21 carat',
  'Bague en or 18K',
  'Bague en or massif',
  'Collier en or véritable',
  'Bracelet 18 carats d’or',
  'Chaîne or 24K',
  'Gold 18k chain',
  '18K gold chain',
  'Solid gold ring',
  'Pendentif en or jaune 18 carats',
  'Alliance or 750',
  'Vrai or',
  'Bracelet OR 21 CARATS',
  'Collier en or fin',
];

export const ALLOWED = [
  'Bracelet plaqué or',
  'Collier plaqué or 18K',
  'Bague plaquée or jaune 18 carats',
  'Boucles dorées à l’or fin',
  'Bracelet doré minimal',
  'Collier couleur or',
  'Boucles d’oreilles créoles dorées',
  'Bijou de taille ceinture dorée',
  'Bracelet en acier inoxydable doré',
  'Boucles or rose',
  'Ensemble de bracelets ornés de strass',
  'Lunettes de soleil Céline',
  'Collier gold plated',
  'Bracelet effet or',
  'Parure plaquée or 24K',
  'Ensemble de bracelets en métal, finition or',
  'Montre acier, cadran or',
];

test('les mentions d’or véritable sont repérées', () => {
  for (const text of BLOCKED) assert.equal(mentionsRealGold(text), true, `à bloquer : ${text}`);
});

test('plaqué or, doré, couleur or et acier ne sont jamais bloqués', () => {
  for (const text of ALLOWED) assert.equal(mentionsRealGold(text), false, `à autoriser : ${text}`);
});

test('matière « Or » bloquée, « Plaqué or », acier et perles autorisés', () => {
  for (const v of ['Or', 'or', 'Or massif', 'Or rose', 'Or jaune', 'Or 18K', ' OR ']) assert.equal(isGoldMaterialValue(v), true, v);
  for (const v of ['Plaqué or', 'Acier inoxydable', 'Perles', 'Argent', 'Fantaisie', 'Plaqué or 18K']) assert.equal(isGoldMaterialValue(v), false, v);
});

test('produit : seule la catégorie Bijoux est concernée', () => {
  const gold = { name: 'Parure feuilles', descriptiveAttributes: { Matière: ['Or'] } };
  assert.equal(isRealGoldJewelry({ ...gold, category: 'bijoux' }), true);
  assert.equal(isRealGoldJewelry({ ...gold, category: 'beaute' }), false);
  // « Gold 24K » est courant en cosmétique : jamais bloqué hors bijoux.
  assert.equal(isRealGoldJewelry({ category: 'beaute', name: 'Masque visage 24K gold' }), false);
});

test('produit : plaqué or, perles, acier et lunettes restent publiables', () => {
  const ok = [
    { name: 'Ensemble de bracelets ornés de strass', descriptiveAttributes: { Type: ['Bracelet'], Matière: ['Plaqué or'] } },
    { name: 'Bijou de taille en perles', descriptiveAttributes: { Matière: ['Perles'] } },
    { name: 'Boucle d’oreille en acier inoxydable', descriptiveAttributes: { Matière: ['Acier inoxydable'] }, description: 'Très jolie boucle d’oreille en acier inoxydable' },
    { name: 'Lunettes de soleil Céline', descriptiveAttributes: { Type: ['Lunettes'] } },
    { name: 'Collier doré', descriptiveAttributes: { Couleur: ['Doré', 'Or rose'] } },
  ];
  for (const p of ok) assert.equal(isRealGoldJewelry({ ...p, category: 'bijoux' }), false, p.name);
});

test('produit : or véritable repéré dans le nom, la description ou la matière', () => {
  assert.equal(isRealGoldJewelry({ category: 'bijoux', name: 'Bague', description: 'Bague en or 18K, finition polie' }), true);
  assert.equal(isRealGoldJewelry({ category: 'bijoux', name: 'Bague en or massif' }), true);
  assert.equal(isRealGoldJewelry({ category: 'bijoux', name: 'Bague', descriptiveAttributes: { Matière: ['Or'] } }), true);
  assert.equal(isRealGoldJewelry({ category: 'bijoux', name: 'Bague', descriptiveAttributes: { Titre: ['Or 750'] } }), true);
});

test('accents et majuscules ne contournent pas la règle', () => {
  assert.equal(foldText('  Plaqué  OR '), 'plaque or');
  assert.equal(mentionsRealGold('COLLIER EN OR VÉRITABLE'), true);
  assert.equal(mentionsRealGold('Bracelet en Or Massif'), true);
});
