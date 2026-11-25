// Missions Ezial Livreur — code pur (aucun accès réseau), testé par
// src/lib/driverMissionsCore.test.mjs.
//
// Règle (demande de la propriétaire, 25 nov. 2026) : tant qu'une mission
// est encore disponible, le livreur voit où livrer (quartier, adresse,
// position, créneau, urgence, boutiques) mais jamais le téléphone, le nom
// ou l'e-mail du client, ni les informations d'un destinataire cadeau.
// Seul le livreur qui a accepté la mission voit le téléphone. La base
// l'impose (docs/sql/livreur-telephone-masque.sql) ; ce module l'applique
// aussi à l'écran, même si une donnée arrivait par erreur.
import type { Mission } from '@/pro/data';

export const MISSION_STATUS = {
  available: 'available',
  accepted: 'accepted',
  pickingUp: 'picking_up',
  outForDelivery: 'out_for_delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
} as const;

export const STOP_STATUS = {
  pending: 'pending',
  pickedUp: 'picked_up',
} as const;

export const ANONYMOUS_CUSTOMER_NAME = 'Client Ezial';

export interface DriverMissionRow {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: string;
  created_at: string;
  delivered_at?: string | null;
}

/** Lieu de livraison : seuls champs autorisés pour une mission disponible. */
export interface MissionDestination {
  order_number: string | null;
  neighborhood: string | null;
  delivery_address: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  preferred_delivery_slot: string | null;
  preferred_delivery_date: string | null;
}

/** Coordonnées du client : lues seulement pour une mission attribuée au livreur. */
export interface MissionCustomer {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface MissionStop {
  stop_id: string;
  shop_id: string | null;
  stop_order: number;
  status: string;
  picked_up_at: string | null;
  shop_name: string | null;
  shop_neighborhood: string | null;
  shop_address: string | null;
  shop_latitude: number | string | null;
  shop_longitude: number | string | null;
}

/** Ligne renvoyée par la fonction serveur driver_available_missions(). */
export interface AvailableMissionRpcRow extends MissionDestination {
  mission_id: string;
  order_id: string;
  created_at: string;
  is_urgent: boolean | null;
  stops: MissionStop[] | null;
}

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || ANONYMOUS_CUSTOMER_NAME;
}

/** Vrai seulement si la mission est attribuée à un livreur (lui : la RLS ne montre que les siennes). */
export function isMissionAssigned(row: Pick<DriverMissionRow, 'driver_id'>): boolean {
  return Boolean(row.driver_id);
}

/** Mission annulée (par exemple quand la dernière boutique n'honore pas sa commande) : jamais affichée au livreur. */
export function isMissionCancelled(row: Pick<DriverMissionRow, 'status'>): boolean {
  return row.status === MISSION_STATUS.cancelled;
}

export interface BuildMissionInput {
  row: DriverMissionRow;
  destination?: MissionDestination;
  /** Ignoré si la mission n'est pas attribuée. */
  customer?: MissionCustomer;
  stops: MissionStop[];
  urgent: boolean;
  proofPhoto?: string;
}

export function buildDriverMission({ row, destination, customer, stops, urgent, proofPhoto }: BuildMissionInput): Mission {
  const sortedStops = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  const collections = sortedStops.map((stop) => ({
    shopId: stop.shop_id ?? stop.stop_id,
    stopId: stop.stop_id,
    shopName: stop.shop_name ?? 'Boutique',
    area: stop.shop_neighborhood ?? '',
    address: stop.shop_address ?? '',
    latitude: toNumber(stop.shop_latitude),
    longitude: toNumber(stop.shop_longitude),
    // Pas de sous-état « prête / en préparation » dans ce schéma : une
    // mission n'existe qu'une fois toutes les boutiques prêtes. Seul
    // `collected` compte pour l'interface livreur.
    status: 'ready' as const,
    collected: Boolean(stop.picked_up_at) || stop.status === STOP_STATUS.pickedUp,
    collectedAt: stop.picked_up_at ?? undefined,
    // Aucun nombre de colis dans delivery_stops : un point de collecte = un colis.
    parcelCount: 1,
  }));
  const allCollected = collections.length > 0 && collections.every((c) => c.collected);

  // Le téléphone et le nom ne sont repris que pour une mission attribuée.
  const visibleCustomer = isMissionAssigned(row) ? customer : undefined;

  return {
    id: row.id,
    orderId: destination?.order_number ?? row.order_id,
    driverId: row.driver_id ?? undefined,
    collections,
    destination: destination?.neighborhood ?? '',
    destinationAddress: destination?.delivery_address ?? undefined,
    destinationLatitude: toNumber(destination?.delivery_latitude),
    destinationLongitude: toNumber(destination?.delivery_longitude),
    slot: destination?.preferred_delivery_slot ?? '',
    slotDate: destination?.preferred_delivery_date ?? undefined,
    urgent,
    distance: '',
    step: row.status === MISSION_STATUS.delivered ? 'delivered'
      : row.status === MISSION_STATUS.outForDelivery ? 'to_customer'
      : allCollected ? 'all_collected'
      : 'to_collection',
    // Jamais affiché : le livreur est payé hors de l'application.
    earnings: 0,
    customerName: fullName(visibleCustomer?.first_name ?? null, visibleCustomer?.last_name ?? null),
    customerPhone: visibleCustomer?.phone ?? '',
    date: row.created_at,
    proofPhoto,
    deliveredAt: row.delivered_at ?? undefined,
  };
}

/** Mission disponible construite depuis driver_available_missions() : jamais de coordonnées du client. */
export function buildAvailableMissionFromRpc(r: AvailableMissionRpcRow): Mission {
  return buildDriverMission({
    row: { id: r.mission_id, order_id: r.order_id, driver_id: null, status: MISSION_STATUS.available, created_at: r.created_at },
    destination: {
      order_number: r.order_number,
      neighborhood: r.neighborhood,
      delivery_address: r.delivery_address,
      delivery_latitude: r.delivery_latitude,
      delivery_longitude: r.delivery_longitude,
      preferred_delivery_slot: r.preferred_delivery_slot,
      preferred_delivery_date: r.preferred_delivery_date,
    },
    stops: Array.isArray(r.stops) ? r.stops : [],
    urgent: r.is_urgent === true,
  });
}
