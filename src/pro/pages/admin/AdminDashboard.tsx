import { useState, useEffect, useCallback, useMemo } from 'react';
import UrgentBadge from '@/components/UrgentBadge';
import { usePro } from '../../ProContext';
import { fetchAdminDashboardStats, type AdminDashboardStats } from '@/lib/supabaseAdminData';
import { fetchAdminSalesStats } from '@/lib/supabaseAdminStats';
import {
  PERIOD_PRESETS, presetRange, customRange, averageBasket, percentChange, bucketLabel, compactAmount,
  type AdminSalesStats, type PeriodId, type StatsRange,
} from '@/lib/adminStatsCore';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import StatTile from '../../components/StatTile';
import ColumnChart from '../../components/charts/ColumnChart';
import RankedBars from '../../components/charts/RankedBars';
import { supabase } from '@/lib/supabaseClient';
import NotificationOptIn from '@/components/NotificationOptIn';
import { ShoppingBag, Store, Package, Loader2, AlertCircle, Banknote, Percent, Receipt, CalendarRange, Info, ChevronRight } from 'lucide-react';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type Measure = 'revenue' | 'orders' | 'commission';
const MEASURES: { id: Measure; label: string }[] = [
  { id: 'revenue', label: 'Chiffre d’affaires' },
  { id: 'orders', label: 'Commandes' },
  { id: 'commission', label: 'Commissions' },
];

const BUCKET_NAME = { day: 'par jour', week: 'par semaine', month: 'par mois' } as const;

