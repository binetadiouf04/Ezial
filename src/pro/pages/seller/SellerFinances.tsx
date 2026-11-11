import { useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { fetchSellerFinances, requestSellerPayout, type SellerTransactionRow } from '@/lib/supabaseSellerFinances';
import { fetchSellerSubscription } from '@/lib/supabaseSellerSubscription';
import { FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT } from '@/data/subscriptionPlans';
import FinanceSummary from '../../components/FinanceSummary';
import { StatusChip } from '../../components/StatusChip';
import { Wallet, TrendingUp, Calendar, Check, Loader2 } from 'lucide-react';
import {
  fetchSellerFinanceSummary, fetchMyPayoutMethods, fetchMyPayouts,
  type SellerPaymentSummary, type PayoutMethod, type SellerPayout,
} from '@/lib/supabasePayments';
import { SellerPaymentCards, SellerPayoutMethodCard, SellerPayoutHistory } from './SellerPaymentsSection';

// Module paiements (migration Wave / Orange Money) : tant qu'il n'est pas
// installé, la page garde exactement son affichage actuel.
type PaymentsState =
  | { kind: 'missing' }
  | { kind: 'ready'; summary: SellerPaymentSummary | null; methods: PayoutMethod[]; payouts: SellerPayout[]; error: string };

async function loadPaymentsState(shopId: string): Promise<PaymentsState> {
  const [summaryRes, methodsRes, payoutsRes] = await Promise.all([
    fetchSellerFinanceSummary(),
    fetchMyPayoutMethods(shopId),
    fetchMyPayouts(shopId),
  ]);
  if (!summaryRes.supported || !methodsRes.supported || !payoutsRes.supported) return { kind: 'missing' };
  const errors = [summaryRes, methodsRes, payoutsRes].map((r) => ('error' in r ? r.error : '')).filter(Boolean);
  return {
    kind: 'ready',
    summary: 'summary' in summaryRes ? summaryRes.summary : null,
    methods: 'methods' in methodsRes ? methodsRes.methods : [],
    payouts: 'payouts' in payoutsRes ? payoutsRes.payouts : [],
    error: errors.join(' '),
  };
}

export default function SellerFinances() {
  const { sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [transactions, setTransactions] = useState<SellerTransactionRow[]>([]);
  const [grossTotal, setGrossTotal] = useState(0);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [netTotal, setNetTotal] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [payments, setPayments] = useState<PaymentsState>({ kind: 'missing' });

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
    Promise.all([
      fetchSellerFinances(sellerSupabaseShopId),
      fetchSellerSubscription(sellerSupabaseShopId),
      loadPaymentsState(sellerSupabaseShopId),
    ]).then(([summary, sub, paymentsState]) => {
      if (cancelled) return;
      setPayments(paymentsState);
      setTransactions(summary.transactions);
      setGrossTotal(summary.grossTotal);
      setCommissionTotal(summary.commissionTotal);
      setNetTotal(summary.netTotal);
      setAvailableBalance(summary.availableBalance);
      // The official Ezial shop pays no commission (create_order records 0).
      setCommissionRate(sellerShopIsOfficial ? 0 : sub.isProActive ? PREMIUM_COMMISSION_PERCENT : FREE_COMMISSION_PERCENT);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId, sellerShopIsOfficial]);

  const reloadPayments = async () => {
    if (!sellerSupabaseShopId) return;
    setPayments(await loadPaymentsState(sellerSupabaseShopId));
  };

  const commissionHint = commissionRate === 0 ? 'Aucune commission sur les ventes de la boutique Ezial' : `${commissionRate ?? FREE_COMMISSION_PERCENT} % (votre forfait actuel) — déduite automatiquement`;

  const handleRequestPayout = async () => {
    if (!sellerSupabaseShopId) return;
    setRequesting(true);
    setRequestError('');
    const result = await requestSellerPayout(sellerSupabaseShopId);
    setRequesting(false);
    if (result.error) { setRequestError(result.error); return; }
    setRequestSent(true);
    setTimeout(() => setRequestSent(false), 4000);
  };

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

      {/* Summary — remplacé par « Mes paiements » (calculé par le serveur)
          une fois le module paiements installé. */}
      {payments.kind === 'ready' && payments.summary ? (
        <SellerPaymentCards summary={payments.summary} commissionHint={commissionHint} />
      ) : (
        <FinanceSummary
          rows={[
            { label: 'Ventes brutes', value: grossTotal, hint: `${transactions.length} transaction${transactions.length > 1 ? 's' : ''}` },
            { label: 'Commission Ezial', value: -commissionTotal, hint: commissionHint },
            { label: 'Montant net', value: netTotal, accent: true },
          ]}
        />
      )}
      {payments.kind === 'ready' && payments.error && <p className="text-sm text-burgundy">{payments.error}</p>}

      {/* Available balance */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Wallet size={14} /> Solde disponible</p>
            <p className="mt-1 font-display text-2xl font-semibold text-burgundy">{formatFCFA(availableBalance)}</p>
          </div>
          <button onClick={() => void handleRequestPayout()} disabled={requesting || availableBalance <= 0} className="btn-primary flex items-center gap-1.5 flex-shrink-0">
            {requesting ? <Loader2 size={15} className="animate-spin" /> : requestSent ? <Check size={15} /> : null}
            {requestSent ? 'Demande envoyée' : 'Demander un paiement'}
          </button>
        </div>
        {requestError && <p className="mt-2 text-sm text-burgundy">{requestError}</p>}
      </div>

      {payments.kind === 'ready' && (
        <>
          <SellerPayoutMethodCard methods={payments.methods} onSubmitted={reloadPayments} />
          <SellerPayoutHistory payouts={payments.payouts} />
        </>
      )}

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
