import { supabase } from './supabaseClient';
import { isBlogSchemaMissing } from './supabaseBlog';
import { BLOG_IMAGE_BUCKET, BLOG_IMAGE_FOLDER } from '@/components/blog/blogShared';

// Ezial Pro admin side of the blog: articles and categories (public.blog_posts,
// public.blog_categories), images in site-content/blog/<post_id>/ and the
// "update the site now" request. Every write is checked by RLS (admins only)
// and by the database rules of the blog migration: slug generated then frozen
// after the first publication, published_at set once, a published article is
// always complete, only a never-published article can be deleted.
// Mutations return { error?: string } with a French message; nothing throws.

export type BlogPostStatus = 'draft' | 'published' | 'unpublished';

export const BLOG_STATUS_LABELS: Record<BlogPostStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  unpublished: 'Dépublié',
};

export const BLOG_MIGRATION_MISSING =
  "Le blog n'est pas encore activé dans la base de données : la migration SQL du blog doit d'abord être exécutée dans Supabase (SQL Editor).";

export const BLOG_LIMITS = {
  title: 150,
  excerpt: 300,
  content: 100000,
  coverAlt: 250,
  seoTitle: 70,
  metaDescription: 160,
  sources: 3000,
  marketplaceLinks: 8,
  categoryName: 60,
  categoryDescription: 500,
} as const;

export interface AdminBlogPost {
  id: string;
  title: string;
  slug: string;
  status: BlogPostStatus;
  categoryId: string | null;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  coverImageAlt: string;
  ogImageUrl: string;
  seoTitle: string;
  metaDescription: string;
  marketplaceLinks: string[];
  sources: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBlogPostInput {
  title: string;
  slug: string;
  categoryId: string | null;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  coverImageAlt: string;
  ogImageUrl: string;
  seoTitle: string;
  metaDescription: string;
  marketplaceLinks: string[];
  sources: string;
}

export interface AdminBlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  postCount: number;
}

interface PostRow {
  id: string;
  title: string;
  slug: string;
  status: BlogPostStatus;
  category_id: string | null;
  excerpt: string | null;
  content: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  og_image_url: string | null;
  seo_title: string | null;
  meta_description: string | null;
  marketplace_links: string[] | null;
  sources: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  blog_posts?: { count: number }[];
}

const POST_COLUMNS = 'id, title, slug, status, category_id, excerpt, content, cover_image_url, cover_image_alt, og_image_url, seo_title, meta_description, marketplace_links, sources, published_at, created_at, updated_at';

function mapPost(row: PostRow): AdminBlogPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    categoryId: row.category_id,
    excerpt: row.excerpt ?? '',
    content: row.content ?? '',
    coverImageUrl: row.cover_image_url ?? '',
    coverImageAlt: row.cover_image_alt ?? '',
    ogImageUrl: row.og_image_url ?? '',
    seoTitle: row.seo_title ?? '',
    metaDescription: row.meta_description ?? '',
    marketplaceLinks: row.marketplace_links ?? [],
    sources: row.sources ?? '',
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(row: CategoryRow): AdminBlogCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    sortOrder: row.sort_order,
    postCount: row.blog_posts?.[0]?.count ?? 0,
  };
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  blog_posts_publishable_check: "Pour publier, l'article doit avoir une catégorie, une image de couverture avec son texte alternatif, un extrait et un contenu.",
  blog_posts_title_length_check: `Le titre doit contenir entre 3 et ${BLOG_LIMITS.title} caractères.`,
  blog_posts_slug_format_check: "L'adresse (slug) ne peut contenir que des lettres minuscules sans accent, des chiffres et des tirets.",
  blog_posts_slug_key: 'Cette adresse (slug) est déjà utilisée par un autre article.',
  blog_posts_excerpt_length_check: `L'extrait ne doit pas dépasser ${BLOG_LIMITS.excerpt} caractères.`,
  blog_posts_content_length_check: `Le contenu ne doit pas dépasser ${BLOG_LIMITS.content.toLocaleString('fr-FR')} caractères.`,
  blog_posts_cover_image_url_check: "L'image de couverture doit être une adresse https.",
  blog_posts_og_image_url_check: "L'image de partage doit être une adresse https.",
  blog_posts_cover_image_alt_length_check: `Le texte alternatif ne doit pas dépasser ${BLOG_LIMITS.coverAlt} caractères.`,
  blog_posts_seo_title_length_check: `Le titre SEO ne doit pas dépasser ${BLOG_LIMITS.seoTitle} caractères.`,
  blog_posts_meta_description_length_check: `La méta-description ne doit pas dépasser ${BLOG_LIMITS.metaDescription} caractères.`,
  blog_posts_sources_length_check: `Les sources ne doivent pas dépasser ${BLOG_LIMITS.sources} caractères.`,
  blog_posts_marketplace_links_check: `Liens vers la marketplace invalides (${BLOG_LIMITS.marketplaceLinks} au maximum).`,
  blog_posts_status_published_at_check: 'Ce changement de statut est impossible : un article publié une fois peut être dépublié, mais ne redevient pas un brouillon.',
  blog_posts_status_check: 'Statut inconnu.',
  blog_posts_category_id_fkey: 'Cette catégorie est utilisée par des articles : déplacez-les dans une autre catégorie avant de la supprimer.',
  blog_categories_name_key: 'Une catégorie porte déjà ce nom.',
  blog_categories_name_length_check: `Le nom de la catégorie doit contenir entre 2 et ${BLOG_LIMITS.categoryName} caractères.`,
  blog_categories_description_length_check: `La description ne doit pas dépasser ${BLOG_LIMITS.categoryDescription} caractères.`,
};

function blogErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'Une erreur est survenue. Réessayez.';
  if (isBlogSchemaMissing(error)) return BLOG_MIGRATION_MISSING;
  const message = error.message ?? '';
  if (message.includes('blog_posts_category_id_fkey') && /insert or update/i.test(message)) {
    return "La catégorie choisie n'existe plus. Rechargez la page et choisissez-en une autre.";
  }
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return text;
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(message)) return 'Action réservée aux administrateurs. Reconnectez-vous puis réessayez.';
  if (error.code === 'P0001' && message) return message;
  if (/fetch|network/i.test(message)) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  return `Une erreur est survenue : ${message || 'erreur inconnue'}.`;
}

/** A new article id, chosen before the first save so images can be uploaded to blog/<id>/ right away. */
export function newBlogPostId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What is still missing before an article can be published (empty = publishable). */
export function missingForPublication(input: Pick<AdminBlogPostInput, 'categoryId' | 'coverImageUrl' | 'coverImageAlt' | 'excerpt' | 'content' | 'title'>): string[] {
  const missing: string[] = [];
  if (input.title.trim().length < 3) missing.push('un titre (3 caractères minimum)');
  if (!input.categoryId) missing.push('une catégorie');
  if (!input.coverImageUrl.trim()) missing.push('une image de couverture');
  if (!input.coverImageAlt.trim()) missing.push("le texte alternatif de l'image de couverture");
  if (!input.excerpt.trim()) missing.push('un extrait');
  if (!input.content.trim()) missing.push('un contenu');
  return missing;
}

function toRow(input: AdminBlogPostInput) {
  return {
    title: input.title.trim(),
    slug: input.slug.trim(),
    category_id: input.categoryId || null,
    excerpt: input.excerpt.trim() || null,
    content: input.content.trim() ? input.content : null,
    cover_image_url: input.coverImageUrl.trim() || null,
    cover_image_alt: input.coverImageAlt.trim() || null,
    og_image_url: input.ogImageUrl.trim() || null,
    seo_title: input.seoTitle.trim() || null,
    meta_description: input.metaDescription.trim() || null,
    marketplace_links: input.marketplaceLinks,
    sources: input.sources.trim() || null,
  };
}

// ===================== Articles =====================

export async function fetchAdminBlogPosts(): Promise<{ posts: AdminBlogPost[]; error?: string }> {
  const { data, error } = await supabase.from('blog_posts').select(POST_COLUMNS).order('updated_at', { ascending: false });
  if (error) return { posts: [], error: blogErrorMessage(error) };
  return { posts: ((data ?? []) as PostRow[]).map(mapPost) };
}

export async function fetchAdminBlogPost(id: string): Promise<{ post: AdminBlogPost | null; error?: string }> {
  const { data, error } = await supabase.from('blog_posts').select(POST_COLUMNS).eq('id', id).maybeSingle();
  if (error) return { post: null, error: blogErrorMessage(error) };
  return { post: data ? mapPost(data as PostRow) : null };
}

