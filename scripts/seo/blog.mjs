// Static (crawlable) blog pages: /blog/, /blog/<slug>/, /blog/categorie/<slug>/.
// Called by scripts/prerender-seo.mjs with the shared helpers (ctx).
//
// Only published articles (status 'published', publication date passed) and
// only categories with at least one of them. No article → no blog page and
// nothing in the sitemap. The blog never breaks the build: a missing table
// (migration not run yet) or any failed query logs a warning and generates
// nothing; pages are only written once everything has been rendered.
import { markdownToHtml } from '../../src/shared/markdown.js';
import {
  BLOG_NAME, BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION, BLOG_INTRO, BLOG_AUTHOR_LABEL, EZIAL_ORGANIZATION,
  BLOG_INDEX_PATH, blogPostPath, blogCategoryPath, marketplaceLinkPath, marketplaceLinkLabel,
  blogPostTitle, blogPostDescription, blogCategoryTitle, blogCategoryDescription, truncateText,
  postLastModified, formatBlogDate, showUpdatedDate, blogImagePrefixFor, makeBlogImageCheck,
} from '../../src/components/blog/blogShared.js';

const PAGE_SIZE = 1000;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const POST_COLUMNS = 'id, slug, title, excerpt, content, cover_image_url, cover_image_alt, category_id, published_at, updated_at, seo_title, meta_description, og_image_url, marketplace_links, sources';
const CATEGORY_COLUMNS = 'id, name, slug, description, sort_order, updated_at';

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows };
  }
}

// JSON-LD is serialized inside a <script> element: a "</script" or "<!--"
// sequence in a title would end it early. Only that "<" is replaced.
function scriptSafe(value) {
  if (typeof value === 'string') return value.replace(/<(?=\/?script|!--)/gi, '﹤');
  if (Array.isArray(value)) return value.map(scriptSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scriptSafe(v)]));
  return value;
}

