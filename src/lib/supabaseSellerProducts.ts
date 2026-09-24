import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';
import { assignShopPrefixes, formatReference } from '@/utils/reference';
import { generateThumbnail } from '@/utils/imageOptimize';

// Writes a seller-created product to Supabase: products, then
// product_variants, then the image uploads + product_images. Each step
// only runs after the previous one succeeded, and any failure rolls back
// everything created so far (best-effort — the Supabase JS client has no
// real cross-table transaction, so this is a manual compensating-delete
// chain, not a real ROLLBACK). The whole sequence also runs inside a
// try/catch: an unexpected rejection (a dropped connection mid-upload, for
// instance) still triggers the same best-effort cleanup instead of leaving
// a products row silently orphaned.

export interface VariantRowInput {
  attributes: Record<string, string>;
  price: number;
  stock: number;
}

// The one standard ratio (width / height) for every product photo across
// the app — ProductCard and ProductGallery already both render at 4:5
// (aspect-[4/5]); ImageCropModal locks its frame to this exact same value
// so a vendor cropping a photo sees precisely the shape it will have
// everywhere it's displayed, never a mismatched crop between Home, the
// catalog grid and the product page.
export const PRODUCT_MEDIA_ASPECT_RATIO = 4 / 5;

// Media limits — enforced client-side in SellerProductForm before upload,
// not just documented here.
export const MAX_PRODUCT_MEDIA_ITEMS = 10;
export const MAX_PRODUCT_VIDEOS = 1;
export const MAX_VIDEO_SIZE_MB = 50;
export const ACCEPTED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export type MediaType = 'image' | 'video';

export interface BrandingOverlay {
  logoStoragePath: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
}

// One photo or video to upload. `originalFile`/`logoFile`/`brandingOverlay`
// are present only when the vendor applied a logo overlay to this image:
// `file` is then the already-composited result, `originalFile` the
// untouched source (kept so the overlay can be redone or removed later),
// and `logoFile` the logo itself — uploaded alongside so
// `brandingOverlay.logoStoragePath` can point at a real Storage object.
export interface NewProductMedia {
  file: File;
  mediaType: MediaType;
  originalFile?: File;
  logoFile?: File;
  brandingOverlay?: Omit<BrandingOverlay, 'logoStoragePath'>;
}

// Back-compat alias — the shape a plain (non-branded) photo upload needs.
export type NewProductImage = { file: File };

// The real products_status_check constraint only allows these four values —
// 'published' does not exist in the Supabase schema. Typing this here (not
// as the form's own 'draft' | 'published') makes it a compile error for any
// caller to pass an incompatible status again.
export type SupabaseProductStatus = 'draft' | 'active' | 'flagged' | 'disabled';

export interface CreateProductInput {
  shopId: string;
  shopName: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  basePrice: number;
  status: SupabaseProductStatus;
  descriptiveAttributes: Record<string, string[]>;
  variants: VariantRowInput[];
  images: NewProductMedia[];
  isPromo: boolean;
  promoPrice: number | null;
  promoStart: string | null;
  promoEnd: string | null;
}

export interface CreateProductResult {
  productId: string;
  reference: string;
}

export interface CreateProductError {
  error: string;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo';
}

// The shop's 3-letter reference prefix, derived only from its real Supabase
// name — never from any frontend mock data. A single-shop list never hits
// assignShopPrefixes' collision-avoidance branch, so this is a pure,
// deterministic, stable function of the shop's own name (same input, same
// prefix, every time).
function shopReferencePrefix(shopId: string, shopName: string): string {
  const prefixes = assignShopPrefixes([{ id: shopId, name: shopName }]);
  return prefixes[shopId] ?? 'EZI';
}

