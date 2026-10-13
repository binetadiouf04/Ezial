import type { DeliveryStepStatus, PickupStepStatus, Order } from '@/store/AppContext';

// Single source of truth for customer-facing order-status wording, shared
// by OrderTimeline, OrderDetailPage, ProfilePage and OrderTrackingPage so
// the same status always reads the same way everywhere. Never changes the
// underlying DB status values — display text only.
export const deliveryStatusLabels: Record<DeliveryStepStatus, string> = {
  confirmed: 'Commande en cours',
  preparing: 'En préparation',
  ready: 'Prête',
  picked_up: 'En livraison',
  delivering: 'En livraison',
  delivered: 'Livrée',
};

export const pickupStepLabels: Record<PickupStepStatus, string> = {
  preparing: 'En préparation',
  ready_for_pickup: 'Prête',
  picked_up: 'Récupérée',
};

// orders.status is written once by create_order() and never updated after
// — the real signal for a delivery-type order lives on
// delivery_missions.status (fetched separately via
// fetchOrderDeliveryMissionStatus, since customers have no direct RLS
// access to that table). This combines it with the already-known shop prep
// state to get the real customer-facing step, instead of trusting the
// permanently-frozen orders.status column.
export function computeDeliveryStepStatus(order: Order, missionStatus: string | null): DeliveryStepStatus {
  if (missionStatus === 'delivered') return 'delivered';
  if (missionStatus === 'out_for_delivery') return 'delivering';
  if (missionStatus === 'picking_up' || missionStatus === 'accepted') return 'picked_up';

  const deliveryShops = order.shopFulfillments.filter((f) => f.type === 'delivery');
  if (deliveryShops.length === 0) return order.status;
  if (deliveryShops.every((f) => f.status === 'ready' || f.status === 'collected')) return 'ready';
  if (deliveryShops.some((f) => f.status === 'preparing')) return 'preparing';
  return 'confirmed';
}