/** Creates the article with the id chosen by newBlogPostId(); author_id is set by the database. */
export async function createAdminBlogPost(id: string, input: AdminBlogPostInput, status: 'draft' | 'published' = 'draft'): Promise<{ post?: AdminBlogPost; error?: string }> {
  const { data, error } = await supabase.from('blog_posts').insert({ id, ...toRow(input), status }).select(POST_COLUMNS).single();
  if (error) return { error: blogErrorMessage(error) };
  return { post: mapPost(data as PostRow) };
}

/** Saves the editorial fields (and optionally a new status) of an article. */
export async function updateAdminBlogPost(id: string, input: AdminBlogPostInput, status?: BlogPostStatus): Promise<{ post?: AdminBlogPost; error?: string }> {
  const { data, error } = await supabase
    .from('blog_posts')
    .update({ ...toRow(input), ...(status ? { status } : {}) })
    .eq('id', id)
    .select(POST_COLUMNS)
    .maybeSingle();
  if (error) return { error: blogErrorMessage(error) };
  if (!data) return { error: 'Article introuvable (il a peut-être été supprimé).' };
  return { post: mapPost(data as PostRow) };
}

/** Publish / unpublish without touching the content. */
export async function setAdminBlogPostStatus(id: string, status: 'published' | 'unpublished'): Promise<{ post?: AdminBlogPost; error?: string }> {
  const { data, error } = await supabase.from('blog_posts').update({ status }).eq('id', id).select(POST_COLUMNS).maybeSingle();
  if (error) return { error: blogErrorMessage(error) };
  if (!data) return { error: 'Article introuvable (il a peut-être été supprimé).' };
  return { post: mapPost(data as PostRow) };
}

/**
 * Deletes a never-published article (the database refuses any other), then
 * its images folder. A failure on the images is reported but the article
 * stays deleted.
 */
export async function deleteAdminBlogPost(id: string): Promise<{ error?: string; warning?: string }> {
  const { data, error } = await supabase.from('blog_posts').delete().eq('id', id).select('id');
  if (error) return { error: blogErrorMessage(error) };
  if (!data || data.length === 0) return { error: 'Article introuvable ou suppression refusée.' };
  const cleanup = await removeBlogImages(id);
  return cleanup.error ? { warning: "L'article est supprimé, mais ses images n'ont pas toutes pu être effacées du stockage." } : {};
}

/** Removes every file of site-content/blog/<postId>/ (draft deleted or new article abandoned). */
export async function removeBlogImages(postId: string): Promise<{ error?: string }> {
  const folder = `${BLOG_IMAGE_FOLDER}/${postId}`;
  const { data, error } = await supabase.storage.from(BLOG_IMAGE_BUCKET).list(folder, { limit: 1000 });
  if (error) return { error: error.message };
  const paths = (data ?? []).filter((f) => f.name && !f.name.startsWith('.')).map((f) => `${folder}/${f.name}`);
  if (paths.length === 0) return {};
  const { error: removeError } = await supabase.storage.from(BLOG_IMAGE_BUCKET).remove(paths);
  return removeError ? { error: removeError.message } : {};
}

// ===================== Images =====================

export type BlogImageKind = 'couverture' | 'partage' | 'image';

const MAX_DIMENSION: Record<BlogImageKind, number> = { couverture: 1600, partage: 1200, image: 1600 };
const WEB_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Resized, re-encoded as WebP — or JPEG on browsers that cannot encode WebP
// (Safari on iPad/iPhone returns a PNG for a WebP request, much heavier).
// The bucket only accepts WebP, JPEG and PNG up to 5 MB.
async function prepareBlogImage(file: File, maxDimension: number): Promise<{ blob: Blob; type: string; ext: string } | { error: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    if (!blob) throw new Error('encode');
    return { blob, type: blob.type, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
  } catch {
    if (WEB_TYPES.includes(file.type)) {
      return { blob: file, type: file.type, ext: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg' };
    }
    return { error: "Format d'image non pris en charge : choisissez une photo JPEG, PNG ou WebP." };
  }
}

/** Optimizes and uploads an article image to site-content/blog/<postId>/; returns its public URL. */
export async function uploadBlogImage(postId: string, file: File, kind: BlogImageKind): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'Ce fichier n’est pas une image.' };
  const prepared = await prepareBlogImage(file, MAX_DIMENSION[kind]);
  if ('error' in prepared) return prepared;
  if (prepared.blob.size > 5 * 1024 * 1024) return { error: "L'image dépasse 5 Mo même après optimisation : choisissez une image plus légère." };
  const random = Math.random().toString(36).slice(2, 8);
  const path = `${BLOG_IMAGE_FOLDER}/${postId}/${kind}-${Date.now()}-${random}.${prepared.ext}`;
  const { error } = await supabase.storage.from(BLOG_IMAGE_BUCKET).upload(path, prepared.blob, {
    cacheControl: '31536000',
    contentType: prepared.type,
    upsert: false,
  });
  if (error) {
    if (/mime|type/i.test(error.message)) return { error: "Format d'image refusé : choisissez une photo JPEG, PNG ou WebP." };
    if (/size|large|exceed/i.test(error.message)) return { error: "L'image dépasse la taille maximale autorisée (5 Mo)." };
    if (/row-level security|unauthori[sz]ed|403/i.test(error.message)) return { error: "Envoi refusé : action réservée aux administrateurs. Reconnectez-vous puis réessayez." };
    return { error: `L'envoi de l'image a échoué : ${error.message}.` };
  }
  return { url: supabase.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl };
}

