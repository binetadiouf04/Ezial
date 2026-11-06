import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { BLOG_PAGE_SIZE, blogImagePrefixFor, makeBlogImageCheck } from '@/components/blog/blogShared';

// Public read side of the blog (public.blog_posts / public.blog_categories,
// see the blog SQL migration). RLS only ever returns published articles whose
// publication date has passed; the explicit filters below say the same thing
// and let the (status, published_at) index do the work.
//
// Never throws. A missing table or column (migration not run yet) reads as
// "no article", without an error, so the public pages simply stay empty; any
// other failure (network...) comes back as `failed: true`, so a page can say
// so instead of claiming the blog is empty.

export interface BlogCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface BlogCategory extends BlogCategoryRef {
  description: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string;
  updatedAt: string;
  category: BlogCategoryRef | null;
}

export interface BlogPost extends BlogPostSummary {
  content: string;
  seoTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  marketplaceLinks: string[];
  sources: string | null;
}

interface SummaryRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  published_at: string;
  updated_at: string;
  category_id: string | null;
  category: BlogCategoryRef | BlogCategoryRef[] | null;
}

interface PostRow extends SummaryRow {
  content: string | null;
  seo_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  marketplace_links: string[] | null;
  sources: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  updated_at: string;
}

const SUMMARY_COLUMNS = 'id, slug, title, excerpt, cover_image_url, cover_image_alt, published_at, updated_at, category_id, category:blog_categories(id, name, slug)';
const POST_COLUMNS = `${SUMMARY_COLUMNS}, content, seo_title, meta_description, og_image_url, marketplace_links, sources`;
const CATEGORY_COLUMNS = 'id, name, slug, description, sort_order, updated_at';

/** True for "this table / column / relationship does not exist (yet)". */
export function isBlogSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message ?? '');
}

// Public URL prefix of site-content/blog/ — the only place an article image
// may come from (cover and images inside the content alike).
export const BLOG_IMAGE_PREFIX = blogImagePrefixFor(supabase);
export const isBlogImageAllowed = makeBlogImageCheck(BLOG_IMAGE_PREFIX);

function mapCategoryRef(value: SummaryRow['category']): BlogCategoryRef | null {
  const c = Array.isArray(value) ? value[0] : value;
  return c ? { id: c.id, name: c.name, slug: c.slug } : null;
}

function mapSummary(row: SummaryRow): BlogPostSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    category: mapCategoryRef(row.category),
  };
}

function mapPost(row: PostRow): BlogPost {
  return {
    ...mapSummary(row),
    content: row.content ?? '',
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    ogImageUrl: row.og_image_url,
    marketplaceLinks: row.marketplace_links ?? [],
    sources: row.sources,
  };
}

function mapCategory(row: CategoryRow): BlogCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function publishedPosts(columns: string, options?: { count: 'exact' }) {
  return supabase
    .from('blog_posts')
    .select(columns, options)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString());
}

/** One page of published articles, most recent first (optionally one category). */
export async function fetchPublishedBlogPosts(
  { page = 1, pageSize = BLOG_PAGE_SIZE, categoryId }: { page?: number; pageSize?: number; categoryId?: string } = {},
): Promise<{ posts: BlogPostSummary[]; total: number; failed: boolean }> {
  const from = (Math.max(1, page) - 1) * pageSize;
  let query = publishedPosts(SUMMARY_COLUMNS, { count: 'exact' });
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error, count } = await query
    .order('published_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) {
    // PGRST103: page past the last one — simply no article on that page.
    if (isBlogSchemaMissing(error) || error.code === 'PGRST103') return { posts: [], total: 0, failed: false };
    return { posts: [], total: 0, failed: true };
  }
  return { posts: ((data ?? []) as unknown as SummaryRow[]).map(mapSummary), total: count ?? 0, failed: false };
}

/** The N latest published articles (homepage block). */
export async function fetchLatestBlogPosts(limit = 3): Promise<{ posts: BlogPostSummary[]; failed: boolean }> {
  const { posts, failed } = await fetchPublishedBlogPosts({ page: 1, pageSize: limit });
  return { posts, failed };
}

