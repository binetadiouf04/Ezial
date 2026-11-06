import { supabase } from './supabaseClient';
import { resolveImageUrl } from './supabaseCatalog';
import { EDITORIAL_PICKS_MAX, isMissingEditorialTable } from './supabaseEditorial';

// Admin management of the "Sélection Ezial" (public.editorial_picks).
// Every rule is enforced by the database — RLS (admins only), the
// editorial_picks_validate() trigger (active product of an active Ezial Plus
// shop, 12 items at most) and the unique product constraint — so these
// helpers only translate its answers into clear French messages.

export { EDITORIAL_PICKS_MAX };

export interface AdminEditorialProduct {
  id: string;
  name: string;
  reference: string;
  shopId: string;
  shopName: string;
  imageUrl: string;
  price: number;
  /** products.status — 'active' for a published product. */
  status: string;
  /** Shop currently Ezial Plus (active_premium_shop_ids()). */
  shopIsPlus: boolean;
}

export interface AdminEditorialPick {
  id: string;
  productId: string;
  sortOrder: number;
  createdAt: string;
  /** null when the product no longer exists or can't be read. */
  product: AdminEditorialProduct | null;
}

export interface AdminEditorialData {
  picks: AdminEditorialPick[];
  /** Active products of the shops currently Ezial Plus, not yet selected. */
  eligible: AdminEditorialProduct[];
  /** The migration hasn't been run yet. */
  missingTable?: boolean;
  error?: string;
}

export const EDITORIAL_TABLE_MISSING_MESSAGE =
  'La Sélection Ezial n’est pas encore installée : la migration SQL doit d’abord être exécutée dans Supabase.';

interface SupabaseLikeError { code?: string; message?: string }

function editorialErrorMessage(error: SupabaseLikeError): string {
  if (isMissingEditorialTable(error)) return EDITORIAL_TABLE_MISSING_MESSAGE;
  if (error.code === '23505') return 'Ce produit fait déjà partie de la Sélection Ezial.';
  if (error.code === '23503') return 'Produit introuvable : il a peut-être été supprimé.';
  // Raised by editorial_picks_validate(): already a clear French sentence.
  if (error.code === 'P0001' && error.message) return error.message;
  const message = error.message ?? '';
  if (error.code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'Action réservée aux administrateurs Ezial. Reconnectez-vous avec un compte administrateur.';
  }
  return `Une erreur est survenue : ${message || 'erreur inconnue'}.`;
}

interface PickRow { id: string; product_id: string; sort_order: number; created_at: string }
interface ProductRow { id: string; name: string; reference: string | null; shop_id: string; base_price: number; status: string }
interface ShopRow { id: string; name: string }
interface ImageRow { product_id: string; storage_path: string | null; thumbnail_storage_path?: string | null; is_primary: boolean | null; sort_order: number | null; media_type?: string | null }

const PRODUCT_COLUMNS = 'id, name, reference, shop_id, base_price, status';

