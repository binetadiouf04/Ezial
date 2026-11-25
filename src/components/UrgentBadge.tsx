import { Zap } from 'lucide-react';

// Badge « Urgent » d'une commande en livraison urgente (orders.is_urgent),
// partagé par le site client, Ezial Admin, Ezial Pro et Ezial Livreur.
// Rouge rubis de l'identité Ezial, icône en trait fin.
export default function UrgentBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-burgundy-ruby px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white ${className}`}>
      <Zap size={11} strokeWidth={2} aria-hidden="true" /> Urgent
    </span>
  );
}
