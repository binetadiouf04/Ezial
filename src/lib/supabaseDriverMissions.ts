import { supabase } from './supabaseClient';
import { resolveImageUrl, PRODUCT_IMAGES_BUCKET } from './supabaseCatalog';
import { optimizeImageFile } from '@/utils/imageOptimize';
import type { Mission } from '@/pro/data';

// Real driver missions, backed by delivery_missions / delivery_stops /
// orders / shops — replaces the local mock array in pro/data.ts entirely.
// Mapped into the exact same Mission shape the driver UI already renders,
// so DriverHome/DriverMissions/DriverMissionDetail/DriverHistory needed no
// redesign, only a real data source.
//
// Status vocabulary chosen here (delivery_missions.status progression:
// available -> accepted -> in_delivery -> delivered) is this integration's
// own choice, not reverse-engineered from existing production data — the
// tables were empty except for the literal 'available' string already
// baked into the RLS policies (see accept_delivery_mission). Every status
// write in this file goes through the one set of constants below, so
// correcting a string later is a one-place change.
export const MISSION_STATUS = {
  available: 'available',
  accepted: 'accepted',
  inDelivery: 'in_delivery',
  delivered: 'delivered',
} as const;

const STOP_STATUS = {
  pending: 'pending',
  pickedUp: 'picked_up',
} as const;

