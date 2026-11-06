import { useEffect } from 'react';

// Client-side <head> updates. The formats below must stay identical to
// scripts/prerender-seo.mjs: a crawler that runs JavaScript must end up
// with the same title/description/canonical/Open Graph as the static HTML
// it first received for the page.
export const SITE_URL = 'https://ezial.net';

// Same values as index.html — what a fresh load of any non-prerendered
// route carries.
export const DEFAULT_OG_TITLE = 'Ezial — Mode, beauté & lifestyle à Dakar';
export const DEFAULT_OG_DESCRIPTION = 'Découvrez des boutiques de mode, beauté, cheveux, bijoux et parfums à Dakar, avec livraison ou retrait en boutique.';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/ezial-fallback.webp`;

export interface HeadTags {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: 'website' | 'product';
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

// Image URLs are absolute once resolved from Supabase Storage; the local
// fallback image is root-relative and needs the site origin for Open Graph.
export function absoluteUrl(url: string): string {
  try {
    return new URL(url, `${SITE_URL}/`).href;
  } catch {
    return DEFAULT_OG_IMAGE;
  }
}

export function applyHeadTags(tags: HeadTags) {
  document.title = tags.title;
  upsertMeta('name', 'description', tags.description);
  setCanonical(tags.canonical);
  upsertMeta('property', 'og:title', tags.ogTitle);
  upsertMeta('property', 'og:description', tags.ogDescription);
  upsertMeta('property', 'og:url', tags.canonical);
  upsertMeta('property', 'og:image', tags.ogImage);
  upsertMeta('property', 'og:type', tags.ogType);
  upsertMeta('name', 'twitter:image', tags.ogImage);
}

// <meta name="robots" content="noindex"> while `active` — for a product or
// shop that no longer exists, so search engines drop the URL instead of
// keeping an empty "introuvable" page. Removed as soon as the page changes.
export function useNoIndex(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const tag = document.createElement('meta');
    tag.setAttribute('name', 'robots');
    tag.setAttribute('content', 'noindex');
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, [active]);
}