// ===================== Catégories =====================

export async function fetchAdminBlogCategories(): Promise<{ categories: AdminBlogCategory[]; error?: string }> {
  const { data, error } = await supabase
    .from('blog_categories')
    .select('id, name, slug, description, sort_order, blog_posts(count)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) return { categories: [], error: blogErrorMessage(error) };
  return { categories: ((data ?? []) as CategoryRow[]).map(mapCategory) };
}

export interface BlogCategoryInput {
  name: string;
  description: string;
}

export async function createAdminBlogCategory(input: BlogCategoryInput, sortOrder: number): Promise<{ category?: AdminBlogCategory; error?: string }> {
  const { data, error } = await supabase
    .from('blog_categories')
    .insert({ name: input.name.trim(), description: input.description.trim() || null, sort_order: sortOrder })
    .select('id, name, slug, description, sort_order')
    .single();
  if (error) return { error: blogErrorMessage(error) };
  return { category: mapCategory(data as CategoryRow) };
}

/** Rename / describe. The address (/blog/categorie/<slug>/) never changes. */
export async function updateAdminBlogCategory(id: string, input: BlogCategoryInput): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from('blog_categories')
    .update({ name: input.name.trim(), description: input.description.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) return { error: blogErrorMessage(error) };
  if (!data || data.length === 0) return { error: 'Catégorie introuvable.' };
  return {};
}

/** Saves the display order (1, 2, 3…) of the given category ids. */
export async function reorderAdminBlogCategories(orderedIds: string[]): Promise<{ error?: string }> {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('blog_categories').update({ sort_order: index + 1 }).eq('id', id)),
  );
  const failed = results.find((r) => r.error);
  return failed?.error ? { error: blogErrorMessage(failed.error) } : {};
}

export async function deleteAdminBlogCategory(id: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.from('blog_categories').delete().eq('id', id).select('id');
  if (error) return { error: blogErrorMessage(error) };
  if (!data || data.length === 0) return { error: 'Catégorie introuvable.' };
  return {};
}

// ===================== Mise à jour du site =====================

/**
 * Asks for an immediate rebuild of the static pages and sitemap
 * (admin_request_seo_rebuild → Cloudflare Deploy Hook). Without it, the
 * hourly job picks the change up anyway.
 */
export async function requestBlogSiteUpdate(): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc('admin_request_seo_rebuild');
  if (error) return { ok: false, message: blogErrorMessage(error) };
  const result = (data ?? {}) as { triggered?: boolean; reason?: string };
  if (result.triggered) {
    return { ok: true, message: 'Mise à jour lancée : les pages du blog et le sitemap seront régénérés d’ici quelques minutes.' };
  }
  switch (result.reason) {
    case 'recently_requested':
      return { ok: true, message: 'Une mise à jour a déjà été lancée il y a moins de 5 minutes. Si votre modification est plus récente, elle sera prise en compte automatiquement dans l’heure.' };
    case 'deploy_hook_missing':
      return { ok: false, message: 'La mise à jour automatique n’est pas configurée (Deploy Hook Cloudflare absent de Supabase Vault). Les pages seront régénérées au prochain déploiement.' };
    case 'daily_cap_reached':
      return { ok: false, message: 'Le nombre maximal de mises à jour pour aujourd’hui est atteint. Les pages seront régénérées cette nuit.' };
    default:
      return { ok: false, message: 'La mise à jour n’a pas pu être lancée. Les pages seront régénérées automatiquement dans l’heure.' };
  }
}
