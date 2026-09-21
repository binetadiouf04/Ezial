// Shared client-side image optimization — resizes to a sane max dimension
// and re-encodes as WebP before upload, so nothing reaches Supabase Storage
// at a phone camera's full resolution/format. Product photos already get
// this treatment via ImageCropModal's own canvas export (crop + resize +
// WebP in one step); this utility covers every OTHER upload path that
// still sent the raw picked file as-is (shop logo/cover, review photos).
//
// Never blocks an upload: any failure (decode error, exotic format,
// browser without canvas.toBlob('image/webp') support) falls back to the
// original file untouched rather than surfacing an error to the user.
export async function optimizeImageFile(file: File, maxDimension: number, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) return file;

    const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], webpName, { type: 'image/webp' });
  } catch {
    return file;
  }
}

// A small, fixed-size product thumbnail for ProductCard/Home/Catégories/
// Recherche — every one of those already renders the exact same 4:5 crop
// the seller confirmed (ImageCropModal's own output), so a plain resize to
// 240x300 never distorts or re-frames anything. Returns null (never the
// original file) on any failure — callers treat that as "no thumbnail this
// time", which is exactly what the existing "fall back to the main image"
// behavior already handles for products that predate this feature.
export async function generateThumbnail(file: File, width = 240, height = 300, quality = 0.82): Promise<File | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) return null;

    const thumbName = file.name.replace(/\.[^.]+$/, '') + '-thumb.webp';
    return new File([blob], thumbName, { type: 'image/webp' });
  } catch {
    return null;
  }
}
