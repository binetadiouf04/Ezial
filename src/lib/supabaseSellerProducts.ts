import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';
import { assignShopPrefixes, formatReference } from '@/utils/reference';

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

export interface NewProductImage {
  file: File;
}

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
  images: NewProductImage[];
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

// The next free reference for this shop's prefix, computed from the
// products actually present in Supabase — never from local/mock counters.
// products.reference is unique across the whole table (not per shop), so
// this looks at every product sharing the prefix, across every shop, not
// just this shop's own products: if two shops happen to compute the same
// 3-letter code, their references still never collide, since both draw
// their next number from the same shared count.
async function nextAvailableReference(shopId: string, shopName: string): Promise<string> {
  const prefix = shopReferencePrefix(shopId, shopName);
  const { data } = await supabase.from('products').select('reference').like('reference', `EZ-${prefix}-%`);
  const pattern = new RegExp(`^EZ-${prefix}-(\\d+)$`);
  let maxSeq = 0;
  for (const row of data ?? []) {
    const match = (row.reference as string | null)?.match(pattern);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return formatReference(prefix, maxSeq + 1);
}

// Postgres' unique_violation code — used to tell "someone else just took
// this exact reference" (retry with a fresh one) apart from any other
// insert failure (which should not be retried).
function isReferenceConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '23505' || (error.message ?? '').includes('products_reference_key');
}

const MAX_REFERENCE_ATTEMPTS = 5;

async function uploadImages(
  uid: string,
  productId: string,
  images: NewProductImage[],
): Promise<{ paths: string[] } | { error: string; uploadedSoFar: string[] }> {
  const uploadedSoFar: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const file = images[i].file;
    const path = `${uid}/${productId}/${i}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file);
    if (error) {
      return { error: `L'envoi de l'image "${file.name}" a échoué : ${error.message}.`, uploadedSoFar };
    }
    uploadedSoFar.push(path);
  }
  return { paths: uploadedSoFar };
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
      const uploadResult = await uploadImages(uid, productId, input.images);
      if ('error' in uploadResult) {
        uploadedPaths = uploadResult.uploadedSoFar;
        const { cleanedUp } = await cleanupFailedProduct(productId, uploadedPaths);
        return { error: failureMessage(uploadResult.error, productId, cleanedUp) };
      }
      uploadedPaths = uploadResult.paths;

      const imageRows = uploadedPaths.map((storagePath, i) => ({
        product_id: productId,
        storage_path: storagePath,
        is_primary: i === 0,
        sort_order: i,
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
export async function fetchSellerProducts(shopId: string): Promise<SellerProductSummary[]> {
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select('id, reference, name, category, base_price, status, created_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (productsError || !productRows || productRows.length === 0) return [];

  const productIds = productRows.map((row) => row.id as string);

  const [{ data: variantRows }, { data: imageRows }] = await Promise.all([
    supabase.from('product_variants').select('id, product_id, stock').in('product_id', productIds),
    supabase.from('product_images').select('product_id, storage_path, is_primary, sort_order').in('product_id', productIds),
  ]);

  const variantsByProduct = new Map<string, SellerProductVariantSummary[]>();
  for (const row of variantRows ?? []) {
    const pid = row.product_id as string;
    const list = variantsByProduct.get(pid) ?? [];
    list.push({ id: row.id as string, stock: (row.stock as number) ?? 0 });
    variantsByProduct.set(pid, list);
  }

  const imagesByProduct = new Map<string, { storagePath: string; isPrimary: boolean; sortOrder: number }[]>();
  for (const row of imageRows ?? []) {
    const pid = row.product_id as string;
    const list = imagesByProduct.get(pid) ?? [];
    list.push({ storagePath: (row.storage_path as string) ?? '', isPrimary: Boolean(row.is_primary), sortOrder: (row.sort_order as number) ?? 0 });
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
      imageUrl: images[0] ? resolveImageUrl(images[0].storagePath) : '',
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

// === Edit-mode image sync (existing Supabase-synced product only) ===

export interface ExistingProductImage {
  id: string;
  storagePath: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

export async function fetchProductImages(productId: string): Promise<ExistingProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, storage_path, is_primary, sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    storagePath: (row.storage_path as string) ?? '',
    url: resolveImageUrl((row.storage_path as string) ?? ''),
    isPrimary: Boolean(row.is_primary),
    sortOrder: (row.sort_order as number) ?? 0,
  }));
}

export async function deleteProductImage(imageId: string, storagePath: string): Promise<{ error?: string }> {
  if (storagePath) {
    const { error: storageError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
    if (storageError) return { error: `Suppression du fichier impossible : ${storageError.message}` };
  }
  const { error: dbError } = await supabase.from('product_images').delete().eq('id', imageId);
  if (dbError) return { error: `Suppression de l'image impossible : ${dbError.message}` };
  return {};
}

// Adds newly-selected photos to an already-Supabase-synced product during
// an edit — mirrors the create flow's upload step, but for a product that
// already has an id. sortOrderStart lets new photos append after whatever
// existing images are already there.
export async function addProductImages(
  productId: string,
  images: NewProductImage[],
  sortOrderStart: number,
  markFirstAsPrimary: boolean,
): Promise<{ error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) return { error: 'Session vendeur expirée. Reconnectez-vous et réessayez.' };

  const uploadResult = await uploadImages(uid, productId, images);
  if ('error' in uploadResult) return { error: uploadResult.error };

  const imageRows = uploadResult.paths.map((storagePath, i) => ({
    product_id: productId,
    storage_path: storagePath,
    is_primary: markFirstAsPrimary && i === 0,
    sort_order: sortOrderStart + i,
  }));
  const { error: imagesError } = await supabase.from('product_images').insert(imageRows);
  if (imagesError) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(uploadResult.paths);
    return { error: `Impossible d'enregistrer les nouvelles images : ${imagesError.message}` };
  }
  return {};
}
