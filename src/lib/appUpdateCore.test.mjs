// Tests des règles de mise à jour de l'application (code pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSensitivePath, parseVersionPayload, isNewerBuild, shouldAutoReloadAfterChunkError } from './appUpdateCore.ts';

test('pages sensibles : paiement, commande, saisie vendeur — jamais de proposition de rechargement', () => {
  for (const p of ['/checkout', '/checkout?step=2', '/commande/abc-123', '/suivi/abc', '/panier',
    '/pro/seller/abonnement/paiement', '/seller/abonnement/essai', '/pro/seller/produits/ajouter', '/pro/seller/produits/modifier/xyz']) {
    assert.equal(isSensitivePath(p), true, p);
  }
});

test('pages ordinaires : la mise à jour peut être proposée', () => {
  for (const p of ['/', '/boutiques', '/produit/robe-wax', '/categorie/bijoux', '/profil', '/commandes', '/pro/seller', '/pro/seller/commandes', '/pro/driver', '/checkout-info', '/commandes-passees']) {
    assert.equal(isSensitivePath(p), false, p);
  }
});

test('lecture de /version.json : seul un identifiant propre est accepté', () => {
  assert.equal(parseVersionPayload({ build: 'a1b2c3d4e5f6' }), 'a1b2c3d4e5f6');
  assert.equal(parseVersionPayload({ build: '20261118-1902' }), '20261118-1902');
  for (const bad of [null, 'texte', {}, { build: 12 }, { build: '' }, { build: '<script>' }, { build: 'x'.repeat(65) }]) {
    assert.equal(parseVersionPayload(bad), null, JSON.stringify(bad));
  }
});

test('nouvelle version : seulement si l’identifiant publié diffère, jamais en développement', () => {
  assert.equal(isNewerBuild('aaa', 'bbb'), true);
  assert.equal(isNewerBuild('aaa', 'aaa'), false);
  assert.equal(isNewerBuild('aaa', null), false);
  assert.equal(isNewerBuild('dev', 'bbb'), false);
  assert.equal(isNewerBuild('', 'bbb'), false);
});

test('erreur de chargement après un déploiement : un seul rechargement par minute (pas de boucle)', () => {
  const now = 1_000_000;
  assert.equal(shouldAutoReloadAfterChunkError(null, now), true);
  assert.equal(shouldAutoReloadAfterChunkError(now - 5_000, now), false);
  assert.equal(shouldAutoReloadAfterChunkError(now - 61_000, now), true);
  assert.equal(shouldAutoReloadAfterChunkError(Number.NaN, now), true);
});