// The next free reference for this shop's prefix — an atomic per-prefix
// counter in Postgres (next_product_reference_seq(), see the migration this
// function ships with), never a client-side MAX(reference)+1 over products
// currently in the table. That MAX-based approach reused the exact number
// of whichever product happened to be the highest-numbered for this prefix
// the moment it was hard-deleted (no history, nothing left referencing it),
// silently reissuing an already-used reference to a brand new product — a
// real, observed failure mode, not a theoretical one. The counter only ever
// increases, so a deleted product's reference is never reused, and the
// increment itself is a single atomic statement server-side, so two
// products created for the same prefix at the same instant still can never
// collide (the products.reference UNIQUE constraint remains the final
// backstop regardless).
async function nextAvailableReference(shopId: string, shopName: string): Promise<string> {
  const prefix = shopReferencePrefix(shopId, shopName);
  const { data, error } = await supabase.rpc('next_product_reference_seq', { p_prefix: prefix });
  if (error || typeof data !== 'number') {
    throw new Error(`Impossible de générer une référence produit : ${error?.message ?? 'erreur inconnue'}.`);
  }
  return formatReference(prefix, data);
}

// Postgres' unique_violation code — used to tell "someone else just took
// this exact reference" (retry with a fresh one) apart from any other
// insert failure (which should not be retried).
function isReferenceConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '23505' || (error.message ?? '').includes('products_reference_key');
}

const MAX_REFERENCE_ATTEMPTS = 5;

export interface UploadedMediaRow {
  storagePath: string;
  mediaType: MediaType;
  originalStoragePath?: string;
  brandingOverlay?: BrandingOverlay;
  // A 240x300 WebP crop of `storagePath`, generated from the same already-
  // cropped (4:5) file — undefined whenever generation or its own upload
  // fails, which is never treated as a reason to fail the whole product
  // save: the reader side already falls back to the full-size image.
  thumbnailStoragePath?: string;
}

// Uploads every file a media item needs (main file, plus the original and
// the logo when a branding overlay was applied) and resolves
// brandingOverlay.logoStoragePath to the path it was actually uploaded to.
// `uploadedSoFar` on failure lists every Storage path written before the
// failing item, so the caller's cleanup removes exactly those, no more.
async function uploadMedia(
  uid: string,
  productId: string,
  items: NewProductMedia[],
): Promise<{ rows: UploadedMediaRow[] } | { error: string; uploadedSoFar: string[] }> {
  const uploadedSoFar: string[] = [];
  const rows: UploadedMediaRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const upload = async (file: File, suffix: string) => {
      // A short random token makes every upload's path globally unique, even
      // when a seller replaces the photo at the same slot (index i) more
      // than once for the same product — without it, a delete-then-reupload
      // to the exact same path is what lets the long cacheControl below
      // actually be safe: the browser can never end up serving a stale file
      // from a path that's since been overwritten with different content.
      const token = Math.random().toString(36).slice(2, 8);
      const path = `${uid}/${productId}/${i}${suffix}-${token}-${sanitizeFileName(file.name)}`;
      // One year, immutable: product photos are never edited in place (a
      // replacement always deletes the old file and uploads to a brand-new,
      // unique path above), so once a path is public it never changes —
      // safe to cache as aggressively as the browser allows instead of the
      // Supabase Storage default (1 hour), which forced every repeat visit
      // to re-download every product image on the page.
      const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, { cacheControl: '31536000' });
      if (error) throw new Error(`L'envoi de "${file.name}" a échoué : ${error.message}.`);
      uploadedSoFar.push(path);
      return path;
    };

    try {
      const storagePath = await upload(item.file, '');
      let originalStoragePath: string | undefined;
      let brandingOverlay: BrandingOverlay | undefined;
      if (item.originalFile) originalStoragePath = await upload(item.originalFile, '-original');
      if (item.logoFile && item.brandingOverlay) {
        const logoStoragePath = await upload(item.logoFile, '-logo');
        brandingOverlay = { ...item.brandingOverlay, logoStoragePath };
      }

      // Best-effort only, deliberately outside the try/catch that fails the
      // whole item: a thumbnail that can't be generated or uploaded just
      // means this product falls back to its full-size image, exactly like
      // any product that predates this feature — never a reason to fail an
      // otherwise-successful photo upload.
      let thumbnailStoragePath: string | undefined;
      if (item.mediaType === 'image') {
        const thumbFile = await generateThumbnail(item.file);
        if (thumbFile) {
          try {
            thumbnailStoragePath = await upload(thumbFile, '-thumb');
          } catch {
            thumbnailStoragePath = undefined;
          }
        }
      }

      rows.push({ storagePath, mediaType: item.mediaType, originalStoragePath, brandingOverlay, thumbnailStoragePath });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), uploadedSoFar };
    }
  }

  return { rows };
}

