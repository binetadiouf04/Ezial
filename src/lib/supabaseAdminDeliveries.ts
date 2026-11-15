import { supabase } from './supabaseClient';
import { resolveSecurePhotoUrl } from './secureStorage';
import {
  buildAdminDeliveries,
  type AdminDelivery, type MissionRow, type StopRow, type OrderRow, type ShopRow, type DriverRow,
} from './adminDeliveriesCore';

// Livraisons réelles de l'espace administrateur : delivery_missions,
// delivery_stops, orders, shops et profils des livreurs, lus avec les règles
// d'accès « administrateur » déjà en place (aucune migration SQL). Remplace
// la liste de démonstration qui s'affichait auparavant.
const MAX_DELIVERIES = 200;

export async function fetchAdminDeliveries(): Promise<{ deliveries: AdminDelivery[] } | { error: string }> {
  const { data: missionRows, error } = await supabase
    .from('delivery_missions')
    .select('id, order_id, driver_id, status, proof_photo_path, accepted_at, delivered_at, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_DELIVERIES);
  if (error) return { error: 'Impossible de charger les livraisons. Réessayez.' };
  const missions = (missionRows ?? []) as MissionRow[];
  if (missions.length === 0) return { deliveries: [] };

  const missionIds = missions.map((m) => m.id);
  const orderIds = [...new Set(missions.map((m) => m.order_id))];
  const driverIds = [...new Set(missions.map((m) => m.driver_id).filter((id): id is string => Boolean(id)))];

  const [stopsRes, ordersRes, driversRes] = await Promise.all([
    supabase.from('delivery_stops').select('id, mission_id, shop_id, stop_order, status, picked_up_at').in('mission_id', missionIds),
    supabase.from('orders').select('id, order_number, first_name, last_name, phone, neighborhood, delivery_address, preferred_delivery_slot').in('id', orderIds),
    driverIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name, username').in('id', driverIds)
      : Promise.resolve({ data: [] as DriverRow[], error: null }),
  ]);
  if (stopsRes.error || ordersRes.error || driversRes.error) return { error: 'Impossible de charger le détail des livraisons. Réessayez.' };

  const stops = (stopsRes.data ?? []) as StopRow[];
  const shopIds = [...new Set(stops.map((s) => s.shop_id).filter((id): id is string => Boolean(id)))];
  const shopsRes = shopIds.length > 0
    ? await supabase.from('shops').select('id, name, address_text, neighborhood').in('id', shopIds)
    : { data: [] as ShopRow[], error: null };

  return {
    deliveries: buildAdminDeliveries(
      missions, stops, (ordersRes.data ?? []) as OrderRow[], (shopsRes.data ?? []) as ShopRow[], (driversRes.data ?? []) as DriverRow[],
    ),
  };
}

/** Lien temporaire (10 minutes) vers la photo de preuve : le dossier est privé, aucun lien durable n'existe. */
export async function fetchDeliveryProofUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  return (await resolveSecurePhotoUrl(path)) ?? null;
}
