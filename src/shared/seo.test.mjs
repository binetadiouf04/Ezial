import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEO, DELIVERY } from './siteInfo.js';
import { INFO_PAGES as INFO_LIST } from './infoPages.js';

const INFO_PAGES = Object.fromEntries(INFO_LIST.map((p) => [p.slug, p]));
import { BECOME_SELLER_META } from './becomeSeller.js';
import { clipDescription, categoryDescription, productFallbackDescription, shopFallbackDescription, SHOPS_INDEX_DESCRIPTION, UTILITY_DESCRIPTIONS } from './seoText.js';
import { BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION } from '../components/blog/blogShared.js';

const HOME_TITLE = 'Ezial, mode, beauté et accessoires à Dakar';
const HOME_DESCRIPTION = 'Ezial, marketplace 100 % en ligne réunissant plusieurs boutiques à Dakar. Mode, beauté, parfumerie et accessoires. Livraison dès 800 FCFA en 4 à 48 h.';

test('accueil : titre et description demandés, dans les limites des moteurs de recherche', () => {
  assert.equal(SEO.homeTitle, HOME_TITLE);
  assert.equal(SEO.homeDescription, HOME_DESCRIPTION);
  assert.ok(SEO.homeTitle.length <= 60, 'titre ≤ 60 caractères');
  assert.ok(SEO.homeDescription.length <= 160, 'description ≤ 160 caractères');
  assert.equal(DELIVERY.fromFee, 800);
});

test('index.html (HTML initial lu par Google) porte exactement les mêmes textes, Open Graph et Twitter compris', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(`<title>${HOME_TITLE}</title>`));
  for (const tag of [
    `<meta name="description" content="${HOME_DESCRIPTION}" />`,
    `<meta property="og:title" content="${HOME_TITLE}" />`,
    `<meta property="og:description" content="${HOME_DESCRIPTION}" />`,
    `<meta name="twitter:title" content="${HOME_TITLE}" />`,
    `<meta name="twitter:description" content="${HOME_DESCRIPTION}" />`,
  ]) assert.ok(html.includes(tag), tag);
  assert.ok(html.includes('<link rel="canonical" href="https://ezial.net/" />'));
  // Aperçu des liens : papillon sur fond rouge, jamais l'image de remplacement « Image indisponible ».
  assert.ok(html.includes('<meta property="og:image" content="https://ezial.net/ezial-partage.png" />'));
  assert.ok(html.includes('<meta name="twitter:image" content="https://ezial.net/ezial-partage.png" />'));
  assert.ok(!/og:image[^>]*ezial-fallback/.test(html));
  assert.ok(readFileSync(new URL('../../public/ezial-partage.png', import.meta.url)).length > 1000);
});

test('aucune description ni aucun titre ne parle de cheveux ni de « lifestyle »', () => {
  const texts = [
    SEO.homeTitle, SEO.homeDescription, BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION, BECOME_SELLER_META.title, BECOME_SELLER_META.description,
    SHOPS_INDEX_DESCRIPTION, categoryDescription('Beauté'), categoryDescription('Beauté', 'Soins capillaires'),
    productFallbackDescription('Brume'), shopFallbackDescription('Maison Dakar'), ...Object.values(UTILITY_DESCRIPTIONS),
    ...INFO_LIST.flatMap((p) => [p.metaTitle, p.description]),
    readFileSync(new URL('../../index.html', import.meta.url), 'utf8'),
  ];
  for (const t of texts) assert.ok(!/cheveu|lifestyle/i.test(t.replace('Soins capillaires', '')), t.slice(0, 80));
});

test('titres éditoriaux : « Ezial, … » et jamais « Ezial — … » en début de titre', () => {
  for (const t of [SEO.homeTitle, BLOG_INDEX_TITLE]) assert.ok(!/^Ezial\s+[—-]/.test(t) && !/^Blog Ezial\s+[—-]/.test(t), t);
  assert.ok(BLOG_INDEX_TITLE.startsWith('Blog Ezial,'));
});

test('descriptions des pages : au plus 160 caractères, et jamais deux identiques', () => {
  const all = [
    ['accueil', SEO.homeDescription], ['boutiques', SHOPS_INDEX_DESCRIPTION], ['blog', BLOG_INDEX_DESCRIPTION],
    ['devenir-vendeur', BECOME_SELLER_META.description],
    ...INFO_LIST.map((p) => [`info/${p.slug}`, p.description]),
    ...Object.entries(UTILITY_DESCRIPTIONS),
    ['cat-vetements', categoryDescription('Vêtements')], ['cat-sacs', categoryDescription('Sacs & Maroquinerie')],
    ['sub', categoryDescription('Bijoux & Accessoires', 'Ensemble / Parure')],
    ['produit', productFallbackDescription('Robe wax')], ['boutique', shopFallbackDescription('Maison Dakar')],
  ];
  for (const [name, d] of all) assert.ok(d.length > 0 && d.length <= 160, `${name} : ${d.length} caractères`);
  const seen = new Map();
  for (const [name, d] of all) { assert.ok(!seen.has(d), `${name} identique à ${seen.get(d)}`); seen.set(d, name); }
});

test('descriptions de catégorie, produit et boutique : propres à la page, avec la livraison dès 800 FCFA', () => {
  assert.notEqual(categoryDescription('Vêtements'), categoryDescription('Chaussures'));
  assert.ok(categoryDescription('Vêtements').startsWith('Vêtements à Dakar'));
  assert.ok(categoryDescription('Bijoux & Accessoires', 'Montres').startsWith('Montres (Bijoux & Accessoires)'));
  assert.ok(productFallbackDescription('Montre Casio').includes('Montre Casio'));
  assert.ok(shopFallbackDescription('Maison Dakar').includes('Maison Dakar'));
  for (const d of [categoryDescription('Vêtements'), productFallbackDescription('X'), shopFallbackDescription('Y'), SHOPS_INDEX_DESCRIPTION]) assert.ok(d.includes('dès 800 FCFA en 4 à 48 h'));
});

test('clipDescription : coupe au dernier mot entier avec « … »', () => {
  const long = 'mot '.repeat(60);
  const out = clipDescription(long);
  assert.ok(out.length <= 160 && out.endsWith('…') && !out.includes('mo…'));
  assert.equal(clipDescription('court'), 'court');
});

test('page Paiement : informations fonctionnelles inchangées (paiement en cours d’activation, jamais de code PIN)', () => {
  const p = INFO_PAGES.paiement;
  assert.ok(p.description.includes('Wave et Orange Money') && p.description.includes('code PIN'));
  assert.equal(p.metaTitle, 'Paiement — Ezial');
});

test('page Livraison : dès 800 FCFA en 4 à 48 h à Dakar', () => {
  const l = INFO_PAGES.livraison;
  assert.ok(l.description.includes('dès 800 FCFA') && l.description.includes('4 à 48 h') && l.description.length <= 160);
});