// Best-effort compensating delete. Each step's own result is checked —
// unlike a silent fire-and-forget, this never claims a clean rollback when
// Supabase actually refused one of the deletes (e.g. RLS not permitting a
// seller to delete a products row directly): the caller is told exactly
// whether cleanup fully succeeded, so it can report an honest error instead
// of hiding a leftover row.
async function cleanupFailedProduct(productId: string, uploadedPaths: string[]): Promise<{ cleanedUp: boolean }> {
  let cleanedUp = true;
  if (uploadedPaths.length > 0) {
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(uploadedPaths);
    if (error) cleanedUp = false;
  }
  const { error: imagesError } = await supabase.from('product_images').delete().eq('product_id', productId);
  if (imagesError) cleanedUp = false;
  const { error: variantsError } = await supabase.from('product_variants').delete().eq('product_id', productId);
  if (variantsError) cleanedUp = false;
  const { error: productError } = await supabase.from('products').delete().eq('id', productId);
  if (productError) cleanedUp = false;
  return { cleanedUp };
}

function failureMessage(reason: string, productId: string, cleanedUp: boolean): string {
  if (cleanedUp) return `${reason} Le produit n'a pas été enregistré.`;
  return `${reason} Le nettoyage automatique a échoué : un produit partiel (id ${productId}) peut être resté en base. Contactez EZIAL avec cet identifiant.`;
}

