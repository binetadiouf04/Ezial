#!/usr/bin/env node
// Generates real, static, crawlable HTML files — one per active product,
// shop and category(/subcategory) — plus the sitemap, directly from
// Supabase at build time. Runs AFTER `vite build` (needs the final hashed
// asset filenames from dist/index.html) and BEFORE the GitHub Pages
// upload step.
//
// Why this exists: the live app is a 100% client-rendered SPA using hash
// routing (#/produit/123). A hash fragment is never a distinct URL to a
// search engine — every one of those "pages" collapses to the same
// https://www.ezial.net/, so nothing but the homepage was ever indexable.
//
// This script does NOT change that app. It adds real files at real paths
// (dist/produit/<id>/index.html, etc.) containing the actual product/shop/
// category content as plain HTML (readable with zero JavaScript), correct
// per-page <title>/meta description/canonical/Open Graph/JSON-LD, and the
// exact same <script>/<link> tags as the built app — so once a browser (or
// a crawler that executes JS) loads that same file, the normal React app
// mounts right over it and becomes fully interactive. Nothing redirects:
// the URL a visitor or a crawler lands on is the URL that stays in the bar.
// See src/store/AppContext.tsx's getInitialRoute() for the one small
// router change that lets the app recognize that initial path.
//
// Usage: node scripts/prerender-seo.mjs   (after `vite build`)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = `${ROOT}dist`;
const SITE_URL = 'https://www.ezial.net';

function loadEnvLocal() {
  const path = `${ROOT}.env.local`;
  if (!existsSync(path)) return {};
  const env = {};
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[line.slice(0, idx).trim()] = value;
  }
  return env;
}

