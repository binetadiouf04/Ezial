import { usePro } from '../../ProContext';
import { formatFCFA, commissionAmount } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { TrendingUp, Wallet, Store, Truck } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

export default function AdminFinances() {
  const { allOrders, allShops, allDrivers, allTransactions, markSellerPaid, markDriverPaid, payoutStatuses, driverPayoutStatuses } = usePro();

  // Calculate totals
  const productSales = allOrders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((sum, o) => sum + (o.total - o.deliveryFee), 0);
  const totalCommissions = allOrders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((sum, o) => sum + commissionAmount(o.total - o.deliveryFee), 0);
  const sellerBalances = allTransactions
    .filter((t) => t.payout !== 'paid' && payoutStatuses[t.id] !== 'paid')
    .reduce((sum, t) => sum + t.net, 0);
  const driverBalances = allDrivers
    .filter((d) => driverPayoutStatuses[d.id] !== 'paid')
    .reduce((sum, d) => sum + d.weeklyEarnings, 0);

  const cards = [
    { label: 'Volume des ventes', value: productSales, icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
    { label: 'Commissions Ezial', value: totalCommissions, icon: Wallet, color: 'text-burgundy bg-burgundy/10' },
    { label: 'À verser aux vendeurs', value: sellerBalances, icon: Store, color: 'text-amber-600 bg-amber-50' },
    { label: 'À verser aux livreurs', value: driverBalances, icon: Truck, color: 'text-violet-600 bg-violet-50' },
  ];

  // Group transactions by shop
  const shopTransactions = allShops.map((shop) => {
    const txns = allTransactions.filter((t) => t.shopName === shop.name);
    const gross = txns.reduce((sum, t) => sum + t.gross, 0);
    const commission = txns.reduce((sum, t) => sum + t.commission, 0);
    const net = txns.reduce((sum, t) => sum + t.net, 0);
    const allPaid = txns.every((t) => (payoutStatuses[t.id] ?? t.payout) === 'paid');
    return { shop, gross, commission, net, txns, allPaid };
  }).filter((s) => s.gross > 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Finances</h1>

      {/* Top cards */}
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

      {/* Seller breakdowns */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2"><Store size={16} className="text-ink/40" /> Vendeurs</h2>
        <div className="space-y-3">
          {shopTransactions.map(({ shop, gross, commission, net, txns, allPaid }) => (
            <div key={shop.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <SmartImage src={shop.logo} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
                <p className="text-sm font-medium text-ink flex-1">{shop.name}</p>
                <StatusChip status={allPaid ? 'paid' : 'pending'} />
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink/55">Ventes</span>
                  <span className="font-medium text-ink">{formatFCFA(gross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/55">Commission Ezial (8%)</span>
                  <span className="font-medium text-red-500">- {formatFCFA(commission)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-line">
                  <span className="font-semibold text-ink">Net vendeur</span>
                  <span className="font-semibold text-ink">{formatFCFA(net)}</span>
                </div>
              </div>
              {!allPaid && (
                <button onClick={() => txns.forEach((t) => markSellerPaid(t.id))} className="btn-outline w-full mt-3 text-sm">Marquer comme versé</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Driver breakdowns */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2"><Truck size={16} className="text-ink/40" /> Livreurs</h2>
        <div className="space-y-3">
          {allDrivers.map((driver) => {
            const isPaid = driverPayoutStatuses[driver.id] === 'paid';
            return (
              <div key={driver.id} className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-burgundy">{driver.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{driver.name}</p>
                    <p className="text-xs text-ink/45">{driver.weeklyDeliveries} livraisons</p>
                  </div>
                  <StatusChip status={isPaid ? 'paid' : 'pending'} />
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-line">
                  <span className="font-semibold text-ink">À verser</span>
                  <span className="font-semibold text-ink">{formatFCFA(driver.weeklyEarnings)}</span>
                </div>
                {!isPaid && (
                  <button onClick={() => markDriverPaid(driver.id)} className="btn-outline w-full mt-3 text-sm">Marquer comme versé</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial separation note */}
      <div className="card p-4 bg-cream/50">
        <p className="text-xs text-ink/45 text-center">
          Commission Ezial (8%) appliquée uniquement sur les ventes produits.
          Les frais de livraison sont gérés séparément.
        </p>
      </div>
    </div>
  );
}
