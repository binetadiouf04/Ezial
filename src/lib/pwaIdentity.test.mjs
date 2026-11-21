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
  for (const host of ['ezial.net', 'www.ezial.net', 'ezial.pages.dev', 'abc123.ezial.pages.dev', 'localhost', '127.0.0.1', 'administrateur.ezial.net']) {
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
  assert.deepEqual(overrideShareTags(base, 'www.ezial.net', 'https://www.ezial.net'), base);
});

test('livreur.ezial.net : manifeste, icônes et nom Ezial Livreur, thème rouge rubis, rien d\'autre ne change', () => {
  const id = pwaIdentityForHostname('livreur.ezial.net');
  assert.equal(id.manifest, '/manifest-livreur.webmanifest');
  assert.equal(id.appName, 'Ezial Livreur');
  assert.equal(id.appleTouchIcon, '/icons/livreur/apple-touch-icon.png');
  assert.equal(id.themeColor, '#8C1024');
  assert.deepEqual(id.favicons, {}); // favicon inchangé
  assert.equal(pwaIdentityForHostname('LIVREUR.ezial.net')?.appName, 'Ezial Livreur');
  assert.equal(pwaIdentityForHostname('livreurs.ezial.net'), null);
  // L'admin et le site public gardent leur propre identité.
  assert.equal(pwaIdentityForHostname('admin.ezial.net').manifest, '/manifest-admin.webmanifest');
  assert.equal(pwaIdentityForHostname('admin.ezial.net').themeColor, undefined);
  const base = { title: 'T', description: 'D', ogTitle: 'OT', ogDescription: 'OD', ogImage: 'https://ezial.net/x.webp' };
  assert.equal(overrideShareTags(base, 'livreur.ezial.net', 'https://livreur.ezial.net').ogImage, 'https://livreur.ezial.net/icons/livreur/icon-512.png');
});

test('fichiers de l\'application Livreur : manifeste valide, icônes présentes aux bonnes tailles', async () => {
  const { readFileSync } = await import('node:fs');
  const root = new URL('../../public/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest-livreur.webmanifest', root), 'utf8'));
  assert.equal(m.name, 'Ezial Livreur');
  assert.equal(m.short_name, 'Ezial Livreur');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#8C1024');
  const size = (file) => { const b = readFileSync(new URL(file.replace(/^\//, ''), root)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const icon of m.icons) {
    const [w, h] = size(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    assert.ok(icon.src.startsWith('/icons/livreur/'), icon.src);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.deepEqual(size('/icons/livreur/apple-touch-icon.png'), [180, 180]);
  // Les autres applications pointent toujours vers leurs propres icônes.
  const market = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  const admin = JSON.parse(readFileSync(new URL('manifest-admin.webmanifest', root), 'utf8'));
  assert.ok(market.icons.every((i) => !i.src.includes('livreur')));
  assert.ok(admin.icons.every((i) => i.src.startsWith('/icons/admin/')));
});
