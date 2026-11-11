import { supabase } from './supabaseClient';

// Products a shop had to take offline because it went back to the Free limit
// (end of the Ezial Plus trial or subscription, see
// process_subscription_expirations): products.plan_unpublished_at is set by
// the server, never by the browser, and cleared as soon as the product is
// back online. Read separately so that, until the migration that adds the
// column has run, everything else keeps working and the selection screen
// simply stays hidden (supported = false).
export interface PlanUnpublishedState { supported: boolean; ids: string[] }

export async function fetchPlanUnpublishedProducts(shopId: string): Promise<PlanUnpublishedState> {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('shop_id', shopId)
    .is('archived_at', null)
    .not('plan_unpublished_at', 'is', null);
  if (error) return { supported: false, ids: [] };
  return { supported: true, ids: (data ?? []).map((r) => r.id as string) };
}

// Publishes exactly these products and takes the shop's other published
// products offline (nothing is deleted). The plan's limit, ownership and
// which products may be chosen are all checked server-side
// (choose_published_products).
export async function choosePublishedProducts(productIds: string[]): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('choose_published_products', { p_product_ids: productIds });
  if (!error) return {};
  if (error.code === 'P0001') return { error: error.message };
  if (error.code === 'PGRST202' || error.code === '42883') return { error: 'Cette fonction n’est pas encore disponible. Utilisez « Activer » / « Désactiver » dans la liste des produits.' };
  return { error: 'Enregistrement impossible. Vérifiez votre connexion et réessayez.' };
}
