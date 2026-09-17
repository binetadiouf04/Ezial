import type { DeliveryStepStatus, PickupStepStatus } from '@/store/AppContext';

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