const fileEnv = loadEnvLocal();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('prerender-seo: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — cannot fetch catalog data.');
  process.exit(1);
}
if (!existsSync(`${DIST}/index.html`)) {
  console.error('prerender-seo: dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Small, stable id -> label lookup, kept in sync by hand with
// src/data/categories.ts (not imported directly: that file also imports
// bundled image assets via Vite's module graph, which this plain Node
// script doesn't have access to).
const CATEGORY_LABELS = {
  vetements: 'Vêtements', chaussures: 'Chaussures', sacs: 'Sacs & Maroquinerie',
  beaute: 'Beauté', parfums: 'Parfums & Senteurs', bijoux: 'Bijoux & Accessoires', lingerie: 'Pyjamas & Lingerie',
};
const SUBCATEGORY_LABELS = {
  femme: 'Femme', homme: 'Homme',
  'sacs-a-main': 'Sacs à main', 'sacs-bandouliere': 'Sacs bandoulière', pochette: 'Pochette', portefeuilles: 'Portefeuilles', 'sacs-a-dos': 'Sacs à dos',
  maquillage: 'Maquillage', skincare: 'Skincare', 'soins-capillaires': 'Soins capillaires', hygiene: 'Hygiène & soins corporels', 'mains-et-pieds': 'Manucure & Pédicure',
  'parfums-femme': 'Parfums Femme', 'parfums-homme': 'Parfums Homme', 'huiles-brumes': 'Huiles & Brumes', 'encens-parfums-maison': 'Encens & Parfums de maison',
  colliers: 'Colliers', bracelets: 'Bracelets', bagues: 'Bagues', 'boucles-oreilles': "Boucles d'oreilles", montres: 'Montres', lunettes: 'Lunettes', 'bijoux-de-taille': 'Bijou de taille', 'ensemble-parure': 'Ensemble / Parure',
  pyjamas: 'Pyjamas', lingerie: 'Lingerie', 'sous-vetements': 'Sous-vêtements', 'vetements-de-nuit': 'Vêtements de nuit',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PRODUCT_IMAGES_BUCKET = 'product-images';
function resolveImageUrl(storagePath) {
  if (!storagePath) return '';
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

console.log('prerender-seo: fetching catalog from Supabase...');

const [shopsRes, productsRes] = await Promise.all([
  supabase.from('shops').select('*').eq('status', 'active'),
  supabase.from('products').select('*').eq('status', 'active'),
]);
if (shopsRes.error) { console.error('prerender-seo: shops query failed —', shopsRes.error.message); process.exit(1); }
if (productsRes.error) { console.error('prerender-seo: products query failed —', productsRes.error.message); process.exit(1); }

const shops = shopsRes.data;
const activeShopIds = new Set(shops.map((s) => s.id));
// Mirrors fetchActiveCatalogFromSupabase (src/lib/supabaseCatalog.ts): a
// product can be 'active' while its own shop isn't — never shown publicly.
const products = productsRes.data.filter((p) => activeShopIds.has(p.shop_id));
const productIds = products.map((p) => p.id);

let imagesByProduct = new Map();
let statsByProduct = new Map();
let stockByProduct = new Map();
if (productIds.length > 0) {
  const [imagesRes, reviewsRes, variantsRes] = await Promise.all([
    supabase.from('product_images').select('*').in('product_id', productIds),
    supabase.from('reviews').select('product_id, rating').in('product_id', productIds),
    supabase.from('product_variants').select('product_id, stock').in('product_id', productIds),
  ]);
  if (imagesRes.error) console.warn('prerender-seo: product_images query failed —', imagesRes.error.message);
  if (reviewsRes.error) console.warn('prerender-seo: reviews query failed —', reviewsRes.error.message);
  if (variantsRes.error) console.warn('prerender-seo: product_variants query failed —', variantsRes.error.message);

  // Mirrors mapProduct (src/lib/supabaseCatalog.ts): stock lives on
  // product_variants, summed per product — a product with no variant rows
  // has no stock source at all and defaults to 0, same as the live app.
  for (const row of variantsRes.data ?? []) {
    stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + (row.stock ?? 0));
  }

  for (const row of imagesRes.data ?? []) {
    const list = imagesByProduct.get(row.product_id) ?? [];
    list.push(row);
    imagesByProduct.set(row.product_id, list);
  }
  for (const list of imagesByProduct.values()) {
    list.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const ratingsByProduct = new Map();
  for (const row of reviewsRes.data ?? []) {
    const list = ratingsByProduct.get(row.product_id) ?? [];
    list.push(row.rating);
    ratingsByProduct.set(row.product_id, list);
  }
  for (const [productId, ratings] of ratingsByProduct) {
    statsByProduct.set(productId, { average: ratings.reduce((s, r) => s + r, 0) / ratings.length, count: ratings.length });
  }
}

function imagesForProduct(productId) {
  const rows = (imagesByProduct.get(productId) ?? []).filter((r) => r.media_type !== 'video');
  const urls = rows.map((r) => resolveImageUrl(r.storage_path)).filter(Boolean);
  return urls.length > 0 ? urls : [`${SITE_URL}/ezial-fallback.webp`];
}

function isPromoActive(p) {
  if (!p.is_promo) return false;
  const now = Date.now();
  if (p.promo_start && now < new Date(p.promo_start).getTime()) return false;
  if (p.promo_end && now > new Date(p.promo_end).getTime()) return false;
  return true;
}
function priceFor(p) { return isPromoActive(p) ? (p.promo_price ?? p.base_price) : p.base_price; }
function stockFor(productId) { return stockByProduct.get(productId) ?? 0; }

const BASE_TEMPLATE = readFileSync(`${DIST}/index.html`, 'utf8');

/**
 * Builds one static page from the base built index.html: swaps the <head>
 * meta block for this page's own title/description/canonical/OG/Twitter
 * tags, appends JSON-LD before </head>, and fills #root with real,
 * crawlable HTML — the exact same script/link tags Vite emitted stay
 * untouched, so the moment this file is loaded in a browser the normal
 * React app mounts over this content and takes over, unchanged.
 */
function renderPage({ title, description, canonical, ogImage, jsonLd, bodyHtml }) {
  let html = BASE_TEMPLATE;
  html = html.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canonical)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(canonical)}" />`);
  if (ogImage) {
    html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(ogImage)}" />`);
    html = html.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(ogImage)}" />`);
  }
  const jsonLdTag = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`;
  html = html.replace('</head>', jsonLdTag);
  html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
  return html;
}

function breadcrumbNav(items) {
  return `<nav aria-label="Fil d'Ariane"><ol>${items.map((i) => `<li><a href="${esc(i.url)}">${esc(i.name)}</a></li>`).join('')}</ol></nav>`;
}
function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
  };
}

function writeFile(relPath, html) {
  const full = `${DIST}${relPath}`;
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, html, 'utf8');
}

const sitemapUrls = [`${SITE_URL}/`];

// --- Products ---------------------------------------------------------
for (const p of products) {
  const canonical = `${SITE_URL}/produit/${p.id}/`;
  const shop = shops.find((s) => s.id === p.shop_id);
  const categoryLabel = CATEGORY_LABELS[p.category] ?? p.category;
  const subLabel = p.subcategory ? (SUBCATEGORY_LABELS[p.subcategory] ?? p.subcategory) : null;
  const images = imagesForProduct(p.id);
  const price = priceFor(p);
  const stats = statsByProduct.get(p.id);
  const title = `${p.name} — ${price.toLocaleString('fr-FR')} FCFA | Ezial`;
  const description = (p.description || `${p.name} disponible sur Ezial, marketplace mode, beauté et accessoires au Sénégal.`).slice(0, 160);

  const breadcrumbItems = [
    { name: 'Accueil', url: `${SITE_URL}/` },
    ...(p.category ? [{ name: categoryLabel, url: `${SITE_URL}/categorie/${p.category}/` }] : []),
    ...(p.category && p.subcategory ? [{ name: subLabel, url: `${SITE_URL}/categorie/${p.category}/${p.subcategory}/` }] : []),
    { name: p.name, url: canonical },
  ];

  const productJsonLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, description: p.description || undefined, image: images, sku: p.reference || p.id, url: canonical,
    offers: { '@type': 'Offer', price, priceCurrency: 'XOF', availability: `https://schema.org/${stockFor(p.id) > 0 ? 'InStock' : 'OutOfStock'}`, url: canonical },
    ...(stats && stats.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: stats.average, reviewCount: stats.count } } : {}),
  };

  const bodyHtml = `
    ${breadcrumbNav(breadcrumbItems)}
    <main>
      <h1>${esc(p.name)}</h1>
      ${shop ? `<p><a href="${esc(`${SITE_URL}/boutique/${shop.id}/`)}">${esc(shop.name)}</a></p>` : ''}
      ${images.map((url) => `<img src="${esc(url)}" alt="${esc(p.name)}" />`).join('')}
      <p>${price.toLocaleString('fr-FR')} FCFA</p>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    </main>`;

  writeFile(`/produit/${p.id}/index.html`, renderPage({
    title, description, canonical, ogImage: images[0], bodyHtml,
    jsonLd: [productJsonLd, breadcrumbJsonLd(breadcrumbItems)],
  }));
  sitemapUrls.push(canonical);
}

