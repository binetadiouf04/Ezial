import { supabase } from './supabaseClient';
import { fetchUrgentOrderIds } from './supabaseUrgentDelivery';
import { uploadSecurePhoto, resolveSecurePhotoUrl } from './secureStorage';
import { optimizeImageFile } from '@/utils/imageOptimize';
import { isRpcMissing } from './supabaseFeatureDetect';
import {
  MISSION_STATUS,
  STOP_STATUS,
  buildDriverMission,
  buildAvailableMissionFromRpc,
  isMissionAssigned,
  type AvailableMissionRpcRow,
  type DriverMissionRow,
  type MissionCustomer,
  type MissionDestination,
  type MissionStop,
} from './driverMissionsCore';
import type { Mission } from '@/pro/data';

// Real driver missions, backed by delivery_missions / delivery_stops /
// orders / shops. Mapped into the Mission shape the driver UI renders
// (mapping pur et testé : driverMissionsCore.ts).
//
// Confidentialité (25 nov. 2026) : une mission encore disponible ne montre
// jamais le téléphone, le nom ni l'e-mail du client. Ses informations
// viennent de la fonction serveur driver_available_missions(), qui ne
// renvoie que le lieu de livraison, le créneau, l'urgence et les boutiques.
// La lecture directe de la commande (téléphone compris) ne sert qu'aux
// missions attribuées au livreur connecté, seules autorisées par la RLS
// après docs/sql/livreur-telephone-masque.sql.
export { MISSION_STATUS };

interface DeliveryMissionRow extends DriverMissionRow {
  proof_photo_path: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
}

interface DeliveryStopRow {
  id: string;
  mission_id: string;
  shop_id: string | null;
  stop_order: number;
  status: string;
  picked_up_at: string | null;
}

interface ShopRow {
  id: string;
  name: string;
  neighborhood: string | null;
  address_text: string | null;
  latitude: number | null;
  longitude: number | null;
}

type OrderRow = MissionDestination & Partial<MissionCustomer> & { id: string };

// Colonnes sans aucune coordonnée du client : seules lues pour une mission
// non attribuée (repli tant que la fonction serveur n'est pas installée).
const DESTINATION_COLUMNS = 'id, order_number, neighborhood, delivery_address, delivery_latitude, delivery_longitude, preferred_delivery_slot, preferred_delivery_date';
// Mission attribuée au livreur : il doit pouvoir joindre le client.
const ASSIGNED_ORDER_COLUMNS = `${DESTINATION_COLUMNS}, first_name, last_name, phone`;

async function fetchAvailableMissionsFromServer(): Promise<{ missions: Mission[] } | { unavailable: true }> {
  const { data, error } = await supabase.rpc('driver_available_missions');
  if (error) {
    // Fonction pas encore installée (migration non exécutée) ou erreur :
    // repli sur la lecture directe, limitée aux colonnes sans coordonnées.
    if (!isRpcMissing(error)) console.warn('driver_available_missions :', error.message);
    return { unavailable: true };
  }
  return { missions: ((data ?? []) as AvailableMissionRpcRow[]).map(buildAvailableMissionFromRpc) };
}

// Lecture directe (missions attribuées, et missions disponibles en repli).
async function fetchMissionsDirect(rows: DeliveryMissionRow[]): Promise<Mission[]> {
  if (rows.length === 0) return [];
  const missionIds = rows.map((r) => r.id);
  const assignedOrderIds = [...new Set(rows.filter(isMissionAssigned).map((r) => r.order_id))];
  const unassignedOrderIds = [...new Set(rows.filter((r) => !isMissionAssigned(r)).map((r) => r.order_id))];
  const allOrderIds = [...new Set(rows.map((r) => r.order_id))];

  const [{ data: stopRows }, { data: assignedOrders }, { data: unassignedOrders }, urgentOrderIds] = await Promise.all([
    supabase.from('delivery_stops').select('id, mission_id, shop_id, stop_order, status, picked_up_at').in('mission_id', missionIds).order('stop_order', { ascending: true }),
    assignedOrderIds.length > 0
      ? supabase.from('orders').select(ASSIGNED_ORDER_COLUMNS).in('id', assignedOrderIds)
      : Promise.resolve({ data: [] as OrderRow[] }),
    unassignedOrderIds.length > 0
      ? supabase.from('orders').select(DESTINATION_COLUMNS).in('id', unassignedOrderIds)
      : Promise.resolve({ data: [] as OrderRow[] }),
    fetchUrgentOrderIds(allOrderIds),
  ]);

  const stops = (stopRows ?? []) as DeliveryStopRow[];
  const shopIds = [...new Set(stops.map((s) => s.shop_id).filter((id): id is string => Boolean(id)))];
  const { data: shopRows } = shopIds.length > 0
    ? await supabase.from('shops').select('id, name, neighborhood, address_text, latitude, longitude').in('id', shopIds)
    : { data: [] as ShopRow[] };

  const shopsById = new Map(((shopRows ?? []) as ShopRow[]).map((s) => [s.id, s]));
  const ordersById = new Map(
    [...((unassignedOrders ?? []) as OrderRow[]), ...((assignedOrders ?? []) as OrderRow[])].map((o) => [o.id, o]),
  );
  const stopsByMission = new Map<string, MissionStop[]>();
  for (const stop of stops) {
    const shop = stop.shop_id ? shopsById.get(stop.shop_id) : undefined;
    const list = stopsByMission.get(stop.mission_id) ?? [];
    list.push({
      stop_id: stop.id,
      shop_id: stop.shop_id,
      stop_order: stop.stop_order,
      status: stop.status,
      picked_up_at: stop.picked_up_at,
      shop_name: shop?.name ?? null,
      shop_neighborhood: shop?.neighborhood ?? null,
      shop_address: shop?.address_text ?? null,
      shop_latitude: shop?.latitude ?? null,
      shop_longitude: shop?.longitude ?? null,
    });
    stopsByMission.set(stop.mission_id, list);
  }

  const proofUrlsByMissionId = new Map<string, string>();
  await Promise.all(rows.map(async (row) => {
    if (!row.proof_photo_path) return;
    const url = await resolveSecurePhotoUrl(row.proof_photo_path);
    if (url) proofUrlsByMissionId.set(row.id, url);
  }));

  return rows.map((row) => {
    const order = ordersById.get(row.order_id);
    return buildDriverMission({
      row,
      destination: order,
      customer: isMissionAssigned(row) && order
        ? { first_name: order.first_name ?? null, last_name: order.last_name ?? null, phone: order.phone ?? null }
        : undefined,
      stops: stopsByMission.get(row.id) ?? [],
      urgent: urgentOrderIds.has(row.order_id),
      proofPhoto: proofUrlsByMissionId.get(row.id),
    });
  });
}