export async function createProductInSupabase(
  input: CreateProductInput,
): Promise<CreateProductResult | CreateProductError> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) {
    return { error: 'Session vendeur expirée. Reconnectez-vous et réessayez.' };
  }

  // Tracked across the whole try block so the catch handler can still
  // attempt cleanup if anything unexpected throws partway through (a
  // dropped connection, for instance) instead of leaving a row orphaned
  // with no cleanup attempted at all.
  let productId: string | undefined;
  let uploadedPaths: string[] = [];

  try {
    let productRow: { id: string } | null = null;
    let reference = '';
    let lastError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      reference = await nextAvailableReference(input.shopId, input.shopName);
      const { data, error } = await supabase
        .from('products')
        .insert({
          shop_id: input.shopId,
          reference,
          name: input.name,
          description: input.description,
          category: input.category,
          subcategory: input.subcategory,
          base_price: input.basePrice,
          status: input.status,
          descriptive_attributes: input.descriptiveAttributes,
          is_promo: input.isPromo,
          promo_price: input.isPromo ? input.promoPrice : null,
          promo_start: input.isPromo ? input.promoStart : null,
          promo_end: input.isPromo ? input.promoEnd : null,
        })
        .select('id')
        .single();

      if (!error && data) {
        productRow = data as { id: string };
        break;
      }
      lastError = error;
      // A reference collision (another concurrent request just took the
      // same next number) is retried with a freshly-queried reference —
      // anything else is a real failure, not retried.
      if (!isReferenceConflict(error)) break;
    }

    if (!productRow) {
      if (isReferenceConflict(lastError)) {
        return { error: "Impossible de générer une référence produit disponible après plusieurs tentatives (conflit concurrent). Réessayez." };
      }
      return { error: `Impossible de créer le produit : ${lastError?.message ?? 'erreur inconnue'}.` };
    }
    productId = productRow.id;

    const variantRows = input.variants.map((v) => ({
      product_id: productId,
      attributes: v.attributes,
      price: v.price,
      stock: v.stock,
    }));
    const { error: variantsError } = await supabase.from('product_variants').insert(variantRows);
    if (variantsError) {
      const { cleanedUp } = await cleanupFailedProduct(productId, uploadedPaths);
      return { error: failureMessage(`Impossible d'enregistrer les variantes : ${variantsError.message}.`, productId, cleanedUp) };
    }

    if (input.images.length > 0) {
      const uploadResult = await uploadMedia(uid, productId, input.images);
      if ('error' in uploadResult) {
        uploadedPaths = uploadResult.uploadedSoFar;
        const { cleanedUp } = await cleanupFailedProduct(productId, uploadedPaths);
        return { error: failureMessage(uploadResult.error, productId, cleanedUp) };
      }
      uploadedPaths = uploadResult.rows.flatMap((r) => [r.storagePath, r.originalStoragePath, r.brandingOverlay?.logoStoragePath, r.thumbnailStoragePath].filter((p): p is string => Boolean(p)));

      const imageRows = uploadResult.rows.map((r, i) => ({
        product_id: productId,
        storage_path: r.storagePath,
        is_primary: i === 0,
        sort_order: i,
        media_type: r.mediaType,
        original_storage_path: r.originalStoragePath ?? null,
        branding_overlay: r.brandingOverlay ?? null,
        thumbnail_storage_path: r.thumbnailStoragePath ?? null,
      }));
      const { error: imagesError } = await supabase.from('product_images').insert(imageRows);
      if (imagesError) {
        const { cleanedUp } = await cleanupFailedProduct(productId, uploadedPaths);
        return { error: failureMessage(`Impossible d'enregistrer les images : ${imagesError.message}.`, productId, cleanedUp) };
      }
    }

    return { productId, reference };
  } catch (err) {
    const reason = `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}.`;
    if (!productId) {
      return { error: `${reason} Le produit n'a pas été créé.` };
    }
    const { cleanedUp } = await cleanupFailedProduct(productId, uploadedPaths);
    return { error: failureMessage(reason, productId, cleanedUp) };
  }
}

// === Seller product list (SellerProducts.tsx) ===

export interface SellerProductVariantSummary {
  id: string;
  stock: number;
}

export interface SellerProductSummary {
  id: string;
  reference: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: SupabaseProductStatus;
  imageUrl: string;
  // Exactly one row (no real size/color dimensions, or a single selected
  // combination) is what the stock +/- control can safely adjust — 2+ rows
  // mean stock is only ever shown as a read-only aggregate here.
  variants: SellerProductVariantSummary[];
}

