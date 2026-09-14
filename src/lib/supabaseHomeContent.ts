import { supabase } from './supabaseClient';
import type { HeroSlide } from '@/components/HeroCarousel';
import type { HomeCircleTile } from '@/data/categories';

// Manually-managed Home content (Hero carousel + "À découvrir" shortcuts) —
// see the SQL migration for hero_slides / home_discover_tiles. Both fetch
// functions never throw: a missing table (migration not run yet), an RLS
// failure, or a genuine network error all come back as a non-fatal `error`
// string with an empty list, so HomePage can fall back to its static
// content instead of crashing or rendering empty.

export const SITE_CONTENT_BUCKET = 'site-content';

export function resolveSiteContentUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path; // already a full URL
  return supabase.storage.from(SITE_CONTENT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads an admin-picked image to the site-content bucket and returns its public URL. */
export async function uploadSiteContentImage(file: File, folder: 'hero' | 'discover'): Promise<{ url: string } | { error: string }> {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const { error } = await supabase.storage.from(SITE_CONTENT_BUCKET).upload(path, file);
  if (error) return { error: `L'envoi de l'image a échoué : ${error.message}.` };
  return { url: resolveSiteContentUrl(path) };
}

// ===================== Hero slides =====================

export interface HeroSlideRow {
  id: string;
  image_url: string;
  title: string;
  subtitle: string | null;
  cta_label: string;
  cta_link: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HeroSlideInput {
  imageUrl: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  sortOrder: number;
  isActive: boolean;
}

function mapHeroSlide(row: HeroSlideRow): HeroSlide {
  return {
    id: row.id,
    image: row.image_url,
    eyebrow: row.subtitle || undefined,
    title: row.title,
    ctaLabel: row.cta_label,
    ctaRoute: row.cta_link,
  };
}

/** Public read — only active slides, in display order. Used by HomePage. */
export async function fetchHeroSlides(): Promise<{ slides: HeroSlide[]; error?: string }> {
  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) return { slides: [], error: error.message };
  return { slides: (data ?? []).map((row) => mapHeroSlide(row as HeroSlideRow)) };
}

/** Admin read — every slide (active or not), for the management screen. */
export async function fetchAllHeroSlidesForAdmin(): Promise<{ rows: HeroSlideRow[]; error?: string }> {
  const { data, error } = await supabase.from('hero_slides').select('*').order('sort_order', { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HeroSlideRow[] };
}

export async function createHeroSlide(input: HeroSlideInput): Promise<{ error?: string }> {
  const { error } = await supabase.from('hero_slides').insert({
    image_url: input.imageUrl,
    title: input.title,
    subtitle: input.subtitle || null,
    cta_label: input.ctaLabel,
    cta_link: input.ctaLink,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  return error ? { error: error.message } : {};
}

export async function updateHeroSlide(id: string, input: HeroSlideInput): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('hero_slides')
    .update({
      image_url: input.imageUrl,
      title: input.title,
      subtitle: input.subtitle || null,
      cta_label: input.ctaLabel,
      cta_link: input.ctaLink,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteHeroSlide(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('hero_slides').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

// ===================== Discover tiles =====================

export interface DiscoverTileRow {
  id: string;
  image_url: string;
  label: string;
  link: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DiscoverTileInput {
  imageUrl: string;
  label: string;
  link: string;
  sortOrder: number;
  isActive: boolean;
}

function mapDiscoverTile(row: DiscoverTileRow): HomeCircleTile {
  return { id: row.id, image: row.image_url, label: row.label, route: row.link };
}

/** Public read — only active tiles, in display order. Used by HomePage. */
export async function fetchDiscoverTiles(): Promise<{ tiles: HomeCircleTile[]; error?: string }> {
  const { data, error } = await supabase
    .from('home_discover_tiles')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) return { tiles: [], error: error.message };
  return { tiles: (data ?? []).map((row) => mapDiscoverTile(row as DiscoverTileRow)) };
}

/** Admin read — every tile (active or not), for the management screen. */
export async function fetchAllDiscoverTilesForAdmin(): Promise<{ rows: DiscoverTileRow[]; error?: string }> {
  const { data, error } = await supabase.from('home_discover_tiles').select('*').order('sort_order', { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as DiscoverTileRow[] };
}

export async function createDiscoverTile(input: DiscoverTileInput): Promise<{ error?: string }> {
  const { error } = await supabase.from('home_discover_tiles').insert({
    image_url: input.imageUrl,
    label: input.label,
    link: input.link,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  return error ? { error: error.message } : {};
}

export async function updateDiscoverTile(id: string, input: DiscoverTileInput): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('home_discover_tiles')
    .update({
      image_url: input.imageUrl,
      label: input.label,
      link: input.link,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteDiscoverTile(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('home_discover_tiles').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
