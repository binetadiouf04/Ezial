export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'link'; href: string; external: boolean; children: InlineNode[] };

export type MarkdownBlock =
  | { type: 'heading'; level: 2 | 3; id: string; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'quote'; children: InlineNode[] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'hr' };

export interface MarkdownHeading { level: 2 | 3; id: string; text: string }

export interface MarkdownOptions {
  /** Images are dropped unless this returns true (default: any https:// URL). */
  isImageAllowed?: (src: string) => boolean;
  /** HTML output only: prefix internal links (/...) with this origin. */
  siteUrl?: string;
}

export function slugify(text: string): string;
export function safeHref(raw: string): { href: string; external: boolean } | null;
export function parseInline(text: string): InlineNode[];
export function inlineToText(nodes: InlineNode[]): string;
export function parseMarkdown(source: string, opts?: MarkdownOptions): { blocks: MarkdownBlock[]; headings: MarkdownHeading[] };
export function escapeHtml(value: unknown): string;
export function markdownToHtml(source: string, opts?: MarkdownOptions): string;
export function markdownToPlainText(source: string): string;
