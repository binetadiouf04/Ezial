import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';
import { encodeCanvasForWeb, generateThumbnail } from '@/utils/imageOptimize';

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
export interface LightenResult { checked: number; lightened: number; savedBytes: number; failed: number }

interface ImageRow {
  id: string;
  product_id: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  original_storage_path: string | null;
}

interface StoredFile { size: number; mimetype: string }

async function listProductFolder(folder: string): Promise<Map<string, StoredFile>> {
  const files = new Map<string, StoredFile>();
  const { data } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).list(folder, { limit: 1000 });
  for (const f of data ?? []) {
    const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
    files.set(`${folder}/${f.name}`, { size: meta.size ?? 0, mimetype: meta.mimetype ?? '' });
  }
  return files;
}

const extFor = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

async function reencode(blob: Blob): Promise<{ blob: Blob; type: string } | null> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encoded = await encodeCanvasForWeb(canvas, 0.82);
  return encoded ? { blob: encoded.blob, type: encoded.type } : null;
}

async function upload(path: string, blob: Blob, contentType: string): Promise<boolean> {
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, blob, { cacheControl: '31536000', contentType });
  return !error;
}

async function lightenOne(uid: string, row: ImageRow, stored: StoredFile | undefined): Promise<number | null> {
  // Already light and in a modern format: nothing to do.
  if (stored && stored.size > 0 && stored.size < HEAVY_BYTES && stored.mimetype !== 'image/png') return 0;

  const response = await fetch(resolveImageUrl(row.storage_path), { cache: 'no-store' });
  if (!response.ok) return null;
  const source = await response.blob();
  if (source.size < HEAVY_BYTES && source.type !== 'image/png') return 0;

  const next = await reencode(source);
  if (!next || next.blob.size >= source.size * MIN_GAIN) return 0;

  const token = Math.random().toString(36).slice(2, 8);
  const ext = extFor(next.type);
  const mainPath = `${uid}/${row.product_id}/opt-${token}.${ext}`;
  if (!(await upload(mainPath, next.blob, next.type))) return null;

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
    return null;
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

// maxHeavy: how many heavy photos to convert in this run (light photos are
// skipped from Storage metadata alone, without downloading them). Lets the
// automatic background run spread a large backlog over several visits.
export async function lightenShopProductPhotos(shopId: string, options: { maxHeavy?: number; onProgress?: (p: LightenProgress) => void } = {}): Promise<LightenResult | { error: string }> {
  const { maxHeavy = Infinity, onProgress } = options;
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
  // replace), and never one with a logo overlay.
  const candidates = ((rows ?? []) as ImageRow[]).filter((r) => r.storage_path?.startsWith(`${uid}/`) && !r.original_storage_path);

  const folders = [...new Set(candidates.map((r) => r.storage_path.split('/').slice(0, -1).join('/')))];
  const stored = new Map<string, StoredFile>();
  for (const folder of folders) for (const [k, v] of await listProductFolder(folder)) stored.set(k, v);

  const result: LightenResult = { checked: candidates.length, lightened: 0, savedBytes: 0, failed: 0 };
  onProgress?.({ done: 0, total: candidates.length });
  for (let i = 0; i < candidates.length; i++) {
    if (result.lightened + result.failed >= maxHeavy) break;
    try {
      const saved = await lightenOne(uid, candidates[i], stored.get(candidates[i].storage_path));
      if (saved === null) result.failed += 1;
      else if (saved > 0) { result.lightened += 1; result.savedBytes += saved; }
    } catch {
      result.failed += 1;
    }
    onProgress?.({ done: i + 1, total: candidates.length });
  }
  return result;
}

// Once per browser session per shop, a few seconds after the seller space
// opens: converts up to AUTO_BATCH heavy legacy photos in the background.
// Sellers don't need to know or do anything; a large backlog is simply
// spread over a few visits. Every failure is silent (nothing changes then).
const AUTO_BATCH = 25;
const AUTO_DELAY_MS = 4000;

export function scheduleAutoLightening(shopId: string): () => void {
  const key = `ezial-photo-lightening-${shopId}`;
  try { if (sessionStorage.getItem(key)) return () => {}; } catch { /* ignore */ }
  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
    void lightenShopProductPhotos(shopId, { maxHeavy: AUTO_BATCH }).catch(() => undefined);
  }, AUTO_DELAY_MS);
  return () => { cancelled = true; window.clearTimeout(timer); };
}