// Every real product for this shop, with stock, primary image and variants
// resolved from Supabase — never from local/mock state.
//
// archived_at IS NOT NULL means this product was removed via "Supprimer"
// but kept (status 'disabled') only because real order/review history
// references it — see seller_delete_or_archive_product. Unlike a product
// the seller manually paused with "Désactiver" (same 'disabled' status,
// archived_at stays null, still meant to be reactivated), an archived one
// has no reason to ever appear in the seller's own dashboard again.
export async function fetchSellerProducts(shopId: string): Promise<SellerProductSummary[]> {
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select('id, reference, name, category, base_price, status, created_at')
    .eq('shop_id', shopId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (productsError || !productRows || productRows.length === 0) return [];

  const productIds = productRows.map((row) => row.id as string);

  const [{ data: variantRows }, { data: imageRows }] = await Promise.all([
    supabase.from('product_variants').select('id, product_id, stock').in('product_id', productIds),
    supabase.from('product_images').select('product_id, storage_path, thumbnail_storage_path, is_primary, sort_order').in('product_id', productIds),
  ]);

  const variantsByProduct = new Map<string, SellerProductVariantSummary[]>();
  for (const row of variantRows ?? []) {
    const pid = row.product_id as string;
    const list = variantsByProduct.get(pid) ?? [];
    list.push({ id: row.id as string, stock: (row.stock as number) ?? 0 });
    variantsByProduct.set(pid, list);
  }

  const imagesByProduct = new Map<string, { storagePath: string; thumbnailStoragePath: string | null; isPrimary: boolean; sortOrder: number }[]>();
  for (const row of imageRows ?? []) {
    const pid = row.product_id as string;
    const list = imagesByProduct.get(pid) ?? [];
    list.push({
      storagePath: (row.storage_path as string) ?? '',
      thumbnailStoragePath: (row.thumbnail_storage_path as string | null) ?? null,
      isPrimary: Boolean(row.is_primary),
      sortOrder: (row.sort_order as number) ?? 0,
    });
    imagesByProduct.set(pid, list);
  }

  return productRows.map((row) => {
    const pid = row.id as string;
    const variants = variantsByProduct.get(pid) ?? [];
    const images = (imagesByProduct.get(pid) ?? []).sort(
      (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder,
    );
    return {
      id: pid,
      reference: (row.reference as string) ?? '',
      name: (row.name as string) ?? '',
      category: (row.category as string) ?? '',
      price: (row.base_price as number) ?? 0,
      stock: variants.reduce((sum, v) => sum + v.stock, 0),
      status: (row.status as SupabaseProductStatus) ?? 'draft',
      imageUrl: images[0] ? resolveImageUrl(images[0].thumbnailStoragePath || images[0].storagePath) : '',
      variants,
    };
  });
}

export async function setSellerProductStatus(productId: string, status: SupabaseProductStatus): Promise<{ error?: string }> {
  const { error } = await supabase.from('products').update({ status }).eq('id', productId);
  return error ? { error: error.message } : {};
}

export async function setSellerProductVariantStock(variantId: string, stock: number): Promise<{ error?: string }> {
  const { error } = await supabase.from('product_variants').update({ stock: Math.max(0, stock) }).eq('id', variantId);
  return error ? { error: error.message } : {};
}

export interface DeleteProductResult {
  error?: string;
  /** true when the product was archived (status set to 'disabled') instead of physically removed, because deleting it would risk breaking real order/review history. */
  softDeleted?: boolean;
}

// Deleting a product is only ever safe when nothing else references it.
// order_items snapshots the product's name/price/selected options at the
// time of purchase (it never re-reads the live product row), so a past
// order's own display keeps working even after this row is gone — but
// order_items.product_id and reviews.product_id still point at it.
//
// The history check itself (does this product have any order_items or
// reviews row) used to run as two plain client-side count queries. That's
// what produced "Impossible de vérifier l'historique du produit :" with
// nothing after the colon: order_items has no SELECT policy that lets a
// seller freely count rows by product_id (only via a join through their
// own shop's order_shops), so the query could come back with an error
// whose `.message` is an empty string — and `?? 'erreur inconnue'` only
// replaces null/undefined, never ''. The fix is not to loosen order_items'
// RLS (never make it publicly readable) but to move the whole check + the
// resulting archive/delete into one security-definer RPC (same trusted
// pattern as submit_shop_for_review), which authorizes the caller itself
// (must own the product's shop) instead of depending on ordinary table
// grants/policies. See the migration this function ships with.
//
// A product that has ever been ordered or reviewed is archived instead —
// status = 'disabled', the exact same status "Désactiver" already uses.
// Only a product with zero order/review history is ever physically
// removed, Storage files included.
export async function deleteSellerProduct(productId: string): Promise<DeleteProductResult> {
  // Storage paths must be gathered before the RPC runs — if it hard-deletes,
  // the product_images rows (and this info) are gone immediately after.
  const { data: imageRows } = await supabase.from('product_images').select('*').eq('product_id', productId);
  const paths = (imageRows ?? [])
    .flatMap((row) => [
      row.storage_path as string | null,
      row.original_storage_path as string | null,
      row.thumbnail_storage_path as string | null,
      (row.branding_overlay as { logoStoragePath?: string } | null)?.logoStoragePath ?? null,
    ])
    .filter((p): p is string => Boolean(p));

  const { data, error } = await supabase.rpc('seller_delete_or_archive_product', { p_product_id: productId });
  if (error) {
    // The real Postgres/PostgREST error goes to the console for debugging —
    // the seller only ever sees a clear, never-empty message.
    console.error('[deleteSellerProduct] seller_delete_or_archive_product failed:', error);
    return { error: "Impossible de supprimer ce produit pour le moment. Réessayez dans quelques instants." };
  }

  const archived = Boolean((data as { archived?: boolean } | null)?.archived);
  if (archived) return { softDeleted: true };

  // Fire-and-forget: the product_images/products rows are already gone via
  // the RPC above, so the seller's UI has everything it needs to move on.
  // Waiting on this extra Storage round trip before returning would only
  // add latency to a delete that, from the seller's perspective, already
  // succeeded — a failure here just leaves orphaned files behind (logged
  // for follow-up), never a dangling DB reference.
  if (paths.length > 0) {
    void supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths).then(({ error: storageError }) => {
      if (storageError) console.error('[deleteSellerProduct] Storage cleanup failed:', storageError);
    });
  }
  return { softDeleted: false };
}

// === Edit-mode image sync (existing Supabase-synced product only) ===

export interface ExistingProductImage {
  id: string;
  storagePath: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
  mediaType: MediaType;
  originalStoragePath: string | null;
  brandingOverlay: BrandingOverlay | null;
  thumbnailStoragePath: string | null;
}

// select('*') on purpose, not an explicit column list: media_type,
// original_storage_path and branding_overlay only exist once
// migration-media.sql has actually been run against this Supabase project.
// Naming those columns explicitly would make the whole query fail (and
// silently return zero images to the edit form — the exact bug this
// comment is here to prevent) on any project that hasn't run it yet.
// '*' always succeeds and the mapping below already defaults every new
// field with `??` when the column is genuinely absent from a row.
export async function fetchProductImages(productId: string): Promise<ExistingProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    storagePath: (row.storage_path as string) ?? '',
    url: resolveImageUrl((row.storage_path as string) ?? ''),
    isPrimary: Boolean(row.is_primary),
    sortOrder: (row.sort_order as number) ?? 0,
    mediaType: (row.media_type as MediaType) ?? 'image',
    originalStoragePath: (row.original_storage_path as string | null) ?? null,
    brandingOverlay: (row.branding_overlay as BrandingOverlay | null) ?? null,
    thumbnailStoragePath: (row.thumbnail_storage_path as string | null) ?? null,
  }));
}

