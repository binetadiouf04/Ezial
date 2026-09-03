import { supabase } from './supabaseClient';
import type { Product, VariantOption, VariantPrice } from '@/data/products';
import type { Shop } from '@/data/shops';
import type { CategoryId } from '@/data/categories';

// Reads the real catalog from Supabase and adapts it to the exact `Product` /
// `Shop` shapes the frontend already uses (src/data/products.ts,
// src/data/shops.ts). This is preparation only: nothing in the app calls
// this yet, src/data/products.ts is still the live source, and no display
// code has been touched.
//
// Column names below match the verified live schema exactly — no guessed
// or nonexistent columns (no old_price, no review_count, etc.).
//
// Relies entirely on the existing RLS policies to scope `shops` and
// `products` to active rows — no client-side status filter is applied
// here (the exact "active" value isn't known from the column list alone,
// and RLS already enforces it correctly).
//
//   public.shops:            id, owner_id, name, slug, description, phone,
//                             neighborhood, address_text, logo_url,
//                             cover_url, status, seller_code, pin_hash,
//                             active_product_limit, created_at, updated_at
//   public.products:         id, shop_id, reference, name, description,
//                             category, subcategory, base_price, status,
//                             is_promo, promo_price, promo_start, promo_end,
//                             created_at, updated_at
//   public.product_images:   id, product_id, storage_path, is_primary,
//                             sort_order, created_at
//   public.product_variants: id, product_id, attributes (jsonb), price,
//                             stock, created_at, updated_at
//
// Frontend fields with no Supabase equivalent at all come back as a neutral
// default (see the mapping functions below) rather than an invented column.

// product_images.storage_path is a Supabase Storage path, not a URL. The
// bucket it lives in isn't part of the schema given for this step — this
// name is an unconfirmed guess and must be checked against the real bucket
// (Supabase dashboard → Storage) before this is relied on.
const PRODUCT_IMAGES_BUCKET = 'product-images';

function resolveImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  if (/^https?:\/\//.test(storagePath)) return storagePath; // already a full URL
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

interface ShopRow {
  id: string;
  owner_id?: string | null;
  name: string;
  slug?: string | null;
  description?: string | null;
  phone?: string | null;
  neighborhood?: string | null;
  address_text?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  status?: string | null;
  seller_code?: string | null;
  pin_hash?: string | null;
  active_product_limit?: number | null;
  created_at?: string;
  updated_at?: string;
}

interface ProductRow {
  id: string;
  shop_id: string;
  reference?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  base_price: number;
  status?: string | null;
  is_promo?: boolean | null;
  promo_price?: number | null;
  promo_start?: string | null;
  promo_end?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ProductImageRow {
  id: string;
  product_id: string;
  storage_path?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
  created_at?: string;
}

interface ProductVariantRow {
  id: string;
  product_id: string;
  attributes: Record<string, unknown> | null;
  price?: number | null;
  stock?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseCatalogResult {
  products: Product[];
  shops: Shop[];
  /** One message per failed query/step — non-fatal, partial results are still returned. */
  errors: string[];
}

function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    banner: row.cover_url ?? '',
    logo: row.logo_url ?? '',
    // No Supabase equivalent — neutral defaults, not invented columns.
    followers: 0,
    description: row.description ?? '',
    city: '',
    rating: 0,
    reviewCount: 0,
    address: row.address_text ?? '',
    pickupEnabled: false,
    pickupEta: '',
  };
}

function imagesForProduct(productId: string, imageRows: ProductImageRow[]): string[] {
  return imageRows
    .filter((img) => img.product_id === productId)
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img) => resolveImageUrl(img.storage_path ?? ''))
    .filter(Boolean);
}

function variantRowsForProduct(productId: string, variantRows: ProductVariantRow[]): ProductVariantRow[] {
  return variantRows.filter((row) => row.product_id === productId && row.attributes);
}

/** Attribute names + the distinct values seen across all variant rows, for rendering selectable options. */
function variantOptionsForProduct(productId: string, variantRows: ProductVariantRow[]): VariantOption[] {
  const grouped = new Map<string, string[]>();
  for (const row of variantRowsForProduct(productId, variantRows)) {
    for (const [name, value] of Object.entries(row.attributes ?? {})) {
      if (typeof value !== 'string') continue;
      const values = grouped.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      grouped.set(name, values);
    }
  }
  return [...grouped.entries()].map(([name, values]) => ({ name, values }));
}