/** Selection (in order) plus the products that can still be added. */
export async function fetchAdminEditorialData(): Promise<AdminEditorialData> {
  try {
    const picksRes = await supabase
      .from('editorial_picks')
      .select('id, product_id, sort_order, created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (picksRes.error) {
      if (isMissingEditorialTable(picksRes.error)) return { picks: [], eligible: [], missingTable: true };
      return { picks: [], eligible: [], error: editorialErrorMessage(picksRes.error) };
    }
    const pickRows = (picksRes.data ?? []) as PickRow[];

    const premiumRes = await supabase.rpc('active_premium_shop_ids');
    if (premiumRes.error) {
      return { picks: [], eligible: [], error: `Impossible de charger les boutiques Ezial Plus : ${premiumRes.error.message}.` };
    }
    const plusShopIds = new Set(((premiumRes.data ?? []) as string[]).map(String));

    const pickProductIds = pickRows.map((p) => p.product_id);
    const [eligibleRes, pickedRes] = await Promise.all([
      plusShopIds.size > 0
        ? supabase.from('products').select(PRODUCT_COLUMNS).in('shop_id', [...plusShopIds]).eq('status', 'active').order('name')
        : Promise.resolve({ data: [] as ProductRow[], error: null }),
      pickProductIds.length > 0
        ? supabase.from('products').select(PRODUCT_COLUMNS).in('id', pickProductIds)
        : Promise.resolve({ data: [] as ProductRow[], error: null }),
    ]);
    if (eligibleRes.error) return { picks: [], eligible: [], error: `Impossible de charger les produits : ${eligibleRes.error.message}.` };
    if (pickedRes.error) return { picks: [], eligible: [], error: `Impossible de charger les produits sélectionnés : ${pickedRes.error.message}.` };

    const productRows = new Map<string, ProductRow>();
    for (const row of [...((eligibleRes.data ?? []) as ProductRow[]), ...((pickedRes.data ?? []) as ProductRow[])]) productRows.set(row.id, row);

    const shopIds = [...new Set([...productRows.values()].map((p) => p.shop_id))];
    const productIds = [...productRows.keys()];
    const [shopsRes, imagesRes] = await Promise.all([
      shopIds.length > 0 ? supabase.from('shops').select('id, name').in('id', shopIds) : Promise.resolve({ data: [] as ShopRow[], error: null }),
      productIds.length > 0
        ? supabase.from('product_images').select('product_id, storage_path, thumbnail_storage_path, is_primary, sort_order, media_type').in('product_id', productIds)
        : Promise.resolve({ data: [] as ImageRow[], error: null }),
    ]);
    // Shop names and images are cosmetic here: a failure only leaves them blank.
    const shopNames = new Map(((shopsRes.data ?? []) as ShopRow[]).map((s) => [s.id, s.name]));
    const imageByProduct = new Map<string, string>();
    const images = ((imagesRes.data ?? []) as ImageRow[])
      .filter((img) => img.media_type !== 'video')
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const img of images) {
      if (imageByProduct.has(img.product_id)) continue;
      const url = resolveImageUrl(img.thumbnail_storage_path || img.storage_path || '');
      if (url) imageByProduct.set(img.product_id, url);
    }

    const toProduct = (row: ProductRow): AdminEditorialProduct => ({
      id: row.id,
      name: row.name,
      reference: row.reference ?? '',
      shopId: row.shop_id,
      shopName: shopNames.get(row.shop_id) ?? '',
      imageUrl: imageByProduct.get(row.id) ?? '',
      price: row.base_price,
      status: row.status,
      shopIsPlus: plusShopIds.has(row.shop_id),
    });

    const picks = pickRows.map((row) => {
      const productRow = productRows.get(row.product_id);
      return { id: row.id, productId: row.product_id, sortOrder: row.sort_order, createdAt: row.created_at, product: productRow ? toProduct(productRow) : null };
    });
    const picked = new Set(pickProductIds);
    const eligible = ((eligibleRes.data ?? []) as ProductRow[]).filter((row) => !picked.has(row.id)).map(toProduct);

    return { picks, eligible };
  } catch (e) {
    return { picks: [], eligible: [], error: `Une erreur est survenue : ${e instanceof Error ? e.message : 'erreur réseau'}.` };
  }
}

/** Adds a product at the end of the selection (sort_order set by the database). */
export async function addEditorialPick(productId: string): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.from('editorial_picks').insert({ product_id: productId });
    return error ? { error: editorialErrorMessage(error) } : {};
  } catch (e) {
    return { error: `Une erreur est survenue : ${e instanceof Error ? e.message : 'erreur réseau'}.` };
  }
}

export async function removeEditorialPick(pickId: string): Promise<{ error?: string }> {
  try {
    const { data, error } = await supabase.from('editorial_picks').delete().eq('id', pickId).select('id');
    if (error) return { error: editorialErrorMessage(error) };
    if (!data || data.length === 0) {
      return { error: 'Aucun produit retiré : il a peut-être déjà été retiré, ou votre compte n’a pas les droits administrateur.' };
    }
    return {};
  } catch (e) {
    return { error: `Une erreur est survenue : ${e instanceof Error ? e.message : 'erreur réseau'}.` };
  }
}

/** Saves the display order: each pick gets its index in `orderedPickIds`. */
export async function reorderEditorialPicks(orderedPickIds: string[]): Promise<{ error?: string }> {
  try {
    const results = await Promise.all(
      orderedPickIds.map((id, index) => supabase.from('editorial_picks').update({ sort_order: index }).eq('id', id).select('id')),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: editorialErrorMessage(failed.error) };
    if (results.some((r) => !r.data || r.data.length === 0)) {
      return { error: 'L’ordre n’a pas pu être enregistré entièrement : rechargez la page et réessayez.' };
    }
    return {};
  } catch (e) {
    return { error: `Une erreur est survenue : ${e instanceof Error ? e.message : 'erreur réseau'}.` };
  }
}