// Removes every Storage object this row owns (main file, plus the original
// and logo when a branding overlay was applied) so branding never leaves
// orphaned files behind, then deletes the row itself.
export async function deleteProductImage(
  imageId: string,
  storagePath: string,
  extraPaths: (string | null | undefined)[] = [],
): Promise<{ error?: string }> {
  const paths = [storagePath, ...extraPaths].filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
    if (storageError) return { error: `Suppression du fichier impossible : ${storageError.message}` };
  }
  const { error: dbError } = await supabase.from('product_images').delete().eq('id', imageId);
  if (dbError) return { error: `Suppression de l'image impossible : ${dbError.message}` };
  return {};
}

// Persists a full reorder + primary-flag pass over already-existing
// product_images rows in one go — called after the seller drags/moves a
// photo or changes the primary photo, so sort_order in Supabase always
// matches what the form shows.
export async function reorderProductMedia(
  rows: { id: string; sortOrder: number; isPrimary: boolean }[],
): Promise<{ error?: string }> {
  const results = await Promise.all(
    rows.map((r) => supabase.from('product_images').update({ sort_order: r.sortOrder, is_primary: r.isPrimary }).eq('id', r.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: `Impossible d'enregistrer l'ordre des photos : ${failed.error.message}` };
  return {};
}

// === Edit mode: load a full product for editing, and save it back ===

export interface EditableProductVariant {
  id: string;
  attributes: Record<string, string>;
  price: number;
  stock: number;
}

export interface EditableProduct {
  id: string;
  shopId: string;
  reference: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  basePrice: number;
  status: SupabaseProductStatus;
  descriptiveAttributes: Record<string, string[]>;
  variants: EditableProductVariant[];
  images: ExistingProductImage[];
  isPromo: boolean;
  promoPrice: number | null;
  promoStart: string | null;
  promoEnd: string | null;
}

// Scoped to the seller's own shop (like fetchSellerProducts) so editing
// never reads — let alone later updates — a product belonging to a
// different shop, on top of whatever RLS already enforces.
export async function fetchProductForEdit(productId: string, shopId: string): Promise<EditableProduct | null> {
  const { data: row, error } = await supabase
    .from('products')
    .select('id, shop_id, reference, name, description, category, subcategory, base_price, status, descriptive_attributes, is_promo, promo_price, promo_start, promo_end')
    .eq('id', productId)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error || !row) return null;

  const [{ data: variantRows }, images] = await Promise.all([
    supabase.from('product_variants').select('id, attributes, price, stock').eq('product_id', productId),
    fetchProductImages(productId),
  ]);

  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    reference: (row.reference as string) ?? '',
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    category: (row.category as string) ?? '',
    subcategory: (row.subcategory as string) ?? '',
    basePrice: (row.base_price as number) ?? 0,
    status: (row.status as SupabaseProductStatus) ?? 'draft',
    descriptiveAttributes: (row.descriptive_attributes as Record<string, string[]>) ?? {},
    variants: (variantRows ?? []).map((v) => ({
      id: v.id as string,
      attributes: (v.attributes as Record<string, string>) ?? {},
      price: (v.price as number) ?? 0,
      stock: (v.stock as number) ?? 0,
    })),
    images,
    isPromo: Boolean(row.is_promo),
    promoPrice: (row.promo_price as number) ?? null,
    promoStart: (row.promo_start as string | null) ?? null,
    promoEnd: (row.promo_end as string | null) ?? null,
  };
}

