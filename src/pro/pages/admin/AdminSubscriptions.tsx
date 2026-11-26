import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { formatFcfa } from '@/data/subscriptionPlans';
import {
  confirmSubscriptionAttempt, fetchSubscriptionPayments, rejectSubscriptionAttempt, PAYMENT_STATE_LABELS, PROVIDER_LABELS,
  type AdminSubscriptionPayment, type SubscriptionPaymentState,
} from '@/lib/supabaseAdminSubscriptions';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TONE: Record<SubscriptionPaymentState, string> = {
  confirmed: 'bg-green-50 text-green-700 border-green-100', pending: 'bg-amber-50 text-amber-700 border-amber-100',
  expired: 'bg-gray-50 text-gray-600 border-gray-200', failed: 'bg-red-50 text-red-700 border-red-100',
  duplicate: 'bg-red-50 text-red-700 border-red-100', review: 'bg-red-50 text-red-700 border-red-100', replaced: 'bg-gray-50 text-gray-600 border-gray-200',
};

// Paiements d'abonnement Ezial Plus : suivi (moyen, état). L'activation est AUTOMATIQUE à la confirmation d'Orange.
// Confirmation / refus manuels : cas d'exception seulement (paiement reçu chez Orange ou Wave mais non rapproché).
export default function AdminSubscriptions() {
  const [rows, setRows] = useState<AdminSubscriptionPayment[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<{ row: AdminSubscriptionPayment; mode: 'confirm' | 'reject' } | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const r = await fetchSubscriptionPayments();
    if (!r.supported) setSupported(false); else { setSupported(true); setRows(r.rows); if (r.error) setError(r.error); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (row: AdminSubscriptionPayment, mode: 'confirm' | 'reject') => { setTarget({ row, mode }); setReference(''); setNote(''); setFormError(''); };
  const submit = async () => {
    if (!target) return;
    setBusy(true); setFormError('');
    const res = target.mode === 'confirm' ? await confirmSubscriptionAttempt(target.row.id, reference, note) : await rejectSubscriptionAttempt(target.row.id, note);
    setBusy(false);
    if (res.error) { setFormError(res.error); return; }
    setTarget(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Abonnements</h1>
        <p className="mt-1 text-sm text-ink/55">Paiements d’abonnement Ezial Plus. L’abonnement est activé automatiquement dès qu’Orange Money confirme le paiement : rien à valider à la main en temps normal.</p>
      </div>
      {loading ? (
        <div className="p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-burgundy" /></div>
      ) : !supported ? (
        <div className="card p-10 text-center text-sm text-ink/45">Le paiement d’abonnement en ligne n’est pas encore activé.</div>
      ) : (
        <>
          {error && <p className="flex items-center gap-1.5 text-sm text-red-700"><AlertCircle size={15} /> {error}</p>}
          {rows.length === 0 ? (
            <div className="card p-10 text-center text-sm text-ink/45">Aucun paiement d’abonnement pour le moment.</div>
          ) : (
            <div className="card divide-y divide-line">
              {rows.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{r.shopName} · {formatFcfa(r.amount)} · {r.billingPeriod === 'annual' ? 'annuel' : 'trimestriel'}</p>
                      <p className="mt-0.5 text-xs text-ink/50">{PROVIDER_LABELS[r.provider]} · {formatDateTime(r.createdAt)}{r.reference ? <> · réf. <span className="font-mono">{r.reference}</span></> : null}</p>
                      {r.state === 'confirmed' && r.periodEnd && <p className="mt-0.5 text-xs text-ink/50">Actif jusqu’au {formatDateTime(r.periodEnd)}{r.manual ? ' · confirmé manuellement' : r.kind === 'legacy' ? '' : ' · activé automatiquement'}</p>}
                      {r.failureReason && r.state !== 'confirmed' && <p className="mt-0.5 text-xs text-red-700">{r.failureReason}</p>}
                      {r.adminNote && <p className="mt-0.5 text-xs text-ink/50">Note : {r.adminNote}</p>}
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${TONE[r.state]}`}>{PAYMENT_STATE_LABELS[r.state]}</span>
                  </div>
                  {r.canConfirm && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => open(r, 'confirm')} className="btn-outline gap-1.5 text-sm"><Check size={14} /> J’ai reçu ce paiement dans Orange Money / Wave</button>
                      {r.state !== 'failed' && <button type="button" onClick={() => open(r, 'reject')} className="text-xs font-medium text-ink/50 underline underline-offset-2 hover:text-burgundy">Refuser</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink/45">Cas d’exception seulement : confirmer à la main un paiement effectivement reçu chez Orange Money ou Wave mais non rapproché automatiquement. Aucun paiement en espèces n’existe.</p>
        </>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={() => !busy && setTarget(null)}>
          <div role="dialog" aria-modal="true" className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">{target.mode === 'confirm' ? 'Confirmer le paiement reçu' : 'Refuser ce paiement'}</h2>
              <button type="button" onClick={() => setTarget(null)} aria-label="Fermer" className="text-ink/40"><X size={18} /></button>
            </div>
            <p className="mt-1 text-sm text-ink/60">{target.row.shopName} · {formatFcfa(target.row.amount)} · {PROVIDER_LABELS[target.row.provider]}</p>
            {target.mode === 'confirm' && (
              <div className="mt-4">
                <label htmlFor="sub-ref" className="mb-1 block text-xs font-medium text-ink/60">Référence de la transaction Orange Money / Wave (obligatoire)</label>
                <input id="sub-ref" value={reference} onChange={(e) => setReference(e.target.value.slice(0, 120))} className="input-field text-base" autoComplete="off" />
              </div>
            )}
            <div className="mt-3">
              <label htmlFor="sub-note" className="mb-1 block text-xs font-medium text-ink/60">{target.mode === 'confirm' ? 'Note (facultatif)' : 'Motif (envoyé au vendeur, facultatif)'}</label>
              <input id="sub-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} className="input-field text-base" autoComplete="off" />
            </div>
            {formError && <p className="mt-3 text-sm text-burgundy">{formError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="btn-outline w-full sm:w-auto">Annuler</button>
              <button type="button" onClick={() => void submit()} disabled={busy || (target.mode === 'confirm' && reference.trim().length < 4)} className="btn-primary w-full gap-2 sm:w-auto disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" /> : null} {target.mode === 'confirm' ? 'Activer l’abonnement' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