export default function AdminDashboard() {
  const { navigate } = usePro();
  const [overview, setOverview] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null)); }, []);

  // Période : préréglages, ou dates choisies à la main.
  const [period, setPeriod] = useState<PeriodId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customError, setCustomError] = useState('');
  const [range, setRange] = useState<StatsRange>(() => presetRange('30d'));

  // Statistiques de ventes : null = pas encore chargées ; 'missing' = la
  // fonction SQL n'est pas installée (la page garde alors son affichage simple).
  const [stats, setStats] = useState<AdminSalesStats | 'missing' | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [measure, setMeasure] = useState<Measure>('revenue');
  const [showTable, setShowTable] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setOverview(await fetchAdminDashboardStats());
    } catch {
      setLoadError('Impossible de charger le tableau de bord. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError('');
    void fetchAdminSalesStats(range).then((result) => {
      if (cancelled) return;
      if (!result.supported) setStats('missing');
      else if ('error' in result) setStatsError(result.error);
      else setStats(result.stats);
      setStatsLoading(false);
    });
    return () => { cancelled = true; };
  }, [range]);

  const choosePreset = (id: Exclude<PeriodId, 'custom'>) => {
    setPeriod(id);
    setCustomError('');
    setRange(presetRange(id));
  };
  const applyCustom = () => {
    const result = customRange(customFrom, customTo);
    if ('error' in result) { setCustomError(result.error); return; }
    setCustomError('');
    setRange(result);
  };

  const sales = stats && stats !== 'missing' ? stats : null;
  const points = useMemo(() => (sales ? sales.series.map((p) => ({
    key: p.date,
    label: bucketLabel(p.date, sales.bucket),
    longLabel: bucketLabel(p.date, sales.bucket, true),
    value: measure === 'orders' ? p.orders : measure === 'commission' ? p.commission : p.revenue,
  })) : []), [sales, measure]);

  const comparable = period !== 'all';
  const basket = sales ? averageBasket(sales.totals.revenue, sales.totals.orders) : 0;
  const previousBasket = sales ? averageBasket(sales.previous.revenue, sales.previous.orders) : 0;
  const formatMeasure = (n: number) => (measure === 'orders' ? `${n.toLocaleString('fr-FR')} commande${n > 1 ? 's' : ''}` : formatFCFA(n));
  const formatAxis = (n: number) => (measure === 'orders' ? n.toLocaleString('fr-FR') : compactAmount(n));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-semibold text-ink">Tableau de bord</h1>
        {sales && <p className="text-xs text-ink/50">Du {formatDay(sales.from)} au {formatDay(new Date(new Date(sales.to).getTime() - 1).toISOString())} · heure de Dakar</p>}
      </div>

      {authUserId && <NotificationOptIn userId={authUserId} label="Notifications administrateur" />}

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {/* Filtres : une seule rangée, au-dessus de tout ce qu'ils concernent. */}
      {stats !== 'missing' && (
        <div className="space-y-2">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Période">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => choosePreset(p.id)}
                aria-pressed={period === p.id}
                className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${period === p.id ? 'border-burgundy bg-burgundy text-white' : 'border-line bg-white text-ink/65 hover:border-ink/25 hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              aria-pressed={period === 'custom'}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${period === 'custom' ? 'border-burgundy bg-burgundy text-white' : 'border-line bg-white text-ink/65 hover:border-ink/25 hover:text-ink'}`}
            >
              <CalendarRange size={14} aria-hidden="true" /> Personnalisé
            </button>
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white p-3">
              <label className="text-xs font-medium text-ink/55">Du
                <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1 block rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-burgundy focus:outline-none" />
              </label>
              <label className="text-xs font-medium text-ink/55">Au
                <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="mt-1 block rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-burgundy focus:outline-none" />
              </label>
              <button onClick={applyCustom} className="rounded-lg bg-burgundy px-4 py-2 text-sm font-medium text-white hover:bg-burgundy-deep">Appliquer</button>
              {customError && <p className="w-full text-xs text-burgundy">{customError}</p>}
            </div>
          )}
        </div>
      )}

      {statsError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {statsError}
        </p>
      )}

      {stats === 'missing' && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-white p-3.5 text-sm text-ink/65">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-burgundy" />
          Les statistiques de ventes ne sont pas encore installées sur la base de données. Le tableau de bord affiche les compteurs disponibles.
        </p>
      )}

      {/* Affichage simple : tant que les statistiques ne sont pas installées. */}
      {stats === 'missing' && overview && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Commandes" value={overview.totalOrders.toLocaleString('fr-FR')} icon={<ShoppingBag size={15} />} />
          <StatTile label="Boutiques" value={overview.totalShops.toLocaleString('fr-FR')} icon={<Store size={15} />} />
          <StatTile label="Produits actifs" value={overview.activeProducts.toLocaleString('fr-FR')} icon={<Package size={15} />} />
        </div>
      )}

      {stats === null && statsLoading && !statsError && (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      )}

      {sales && (
        // Pendant un rechargement, l'affichage précédent reste en place, atténué.
        <div className={`space-y-5 transition-opacity ${statsLoading ? 'opacity-50' : ''}`} aria-busy={statsLoading}>
          {/* Chiffres clés */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Chiffre d’affaires" value={formatFCFA(sales.totals.revenue)} icon={<Banknote size={15} />}
              change={comparable ? percentChange(sales.totals.revenue, sales.previous.revenue) : null} hint="Total payé par les clients" />
            <StatTile label="Commissions Ezial" value={formatFCFA(sales.totals.commission)} icon={<Percent size={15} />}
              change={comparable ? percentChange(sales.totals.commission, sales.previous.commission) : null} hint="Sur les ventes des boutiques" />
            <StatTile label="Commandes" value={sales.totals.orders.toLocaleString('fr-FR')} icon={<ShoppingBag size={15} />}
              change={comparable ? percentChange(sales.totals.orders, sales.previous.orders) : null}
              hint={sales.totals.cancelledOrders > 0 ? `${sales.totals.cancelledOrders} annulée${sales.totals.cancelledOrders > 1 ? 's' : ''} non comptée${sales.totals.cancelledOrders > 1 ? 's' : ''}` : 'Hors commandes annulées'} />
            <StatTile label="Panier moyen" value={formatFCFA(basket)} icon={<Receipt size={15} />}
              change={comparable ? percentChange(basket, previousBasket) : null} hint="Chiffre d’affaires / commandes" />
          </div>
          {comparable && sales.previous.orders > 0 && <p className="-mt-2 text-[11px] text-ink/45 sm:hidden">« vs préc. » : variation par rapport à la période précédente, de même durée.</p>}

          {/* Détail de la période et état du catalogue — une ligne compacte. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line bg-white px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Ventes de produits', value: formatFCFA(sales.totals.productSales) },
              { label: 'Frais de livraison', value: formatFCFA(sales.totals.deliveryFees) },
              { label: 'Articles vendus', value: sales.totals.itemsSold.toLocaleString('fr-FR') },
              { label: 'Boutiques actives', value: sales.catalog.activeShops.toLocaleString('fr-FR'), now: true },
              { label: 'Produits en vente', value: sales.catalog.activeProducts.toLocaleString('fr-FR'), now: true },
            ].map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs text-ink/50">{item.label}{item.now && <span className="text-ink/35"> · à ce jour</span>}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>

          {/* Évolution des ventes */}
          <section className="rounded-xl border border-line bg-white p-4 sm:p-5" aria-labelledby="evolution-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="evolution-title" className="text-sm font-semibold text-ink">Évolution des ventes</h2>
                <p className="mt-0.5 text-xs text-ink/50">{MEASURES.find((m) => m.id === measure)?.label} {BUCKET_NAME[sales.bucket]}</p>
              </div>
              <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Mesure affichée">
                {MEASURES.map((m) => (
                  <button key={m.id} onClick={() => setMeasure(m.id)} aria-pressed={measure === m.id}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${measure === m.id ? 'bg-burgundy/10 text-burgundy' : 'text-ink/55 hover:text-ink'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              {sales.totals.orders === 0 ? (
                <p className="py-12 text-center text-sm text-ink/45">Aucune commande sur cette période.</p>
              ) : (
                <ColumnChart points={points} measure={MEASURES.find((m) => m.id === measure)?.label ?? ''} formatValue={formatMeasure} formatAxis={formatAxis} integerOnly={measure === 'orders'} />
              )}
            </div>
            {sales.totals.orders > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <button onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="text-xs font-medium text-burgundy hover:underline">
                  {showTable ? 'Masquer le tableau' : 'Afficher le tableau des valeurs'}
                </button>
                {showTable && (
                  <div className="mt-2 max-h-72 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white text-ink/50">
                        <tr>
                          <th className="py-1.5 pr-3 font-medium">Période</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Commandes</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Chiffre d’affaires</th>
                          <th className="py-1.5 text-right font-medium">Commissions</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums text-ink">
                        {sales.series.map((p) => (
                          <tr key={p.date} className="border-t border-line">
                            <td className="py-1.5 pr-3">{bucketLabel(p.date, sales.bucket, true)}</td>
                            <td className="py-1.5 pr-3 text-right">{p.orders.toLocaleString('fr-FR')}</td>
                            <td className="py-1.5 pr-3 text-right">{formatFCFA(p.revenue)}</td>
                            <td className="py-1.5 text-right">{formatFCFA(p.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Classements */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-line bg-white p-4 sm:p-5" aria-labelledby="top-products-title">
              <h2 id="top-products-title" className="text-sm font-semibold text-ink">Produits les plus vendus</h2>
              <p className="mb-4 mt-0.5 text-xs text-ink/50">Par montant des ventes sur la période</p>
              <RankedBars
                emptyLabel="Aucune vente sur cette période."
                rows={sales.topProducts.map((p) => ({
                  key: p.productId || p.name,
                  name: p.name,
                  detail: [p.shopName, `${p.quantity.toLocaleString('fr-FR')} vendu${p.quantity > 1 ? 's' : ''}`].filter(Boolean).join(' · '),
                  value: p.revenue,
                  valueLabel: formatFCFA(p.revenue),
                }))}
              />
            </section>
            <section className="min-w-0 rounded-xl border border-line bg-white p-4 sm:p-5" aria-labelledby="top-shops-title">
              <h2 id="top-shops-title" className="text-sm font-semibold text-ink">Boutiques les plus performantes</h2>
              <p className="mb-4 mt-0.5 text-xs text-ink/50">Par ventes de produits sur la période</p>
              <RankedBars
                emptyLabel="Aucune vente sur cette période."
                rows={sales.topShops.map((s) => ({
                  key: s.shopId || s.name,
                  name: s.name,
                  detail: [`${s.orders.toLocaleString('fr-FR')} commande${s.orders > 1 ? 's' : ''}`, `commission ${formatFCFA(s.commission)}`].join(' · '),
                  value: s.productSales,
                  valueLabel: formatFCFA(s.productSales),
                }))}
              />
            </section>
          </div>
        </div>
      )}

      {/* Commandes récentes */}
      {loading ? (
        <div className="card p-8 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : overview && (
        <section aria-labelledby="recent-orders-title">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="recent-orders-title" className="text-sm font-semibold text-ink">Commandes récentes</h2>
            <button onClick={() => navigate('/admin/commandes')} className="flex items-center gap-0.5 text-xs font-medium text-burgundy hover:underline">Voir tout <ChevronRight size={13} aria-hidden="true" /></button>
          </div>
          {overview.recentOrders.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-ink/45">Aucune commande pour le moment.</p>
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {overview.recentOrders.map((order) => (
                <button key={order.id} onClick={() => navigate(`/admin/commandes/${order.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream/40">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-mono text-sm font-semibold text-ink">{order.orderNumber}{order.isUrgent && <UrgentBadge />}</p>
                    <p className="mt-0.5 truncate text-xs text-ink/45">{order.customerName} · {order.fulfillmentType === 'pickup' ? 'Retrait' : 'Livraison'} · {formatDateTime(order.createdAt)}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink">{formatFCFA(order.totalAmount)}</p>
                    <div className="mt-1"><StatusChip status={order.status} /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