// Every mission the signed-in driver can currently see: their own
// (accepted/out_for_delivery/delivered) plus every still-unclaimed one,
// never a broader fetch than what the RLS policies already allow.
export async function fetchDriverMissions(): Promise<Mission[]> {
  const [{ data: missionRows, error: missionsError }, available] = await Promise.all([
    supabase
      .from('delivery_missions')
      .select('id, order_id, driver_id, status, proof_photo_path, accepted_at, picked_up_at, delivered_at, created_at')
      .order('created_at', { ascending: false }),
    fetchAvailableMissionsFromServer(),
  ]);
  if (missionsError) return [];

  const rows = (missionRows ?? []) as DeliveryMissionRow[];
  const assignedRows = rows.filter(isMissionAssigned);

  let missions: Mission[];
  if ('missions' in available) {
    // Une mission acceptée entre les deux lectures n'apparaît qu'une fois, comme attribuée.
    const assignedIds = new Set(assignedRows.map((r) => r.id));
    missions = [
      ...await fetchMissionsDirect(assignedRows),
      ...available.missions.filter((m) => !assignedIds.has(m.id)),
    ];
  } else {
    missions = await fetchMissionsDirect(rows);
  }
  return missions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function acceptDeliveryMission(missionId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('accept_delivery_mission', { p_mission_id: missionId });
  return error ? { error: error.message } : {};
}

// Same silent-RLS-rejection guard as the stock fix: without .select(),
// Supabase returns success even when 0 rows actually matched.
export async function markStopCollected(stopId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from('delivery_stops')
    .update({ status: STOP_STATUS.pickedUp, picked_up_at: new Date().toISOString() })
    .eq('id', stopId)
    .select('id');
  if (error) return { error: error.message };
  if ((data?.length ?? 0) === 0) return { error: 'Impossible de confirmer la récupération (droits d\'accès).' };
  return {};
}

export async function startMissionDelivery(missionId: string): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from('delivery_missions')
    .update({ status: MISSION_STATUS.outForDelivery })
    .eq('id', missionId)
    .select('id');
  if (error) return { error: error.message };
  if ((data?.length ?? 0) === 0) return { error: "Impossible de démarrer la livraison (droits d'accès)." };
  return {};
}

// Compresses the proof photo before upload (same treatment as every other
// image in the app) — never a raw 5-10 Mo phone camera file.
const PROOF_PHOTO_MAX_DIMENSION = 1280;

// Le code de livraison du client n'est jamais lu par le navigateur du
// livreur : seul le serveur (driver_complete_delivery) le connaît et le
// compare, compte les erreurs et bloque après plusieurs codes incorrects.
export async function completeMissionDelivery(
  missionId: string,
  driverId: string,
  deliveryCode: string,
  proofPhotoFile: File,
): Promise<{ error?: string }> {
  const optimized = await optimizeImageFile(proofPhotoFile, PROOF_PHOTO_MAX_DIMENSION);
  const token = Math.random().toString(36).slice(2, 8);
  // The secure-photos bucket's storage policies require the path's first
  // folder segment to equal auth.uid() — driverId here must be the real
  // auth uid, or the upload is silently rejected by storage RLS.
  const path = `${driverId}/delivery-proofs/${missionId}-${token}.webp`;
  const { error: uploadError } = await uploadSecurePhoto(path, optimized);
  if (uploadError) return { error: `Envoi de la preuve photo impossible : ${uploadError}` };

  // Le serveur vérifie la mission, le code client et la preuve photo, puis
  // enregistre la livraison : c'est lui qui décide.
  const { data, error } = await supabase.rpc('driver_complete_delivery', {
    p_mission_id: missionId,
    p_delivery_code: deliveryCode,
    p_proof_photo_path: path,
  });
  if (error) {
    if (isRpcMissing(error)) return { error: 'La confirmation de livraison est momentanément indisponible. Contactez Ezial.' };
    return { error: error.code === 'P0001' ? error.message : 'Impossible de confirmer la livraison. Réessayez dans un instant.' };
  }
  // Code incorrect ou blocage temporaire : le serveur répond sans erreur
  // technique, avec le message à afficher.
  const result = (data ?? {}) as { delivered?: boolean; alreadyDelivered?: boolean; error?: string };
  if (result.delivered === true || result.alreadyDelivered === true) return {};
  return { error: result.error ?? 'Impossible de confirmer la livraison. Réessayez dans un instant.' };
}