// --- Shops --------------------------------------------------------------
for (const shop of shops) {
  const canonical = `${SITE_URL}/boutique/${shop.id}/`;
  const shopProducts = products.filter((p) => p.shop_id === shop.id);
  const title = `${shop.name} — Boutique Ezial`;
  const description = (shop.description || `Découvrez la boutique ${shop.name} sur Ezial.`).slice(0, 160);
  const logoUrl = shop.logo_url ? resolveImageUrl(shop.logo_url) : undefined;

  const breadcrumbItems = [{ name: 'Accueil', url: `${SITE_URL}/` }, { name: shop.name, url: canonical }];

  const bodyHtml = `
    ${breadcrumbNav(breadcrumbItems)}
    <main>
      <h1>${esc(shop.name)}</h1>
      ${shop.description ? `<p>${esc(shop.description)}</p>` : ''}
      ${shop.neighborhood ? `<p>${esc(shop.neighborhood)}</p>` : ''}
      <h2>Produits</h2>
      <ul>${shopProducts.map((p) => `<li><a href="${esc(`${SITE_URL}/produit/${p.id}/`)}">${esc(p.name)}</a></li>`).join('')}</ul>
    </main>`;

  writeFile(`/boutique/${shop.id}/index.html`, renderPage({
    title, description, canonical, ogImage: logoUrl, bodyHtml,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Organization', name: shop.name, description: shop.description || undefined, url: canonical, logo: logoUrl },
      breadcrumbJsonLd(breadcrumbItems),
    ],
  }));
  sitemapUrls.push(canonical);
}

