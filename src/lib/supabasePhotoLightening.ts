import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';
import { encodeCanvasForWeb, generateThumbnail, optimizeImageFile } from '@/utils/imageOptimize';
import { ASSET_MAX_DIMENSION } from './supabaseSellerShop';

// Automatic clean-up (run in the background by the seller space, see
// useAutoLightenProductPhotos) for product photos uploaded before the iPad
// fix in imageOptimize.ts: Safari can't encode WebP, so those photos were stored
// as PNG (~1.3 MB each, measured in production) and their "thumbnails" as
// PNG too. This re-encodes them in the seller's own browser — WebP, or JPEG
// on iPad — at the SAME size and crop, so nothing changes visually, then
// swaps the product_images row to the new files and removes the old ones.
//
// Runs entirely with the seller's own rights (RLS): only files in their own
// Storage folder, only rows of their own products. Never touches a photo
// with a logo overlay (its original must stay paired with it) nor a video.

const HEAVY_BYTES = 350 * 1024;
const MIN_GAIN = 0.8; // keep the new file only if at least 20% lighter
const MAX_DIMENSION = 1200;

export interface LightenProgress { done: number; total: number }
export interface LightenResult { checked: number; lightened: number; savedBytes: number; failed: number; firstError?: string }

interface ImageRow {
  id: string;
  product_id: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  original_storage_path: string | null;
}

const extFor = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

async function reencode(blob: Blob): Promise<{ blob: Blob; type: string } | null> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encoded = await encodeCanvasForWeb(canvas, 0.82);
  // Frees the pixel memory right away (iOS Safari keeps canvases alive and
  // can reload the page after a few dozen large ones).
  canvas.width = 0;
  canvas.height = 0;
  return encoded ? { blob: encoded.blob, type: encoded.type } : null;
}

async function upload(path: string, blob: Blob, contentType: string): Promise<boolean> {
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, blob, { cacheControl: '31536000', contentType });
  return !error;
}

// Photos already examined and found fine (light enough, or no real gain from
// re-encoding) are remembered on this device, so they are never downloaded
// again at each visit. A failure is NOT remembered: it is retried next time.
const CHECKED_KEY = 'ezial-photo-checked-v1';
const CHECKED_MAX = 3000;

function readChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberChecked(paths: string[]): void {
  if (paths.length === 0) return;
  try {
    const all = [...readChecked(), ...paths];
    localStorage.setItem(CHECKED_KEY, JSON.stringify(all.slice(-CHECKED_MAX)));
  } catch { /* storage unavailable: the photo is simply re-checked next time */ }
}

async function lightenOne(uid: string, row: ImageRow): Promise<number> {
  const response = await fetch(resolveImageUrl(row.storage_path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`lecture de la photo refusée (${response.status})`);
  const source = await response.blob();
  if (source.size < HEAVY_BYTES && source.type !== 'image/png') return 0;

  const next = await reencode(source);
  if (!next || next.blob.size >= source.size * MIN_GAIN) return 0;

  const token = Math.random().toString(36).slice(2, 8);
  const ext = extFor(next.type);
  const mainPath = `${uid}/${row.product_id}/opt-${token}.${ext}`;
  if (!(await upload(mainPath, next.blob, next.type))) throw new Error('envoi de la photo allégée refusé');

  // The original is only ever replaced once the new file is confirmed readable
  // online and complete (same size as what was sent). Otherwise the new file
  // is removed and the original stays exactly as it was.
  let verified = false;
  try {
    const check = await fetch(resolveImageUrl(mainPath), { cache: 'no-store' });
    verified = check.ok && (await check.blob()).size === next.blob.size;
  } catch { verified = false; }
  if (!verified) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([mainPath]);
    throw new Error('vérification de la photo allégée échouée');
  }

  let thumbPath: string | null = null;
  const thumb = await generateThumbnail(new File([next.blob], `photo.${ext}`, { type: next.type }));
  if (thumb) {
    const candidate = `${uid}/${row.product_id}/opt-${token}-thumb.${extFor(thumb.type)}`;
    if (await upload(candidate, thumb, thumb.type)) thumbPath = candidate;
  }

  const { data, error } = await supabase
    .from('product_images')
    .update({ storage_path: mainPath, thumbnail_storage_path: thumbPath ?? row.thumbnail_storage_path })
    .eq('id', row.id)
    .select('id');
  if (error || !data || data.length !== 1) {
    // Row unchanged: remove only what was just uploaded.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([mainPath, ...(thumbPath ? [thumbPath] : [])]);
    throw new Error('mise à jour de la fiche photo refusée');
  }

  // The row now points at the new files. The old ones are removed, EXCEPT
  // a file a past order still shows (order_items.image_url keeps the photo
  // path as it was when the order was placed — the seller can read every
  // order line of their own shop, so this check is complete).
  const oldPaths = [row.storage_path, ...(thumbPath && row.thumbnail_storage_path ? [row.thumbnail_storage_path] : [])]
    .filter((p) => p.startsWith(`${uid}/`));
  if (oldPaths.length > 0) {
    const oldUrls = oldPaths.map((p) => resolveImageUrl(p));
    const { data: referenced, error: refError } = await supabase.from('order_items').select('image_url').in('image_url', [...oldPaths, ...oldUrls]);
    if (!refError) {
      const kept = new Set((referenced ?? []).map((r) => r.image_url as string));
      const removable = oldPaths.filter((p, i) => !kept.has(p) && !kept.has(oldUrls[i]));
      if (removable.length > 0) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(removable);
    }
  }

  // Only the main photo's saving is reported (the thumbnail's is a bonus).
  return source.size - next.blob.size;
}

