import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminDashboardStats, type AdminDashboardStats } from '@/lib/supabaseAdminData';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ShoppingBag, Store, Package, Loader2, AlertCircle } from 'lucide-react';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboard() {
  const { navigate } = usePro();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setStats(await fetchAdminDashboardStats());
    } catch {
      setLoadError('Impossible de charger le tableau de bord. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cards = stats ? [
    { label: 'Commandes', value: stats.totalOrders, icon: ShoppingBag, color: 'text-blue-600 bg-blue-50' },
    { label: 'Boutiques', value: stats.totalShops, icon: Store, color: 'text-violet-600 bg-violet-50' },
    { label: 'Produits actifs', value: stats.activeProducts, icon: Package, color: 'text-green-600 bg-green-50' },
  ] : [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Tableau de bord</h1>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          {/* Top cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* Commandes récentes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink">Commandes récentes</h2>
              <button onClick={() => navigate('/admin/commandes')} className="text-xs text-burgundy font-medium hover:underline">Voir tout</button>
            </div>
            {stats && stats.recentOrders.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-ink/45">Aucune commande pour le moment.</p>
              </div>
            ) : (
              <div className="card divide-y divide-line">
                {stats?.recentOrders.map((order) => (
                  <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex items-center gap-3 p-4 w-full text-left hover:bg-cream/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-semibold text-ink">{order.orderNumber}</p>
                      <p className="text-xs text-ink/45 mt-0.5">{order.customerName} · {order.fulfillmentType === 'pickup' ? 'Retrait' : 'Livraison'} · {formatDateTime(order.createdAt)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-ink">{formatFCFA(order.totalAmount)}</p>
                      <div className="mt-1"><StatusChip status={order.status} /></div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
