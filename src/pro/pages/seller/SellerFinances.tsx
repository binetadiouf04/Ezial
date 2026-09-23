import { useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { fetchSellerFinances, type SellerTransactionRow } from '@/lib/supabaseSellerFinances';
import FinanceSummary from '../../components/FinanceSummary';
import { StatusChip } from '../../components/StatusChip';
import { Wallet, TrendingUp, Calendar } from 'lucide-react';

export default function SellerFinances() {
  const { sellerSupabaseShopId } = usePro();
  const [transactions, setTransactions] = useState<SellerTransactionRow[]>([]);
  const [grossTotal, setGrossTotal] = useState(0);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [netTotal, setNetTotal] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Real financial history for the signed-in seller's real Supabase shop —
  // never the mock sellerTransactions array, which only ever matched one
  // hardcoded demo shop name and left every real seller's page empty.
  useEffect(() => {
    if (!sellerSupabaseShopId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchSellerFinances(sellerSupabaseShopId).then((summary) => {
      if (cancelled) return;
      setTransactions(summary.transactions);
      setGrossTotal(summary.grossTotal);
      setCommissionTotal(summary.commissionTotal);
      setNetTotal(summary.netTotal);
      setAvailableBalance(summary.availableBalance);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  const now = Date.now();
  const weeklyNet = transactions
    .filter((t) => now - new Date(t.date).getTime() < 7 * 24 * 60 * 60 * 1000)
    .reduce((sum, t) => sum + t.net, 0);
  const yearlyNet = transactions
    .filter((t) => new Date(t.date).getFullYear() === new Date().getFullYear())
    .reduce((sum, t) => sum + t.net, 0);

  if (!sellerSupabaseShopId) {
    return (
      <div className="card p-10 text-center">
        <Wallet size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-10 text-center"><p className="text-sm text-ink/50">Chargement…</p></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Finances</h1>
        <p className="mt-1 text-sm text-ink/55">Vos revenus et transactions</p>
      </div>

      {/* Summary */}
      <FinanceSummary
        rows={[
          { label: 'Ventes brutes', value: grossTotal, hint: `${transactions.length} transaction${transactions.length > 1 ? 's' : ''}` },
          { label: 'Commission Ezial', value: -commissionTotal, hint: '8% (ou 5% en promotion ≥ 10%) — déduite automatiquement' },
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
          {transactions.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink/45">Aucune transaction</p>
          ) : (
            transactions.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-ink">{t.orderNumber ?? t.id}</span>
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
