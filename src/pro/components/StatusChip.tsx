export function StatusChip({ status, size = 'sm', label: labelOverride }: { status: string; size?: 'sm' | 'md'; label?: string }) {
  const styles: Record<string, string> = {
    // Order / sub-order
    confirmed: 'bg-blue-50 text-blue-700 border-blue-100',
    preparing: 'bg-amber-50 text-amber-700 border-amber-100',
    ready: 'bg-green-50 text-green-700 border-green-100',
    waiting_collection: 'bg-green-50 text-green-700 border-green-100',
    out_for_delivery: 'bg-violet-50 text-violet-700 border-violet-100',
    delivered: 'bg-ink/5 text-ink/60 border-line',
    cancelled: 'bg-red-50 text-red-700 border-red-100',
    return_requested: 'bg-orange-50 text-orange-700 border-orange-100',
    refunded: 'bg-red-50 text-red-700 border-red-100',
    // Product
    draft: 'bg-ink/5 text-ink/50 border-line',
    pending: 'bg-amber-50 text-amber-700 border-amber-100',
    published: 'bg-green-50 text-green-700 border-green-100',
    flagged: 'bg-orange-50 text-orange-700 border-orange-100',
    changes_requested: 'bg-red-50 text-red-700 border-red-100',
    out_of_stock: 'bg-red-50 text-red-700 border-red-100',
    inactive: 'bg-ink/5 text-ink/50 border-line',
    disabled: 'bg-ink/5 text-ink/50 border-line',
    // Shop
    active: 'bg-green-50 text-green-700 border-green-100',
    suspended: 'bg-red-50 text-red-700 border-red-100',
    // Driver
    available: 'bg-green-50 text-green-700 border-green-100',
    on_delivery: 'bg-violet-50 text-violet-700 border-violet-100',
    offline: 'bg-ink/5 text-ink/50 border-line',
    // Payout
    paid: 'bg-green-50 text-green-700 border-green-100',
    // Campaign / Blog
    scheduled: 'bg-blue-50 text-blue-700 border-blue-100',
    ended: 'bg-ink/5 text-ink/50 border-line',
    paused: 'bg-ink/5 text-ink/50 border-line',
    unpublished: 'bg-ink/5 text-ink/50 border-line',
  };

  const labels: Record<string, string> = {
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    ready: 'Prête',
    waiting_collection: 'En attente de retrait',
    out_for_delivery: 'En livraison',
    delivered: 'Livrée',
    cancelled: 'Annulée',
    return_requested: 'Retour demandé',
    refunded: 'Remboursée',
    draft: 'Brouillon',
    pending: 'En attente',
    published: 'Actif',
    flagged: 'Signalé',
    changes_requested: 'Modifications demandées',
    out_of_stock: 'Rupture de stock',
    inactive: 'Désactivé',
    disabled: 'Désactivé',
    active: 'Actif',
    suspended: 'Suspendu',
    available: 'Disponible',
    on_delivery: 'En livraison',
    offline: 'Hors ligne',
    paid: 'Payé',
    scheduled: 'Planifiée',
    ended: 'Terminée',
    paused: 'En pause',
    unpublished: 'Dépublié',
  };

  const cls = styles[status] ?? 'bg-ink/5 text-ink/50 border-line';
  const label = labelOverride ?? labels[status] ?? status;
  const sz = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${cls} ${sz}`}>
      {label}
    </span>
  );
}
