import { useCallback, useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminFinanceOverview, type AdminFinanceOverview } from '@/lib/supabaseAdminFinances';
import { formatFCFA } from '../../data';
import { TrendingUp, Wallet, ArrowDownCircle, ArrowUpCircle, Loader2, AlertCircle } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import AdminPromoCodes from './AdminPromoCodes';

const statusLabels: Record<AdminFinanceOverview['shops'][number]['status'], string> = {
  no_sales: 'Aucune vente',
  settled: 'Soldé',
  owing: 'À verser',
};
const statusStyles: Record<AdminFinanceOverview['shops'][number]['status'], string> = {
  no_sales: 'bg-ink/5 text-ink/50 border-line',
  settled: 'bg-green-50 text-green-700 border-green-100',
  owing: 'bg-amber-50 text-amber-700 border-amber-100',
};

type Tab = 'overview' | 'promo';

export default function AdminFinances() {
  const { navigate } = usePro();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOverview(await fetchAdminFinanceOverview());
    } catch {
      setLoadError('Impossible de charger les finances. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cards = overview ? [
    { label: 'Ventes réelles', value: overview.totalSales, icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
    { label: 'Commissions Ezial', value: overview.totalCommission, icon: Wallet, color: 'text-burgundy bg-burgundy/10' },
    { label: 'Déjà versé', value: overview.totalPaid, icon: ArrowUpCircle, color: 'text-green-600 bg-green-50' },
    { label: 'Restant à verser', value: overview.totalRemaining, icon: ArrowDownCircle, color: 'text-amber-600 bg-amber-50' },
  ] : [];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Finances</h1>

      <div className="flex rounded-full border border-line p-1 w-fit">
        <button onClick={() => setTab('overview')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'overview' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>Vue d'ensemble</button>
        <button onClick={() => setTab('promo')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'promo' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>Codes promo</button>
      </div>

      {tab === 'promo' && <AdminPromoCodes />}

      {tab === 'overview' && (
      <>
      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : overview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="card p-4">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${card.color}`}>
                    <Icon size={18} />
                  </div>
                  <p className="mt-2.5 font-display text-lg font-semibold text-ink">{formatFCFA(card.value)}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{card.label}</p>
                </div>
              );
            })}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink mb-3">Boutiques</h2>
            {overview.shops.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucune boutique.</p></div>
            ) : (
              <div className="space-y-3">
                {overview.shops.map((shop) => (
                  <button
                    key={shop.shopId}
                    onClick={() => navigate(`/admin/finances/${shop.shopId}`)}
                    className="card w-full p-4 text-left hover:card-shadow transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />}
                      <p className="text-sm font-semibold text-ink flex-1 truncate">{shop.shopName}</p>
                      <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyles[shop.status]}`}>{statusLabels[shop.status]}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-ink/45">Ventes</p>
                        <p className="font-medium text-ink">{formatFCFA(shop.sales)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink/45">Commission</p>
                        <p className="font-medium text-ink">{formatFCFA(shop.commission)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink/45">Net vendeur</p>
                        <p className="font-medium text-ink">{formatFCFA(shop.netToSeller)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink/45">Déjà versé</p>
                        <p className="font-medium text-ink">{formatFCFA(shop.alreadyPaid)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink/45">Restant</p>
                        <p className="font-semibold text-ink">{formatFCFA(shop.remaining)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4 bg-cream/50">
            <p className="text-xs text-ink/45 text-center">
              Commission Ezial appliquée produit par produit sur les ventes uniquement (8%, ou 5% sur un produit en promotion d'au moins 10%). Les frais de livraison sont gérés séparément.
            </p>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
