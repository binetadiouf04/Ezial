// Palette commune Ezial Pro + marketplace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorPalette, getColor, canonicalColorName, COMMON_COLOR_NAMES, JEWELRY_COLOR_NAMES, COLOR_ALIASES } from './colors.ts';

const REQUESTED = {
  Terracotta: '#c66b4e', 'Vert olive': '#708238', 'Vert sauge': '#9caf88', 'Vert kaki': '#777b4b',
  'Bleu canard': '#006d77', 'Bleu pétrole': '#176b78', 'Bleu ciel': '#87ceeb', 'Bleu roi': '#2455a4',
  Camel: '#c19a6b', Taupe: '#8b8078', Champagne: '#e7d5b5', Cuivre: '#b87333', Prune: '#673147',
  Lavande: '#b7a1d5', Fuchsia: '#d62c87', Corail: '#ff7f68', Moutarde: '#c49a22',
  'Vert émeraude': '#16865d', 'Gris anthracite': '#383e42', 'Bordeaux foncé': '#580e25',
};

test('les 20 couleurs demandées existent avec leur code exact', () => {
  for (const [name, hex] of Object.entries(REQUESTED)) {
    assert.equal(getColor(name)?.hex.toLowerCase(), hex, name);
  }
});

test('elles sont proposées partout (vêtements, sacs… et bijoux / montres)', () => {
  for (const name of Object.keys(REQUESTED)) {
    assert.ok(COMMON_COLOR_NAMES.includes(name), `commune : ${name}`);
    assert.ok(JEWELRY_COLOR_NAMES.includes(name), `bijoux : ${name}`);
  }
});

test('chaque couleur proposée a une pastille (sinon invisible dans Ezial Pro)', () => {
  for (const name of [...COMMON_COLOR_NAMES, ...JEWELRY_COLOR_NAMES]) assert.ok(getColor(name), name);
});

test('aucun doublon dans les listes, ni ancien synonyme proposé', () => {
  for (const list of [COMMON_COLOR_NAMES, JEWELRY_COLOR_NAMES]) {
    assert.equal(new Set(list).size, list.length);
    const canon = list.map(canonicalColorName);
    assert.equal(new Set(canon).size, canon.length);
    for (const alias of Object.keys(COLOR_ALIASES)) assert.ok(!list.includes(alias), alias);
  }
  assert.ok(!JEWELRY_COLOR_NAMES.includes('Or'), 'pas d’or véritable');
});

test('couleurs existantes conservées (noms déjà utilisés par des produits)', () => {
  for (const name of ['Noir', 'Blanc', 'Bleu', 'Bleu marine', 'Bleu roi', 'Bordeaux', 'Camel', 'Marron', 'Orange', 'Vert', 'Doré', 'Argenté', 'Or rose']) {
    assert.ok(getColor(name), name);
  }
  // Toutes les anciennes entrées de la palette sont toujours reconnues.
  for (const old of ['Anthracite', 'Kaki', 'Rose fuchsia', 'Cuivré', 'Sable', 'Cognac', 'Bleu nuit', 'Aubergine']) assert.ok(getColor(old), old);
});

test('ancien nom : même pastille que le nom de référence, nom d’origine conservé', () => {
  assert.equal(getColor('Kaki')?.hex, getColor('Vert kaki')?.hex);
  assert.equal(getColor('Kaki')?.name, 'Kaki');
  assert.equal(canonicalColorName('Anthracite'), 'Gris anthracite');
  assert.equal(canonicalColorName('Noir'), 'Noir');
});

test('palette : codes hexadécimaux valides', () => {
  for (const c of colorPalette) assert.match(c.hex, /^#[0-9a-f]{6}$/i, c.name);
});
