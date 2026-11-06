export const BLOG_NAME: string;
export const BLOG_PAGE_SIZE: number;
export const BLOG_INDEX_TITLE: string;
export const BLOG_INDEX_DESCRIPTION: string;
export const BLOG_INTRO: string;
export const BLOG_AUTHOR_LABEL: string;
export const BLOG_IMAGE_BUCKET: string;
export const BLOG_IMAGE_FOLDER: string;
export const EZIAL_ORGANIZATION: { '@type': 'Organization'; name: string; url: string; logo: string };

export const BLOG_INDEX_PATH: string;
export function blogPostPath(slug: string): string;
export function blogCategoryPath(slug: string): string;
export function withPage(path: string, page: number): string;
export function routeFromHref(href: string): string;
export function pageFromRoute(route: string): number;
export function marketplaceLinkPath(value: string): string | null;
export function marketplaceLinkLabel(
  value: string,
  categoryLabels: Record<string, string>,
  subcategoryLabels: (categoryId: string, subId: string) => string | undefined,
): string | null;

export function truncateText(text: string | null | undefined, max: number): string;
export function blogPostTitle(seoTitle: string | null | undefined, title: string): string;
export function blogPostDescription(metaDescription: string | null | undefined, excerpt: string | null | undefined): string;
export function blogCategoryTitle(name: string): string;
export function blogCategoryDescription(name: string, description: string | null | undefined): string;

export function postLastModified(publishedAt: string | null | undefined, updatedAt: string | null | undefined): number | undefined;
export function formatBlogDate(iso: string | null | undefined): string;
export function showUpdatedDate(publishedAt: string | null | undefined, updatedAt: string | null | undefined): boolean;

export function blogImagePrefixFor(supabaseClient: {
  storage: { from(bucket: string): { getPublicUrl(path: string): { data: { publicUrl: string } } } };
}): string;
export function makeBlogImageCheck(prefix: string): (src: string) => boolean;
