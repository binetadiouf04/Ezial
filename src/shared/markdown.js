// Restricted Markdown, shared by the React site (src/components/MarkdownContent.tsx)
// and the static SEO build (scripts/prerender-seo.mjs). Plain JavaScript so
// Node can import it directly; types live in markdown.d.ts.
//
// Supported, on purpose nothing more:
//   ## Titre / ### Sous-titre  (# is treated as ##: the page h1 is the title)
//   paragraphs, - or * lists, 1. lists, > quotes, --- separators
//   **gras**, *italique*, [texte](lien), ![texte alternatif](image)
// Raw HTML is never interpreted: it is kept as text and escaped on output,
// so no content (blog article, info page) can inject markup or scripts.
// Links: only https://, mailto:, tel:, internal paths (/...) and #anchors.
// Images: only https:// URLs accepted by opts.isImageAllowed.

const ACCENTS_FROM = 'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿœæ';
const ACCENTS_TO = 'aaaaaaceeeeiiiinoooooouuuuyyoa';

export function slugify(text) {
  let s = String(text ?? '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  s = s.replace(/[àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ]/g, (c) => ACCENTS_TO[ACCENTS_FROM.indexOf(c)] ?? c);
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function safeHref(raw) {
  const href = String(raw ?? '').trim();
  if (/^https:\/\/[^\s<>"]+$/i.test(href)) return { href, external: true };
  if (/^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(href)) return { href, external: false };
  if (/^tel:\+?[0-9 ]{6,20}$/i.test(href)) return { href: href.replace(/ /g, ''), external: false };
  // Lien interne : « / » suivi d'autre chose que « / » ou « \ » (un navigateur
  // lit « /\hôte » comme « //hôte », donc comme un site externe).
  if (/^\/(?![/\\])[^\s<>"\\]*$/.test(href)) return { href, external: false };
  if (/^#[a-z0-9-]+$/i.test(href)) return { href, external: false };
  return null;
}

const defaultImageAllowed = (src) => /^https:\/\/[^\s<>"]+$/i.test(src);

// ---------- inline ----------

const INLINE_PATTERNS = [
  { type: 'link', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  { type: 'strong', re: /\*\*([^*\n]+?)\*\*/ },
  { type: 'em', re: /\*([^*\s][^*\n]*?)\*/ },
];

export function parseInline(text) {
  const out = [];
  let rest = String(text ?? '');
  while (rest.length > 0) {
    let best = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { p, m };
    }
    if (!best) {
      out.push({ type: 'text', value: rest });
      break;
    }
    const { p, m } = best;
    if (m.index > 0) out.push({ type: 'text', value: rest.slice(0, m.index) });
    if (p.type === 'link') {
      const target = safeHref(m[2]);
      const children = parseInline(m[1]);
      if (target) out.push({ type: 'link', href: target.href, external: target.external, children });
      else out.push(...children);
    } else {
      out.push({ type: p.type, children: parseInline(m[1]) });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

export function inlineToText(nodes) {
  return nodes.map((n) => (n.type === 'text' ? n.value : inlineToText(n.children))).join('');
}

// ---------- blocks ----------

export function parseMarkdown(source, opts = {}) {
  const isImageAllowed = opts.isImageAllowed ?? defaultImageAllowed;
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const headings = [];
  const usedIds = new Map();
  let para = null;
  let list = null;
  let quote = null;

  const flush = () => {
    if (para) blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) });
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map((t) => parseInline(t)) });
    if (quote) blocks.push({ type: 'quote', children: parseInline(quote.join(' ')) });
    para = null;
    list = null;
    quote = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    let m;

    if (trimmed === '') { flush(); continue; }

    if ((m = /^(#{1,3})\s+(.+)$/.exec(trimmed))) {
      flush();
      const level = m[1].length === 3 ? 3 : 2;
      const children = parseInline(m[2].trim());
      const text = inlineToText(children);
      const base = slugify(text) || 'section';
      const n = (usedIds.get(base) ?? 0) + 1;
      usedIds.set(base, n);
      const id = n === 1 ? base : `${base}-${n}`;
      blocks.push({ type: 'heading', level, id, children });
      headings.push({ level, id, text });
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) { flush(); blocks.push({ type: 'hr' }); continue; }

    if ((m = /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/.exec(trimmed))) {
      flush();
      const alt = m[1].trim();
      const src = m[2].trim();
      if (alt && isImageAllowed(src)) blocks.push({ type: 'image', src, alt });
      continue;
    }

    if ((m = /^>\s?(.*)$/.exec(trimmed))) {
      if (!quote) { flush(); quote = []; }
      quote.push(m[1]);
      continue;
    }

    const ul = /^[-*]\s+(.+)$/.exec(trimmed);
    const ol = /^\d{1,3}[.)]\s+(.+)$/.exec(trimmed);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)[1]);
      continue;
    }

    // Indented continuation of the previous list item.
    if (list && /^\s{2,}\S/.test(rawLine)) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }

    if (list || quote) flush();
    if (!para) para = [];
    para.push(trimmed);
  }
  flush();
  return { blocks, headings };
}

// ---------- output: HTML (static build) ----------

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineToHtml(nodes, opts) {
  return nodes.map((n) => {
    if (n.type === 'text') return escapeHtml(n.value);
    if (n.type === 'strong') return `<strong>${inlineToHtml(n.children, opts)}</strong>`;
    if (n.type === 'em') return `<em>${inlineToHtml(n.children, opts)}</em>`;
    // link
    let href = n.href;
    if (href.startsWith('/') && opts.siteUrl) href = `${opts.siteUrl}${href}`;
    const rel = n.external ? ' rel="noopener noreferrer nofollow" target="_blank"' : '';
    return `<a href="${escapeHtml(href)}"${rel}>${inlineToHtml(n.children, opts)}</a>`;
  }).join('');
}

// opts.siteUrl: prefix for internal links (absolute URLs in static pages).
export function markdownToHtml(source, opts = {}) {
  const { blocks } = parseMarkdown(source, opts);
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': return `<h${b.level} id="${escapeHtml(b.id)}">${inlineToHtml(b.children, opts)}</h${b.level}>`;
      case 'paragraph': return `<p>${inlineToHtml(b.children, opts)}</p>`;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag}>${b.items.map((it) => `<li>${inlineToHtml(it, opts)}</li>`).join('')}</${tag}>`;
      }
      case 'quote': return `<blockquote><p>${inlineToHtml(b.children, opts)}</p></blockquote>`;
      case 'image': return `<figure><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}" loading="lazy" /></figure>`;
      case 'hr': return '<hr />';
      default: return '';
    }
  }).join('\n');
}

// Plain text (meta descriptions, excerpts, reading time).
export function markdownToPlainText(source) {
  const { blocks } = parseMarkdown(source);
  return blocks.map((b) => {
    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'quote') return inlineToText(b.children);
    if (b.type === 'list') return b.items.map((it) => inlineToText(it)).join(' ');
    return '';
  }).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
