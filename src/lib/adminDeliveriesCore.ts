// Livraisons de l'espace administrateur — code pur (aucun accès réseau),
// testé par src/lib/adminDeliveriesCore.test.mjs. Vocabulaire des statuts :
// celui de la contrainte delivery_missions_status_check (available,
// accepted, picking_up, out_for_delivery, delivered, cancelled).

export type DeliveryPhase = 'available' | 'collecting' | 'delivering' | 'delivered' | 'cancelled';
export type DeliveryFilter = 'all' | Exclude<DeliveryPhase, 'cancelled'>;

export const DELIVERY_FILTERS: { id: DeliveryFilter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'available', label: 'Disponibles' },
  { id: 'collecting', label: 'En collecte' },
  { id: 'delivering', label: 'En livraison' },
  { id: 'delivered', label: 'Livrées' },
];

export const PHASE_LABEL: Record<DeliveryPhase, string> = {
  available: 'Disponible',
  collecting: 'En collecte',
  delivering: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

/** Étape lisible d'une mission à partir de son statut réel. Un statut inconnu n'est jamais présenté comme livré. */
export function phaseOf(status: string, hasDriver: boolean): DeliveryPhase {
  switch (status) {
    case 'delivered': return 'delivered';
    case 'out_for_delivery': return 'delivering';
    case 'cancelled': return 'cancelled';
    case 'accepted':
    case 'picking_up': return 'collecting';
    case 'available': return hasDriver ? 'collecting' : 'available';
    default: return hasDriver ? 'collecting' : 'available';
  }
}

export interface AdminDeliveryStop {
  id: string;
  shopId: string;
  shopName: string;
  address: string;
  collected: boolean;
  collectedAt: string | null;
}

export interface AdminDelivery {
  id: string;
  orderId: string;
  orderNumber: string;
  phase: DeliveryPhase;
  driverId: string | null;
  driverName: string;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  stops: AdminDeliveryStop[];
  neighborhood: string;
  address: string;
  customerName: string;
  customerPhone: string;
  slot: string;
  proofPath: string | null;
}

export interface MissionRow {
  id: string; order_id: string; driver_id: string | null; status: string;
  proof_photo_path: string | null; accepted_at: string | null; delivered_at: string | null; created_at: string;
}
export interface StopRow {
  id: string; mission_id: string; shop_id: string | null; stop_order: number; status: string; picked_up_at: string | null;
}
export interface OrderRow {
  id: string; order_number: string | null; first_name: string | null; last_name: string | null; phone: string | null;
  neighborhood: string | null; delivery_address: string | null; preferred_delivery_slot: string | null;
}
export interface ShopRow { id: string; name: string | null; address_text: string | null; neighborhood: string | null }
export interface DriverRow { id: string; first_name: string | null; last_name: string | null; username: string | null }

function joinName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim();
}

/** Assemble les lignes lues dans Supabase. Aucune valeur n'est inventée : un champ absent reste vide. */
export function buildAdminDeliveries(
  missions: MissionRow[], stops: StopRow[], orders: OrderRow[], shops: ShopRow[], drivers: DriverRow[],
): AdminDelivery[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const stopsByMission = new Map<string, StopRow[]>();
  for (const s of [...stops].sort((a, b) => a.stop_order - b.stop_order)) {
    const list = stopsByMission.get(s.mission_id) ?? [];
    list.push(s);
    stopsByMission.set(s.mission_id, list);
  }
  return [...missions]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .map((m): AdminDelivery => {
      const order = orderById.get(m.order_id);
      const driver = m.driver_id ? driverById.get(m.driver_id) : undefined;
      return {
        id: m.id,
        orderId: m.order_id,
        orderNumber: order?.order_number ?? '',
        phase: phaseOf(m.status, Boolean(m.driver_id)),
        driverId: m.driver_id,
        driverName: m.driver_id ? (joinName(driver?.first_name, driver?.last_name) || driver?.username || 'Livreur') : '',
        createdAt: m.created_at,
        acceptedAt: m.accepted_at,
        deliveredAt: m.delivered_at,
        stops: (stopsByMission.get(m.id) ?? []).map((s) => {
          const shop = s.shop_id ? shopById.get(s.shop_id) : undefined;
          return {
            id: s.id,
            shopId: s.shop_id ?? '',
            shopName: shop?.name ?? 'Boutique',
            address: shop?.address_text || shop?.neighborhood || '',
            collected: Boolean(s.picked_up_at) || s.status === 'picked_up',
            collectedAt: s.picked_up_at,
          };
        }),
        neighborhood: order?.neighborhood ?? '',
        address: order?.delivery_address ?? '',
        customerName: joinName(order?.first_name, order?.last_name),
        customerPhone: order?.phone ?? '',
        slot: order?.preferred_delivery_slot ?? '',
        proofPath: m.proof_photo_path,
      };
    });
}

/** Nombre de livraisons par filtre (pour les pastilles). */
export function countByFilter(deliveries: AdminDelivery[]): Record<DeliveryFilter, number> {
  const out: Record<DeliveryFilter, number> = { all: deliveries.length, available: 0, collecting: 0, delivering: 0, delivered: 0 };
  for (const d of deliveries) if (d.phase !== 'cancelled') out[d.phase] += 1;
  return out;
}

export function filterDeliveries(deliveries: AdminDelivery[], filter: DeliveryFilter): AdminDelivery[] {
  return filter === 'all' ? deliveries : deliveries.filter((d) => d.phase === filter);
}