// Shop logo and cover (same idea, same safety): uploaded before the PNG fix,
// a cover can weigh ~1 MB and a logo 300+ KB, loaded on the home page and on
// every shop card. The image is re-encoded (cover: flattened JPEG/WebP; logo:
// kept as PNG only if it really has transparent pixels), uploaded under a NEW
// name, checked online, and only then does shops.logo_url / cover_url point
// at it. The old file is deliberately left in place: Google, link previews
// and the catalogue copy kept on visitors' devices may still show its URL for
// a few hours. Only the seller's own shop, under their own rights (RLS).
const ASSET_HEAVY_BYTES: Record<'logo' | 'cover', number> = { logo: 80 * 1024, cover: 200 * 1024 };

async function lightenShopAsset(shopId: string, kind: 'logo' | 'cover', url: string): Promise<{ newUrl: string; saved: number } | null> {
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const oldPath = decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  if (!oldPath.startsWith(`shops/${shopId}/`)) return null;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`lecture du ${kind === 'logo' ? 'logo' : 'de la couverture'} refusée (${response.status})`);
  const source = await response.blob();
  if (source.size < ASSET_HEAVY_BYTES[kind]) return null;

  const optimized = await optimizeImageFile(
    new File([source], `${kind}.${source.type === 'image/png' ? 'png' : 'img'}`, { type: source.type }),
    ASSET_MAX_DIMENSION[kind],
    0.82,
    { flatten: kind === 'cover' },
  );
  if (optimized.size >= source.size * MIN_GAIN || !['image/webp', 'image/jpeg', 'image/png'].includes(optimized.type)) return null;

  const ext = optimized.type === 'image/webp' ? 'webp' : optimized.type === 'image/png' ? 'png' : 'jpg';
  const path = `shops/${shopId}/${kind}-${Date.now()}.${ext}`;
  if (!(await upload(path, optimized, optimized.type))) throw new Error('envoi de l\'image allégée refusé');

  const newUrl = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  let verified = false;
  try {
    const check = await fetch(newUrl, { cache: 'no-store' });
    verified = check.ok && (await check.blob()).size === optimized.size;
  } catch { verified = false; }
  if (!verified) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
    throw new Error('vérification de l\'image allégée échouée');
  }

  const column = kind === 'logo' ? 'logo_url' : 'cover_url';
  // .eq(column, url): never overwrite a logo/cover the seller replaced meanwhile.
  const { data, error } = await supabase.from('shops').update({ [column]: newUrl }).eq('id', shopId).eq(column, url).select('id');
  if (error || !data || data.length === 0) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
    if (error) throw new Error('mise à jour de la boutique refusée');
    return null;
  }
  return { newUrl, saved: source.size - optimized.size };
}

export async function lightenShopAssets(shopId: string): Promise<{ lightened: number; savedBytes: number; failed: number; firstError?: string }> {
  const out: { lightened: number; savedBytes: number; failed: number; firstError?: string } = { lightened: 0, savedBytes: 0, failed: 0 };
  const { data, error } = await supabase.from('shops').select('logo_url, cover_url').eq('id', shopId).maybeSingle();
  if (error || !data) return out;
  const alreadyChecked = readChecked();
  for (const kind of ['logo', 'cover'] as const) {
    const url = (data[kind === 'logo' ? 'logo_url' : 'cover_url'] as string | null) ?? '';
    if (!url || alreadyChecked.has(url)) continue;
    try {
      const result = await lightenShopAsset(shopId, kind, url);
      if (result) { out.lightened += 1; out.savedBytes += result.saved; rememberChecked([result.newUrl]); }
      else rememberChecked([url]);
    } catch (e) {
      out.failed += 1;
      out.firstError ??= e instanceof Error ? e.message : String(e);
    }
  }
  return out;
}

// maxHeavy: how many heavy photos to convert in this run (light photos are
// skipped from Storage metadata alone, without downloading them). Lets the
// automatic background run spread a large backlog over several visits.
// shouldStop lets the caller abort between two photos (page left, signed out).
const CONCURRENCY = 2;

