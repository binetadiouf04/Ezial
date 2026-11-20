import { supabase } from './supabaseClient';
import { dedupeDeliveryPlaces, type DeliveryOrderRow, type RecentDeliveryPlace } from './recentDeliveryPlaces';

/** Dernières adresses de livraison du client connecté (ses commandes non cadeau, avec position). */
export async function fetchRecentDeliveryPlaces(customerId: string): Promise<RecentDeliveryPlace[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('delivery_latitude, delivery_longitude, delivery_address, delivery_notes, neighborhood')
    .eq('customer_id', customerId)
    .eq('is_gift', false)
    .not('delivery_latitude', 'is', null)
    .not('delivery_longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return dedupeDeliveryPlaces(data as DeliveryOrderRow[]);
}