function toIso(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

async function loadBlog(supabase) {
  const nowIso = new Date().toISOString();
  const [categoriesRes, postsRes] = await Promise.all([
    fetchAll(() => supabase.from('blog_categories').select(CATEGORY_COLUMNS).order('sort_order', { ascending: true }).order('name', { ascending: true })),
    fetchAll(() => supabase.from('blog_posts').select(POST_COLUMNS).eq('status', 'published').lte('published_at', nowIso)
      .order('published_at', { ascending: false }).order('id', { ascending: true })),
  ]);
  if (categoriesRes.error) {
    console.warn('prerender-seo: blog ignoré — catégories illisibles (migration du blog pas encore exécutée ?) —', categoriesRes.error.message);
    return null;
  }
  if (postsRes.error) {
    console.warn('prerender-seo: blog ignoré — articles illisibles (migration du blog pas encore exécutée ?) —', postsRes.error.message);
    return null;
  }
  const posts = postsRes.rows.filter((p) => SLUG_RE.test(p.slug ?? '') && p.title && toIso(p.published_at));
  return { categories: categoriesRes.rows.filter((c) => SLUG_RE.test(c.slug ?? '') && c.name), posts };
}

function renderBlog(ctx, { categories, posts }) {
  const { SITE_URL, esc, renderPage, breadcrumbNav, breadcrumbJsonLd, CATEGORY_LABELS, SUBCATEGORY_LABELS } = ctx;
  const isImageAllowed = makeBlogImageCheck(blogImagePrefixFor(ctx.supabase));
  const noImages = () => false;
  const abs = (path) => `${SITE_URL}${path}`;
  const indexUrl = abs(BLOG_INDEX_PATH);
  const home = { name: 'Accueil', url: `${SITE_URL}/` };
  const blogCrumb = { name: 'Blog', url: indexUrl };

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const usedCategories = categories.filter((c) => posts.some((p) => p.category_id === c.id));
  const lastModOf = (p) => postLastModified(p.published_at, p.updated_at);
  const maxOf = (values) => {
    const known = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
    return known.length > 0 ? Math.max(...known) : undefined;
  };
  const categoryUpdated = (c) => {
    const t = new Date(c.updated_at).getTime();
    return Number.isNaN(t) ? undefined : t;
  };

  const postItem = (p, heading) => {
    const c = categoryById.get(p.category_id);
    return `<li><article><${heading}><a href="${esc(abs(blogPostPath(p.slug)))}">${esc(p.title)}</a></${heading}>`
      + `<p><time datetime="${esc(toIso(p.published_at))}">${esc(formatBlogDate(p.published_at))}</time>`
      + `${c ? ` · <a href="${esc(abs(blogCategoryPath(c.slug)))}">${esc(c.name)}</a>` : ''}</p>`
      + `${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}</article></li>`;
  };
  const categoryNav = (activeSlug) => (usedCategories.length === 0 ? '' : `<nav aria-label="Catégories du blog"><ul>`
    + `<li><a href="${esc(indexUrl)}"${activeSlug ? '' : ' aria-current="page"'}>Tous les articles</a></li>`
    + usedCategories.map((c) => `<li><a href="${esc(abs(blogCategoryPath(c.slug)))}"${c.slug === activeSlug ? ' aria-current="page"' : ''}>${esc(c.name)}</a></li>`).join('')
    + '</ul></nav>');
  const collectionJsonLd = (name, description, url, list) => ({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name, description, url, inLanguage: 'fr',
    isPartOf: { '@type': 'WebSite', name: 'Ezial', url: `${SITE_URL}/` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(blogPostPath(p.slug)), name: p.title })),
    },
  });

  const files = [];
  const sitemap = [];

  // --- /blog/ ------------------------------------------------------------
  {
    const crumbs = [home, blogCrumb];
    const bodyHtml = `
    ${breadcrumbNav(crumbs)}
    <main>
      <h1>${esc(BLOG_NAME)}</h1>
      <p>${esc(BLOG_INTRO)}</p>
      ${categoryNav(null)}
      <ul>${posts.map((p) => postItem(p, 'h2')).join('')}</ul>
    </main>`;
    files.push({
      path: '/blog/index.html',
      html: renderPage({
        title: BLOG_INDEX_TITLE, description: BLOG_INDEX_DESCRIPTION, canonical: indexUrl, bodyHtml, ogType: 'website',
        jsonLd: scriptSafe([collectionJsonLd(BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION, indexUrl, posts), breadcrumbJsonLd(crumbs)]),
      }),
    });
    sitemap.push({ loc: indexUrl, lastmod: maxOf([...posts.map(lastModOf), ...usedCategories.map(categoryUpdated)]) });
  }

  // --- /blog/categorie/<slug>/ ---------------------------------------------
  for (const c of usedCategories) {
    const url = abs(blogCategoryPath(c.slug));
    const list = posts.filter((p) => p.category_id === c.id);
    const crumbs = [home, blogCrumb, { name: c.name, url }];
    const title = blogCategoryTitle(c.name);
    const description = blogCategoryDescription(c.name, c.description);
    const bodyHtml = `
    ${breadcrumbNav(crumbs)}
    <main>
      <h1>${esc(c.name)}</h1>
      ${c.description ? `<p>${esc(c.description)}</p>` : ''}
      ${categoryNav(c.slug)}
      <ul>${list.map((p) => postItem(p, 'h2')).join('')}</ul>
      <p><a href="${esc(indexUrl)}">Tous les articles du blog</a></p>
    </main>`;
    files.push({
      path: `/blog/categorie/${c.slug}/index.html`,
      html: renderPage({
        title, description, canonical: url, bodyHtml, ogType: 'website',
        jsonLd: scriptSafe([collectionJsonLd(title, description, url, list), breadcrumbJsonLd(crumbs)]),
      }),
    });
    sitemap.push({ loc: url, lastmod: maxOf([...list.map(lastModOf), categoryUpdated(c)]) });
  }

  // --- /blog/<slug>/ ---------------------------------------------------------
  for (const p of posts) {
    const url = abs(blogPostPath(p.slug));
    const c = categoryById.get(p.category_id) ?? null;
    const crumbs = [home, blogCrumb, ...(c ? [{ name: c.name, url: abs(blogCategoryPath(c.slug)) }] : []), { name: p.title, url }];
    const title = blogPostTitle(p.seo_title, p.title);
    const description = blogPostDescription(p.meta_description, p.excerpt);
    const publishedIso = toIso(p.published_at);
    const modifiedIso = new Date(lastModOf(p)).toISOString();
    const images = [...new Set([p.cover_image_url, p.og_image_url].filter((u) => typeof u === 'string' && /^https:\/\//.test(u)))];
    const ogImage = (p.og_image_url && /^https:\/\//.test(p.og_image_url)) ? p.og_image_url : images[0];

    const related = [
      ...posts.filter((o) => o.id !== p.id && c && o.category_id === c.id),
      ...posts.filter((o) => o.id !== p.id && !(c && o.category_id === c.id)),
    ].slice(0, 3);

    const links = (Array.isArray(p.marketplace_links) ? p.marketplace_links : [])
      .map((value) => ({
        path: marketplaceLinkPath(value),
        label: marketplaceLinkLabel(value, CATEGORY_LABELS, (_categoryId, subId) => SUBCATEGORY_LABELS[subId]),
      }))
      .filter((l) => l.path && l.label);

    const extraHead = `<meta property="article:published_time" content="${esc(publishedIso)}" />\n    `
      + `<meta property="article:modified_time" content="${esc(modifiedIso)}" />\n    `
      + (c ? `<meta property="article:section" content="${esc(c.name)}" />\n    ` : '');

    const bodyHtml = `
    ${breadcrumbNav(crumbs)}
    <main>
      <article>
        <header>
          ${c ? `<p><a href="${esc(abs(blogCategoryPath(c.slug)))}">${esc(c.name)}</a></p>` : ''}
          <h1>${esc(p.title)}</h1>
          <p>Par ${esc(BLOG_AUTHOR_LABEL)} · Publié le <time datetime="${esc(publishedIso)}">${esc(formatBlogDate(p.published_at))}</time>${showUpdatedDate(p.published_at, p.updated_at) ? ` · Mis à jour le <time datetime="${esc(toIso(p.updated_at))}">${esc(formatBlogDate(p.updated_at))}</time>` : ''}</p>
        </header>
        ${p.cover_image_url ? `<figure><img src="${esc(p.cover_image_url)}" alt="${esc(p.cover_image_alt ?? '')}" fetchpriority="high" /></figure>` : ''}
        ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}
        ${markdownToHtml(p.content ?? '', { siteUrl: SITE_URL, isImageAllowed })}
        ${p.sources ? `<section><h2>Sources</h2>${markdownToHtml(p.sources, { siteUrl: SITE_URL, isImageAllowed: noImages })}</section>` : ''}
        ${links.length > 0 ? `<section><h2>À découvrir sur Ezial</h2><ul>${links.map((l) => `<li><a href="${esc(abs(l.path))}">${esc(l.label)}</a></li>`).join('')}</ul></section>` : ''}
      </article>
      ${related.length > 0 ? `<section><h2>À lire aussi</h2><ul>${related.map((o) => postItem(o, 'h3')).join('')}</ul></section>` : ''}
      <p><a href="${esc(indexUrl)}">Tous les articles du blog</a></p>
    </main>`;

    const postingJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: truncateText(p.title, 110),
      description,
      ...(images.length > 0 ? { image: images } : {}),
      datePublished: publishedIso,
      dateModified: modifiedIso,
      author: EZIAL_ORGANIZATION,
      publisher: EZIAL_ORGANIZATION,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      url,
      ...(c ? { articleSection: c.name } : {}),
      inLanguage: 'fr',
      isPartOf: { '@type': 'Blog', name: BLOG_NAME, url: indexUrl },
    };

    files.push({
      path: `/blog/${p.slug}/index.html`,
      html: renderPage({
        title, description, canonical: url, ogImage, bodyHtml, ogType: 'article', extraHead,
        jsonLd: scriptSafe([postingJsonLd, breadcrumbJsonLd(crumbs)]),
      }),
    });
    sitemap.push({ loc: url, lastmod: lastModOf(p) });
  }

  return { files, sitemap, categoryCount: usedCategories.length };
}

export async function buildBlogPages(ctx) {
  let data;
  try {
    data = await loadBlog(ctx.supabase);
  } catch (e) {
    console.warn('prerender-seo: blog ignoré —', e?.message ?? e);
    return;
  }
  if (!data) return;
  if (data.posts.length === 0) {
    console.log('prerender-seo: blog — aucun article publié, aucune page générée.');
    return;
  }

  let output;
  try {
    output = renderBlog(ctx, data);
  } catch (e) {
    console.warn('prerender-seo: blog ignoré (erreur de rendu) —', e?.message ?? e);
    return;
  }
  try {
    for (const f of output.files) ctx.writeFile(f.path, f.html);
  } catch (e) {
    console.warn('prerender-seo: blog — écriture des pages interrompue —', e?.message ?? e);
    return;
  }
  for (const entry of output.sitemap) ctx.addSitemapUrl(entry);
  console.log(`prerender-seo: blog — ${data.posts.length} article(s), ${output.categoryCount} catégorie(s), ${output.files.length} page(s).`);
}
