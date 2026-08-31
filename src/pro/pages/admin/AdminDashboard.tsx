import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ShoppingBag, Clock, Truck, AlertTriangle, ChevronRight, ArrowRight } from 'lucide-react';

export default function AdminDashboard() {
  const { allOrders, missions, navigate, resolvedIncidents, cancelledOrders } = usePro();

  const today = new Date().toDateString();
  const ordersToday = allOrders.filter((o) => new Date(o.date).toDateString() === today).length;
  const ordersInProgress = allOrders.filter((o) => ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status) && !cancelledOrders.includes(o.id)).length;
  const deliveriesInProgress = missions.filter((m) => m.driverId && m.step !== 'delivered').length;
  const openIncidents = missions.filter((m) => m.incident && !resolvedIncidents.includes(m.id)).length;
  const totalOrders = allOrders.length;

  const cards = [
    { label: 'Commandes aujourd\'hui', value: ordersToday, icon: ShoppingBag, color: 'text-blue-600 bg-blue-50' },
    { label: 'Commandes en cours', value: ordersInProgress, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Livraisons en cours', value: deliveriesInProgress, icon: Truck, color: 'text-violet-600 bg-violet-50' },
    { label: 'Incidents ouverts', value: openIncidents, icon: AlertTriangle, color: 'text-orange-600 bg-orange-50' },
    { label: 'Total commandes', value: totalOrders, icon: ShoppingBag, color: 'text-ink bg-ink/5' },
  ];

  // À traiter
  const todoItems: { label: string; href: string; priority: 'high' | 'medium' | 'low' }[] = [];
  if (openIncidents > 0) todoItems.push({ label: `${openIncidents} ${openIncidents > 1 ? 'livraisons ont' : 'livraison a'} un incident`, href: '/admin/livraisons', priority: 'high' });
  const blockedOrders = allOrders.filter((o) => o.status === 'return_requested' && !cancelledOrders.includes(o.id)).length;
  if (blockedOrders > 0) todoItems.push({ label: `${blockedOrders} ${blockedOrders > 1 ? 'retours à examiner' : 'retour à examiner'}`, href: '/admin/commandes', priority: 'medium' });
  const pendingShops = 0;
  if (pendingShops > 0) todoItems.push({ label: `${pendingShops} boutiques en attente`, href: '/admin/boutiques', priority: 'medium' });

  const recentOrders = allOrders.slice(0, 5);
  const priorityColor: Record<string, string> = { high: 'bg-burgundy', medium: 'bg-amber-400', low: 'bg-ink/20' };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Tableau de bord</h1>

      {/* Top cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${card.color}`}>
                <Icon size={18} />
              </div>
              <p className="mt-2.5 font-display text-2xl font-semibold text-ink">{card.value}</p>
              <p className="text-xs text-ink/50 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* À traiter */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">À traiter</h2>
        {todoItems.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-sm text-ink/45">Rien à traiter pour le moment</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todoItems.map((item, i) => (
              <button key={i} onClick={() => navigate(item.href)} className="card w-full p-4 flex items-center gap-3 text-left hover:card-shadow transition-all">
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityColor[item.priority]}`} />
                <span className="flex-1 text-sm text-ink">{item.label}</span>
                <ChevronRight size={16} className="text-ink/30" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Commandes récentes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Commandes récentes</h2>
          <button onClick={() => navigate('/admin/commandes')} className="text-xs text-burgundy font-medium flex items-center gap-1 hover:underline">
            Voir tout <ArrowRight size={12} />
          </button>
        </div>
        <div className="card divide-y divide-line">
          {recentOrders.map((order) => (
            <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold text-ink">{order.id}</p>
                <p className="text-xs text-ink/45 mt-0.5">{order.customerName} · {order.fulfillment === 'pickup' ? 'Retrait' : 'Livraison'} · {formatDate(order.date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-ink">{formatFCFA(order.total)}</p>
                <div className="mt-1"><StatusChip status={order.status} /></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
