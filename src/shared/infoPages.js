// Institutional pages (/info/<slug>/): titles, meta descriptions and Markdown
// bodies, shared by the React site (src/pages/InfoPage.tsx) and the static
// SEO build (scripts/seo/info.mjs). Plain JavaScript; types in infoPages.d.ts.
// Stub: filled in by the info-pages work.
export const INFO_PAGES = [];

export function getInfoPage(slug) {
  return INFO_PAGES.find((p) => p.slug === slug || (p.aliases ?? []).includes(slug)) ?? null;
}
