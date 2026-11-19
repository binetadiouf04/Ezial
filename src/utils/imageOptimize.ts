// Shared client-side image optimization — resizes to a sane max dimension
// and re-encodes before upload, so nothing reaches Supabase Storage at a
// phone camera's full resolution/format. Product photos already get this
// treatment via ImageCropModal's own canvas export (crop + resize + encode
// in one step); this utility covers every OTHER upload path that still sent
// the raw picked file as-is (shop logo/cover, review photos).
//
// Never blocks an upload: any failure (decode error, exotic format) falls
// back to the original file untouched rather than surfacing an error.

export interface EncodedImage {
  blob: Blob;
  type: 'image/webp' | 'image/jpeg' | 'image/png';
  ext: 'webp' | 'jpg' | 'png';
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// WebP when the browser can encode it, JPEG otherwise. Safari on iPad and
// iPhone cannot encode WebP: canvas.toBlob('image/webp') silently returns a
// PNG there — measured in production, product photos sent from an iPad were
// stored as ~1.3 MB PNGs (about 8x a JPEG of the same photo). The returned
// type is always the blob's REAL type, never the one requested.
//
// keepTransparency: for a source that may have transparent pixels (a PNG
// logo), fall back to PNG rather than JPEG, which would turn them black.
export async function encodeCanvasForWeb(canvas: HTMLCanvasElement, quality = 0.82, keepTransparency = false): Promise<EncodedImage | null> {
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return { blob: webp, type: 'image/webp', ext: 'webp' };
  if (keepTransparency) {
    const png = webp && webp.type === 'image/png' ? webp : await toBlob(canvas, 'image/png', 1);
    return png ? { blob: png, type: 'image/png', ext: 'png' } : null;
  }
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  return jpeg && jpeg.type === 'image/jpeg' ? { blob: jpeg, type: 'image/jpeg', ext: 'jpg' } : null;
}

const withExtension = (name: string, ext: string, suffix = '') => `${name.replace(/\.[^.]+$/, '')}${suffix}.${ext}`;

// True when at least one pixel is not fully opaque. A PNG with no transparency
// at all (a screenshot, a banner exported as PNG) is stored as JPEG/WebP
// instead: several times lighter, identical to the eye. If the pixels cannot
// be read, assume transparency (the safe side: PNG is kept).
function hasTransparentPixels(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  } catch {
    return true;
  }
}

// flatten: the image is never shown over anything but a solid background
// (a shop cover): transparent areas are painted white and the result is never
// kept as a heavy PNG.
export async function optimizeImageFile(file: File, maxDimension: number, quality = 0.82, options: { flatten?: boolean } = {}): Promise<File> {
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
    if (options.flatten) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const mayBeTransparent = !options.flatten && (file.type === 'image/png' || file.type === 'image/gif');
    const encoded = await encodeCanvasForWeb(canvas, quality, mayBeTransparent && hasTransparentPixels(ctx, width, height));
    if (!encoded) return file;
    // Never replace a web-ready original with something heavier (a small
    // PNG logo re-encoded as PNG can come out larger than it went in). A
    // HEIC/other source is always replaced: browsers can't display it.
    const webReady = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (webReady && scale === 1 && encoded.blob.size >= file.size) return file;

    return new File([encoded.blob], withExtension(file.name, encoded.ext), { type: encoded.type });
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
export async function generateThumbnail(file: File, width = 240, height = 300, quality = 0.8): Promise<File | null> {
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

    const encoded = await encodeCanvasForWeb(canvas, quality);
    canvas.width = 0;
    canvas.height = 0;
    if (!encoded) return null;
    return new File([encoded.blob], withExtension(file.name, encoded.ext, '-thumb'), { type: encoded.type });
  } catch {
    return null;
  }
}