/** A published article by its slug, or null when it does not exist / is not published. */
export async function fetchBlogPostBySlug(slug: string): Promise<{ post: BlogPost | null; failed: boolean }> {
  const { data, error } = await publishedPosts(POST_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) return { post: null, failed: !isBlogSchemaMissing(error) };
  return { post: data ? mapPost(data as unknown as PostRow) : null, failed: false };
}

/** Categories that have at least one published article, in display order. */
export async function fetchBlogCategoriesWithPosts(): Promise<{ categories: BlogCategory[]; failed: boolean }> {
  const [categoriesRes, postsRes] = await Promise.all([
    supabase.from('blog_categories').select(CATEGORY_COLUMNS).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    publishedPosts('category_id').limit(1000),
  ]);
  const error = categoriesRes.error ?? postsRes.error;
  if (error) return { categories: [], failed: !isBlogSchemaMissing(error) };
  const used = new Set(((postsRes.data ?? []) as unknown as { category_id: string | null }[]).map((r) => r.category_id));
  return { categories: ((categoriesRes.data ?? []) as CategoryRow[]).filter((c) => used.has(c.id)).map(mapCategory), failed: false };
}

/** A category by its slug (whether or not it has published articles). */
export async function fetchBlogCategoryBySlug(slug: string): Promise<{ category: BlogCategory | null; failed: boolean }> {
  const { data, error } = await supabase.from('blog_categories').select(CATEGORY_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) return { category: null, failed: !isBlogSchemaMissing(error) };
  return { category: data ? mapCategory(data as CategoryRow) : null, failed: false };
}

/** Up to `limit` other articles: same category first, then the most recent. */
export async function fetchRelatedBlogPosts(post: BlogPostSummary, limit = 3): Promise<BlogPostSummary[]> {
  const related: BlogPostSummary[] = [];
  if (post.category) {
    const { data, error } = await publishedPosts(SUMMARY_COLUMNS)
      .eq('category_id', post.category.id)
      .neq('id', post.id)
      .order('published_at', { ascending: false })
      .limit(limit);
    if (!error && data) related.push(...(data as unknown as SummaryRow[]).map(mapSummary));
  }
  if (related.length < limit) {
    const { data, error } = await publishedPosts(SUMMARY_COLUMNS)
      .neq('id', post.id)
      .order('published_at', { ascending: false })
      .limit(limit + related.length);
    if (!error && data) {
      const taken = new Set(related.map((p) => p.id));
      for (const row of data as unknown as SummaryRow[]) {
        if (related.length >= limit) break;
        if (!taken.has(row.id)) related.push(mapSummary(row));
      }
    }
  }
  return related;
}

/** Light check: is at least one article published? false on any error. */
export async function hasPublishedBlogPosts(): Promise<boolean> {
  const { data, error } = await publishedPosts('id').limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

// One request per page load, shared by every component using the hook; a
// failed check is not cached, so a later mount can try again.
let hasPostsCache: boolean | null = null;
let hasPostsInFlight: Promise<boolean> | null = null;

async function checkAndCache(): Promise<boolean> {
  try {
    const { data, error } = await publishedPosts('id').limit(1);
    if (error) return false;
    hasPostsCache = (data ?? []).length > 0;
    return hasPostsCache;
  } catch {
    return false;
  } finally {
    hasPostsInFlight = null;
  }
}

function loadHasPublishedBlogPosts(): Promise<boolean> {
  if (hasPostsCache !== null) return Promise.resolve(hasPostsCache);
  if (!hasPostsInFlight) hasPostsInFlight = checkAndCache();
  return hasPostsInFlight;
}

/** true once at least one article is known to be published; false by default and on error. */
export function useHasPublishedBlogPosts(): boolean {
  const [hasPosts, setHasPosts] = useState(hasPostsCache ?? false);
  useEffect(() => {
    let cancelled = false;
    void loadHasPublishedBlogPosts().then((value) => { if (!cancelled) setHasPosts(value); });
    return () => { cancelled = true; };
  }, []);
  return hasPosts;
}
