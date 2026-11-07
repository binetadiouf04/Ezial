// Blog: texts, paths and rules shared by the React pages (src/pages/blog,
// src/components/blog, Ezial Pro admin) and the static SEO build
// (scripts/seo/blog.mjs), so the crawlable HTML and the live app always carry
// the same titles, descriptions, URLs and image rule.
// Plain JavaScript so Node can import it directly; types in blogShared.d.ts.

export const BLOG_NAME = 'Blog Ezial';
export const BLOG_PAGE_SIZE = 12;
export const BLOG_INDEX_TITLE = 'Blog Ezial — Conseils mode, beauté et lifestyle';
export const BLOG_INDEX_DESCRIPTION = 'Les articles du blog Ezial : conseils, tendances et actualités de la marketplace mode, beauté et lifestyle à Dakar.';
export const BLOG_INTRO = "Conseils, tendances et actualités de la marketplace Ezial, rédigés par l'équipe Ezial.";
export const BLOG_AUTHOR_LABEL = "l'équipe Ezial";

// Article images live in the public site-content bucket, one folder per
// article: site-content/blog/<post_id>/.
export const BLOG_IMAGE_BUCKET = 'site-content';
export const BLOG_IMAGE_FOLDER = 'blog';

export const EZIAL_ORGANIZATION = {
  '@type': 'Organization',
  name: 'Ezial',
  url: 'https://ezial.net/',
  logo: 'https://ezial.net/apple-touch-icon.png',
};

// ---------- paths (canonical form: trailing slash) ----------

export const BLOG_INDEX_PATH = '/blog/';
export function blogPostPath(slug) { return `/blog/${slug}/`; }
export function blogCategoryPath(slug) { return `/blog/categorie/${slug}/`; }
export function withPage(path, page) { return page > 1 ? `${path}?page=${page}` : path; }
// ?page=N of an in-app route (1 when absent or invalid).
export function pageFromRoute(route) {
  const query = String(route ?? '').split('?')[1] ?? '';
  const n = Number.parseInt(new URLSearchParams(query).get('page') ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10000) : 1;
}
// In-app route for a canonical href: the client router expects no trailing
// slash ('/blog/' → '/blog', '/blog/x/?page=2' → '/blog/x?page=2').
export function routeFromHref(href) {
  const [path, query] = String(href).split('?');
  const clean = path.replace(/\/+$/, '') || '/';
  return query ? `${clean}?${query}` : clean;
}

// Marketplace links stored on an article: 'beaute' or 'beaute/skincare'.
const MARKETPLACE_LINK_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;
export function marketplaceLinkPath(value) {
  return MARKETPLACE_LINK_RE.test(String(value ?? '')) ? `/categorie/${value}/` : null;
}
// Label from the marketplace category labels, or null for an unknown value
// (a category removed from the site since the article was written).
export function marketplaceLinkLabel(value, categoryLabels, subcategoryLabels) {
  if (!MARKETPLACE_LINK_RE.test(String(value ?? ''))) return null;
  const [categoryId, subId] = String(value).split('/');
  const categoryLabel = categoryLabels[categoryId];
  if (!categoryLabel) return null;
  if (!subId) return categoryLabel;
  const subLabel = subcategoryLabels(categoryId, subId);
  return subLabel ? `${categoryLabel} › ${subLabel}` : null;
}

// ---------- head texts ----------

export function truncateText(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

export function blogPostTitle(seoTitle, title) {
  return `${String(seoTitle || title || '').trim()} — ${BLOG_NAME}`;
}
export function blogPostDescription(metaDescription, excerpt) {
  return truncateText(metaDescription || excerpt || '', 160);
}
export function blogCategoryTitle(name) {
  return `${name} — ${BLOG_NAME}`;
}
export function blogCategoryDescription(name, description) {
  return truncateText(description || `Les articles du blog Ezial dans la catégorie « ${name} ».`, 160);
}

// ---------- dates ----------

// Last real change of an article for search engines: its last editorial
// change, never earlier than its publication.
export function postLastModified(publishedAt, updatedAt) {
  const times = [publishedAt, updatedAt].map((v) => (v ? new Date(v).getTime() : NaN)).filter((t) => !Number.isNaN(t));
  return times.length > 0 ? Math.max(...times) : undefined;
}

export function formatBlogDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dakar' });
}

// Shown only when the article really changed after its publication day.
export function showUpdatedDate(publishedAt, updatedAt) {
  if (!publishedAt || !updatedAt) return false;
  return new Date(updatedAt).getTime() > new Date(publishedAt).getTime() && formatBlogDate(updatedAt) !== formatBlogDate(publishedAt);
}

// ---------- images ----------

// Public URL prefix of the blog image folder for a Supabase client (browser
// or Node): https://<projet>.supabase.co/storage/v1/object/public/site-content/blog/
export function blogImagePrefixFor(supabaseClient) {
  const probe = '__x__';
  const url = supabaseClient.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(`${BLOG_IMAGE_FOLDER}/${probe}`).data.publicUrl;
  return url.slice(0, url.length - probe.length);
}

// Images inside an article: only https files from the blog folder of the bucket.
export function makeBlogImageCheck(prefix) {
  return (src) => {
    const s = String(src ?? '');
    return /^https:\/\//i.test(prefix) && s.startsWith(prefix) && s.length > prefix.length && !s.includes('..') && !/[\s<>"'\\]/.test(s);
  };
}
