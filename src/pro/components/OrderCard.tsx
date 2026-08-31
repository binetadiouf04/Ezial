import type { Order } from '../data';
import { formatFCFA, formatDateTime } from '../data';
import { StatusChip } from './StatusChip';
import { ChevronRight, MapPin, Clock } from 'lucide-react';

interface OrderCardProps {
  order: Order;
  onClick?: () => void;
  showSubOrders?: boolean;
}

export default function OrderCard({ order, onClick, showSubOrders }: OrderCardProps) {
  return (
    <button
      onClick={onClick}
      className="card w-full p-4 text-left transition-all hover:border-ink/20 hover:card-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ink">{order.id}</span>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-1.5 text-sm text-ink/70">{order.customerName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/45">
            <span className="flex items-center gap-1"><MapPin size={12} /> {order.zone}</span>
            {order.slot && <span className="flex items-center gap-1"><Clock size={12} /> {order.slot}</span>}
            <span>{formatDateTime(order.date)}</span>
            <span className="font-medium text-ink/60">{order.fulfillment === 'pickup' ? 'Retrait' : 'Livraison'}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-ink">{formatFCFA(order.total)}</p>
          <p className="text-xs text-ink/40">dont {formatFCFA(order.deliveryFee)} livraison</p>
        </div>
      </div>

      {showSubOrders && order.subOrders.length > 1 && (
        <div className="mt-3 border-t border-line pt-3 space-y-2">
          {order.subOrders.map((sub) => (
            <div key={sub.shopId} className="flex items-center justify-between text-xs">
              <span className="text-ink/60">{sub.shopName}</span>
              <StatusChip status={sub.status} />
            </div>
          ))}
        </div>
      )}

      {onClick && <ChevronRight size={16} className="mt-2 text-ink/20" />}
    </button>
  );
}
