import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import {
  fetchSubscriptionPayments,
  confirmSubscriptionPayment,
  rejectSubscriptionPayment,
  fetchAllSellerSubscriptions,
  type AdminSubscriptionPaymentRow,
  type AdminSellerSubscriptionRow,
} from '@/lib/supabaseAdminSubscriptions';
import { Crown, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { billingPeriodOfPayment } from '@/lib/supabaseSellerSubscription';
import { BILLING_PERIOD_LABEL, formatFcfa } from '@/data/subscriptionPlans';

type Tab = 'pending' | 'history' | 'all';

export default function AdminSubscriptions() {
  const [payments, setPayments] = useState<AdminSubscriptionPaymentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSellerSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [pays, subs] = await Promise.all([fetchSubscriptionPayments(), fetchAllSellerSubscriptions()]);
      setPayments(pays);
      setSubscriptions(subs);
    } catch {
      setLoadError('Impossible de charger les abonnements. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleConfirm = async (id: string) => {
    setActingId(id);
    setActionError('');
    const result = await confirmSubscriptionPayment(id);
    setActingId(null);
    if (result.error) { setActionError(result.error); return; }
    await load();
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    setActionError('');
    const result = await rejectSubscriptionPayment(id, rejectReason);
    setActingId(null);
    setRejectingId(null);
    setRejectReason('');
    if (result.error) { setActionError(result.error); return; }
    await load();
  };

  const pending = payments.filter((p) => p.status === 'pending_review');
  const history = payments.filter((p) => p.status !== 'pending_review');
  const visible = tab === 'pending' ? pending : history;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Crown size={22} className="text-burgundy" />
        <h1 className="font-display text-2xl font-semibold text-ink">Abonnements vendeurs</h1>
      </div>

      <div className="flex rounded-full border border-line p-1 w-fit">
        <button onClick={() => setTab('pending')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'pending' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>
          À vérifier {pending.length > 0 && `(${pending.length})`}
        </button>
        <button onClick={() => setTab('history')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'history' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>
          Historique
        </button>
        <button onClick={() => setTab('all')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'all' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>
          Toutes les boutiques
        </button>
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}
      {actionError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {actionError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : tab === 'all' ? (
        subscriptions.length === 0 ? (
          <div className="card p-10 text-center"><p className="text-sm text-ink/45">Aucune boutique active.</p></div>
        ) : (
          <div className="card divide-y divide-line">
            {subscriptions.map((s) => {
              const label = !s.isProActive ? 'Free' : s.isTrialActive ? 'Essai Ezial Plus' : 'Ezial Plus';
              const labelCls = !s.isProActive ? 'bg-ink/5 text-ink/60 border-line' : s.isTrialActive ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-burgundy/10 text-burgundy border-burgundy/20';
              return (
                <div key={s.shopId} className="flex items-center justify-between gap-3 p-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{s.shopName}</p>
                    <p className="text-xs text-ink/45 mt-0.5">
                      {s.isProActive
                        ? `Jusqu'au ${formatDate(s.proUntil!)}`
                        : s.trialUsed ? 'Essai déjà utilisé' : 'Essai disponible'}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${labelCls}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink/45">{tab === 'pending' ? 'Aucune demande à vérifier.' : 'Aucun historique.'}</p>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {visible.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{p.shopName}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{formatFcfa(p.amount)} · {BILLING_PERIOD_LABEL[billingPeriodOfPayment({ amount: p.amount, periodStart: null, periodEnd: null })]} — {p.method === 'wave' ? 'Wave' : 'Orange Money'}</p>
                  <p className="text-xs text-ink/45 mt-0.5 font-mono">Réf. {p.reference}</p>
                  <p className="text-xs text-ink/40 mt-0.5">Demandé le {formatDate(p.requestedAt)}</p>
                </div>
                <StatusChip
                  status={p.status}
                  label={p.status === 'pending_review' ? 'En vérification' : p.status === 'confirmed' ? 'Confirmé' : 'Refusée'}
                />
              </div>

              {p.status === 'pending_review' && (
                <div className="mt-3">
                  {rejectingId === p.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Motif du refus (optionnel)"
                        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-burgundy focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="btn-outline flex-1 text-sm py-2">Annuler</button>
                        <button
                          onClick={() => void handleReject(p.id)}
                          disabled={actingId === p.id}
                          className="flex-1 rounded-lg bg-burgundy px-3 py-2 text-sm font-medium text-white hover:bg-burgundy/90 disabled:opacity-50"
                        >
                          Confirmer le refus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleConfirm(p.id)}
                        disabled={actingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {actingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirmer le paiement
                      </button>
                      <button
                        onClick={() => setRejectingId(p.id)}
                        disabled={actingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink/60 hover:bg-cream disabled:opacity-50"
                      >
                        <X size={14} /> Refuser
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 bg-cream/50">
        <p className="text-xs text-ink/45 text-center">
          Aucune passerelle de paiement n'est connectée à Ezial : chaque référence doit être vérifiée manuellement sur votre compte Wave / Orange Money avant confirmation. La confirmation active ou prolonge l'abonnement Ezial Plus selon la formule payée (3 ou 12 mois).
        </p>
      </div>
    </div>
  );
}