// --- Categories + subcategories ------------------------------------------
for (const [categoryId, categoryLabel] of Object.entries(CATEGORY_LABELS)) {
  const categoryProducts = products.filter((p) => p.category === categoryId);
  const subIds = [...new Set(categoryProducts.map((p) => p.subcategory).filter(Boolean))];

  const buildCategoryPage = (subId) => {
    const sub = subId ? (SUBCATEGORY_LABELS[subId] ?? subId) : null;
    const canonical = sub ? `${SITE_URL}/categorie/${categoryId}/${subId}/` : `${SITE_URL}/categorie/${categoryId}/`;
    const scoped = subId ? categoryProducts.filter((p) => p.subcategory === subId) : categoryProducts;
    const title = sub ? `${sub} — ${categoryLabel} au Sénégal | Ezial` : `${categoryLabel} au Sénégal | Ezial`;
    const description = `Découvrez les produits ${sub ? `${sub.toLowerCase()} de la catégorie ${categoryLabel.toLowerCase()}` : categoryLabel.toLowerCase()} sur Ezial, marketplace mode, beauté et accessoires au Sénégal.`.slice(0, 160);
    const breadcrumbItems = [
      { name: 'Accueil', url: `${SITE_URL}/` },
      { name: categoryLabel, url: `${SITE_URL}/categorie/${categoryId}/` },
      ...(sub ? [{ name: sub, url: canonical }] : []),
    ];
    const bodyHtml = `
      ${breadcrumbNav(breadcrumbItems)}
      <main>
        <h1>${esc(sub ? `${sub} — ${categoryLabel}` : categoryLabel)}</h1>
        <ul>${scoped.map((p) => `<li><a href="${esc(`${SITE_URL}/produit/${p.id}/`)}">${esc(p.name)} — ${priceFor(p).toLocaleString('fr-FR')} FCFA</a></li>`).join('')}</ul>
      </main>`;
    writeFile(subId ? `/categorie/${categoryId}/${subId}/index.html` : `/categorie/${categoryId}/index.html`, renderPage({
      title, description, canonical, bodyHtml, jsonLd: [breadcrumbJsonLd(breadcrumbItems)],
    }));
    sitemapUrls.push(canonical);
  };

  buildCategoryPage(null);
  for (const subId of subIds) buildCategoryPage(subId);
}

// --- Organization + WebSite JSON-LD on the homepage itself --------------
{
  const homeJsonLd = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Ezial', url: `${SITE_URL}/`, logo: `${SITE_URL}/apple-touch-icon.png` },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Ezial', url: `${SITE_URL}/` },
  ];
  let html = BASE_TEMPLATE.replace('</head>', `<script type="application/ld+json">${JSON.stringify(homeJsonLd)}</script>\n  </head>`);
  writeFileSync(`${DIST}/index.html`, html, 'utf8');
}

// --- Sitemap --------------------------------------------------------------
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
writeFileSync(`${DIST}/sitemap.xml`, sitemapXml, 'utf8');

console.log(`prerender-seo: generated ${products.length} product page(s), ${shops.length} shop page(s), ${sitemapUrls.length} sitemap URL(s).`);