/** Each row is one full attribute combination with its own price/stock — maps 1:1 to VariantPrice. */
function variantPricesForProduct(productId: string, variantRows: ProductVariantRow[]): VariantPrice[] {
  return variantRowsForProduct(productId, variantRows).map((row) => ({
    conditions: row.attributes as Record<string, string>,
    price: row.price ?? 0,
    stock: row.stock ?? undefined,
  }));
}

function isPromoActive(row: ProductRow): boolean {
  if (!row.is_promo) return false;
  const now = Date.now();
  if (row.promo_start && now < new Date(row.promo_start).getTime()) return false;
  if (row.promo_end && now > new Date(row.promo_end).getTime()) return false;
  return true;
}

function mapProduct(row: ProductRow, imageRows: ProductImageRow[], variantRows: ProductVariantRow[]): Product {
  const promoActive = isPromoActive(row);
  const images = imagesForProduct(row.id, imageRows);
  const variants = variantRowsForProduct(row.id, variantRows);
  const stockFromVariants = variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);

  return {
    id: row.id,
    reference: row.reference ?? '',
    name: row.name,
    shopId: row.shop_id,
    category: (row.category ?? '') as CategoryId,
    subcategory: row.subcategory ?? '',
    price: promoActive ? (row.promo_price ?? row.base_price) : row.base_price,
    oldPrice: promoActive ? row.base_price : undefined,
    images: images.length > 0 ? images : [''],
    // No Supabase equivalent — neutral defaults, not invented columns.
    rating: undefined,
    reviewCount: undefined,
    // products has no stock column in this schema — stock lives on
    // product_variants. Summed here when the product has variants; a
    // product with none has no stock source at all, so it defaults to 0.
    stock: variants.length > 0 ? stockFromVariants : 0,
    variants: variantOptionsForProduct(row.id, variantRows),
    description: row.description ?? '',
    details: [], // no Supabase source (not part of this step's tables)
    delivery: '',
    pickup: undefined,
    isNew: undefined,
    isTrending: undefined,
    isPromo: promoActive,
    reviews: [], // no Supabase source (not part of this step's tables)
    variantPrices: variantPricesForProduct(row.id, variantRows),
    texture: undefined,
    hairMaterial: undefined,
    gender: undefined,
    shoeGender: undefined,
  };
}

/**
 * Centralized fetch: active shops + active products (with their images and
 * variants), already adapted to the frontend's Product/Shop shapes.
 *
 * Four separate queries joined client-side by id, rather than one nested
 * PostgREST select — more resilient to unknown/ambiguous foreign key setups
 * on a schema this code hasn't queried directly before.
 */
export async function fetchActiveCatalogFromSupabase(): Promise<SupabaseCatalogResult> {
  const errors: string[] = [];

  const [shopsRes, productsRes] = await Promise.all([
    supabase.from('shops').select('*'),
    supabase.from('products').select('*'),
  ]);

  if (shopsRes.error) errors.push(`shops: ${shopsRes.error.message}`);
  if (productsRes.error) errors.push(`products: ${productsRes.error.message}`);

  const shopRows = (shopsRes.data ?? []) as ShopRow[];
  const productRows = (productsRes.data ?? []) as ProductRow[];
  const productIds = productRows.map((p) => p.id);

  let imageRows: ProductImageRow[] = [];
  let variantRows: ProductVariantRow[] = [];

  if (productIds.length > 0) {
    const [imagesRes, variantsRes] = await Promise.all([
      supabase.from('product_images').select('*').in('product_id', productIds),
      supabase.from('product_variants').select('*').in('product_id', productIds),
    ]);
    if (imagesRes.error) errors.push(`product_images: ${imagesRes.error.message}`);
    if (variantsRes.error) errors.push(`product_variants: ${variantsRes.error.message}`);
    imageRows = (imagesRes.data ?? []) as ProductImageRow[];
    variantRows = (variantsRes.data ?? []) as ProductVariantRow[];
  }

  return {
    shops: shopRows.map(mapShop),
    products: productRows.map((row) => mapProduct(row, imageRows, variantRows)),
    errors,
  };
}