export interface UpdateProductInput {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  basePrice: number;
  status: SupabaseProductStatus;
  descriptiveAttributes: Record<string, string[]>;
  variants: VariantRowInput[];
  isPromo: boolean;
  promoPrice: number | null;
  promoStart: string | null;
  promoEnd: string | null;
}

// A variant's attributes, as a stable key for matching "the same variant"
// across an edit — order-independent, so {Taille:"M",Couleur:"Noir"} and
// {Couleur:"Noir",Taille:"M"} are recognized as the same combination.
function variantAttributesKey(attributes: Record<string, string>): string {
  return JSON.stringify(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)));
}

// Updates the existing products row in place (same id, same reference,
// same shop_id — none of those columns are ever touched here).
//
// product_variants is reconciled, never wholesale-replaced: a desired row
// whose attributes match an existing variant re-uses that variant's id and
// gets UPDATEd (so its stock is only ever the seller's actual current
// input, never zeroed just because the row was rewritten); a desired row
// with no existing match is INSERTed as a genuinely new variant; an
// existing variant with no matching desired row (an option the seller
// explicitly removed) is DELETEd. This is what stops an edit from
// resetting untouched variants' stock to 0 — the previous delete-all/
// insert-all approach lost every variant's identity on every save.
export async function updateProductInSupabase(productId: string, input: UpdateProductInput): Promise<{ error?: string }> {
  const { error: productError } = await supabase
    .from('products')
    .update({
      name: input.name,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory,
      base_price: input.basePrice,
      status: input.status,
      descriptive_attributes: input.descriptiveAttributes,
      is_promo: input.isPromo,
      promo_price: input.isPromo ? input.promoPrice : null,
      promo_start: input.isPromo ? input.promoStart : null,
      promo_end: input.isPromo ? input.promoEnd : null,
    })
    .eq('id', productId);
  if (productError) return { error: `Impossible de mettre à jour le produit : ${productError.message}` };

  const { data: existingVariants, error: fetchError } = await supabase
    .from('product_variants')
    .select('id, attributes')
    .eq('product_id', productId);
  if (fetchError) return { error: `Impossible de lire les variantes existantes : ${fetchError.message}` };

  const existingByKey = new Map<string, string>();
  for (const row of existingVariants ?? []) {
    existingByKey.set(variantAttributesKey((row.attributes as Record<string, string>) ?? {}), row.id as string);
  }

  const matchedIds = new Set<string>();
  const updates: { id: string; attributes: Record<string, string>; price: number; stock: number }[] = [];
  const inserts: VariantRowInput[] = [];
  for (const v of input.variants) {
    const existingId = existingByKey.get(variantAttributesKey(v.attributes));
    if (existingId && !matchedIds.has(existingId)) {
      matchedIds.add(existingId);
      updates.push({ id: existingId, attributes: v.attributes, price: v.price, stock: v.stock });
    } else {
      inserts.push(v);
    }
  }
  const idsToDelete = (existingVariants ?? []).map((row) => row.id as string).filter((id) => !matchedIds.has(id));

  const updateResults = await Promise.all(
    updates.map((u) => supabase.from('product_variants').update({ price: u.price, stock: u.stock }).eq('id', u.id)),
  );
  const failedUpdate = updateResults.find((r) => r.error);
  if (failedUpdate?.error) return { error: `Impossible de mettre à jour les variantes : ${failedUpdate.error.message}` };

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('product_variants').insert(
      inserts.map((v) => ({ product_id: productId, attributes: v.attributes, price: v.price, stock: v.stock })),
    );
    if (insertError) return { error: `Impossible d'enregistrer les nouvelles variantes : ${insertError.message}` };
  }

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('product_variants').delete().in('id', idsToDelete);
    if (deleteError) return { error: `Impossible de supprimer les anciennes variantes : ${deleteError.message}` };
  }

  return {};
}

