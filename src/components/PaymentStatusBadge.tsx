import type { Order } from '@/store/AppContext';
import { paymentBadge, type BadgeTone } from '@/lib/orderPayment';

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-800',
  info: 'bg-blue-50 text-blue-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-ink/5 text-ink/60',
};

// Statut de paiement RÉEL de la commande (jamais « Payé » sans paiement confirmé).
export default function PaymentStatusBadge({ order, className = '' }: { order: Order; className?: string }) {
  const { label, tone } = paymentBadge(order, Date.now());
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}>{label}</span>;
}
