import { usePro } from '../../ProContext';
import { productsByShop, formatFCFA, formatDate, commissionAmount, netAmount } from '../../data';
import FinanceSummary from '../../components/FinanceSummary';
import { StatusChip } from '../../components/StatusChip';
import { Wallet, TrendingUp, Calendar } from 'lucide-react';

export default function SellerFinances() {
  const { sellerTransactions } = usePro();
  const shopId = 'maison-fatou';
  const shopProducts = productsByShop(shopId);
  const shopName = 'Maison Fatou';

  // Filter transactions for this shop
  const myTransactions = sellerTransactions.filter((t) => t.shopName === shopName);

  // Calculate totals
  const grossTotal = myTransactions.reduce((sum, t) => sum + t.gross, 0);
  const commissionTotal = myTransactions.reduce((sum, t) => sum + t.commission, 0);
  const netTotal = myTransactions.reduce((sum, t) => sum + t.net, 0);

  // Available balance = transactions with 'available' payout
  const availableBalance = myTransactions.filter((t) => t.payout === 'available').reduce((sum, t) => sum + t.net, 0);

  // Weekly and yearly
  const weeklyNet = myTransactions
    .filter((t) => new Date(t.date) > new Date('2026-08-20'))
    .reduce((sum, t) => sum + t.net, 0);
  const yearlyNet = myTransactions.reduce((sum, t) => sum + t.net, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Finances</h1>
        <p className="mt-1 text-sm text-ink/55">Vos revenus et transactions</p>
      </div>

      {/* Summary */}
      <FinanceSummary
        rows={[
          { label: 'Ventes brutes', value: grossTotal, hint: `${myTransactions.length} transactions` },
          { label: 'Commission Ezial (8%)', value: -commissionTotal, hint: 'Déduite automatiquement' },
          { label: 'Montant net', value: netTotal, accent: true },
        ]}
      />

      {/* Available balance */}
      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Wallet size={14} /> Solde disponible</p>
          <p className="mt-1 font-display text-2xl font-semibold text-burgundy">{formatFCFA(availableBalance)}</p>
        </div>
        <button className="btn-primary">Demander un paiement</button>
      </div>

      {/* Period summaries */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={14} /> Solde semaine</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-ink">{formatFCFA(weeklyNet)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><TrendingUp size={14} /> Solde annuel</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-ink">{formatFCFA(yearlyNet)}</p>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Historique des transactions</h2>
        <div className="card divide-y divide-line">
          {myTransactions.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune transaction</p>
          ) : (
            myTransactions.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-ink">{t.orderId}</span>
                    <p className="text-xs text-ink/45 mt-0.5">{formatDate(t.date)}</p>
                  </div>
                  <StatusChip status={t.payout} />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-ink/55">Vente</span><span className="font-medium text-ink">{formatFCFA(t.gross)}</span></div>
                  <div className="flex justify-between"><span className="text-ink/55">Commission Ezial</span><span className="font-medium text-ink/50">-{formatFCFA(t.commission)}</span></div>
                  <div className="flex justify-between border-t border-line pt-1"><span className="font-medium text-ink">Montant net</span><span className="font-semibold text-ink">{formatFCFA(t.net)}</span></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
