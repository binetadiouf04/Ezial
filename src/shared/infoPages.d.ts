export interface InfoPageDef {
  /** URL slug: /info/<slug>/ */
  slug: string;
  /** Other slugs that show the same page (e.g. 'faq' for 'centre-aide'). */
  aliases?: string[];
  /** Visible H1. */
  title: string;
  /** <title> (without the " | Ezial" suffix if the page adds it). */
  metaTitle: string;
  /** Meta description (≈ 150 characters). */
  description: string;
  /** Short introduction under the H1 (plain text). */
  intro?: string;
  /** "Dernière mise à jour : …" for legal pages. */
  updated?: string;
  /** Show a table of contents built from the ## headings. */
  toc?: boolean;
  /** Page body in the restricted Markdown of src/shared/markdown.js. */
  markdown: string;
}
export const INFO_PAGES: InfoPageDef[];
export function getInfoPage(slug: string): InfoPageDef | null;
