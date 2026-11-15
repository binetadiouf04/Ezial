// Tests des adresses de boutique (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { shopKey, shopPath, shopPublicPath, findShopByKey, shopShareUrl, shopShareTexts } from './shopUrl.ts';

const ID = 'b421a06f-2376-4ba8-8bfb-2ef7a143546e';

test('le nom court est préféré, l’identifiant sert de repli', () => {
  assert.equal(shopKey({ id: ID, slug: 'tiass-brand' }), 'tiass-brand');
  assert.equal(shopKey({ id: ID, slug: '' }), ID);
  assert.equal(shopKey({ id: ID }), ID);
  assert.equal(shopPath({ id: ID, slug: 'tiass-brand' }), '/boutique/tiass-brand');
  assert.equal(shopPublicPath({ id: ID, slug: 'tiass-brand' }), '/boutique/tiass-brand/');
  assert.equal(shopPublicPath({ id: ID }), `/boutique/${ID}/`);
});

test('une boutique se retrouve par son nom court ou par son identifiant', () => {
  const shops = [{ id: 'a', slug: 'ezial' }, { id: ID, slug: 'tiass-brand' }, { id: 'c' }];
  assert.equal(findShopByKey(shops, 'tiass-brand').id, ID);
  assert.equal(findShopByKey(shops, ID).slug, 'tiass-brand');
  assert.equal(findShopByKey(shops, 'c').id, 'c');
  assert.equal(findShopByKey(shops, 'inconnue'), undefined);
  // L'identifiant l'emporte si un nom court identique existait chez une autre boutique.
  assert.equal(findShopByKey([{ id: 'x', slug: 'y' }, { id: 'y' }], 'y').id, 'y');
});

test('lien à partager : adresse du site + nom court + barre finale', () => {
  assert.equal(shopShareUrl({ id: ID, slug: 'tiass-brand' }, 'https://ezial.net'), 'https://ezial.net/boutique/tiass-brand/');
  assert.equal(shopShareUrl({ id: ID, slug: 'tiass-brand' }, 'https://ezial.net/'), 'https://ezial.net/boutique/tiass-brand/');
});

test('textes prêts à copier : nom de la boutique et lien, bio dans la limite d’Instagram', () => {
  const url = 'https://ezial.net/boutique/tiass-brand/';
  const t = shopShareTexts('  tiassbrand ', url);
  for (const text of Object.values(t)) {
    assert.ok(text.includes('tiassbrand'));
    assert.ok(text.includes(url));
  }
  assert.ok(t.bio.length <= 150);
});