// Adds newly-selected photos to an already-Supabase-synced product during
// an edit — mirrors the create flow's upload step, but for a product that
// already has an id. sortOrderStart lets new photos append after whatever
// existing images are already there.
// Each item carries its own final sort_order/isPrimary (the position it
// actually occupies in the seller's full media array, which — thanks to
// reordering and branding-triggered replacement — is not necessarily
// contiguous with the other new items) rather than an assumed
// append-at-the-end range.
export async function addProductMedia(
  productId: string,
  items: { media: NewProductMedia; sortOrder: number; isPrimary: boolean }[],
): Promise<{ error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) return { error: 'Session vendeur expirée. Reconnectez-vous et réessayez.' };

  const uploadResult = await uploadMedia(uid, productId, items.map((i) => i.media));
  if ('error' in uploadResult) return { error: uploadResult.error };

  const imageRows = uploadResult.rows.map((r, i) => ({
    product_id: productId,
    storage_path: r.storagePath,
    is_primary: items[i].isPrimary,
    sort_order: items[i].sortOrder,
    media_type: r.mediaType,
    original_storage_path: r.originalStoragePath ?? null,
    branding_overlay: r.brandingOverlay ?? null,
    thumbnail_storage_path: r.thumbnailStoragePath ?? null,
  }));
  const { error: imagesError } = await supabase.from('product_images').insert(imageRows);
  if (imagesError) {
    const allPaths = uploadResult.rows.flatMap((r) => [r.storagePath, r.originalStoragePath, r.brandingOverlay?.logoStoragePath, r.thumbnailStoragePath].filter((p): p is string => Boolean(p)));
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(allPaths);
    return { error: `Impossible d'enregistrer les nouvelles images : ${imagesError.message}` };
  }
  return {};
}
