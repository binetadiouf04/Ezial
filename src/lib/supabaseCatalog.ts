import { supabase } from './supabaseClient';
import type { Product, VariantOption } from '@/data/products';
import type { Shop } from '@/data/shops';
import type { CategoryId } from '@/data/categories';

// Reads the real catalog from Supabase and adapts it to the exact `Product` /
// `Shop` shapes the frontend already uses (src/data/products.ts,
// src/data/shops.ts). This is preparation only: nothing in the app calls
// this yet, src/data/products.ts is still the live source, and no display
// code has been touched. It's meant to make the eventual swap a small,
// mechanical change once this is wired in.
//
// Relies entirely on the existing RLS policies to scope `shops` and
// `products` to active rows — no client-side status/is_active filter is
// applied here, so it stays correct regardless of the exact column name
// those policies check.
//
// Schema assumptions (adjust the field lookups below if your actual column
// names differ — this was written without direct access to the live
// schema):
//   public.shops:            id, name, banner, logo, followers, description,
//                             city, rating, review_count, address,
//                             pickup_enabled, pickup_eta
//   public.products:         id, reference, name, shop_id, category,
//                             subcategory, price, old_price, stock,
//                             description, rating, review_count, delivery,
//                             pickup, is_new, is_trending, is_promo,
//                             texture, hair_material, gender, shoe_gender
//   public.product_images:   id, product_id, url, sort_order, is_primary
//   public.product_variants: id, product_id, name, value, sort_order
//
// `details` and `reviews` (both part of the frontend Product shape) have no
// Supabase source yet — only the four tables above were in scope for this
// step — so they come back empty until a dedicated table exists for them.

interface ShopRow {
  id: string;
  name: string;
  banner?: string | null;
  logo?: string | null;
  followers?: number | null;
  description?: string | null;
  city?: string | null;
  rating?: number | null;
  review_count?: number | null;
  address?: string | null;
  pickup_enabled?: boolean | null;
  pickup_eta?: string | null;
  [key: string]: unknown;
}

interface ProductRow {
  id: string;
  reference?: string | null;
  name: string;
  shop_id: string;
  category?: string | null;
  subcategory?: string | null;
  price: number;
  old_price?: number | null;
  stock?: number | null;
  description?: string | null;
  rating?: number | null;
  review_count?: number | null;
  delivery?: string | null;
  pickup?: string | null;
  is_new?: boolean | null;
  is_trending?: boolean | null;
  is_promo?: boolean | null;
  texture?: string | null;
  hair_material?: string | null;
  gender?: string | null;
  shoe_gender?: string | null;
  [key: string]: unknown;
}

interface ProductImageRow {
  id: string;
  product_id: string;
  url?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
  is_primary?: boolean | null;
  [key: string]: unknown;
}

interface ProductVariantRow {
  id: string;
  product_id: string;
  name?: string | null;
  variant_name?: string | null;
  value?: string | null;
  variant_value?: string | null;
  sort_order?: number | null;
  [key: string]: unknown;
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
    banner: row.banner ?? '',
    logo: row.logo ?? '',
    followers: row.followers ?? 0,
    description: row.description ?? '',
    city: row.city ?? '',
    rating: row.rating ?? 0,
    reviewCount: row.review_count ?? 0,
    address: row.address ?? '',
    pickupEnabled: row.pickup_enabled ?? false,
    pickupEta: row.pickup_eta ?? '',
  };
}

function imagesForProduct(productId: string, imageRows: ProductImageRow[]): string[] {
  return imageRows
    .filter((img) => img.product_id === productId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    .map((img) => img.url ?? img.image_url ?? '')
    .filter(Boolean);
}

function variantsForProduct(productId: string, variantRows: ProductVariantRow[]): VariantOption[] {
  const grouped = new Map<string, string[]>();
  for (const row of variantRows) {
    if (row.product_id !== productId) continue;
    const name = row.name ?? row.variant_name;
    const value = row.value ?? row.variant_value;
    if (!name || !value) continue;
    const values = grouped.get(name) ?? [];
    if (!values.includes(value)) values.push(value);
    grouped.set(name, values);
  }
  return [...grouped.entries()].map(([name, values]) => ({ name, values }));
}

function mapProduct(row: ProductRow, imageRows: ProductImageRow[], variantRows: ProductVariantRow[]): Product {
  const images = imagesForProduct(row.id, imageRows);
  return {
    id: row.id,
    reference: row.reference ?? '',
    name: row.name,
    shopId: row.shop_id,
    category: (row.category ?? '') as CategoryId,
    subcategory: row.subcategory ?? '',
    price: row.price,
    oldPrice: row.old_price ?? undefined,
    images: images.length > 0 ? images : [''],
    rating: row.rating ?? undefined,
    reviewCount: row.review_count ?? undefined,
    stock: row.stock ?? 0,
    variants: variantsForProduct(row.id, variantRows),
    description: row.description ?? '',
    details: [], // no Supabase source yet (not part of this step's tables)
    delivery: row.delivery ?? '',
    pickup: row.pickup ?? undefined,
    isNew: row.is_new ?? undefined,
    isTrending: row.is_trending ?? undefined,
    isPromo: row.is_promo ?? undefined,
    reviews: [], // no Supabase source yet (not part of this step's tables)
    texture: row.texture ?? undefined,
    hairMaterial: row.hair_material ?? undefined,
    gender: row.gender === 'femme' || row.gender === 'homme' ? row.gender : undefined,
    shoeGender: row.shoe_gender === 'femme' || row.shoe_gender === 'homme' ? row.shoe_gender : undefined,
  };
}

/**
 * Centralized fetch: active shops + active products (with their images and
 * variants), already adapted to the frontend's Product/Shop shapes.
 *
 * Four separate queries joined client-side by id, rather than one nested
 * PostgREST select — more resilient to unknown/ambiguous foreign key setups
 * on a schema this code hasn't seen directly.
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
