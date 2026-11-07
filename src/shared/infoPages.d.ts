import type { MarkdownHeading } from './markdown';

/** Icon names understood by the React renderer (ignored by the static build). */
export type InfoIcon =
  | 'truck' | 'store' | 'cart' | 'bag' | 'smartphone' | 'package' | 'mail' | 'phone' | 'map' | 'gift'
  | 'shield' | 'help' | 'shirt' | 'footprints' | 'gem' | 'sparkles' | 'spray' | 'heart' | 'scissors';

export interface InfoCard {
  icon?: InfoIcon;
  title: string;
  /** Inline Markdown (bold, italic, links). */
  text?: string;
  /** Makes the card a link (internal path, https://, mailto: or tel:). */
  href?: string;
  /** Visible link label at the bottom of the card (with href). */
  linkLabel?: string;
  /** Highlighted card (brand colour), e.g. the delivery promise. */
  emphasis?: boolean;
}

export type InfoBlock =
  /** Prominent banner: the delivery promise, or a notice (online payment being activated). */
  | { type: 'highlight'; tone: 'delivery' | 'notice'; title: string; text?: string }
  | { type: 'cards'; columns?: 1 | 2 | 3 | 4; compact?: boolean; items: InfoCard[] }
  /** Numbered steps; text is inline Markdown. */
  | { type: 'steps'; items: { title: string; text: string }[] }
  /** Label / value list (company identity). */
  | { type: 'facts'; items: { label: string; value: string; href?: string }[] }
  /** Row of buttons. */
  | { type: 'links'; items: { label: string; href: string; primary?: boolean }[] }
  /** Seller plans (React: PricingCards / PlanComparison). */
  | { type: 'pricingCards' }
  | { type: 'planComparison' };

export type InfoSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'block'; id: string; block: InfoBlock };

export interface InfoPageDef {
  /** URL slug: /info/<slug>/ */
  slug: string;
  /** Other slugs that show the same page (e.g. 'faq' for 'centre-aide'). */
  aliases?: string[];
  /** Visible H1. */
  title: string;
  /** Short label for the breadcrumb (defaults to title). */
  breadcrumb?: string;
  /** Complete <title>, e.g. « À propos — Ezial ». */
  metaTitle: string;
  /** Meta description (≈ 150 characters). */
  description: string;
  /** Short introduction under the H1 (plain text). */
  intro?: string;
  /** Date shown as « Dernière mise à jour : … » (legal pages). */
  updated?: string;
  /** Same date, ISO (sitemap lastmod). */
  updatedIso?: string;
  /** Show a table of contents built from the ## headings. */
  toc?: boolean;
  /** legal: table of contents + reading column; simple: text and card grids; pricing: seller plans. */
  layout?: 'legal' | 'simple' | 'pricing';
  /** Structured data added by the static build. */
  jsonLdType?: 'AboutPage' | 'ContactPage' | 'Organization';
  /** Blocks inserted where the Markdown has a line {{id}}. */
  blocks?: Record<string, InfoBlock>;
  /** Page body in the restricted Markdown of src/shared/markdown.js. */
  markdown: string;
}

export const INFO_PAGES: InfoPageDef[];
export function getInfoPage(slug: string): InfoPageDef | null;
export function getInfoSegments(page: InfoPageDef): InfoSegment[];
export function getInfoHeadings(page: InfoPageDef): MarkdownHeading[];