export async function lightenShopProductPhotos(
  shopId: string,
  options: { maxHeavy?: number; onProgress?: (p: LightenProgress) => void; shouldStop?: () => boolean } = {},
): Promise<LightenResult | { error: string }> {
  const { maxHeavy = Infinity, onProgress, shouldStop } = options;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { error: 'Session expirée : reconnectez-vous.' };

  const { data: products, error: productsError } = await supabase.from('products').select('id').eq('shop_id', shopId);
  if (productsError) return { error: 'Impossible de lire vos produits.' };
  const productIds = (products ?? []).map((p) => p.id as string);
  if (productIds.length === 0) return { checked: 0, lightened: 0, savedBytes: 0, failed: 0 };

  const { data: rows, error: rowsError } = await supabase
    .from('product_images')
    .select('id, product_id, storage_path, thumbnail_storage_path, original_storage_path, media_type')
    .in('product_id', productIds)
    .eq('media_type', 'image');
  if (rowsError) return { error: 'Impossible de lire vos photos.' };

  // Only photos in the seller's own folder (the only ones RLS lets them
  // replace), never one with a logo overlay, and never one this tool already
  // produced (its name starts with "opt-").
  const alreadyChecked = readChecked();
  const candidates = ((rows ?? []) as ImageRow[]).filter(
    (r) => r.storage_path?.startsWith(`${uid}/`) && !r.original_storage_path && !/\/opt-[^/]*$/.test(r.storage_path)
      && !alreadyChecked.has(r.storage_path),
  );

  // No Storage listing: listing a folder runs a heavy query on the database,
  // and ~40 of them at once made it answer "statement timeout" to everyone
  // (seen in production). A photo's real size and type are read from the
  // file itself instead, one request at a time per worker (see lightenOne:
  // an already-light photo is left alone after a cheap download).
  const result: LightenResult = { checked: candidates.length, lightened: 0, savedBytes: 0, failed: 0 };
  const heavy = candidates;
  let done = 0;
  onProgress?.({ done, total: heavy.length });

  let next = 0;
  const worker = async () => {
    while (next < heavy.length && result.lightened + result.failed < maxHeavy && !shouldStop?.()) {
      const row = heavy[next++];
      try {
        const saved = await lightenOne(uid, row);
        if (saved > 0) { result.lightened += 1; result.savedBytes += saved; }
        else rememberChecked([row.storage_path]);
      } catch (e) {
        result.failed += 1;
        result.firstError ??= e instanceof Error ? e.message : String(e);
      }
      done += 1;
      onProgress?.({ done, total: heavy.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, heavy.length) }, worker));
  return result;
}

// Automatic run, started a few seconds after the seller space opens: up to
// AUTO_BATCH heavy legacy photos per visit, so a large backlog is spread over
// a few visits. The run is only marked as done for this browser session once
// it has really finished: a phone that left the page mid-way (iOS pauses the
// tab) starts again on the next visit instead of being skipped.
const AUTO_BATCH = 25;
const LAST_RUN_KEY = 'ezial-photo-lightening-last';
const AUTO_DELAY_MS = 3000;
let autoRunning = false;

export function scheduleAutoLightening(
  shopId: string,
  onProgress?: (p: LightenProgress | null) => void,
  onDone?: (result: LightenResult | { error: string }) => void,
): () => void {
  const key = `ezial-photo-lightening-${shopId}`;
  try { if (sessionStorage.getItem(key)) return () => {}; } catch { /* ignore */ }
  let cancelledBeforeStart = false;
  const timer = window.setTimeout(() => {
    if (cancelledBeforeStart || autoRunning) return;
    autoRunning = true;
    // Once started, the run goes on even if the seller moves to another page
    // of the site (the app stays loaded): leaving the seller space after a
    // few seconds used to cut it short.
    // Logo and cover first (two small files at most, no progress banner), then
    // the product photos; both results are reported together.
    const assetsPromise = lightenShopAssets(shopId).catch(() => ({ lightened: 0, savedBytes: 0, failed: 0 } as Awaited<ReturnType<typeof lightenShopAssets>>));
    void assetsPromise
      .then((assets) => lightenShopProductPhotos(shopId, { maxHeavy: AUTO_BATCH, onProgress: (p) => { if (p.total > 0) onProgress?.(p); } })
        .then((r): LightenResult | { error: string } => ('error' in r ? r : {
          ...r,
          lightened: r.lightened + assets.lightened,
          savedBytes: r.savedBytes + assets.savedBytes,
          failed: r.failed + assets.failed,
          firstError: r.firstError ?? assets.firstError,
        })))
      .then((result) => {
        if (!('error' in result) && result.failed === 0) {
          try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
        }
        try { localStorage.setItem(LAST_RUN_KEY, JSON.stringify({ at: Date.now(), result })); } catch { /* ignore */ }
        onDone?.(result);
      })
      .catch(() => undefined)
      .finally(() => { autoRunning = false; onProgress?.(null); });
  }, AUTO_DELAY_MS);
  return () => { cancelledBeforeStart = true; window.clearTimeout(timer); };
}

// Outcome of the last automatic run, kept so it can still be shown when the
// seller had left the seller space (or the page was reloaded) before it ended.
export function readLastLighteningReport(): LightenResult | { error: string } | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; result: LightenResult | { error: string } };
    return Date.now() - parsed.at < 24 * 60 * 60 * 1000 ? parsed.result : null;
  } catch {
    return null;
  }
}

export function clearLastLighteningReport(): void {
  try { localStorage.removeItem(LAST_RUN_KEY); } catch { /* ignore */ }
}