interface DeliveryMissionRow {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: string;
  pickup_code: string | null;
  delivery_code: string | null;
  proof_photo_path: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface DeliveryStopRow {
  id: string;
  mission_id: string;
  shop_id: string | null;
  stop_order: number;
  status: string;
  picked_up_at: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  neighborhood: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  preferred_delivery_slot: string | null;
}

interface ShopRow {
  id: string;
  name: string;
  neighborhood: string | null;
  address_text: string | null;
  latitude: number | null;
  longitude: number | null;
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Client Ezial';
}

// Every mission the signed-in driver can currently see: their own
// (accepted/in_delivery/delivered) plus every still-unclaimed one, exactly
// mirroring the RLS policies on delivery_missions/delivery_stops/orders —
// never a broader fetch than what those policies already allow.
export async function fetchDriverMissions(): Promise<Mission[]> {
  const { data: missionRows, error: missionsError } = await supabase
    .from('delivery_missions')
    .select('id, order_id, driver_id, status, pickup_code, delivery_code, proof_photo_path, accepted_at, picked_up_at, delivered_at, created_at')
    .order('created_at', { ascending: false });
  if (missionsError || !missionRows || missionRows.length === 0) return [];

  const rows = missionRows as DeliveryMissionRow[];
  const missionIds = rows.map((r) => r.id);
  const orderIds = [...new Set(rows.map((r) => r.order_id))];

  const [{ data: stopRows }, { data: orderRows }] = await Promise.all([
    supabase.from('delivery_stops').select('id, mission_id, shop_id, stop_order, status, picked_up_at').in('mission_id', missionIds).order('stop_order', { ascending: true }),
    supabase.from('orders').select('id, order_number, first_name, last_name, phone, neighborhood, delivery_address, delivery_notes, delivery_latitude, delivery_longitude, preferred_delivery_slot').in('id', orderIds),
  ]);

  const stops = (stopRows ?? []) as DeliveryStopRow[];
  const shopIds = [...new Set(stops.map((s) => s.shop_id).filter((id): id is string => Boolean(id)))];
  const { data: shopRows } = shopIds.length > 0
    ? await supabase.from('shops').select('id, name, neighborhood, address_text, latitude, longitude').in('id', shopIds)
    : { data: [] as ShopRow[] };

  const shopsById = new Map((shopRows ?? []).map((s) => [s.id as string, s as ShopRow]));
  const ordersById = new Map((orderRows ?? []).map((o) => [o.id as string, o as OrderRow]));
  const stopsByMission = new Map<string, DeliveryStopRow[]>();
  for (const stop of stops) {
    const list = stopsByMission.get(stop.mission_id) ?? [];
    list.push(stop);
    stopsByMission.set(stop.mission_id, list);
  }

  return rows.map((row): Mission => {
    const order = ordersById.get(row.order_id);
    const missionStops = stopsByMission.get(row.id) ?? [];
    const collections = missionStops.map((stop) => {
      const shop = stop.shop_id ? shopsById.get(stop.shop_id) : undefined;
      return {
        shopId: stop.shop_id ?? stop.id,
        stopId: stop.id,
        shopName: shop?.name ?? 'Boutique',
        area: shop?.neighborhood ?? '',
        address: shop?.address_text ?? '',
        latitude: shop?.latitude ?? undefined,
        longitude: shop?.longitude ?? undefined,
        // Real per-stop status has no "ready"/"preparing" sub-state in
        // this schema — a mission only ever exists once every shop
        // portion is genuinely ready to collect, so every stop is
        // treated as ready. `collected` is the only distinction that
        // matters to the driver UI.
        status: 'ready' as const,
        collected: Boolean(stop.picked_up_at) || stop.status === STOP_STATUS.pickedUp,
        collectedAt: stop.picked_up_at ?? undefined,
        // No physical parcel count exists on delivery_stops — one
        // pickup point is treated as one parcel until a real count is
        // added to the schema.
        parcelCount: 1,
      };
    });
    const allCollected = collections.length > 0 && collections.every((c) => c.collected);

    return {
      id: row.id,
      orderId: order?.order_number ?? row.order_id,
      driverId: row.driver_id ?? undefined,
      collections,
      destination: order?.neighborhood ?? '',
      destinationAddress: order?.delivery_address ?? undefined,
      destinationLatitude: order?.delivery_latitude ?? undefined,
      destinationLongitude: order?.delivery_longitude ?? undefined,
      slot: order?.preferred_delivery_slot ?? '',
      distance: '',
      step: row.status === MISSION_STATUS.delivered ? 'delivered'
        : row.status === MISSION_STATUS.inDelivery ? 'to_customer'
        : allCollected ? 'all_collected'
        : 'to_collection',
      // Never read/displayed by the driver UI — the driver is paid
      // monthly outside this app (see driver_earning on delivery_missions,
      // deliberately never selected above).
      earnings: 0,
      customerName: fullName(order?.first_name ?? null, order?.last_name ?? null),
      customerPhone: order?.phone ?? '',
      date: row.created_at,
      deliveryCode: row.delivery_code ?? undefined,
      proofPhoto: row.proof_photo_path ? resolveImageUrl(row.proof_photo_path) : undefined,
      deliveredAt: row.delivered_at ?? undefined,
    };
  });
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
    .update({ status: MISSION_STATUS.inDelivery })
    .eq('id', missionId)
    .select('id');
  if (error) return { error: error.message };
  if ((data?.length ?? 0) === 0) return { error: "Impossible de démarrer la livraison (droits d'accès)." };
  return {};
}

// Compresses the proof photo before upload (same treatment as every other
// image in the app) — never a raw 5-10 Mo phone camera file.
const PROOF_PHOTO_MAX_DIMENSION = 1280;

export async function completeMissionDelivery(
  missionId: string,
  driverId: string,
  deliveryCode: string,
  proofPhotoFile: File,
): Promise<{ error?: string }> {
  const { data: missionRow, error: fetchError } = await supabase
    .from('delivery_missions')
    .select('delivery_code')
    .eq('id', missionId)
    .maybeSingle();
  if (fetchError || !missionRow) return { error: 'Mission introuvable.' };
  if ((missionRow.delivery_code as string | null) !== deliveryCode) return { error: 'Code de livraison incorrect.' };

  const optimized = await optimizeImageFile(proofPhotoFile, PROOF_PHOTO_MAX_DIMENSION);
  const token = Math.random().toString(36).slice(2, 8);
  // The product-images bucket's storage policies require the path's first
  // folder segment to equal auth.uid() (see "Sellers/Users can upload own
  // product files") — driverId here must be the real auth uid, or the
  // upload is silently rejected by storage RLS.
  const path = `${driverId}/delivery-proofs/${missionId}-${token}.webp`;
  const { error: uploadError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, optimized, { cacheControl: '31536000' });
  if (uploadError) return { error: `Envoi de la preuve photo impossible : ${uploadError.message}` };

  const { data, error } = await supabase
    .from('delivery_missions')
    .update({ status: MISSION_STATUS.delivered, delivered_at: new Date().toISOString(), proof_photo_path: path })
    .eq('id', missionId)
    .select('id');
  if (error) return { error: error.message };
  if ((data?.length ?? 0) === 0) return { error: "Impossible de confirmer la livraison (droits d'accès)." };
  return {};
}
