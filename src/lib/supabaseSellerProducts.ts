import { supabase } from './supabaseClient';
import { PRODUCT_IMAGES_BUCKET, resolveImageUrl } from './supabaseCatalog';

// Writes a seller-created product to Supabase: products, then
// product_variants, then the image uploads + product_images. Each step
// only runs after the previous one succeeded, and any failure rolls back
// everything created so far (best-effort — the Supabase JS client has no
// real cross-table transaction, so this is a manual compensating-delete
// chain, not a real ROLLBACK).

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
  reference: string;
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
}

export interface CreateProductError {
  error: string;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo';
}

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

async function cleanupFailedProduct(productId: string, uploadedPaths: string[]): Promise<void> {
  if (uploadedPaths.length > 0) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(uploadedPaths);
  }
  await supabase.from('product_images').delete().eq('product_id', productId);
  await supabase.from('product_variants').delete().eq('product_id', productId);
  await supabase.from('products').delete().eq('id', productId);
}

export async function createProductInSupabase(
  input: CreateProductInput,
): Promise<CreateProductResult | CreateProductError> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (userError || !uid) {
    return { error: 'Session vendeur expirée. Reconnectez-vous et réessayez.' };
  }

  const { data: productRow, error: productError } = await supabase
    .from('products')
    .insert({
      shop_id: input.shopId,
      reference: input.reference,
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

  if (productError || !productRow) {
    return { error: `Impossible de créer le produit : ${productError?.message ?? 'erreur inconnue'}.` };
  }
  const productId = productRow.id as string;

  const variantRows = input.variants.map((v) => ({
    product_id: productId,
    attributes: v.attributes,
    price: v.price,
    stock: v.stock,
  }));
  const { error: variantsError } = await supabase.from('product_variants').insert(variantRows);
  if (variantsError) {
    await cleanupFailedProduct(productId, []);
    return { error: `Impossible d'enregistrer les variantes : ${variantsError.message}. Le produit n'a pas été créé.` };
  }

  if (input.images.length > 0) {
    const uploadResult = await uploadImages(uid, productId, input.images);
    if ('error' in uploadResult) {
      await cleanupFailedProduct(productId, uploadResult.uploadedSoFar);
      return { error: `${uploadResult.error} Le produit n'a pas été enregistré.` };
    }

    const imageRows = uploadResult.paths.map((storagePath, i) => ({
      product_id: productId,
      storage_path: storagePath,
      is_primary: i === 0,
      sort_order: i,
    }));
    const { error: imagesError } = await supabase.from('product_images').insert(imageRows);
    if (imagesError) {
      await cleanupFailedProduct(productId, uploadResult.paths);
      return { error: `Impossible d'enregistrer les images : ${imagesError.message}. Le produit n'a pas été enregistré.` };
    }
  }

  return { productId };
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
