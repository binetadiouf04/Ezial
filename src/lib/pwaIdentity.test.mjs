import test from 'node:test';
import assert from 'node:assert/strict';
import { pwaIdentityForHostname, overrideShareTags } from './pwaIdentity.ts';

test('admin.ezial.net : manifeste, icône et nom Ezial Admin', () => {
  const id = pwaIdentityForHostname('admin.ezial.net');
  assert.equal(id.manifest, '/manifest-admin.webmanifest');
  assert.equal(id.appName, 'Ezial Admin');
  assert.ok(id.appleTouchIcon.startsWith('/icons/admin/'));
  assert.deepEqual(Object.keys(id.favicons).sort(), ['16x16', '32x32', '48x48']);
  assert.ok(Object.values(id.favicons).every((u) => u.startsWith('/icons/admin/')));
  assert.equal(pwaIdentityForHostname('ADMIN.ezial.net')?.appName, 'Ezial Admin');
});

test('les autres adresses gardent l\'identité d\'origine (aucun changement)', () => {
  for (const host of ['ezial.net', 'www.ezial.net', 'livreur.ezial.net', 'ezial.pages.dev', 'abc123.ezial.pages.dev', 'localhost', '127.0.0.1', 'administrateur.ezial.net']) {
    assert.equal(pwaIdentityForHostname(host), null, host);
  }
});

test('aperçu d\'un lien admin : icône Ezial Admin au lieu de l\'image de remplacement, autres hôtes inchangés', () => {
  const base = { title: 'T', description: 'D', ogTitle: 'OT', ogDescription: 'OD', ogImage: 'https://ezial.net/ezial-fallback.webp' };
  const admin = overrideShareTags(base, 'admin.ezial.net', 'https://admin.ezial.net');
  assert.equal(admin.ogImage, 'https://admin.ezial.net/icons/admin/icon-512.png?v=2');
  assert.equal(admin.ogTitle, 'Ezial Admin');
  assert.equal(admin.title, 'Ezial Admin');
  assert.ok(!/ezial-fallback/.test(JSON.stringify(admin)));
  assert.deepEqual(overrideShareTags(base, 'ezial.net', 'https://ezial.net'), base);
  assert.deepEqual(overrideShareTags(base, 'livreur.ezial.net', 'https://livreur.ezial.net'), base);
});
