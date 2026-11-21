// Teintes de maquillage : chaque teinte proposée a sa pastille, sans doublon,
// et chaque type de produit a des teintes qui lui sont propres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKEUP_SHADES_BY_TYPE, MAKEUP_SHADE_DEFS, TEINT_SHADES, BROW_SHADES, LIP_SHADES } from './makeupShades.ts';
import { getColor, colorPalette } from './colors.ts';

test('chaque teinte proposée a une pastille', () => {
  for (const [type, shades] of Object.entries(MAKEUP_SHADES_BY_TYPE)) {
    for (const name of shades) assert.ok(getColor(name), `${type} : pastille manquante pour « ${name} »`);
    assert.equal(new Set(shades).size, shades.length, `${type} : teinte en double`);
  }
});

test('aucun nom propre au maquillage ne remplace une couleur existante', () => {
  const before = colorPalette.slice(0, colorPalette.length - MAKEUP_SHADE_DEFS.length).map((c) => c.name);
  for (const d of MAKEUP_SHADE_DEFS) assert.ok(!before.includes(d.name), `« ${d.name} » existe déjà dans la palette`);
});

test('le teint : 6 profondeurs × 4 sous-tons ; sourcils et lèvres distincts du teint', () => {
  assert.equal(TEINT_SHADES.length, 24);
  assert.ok(TEINT_SHADES.includes('Très foncé olive'));
  assert.ok(!BROW_SHADES.some((s) => TEINT_SHADES.includes(s)));
  assert.ok(!LIP_SHADES.some((s) => TEINT_SHADES.includes(s)));
  assert.equal(MAKEUP_SHADES_BY_TYPE['Fond de teint'], TEINT_SHADES);
  assert.equal(MAKEUP_SHADES_BY_TYPE['Crayon à sourcils'], BROW_SHADES);
  assert.equal(MAKEUP_SHADES_BY_TYPE['Faux cils'], undefined);
});
