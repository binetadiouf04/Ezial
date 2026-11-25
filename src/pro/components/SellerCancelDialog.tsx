import { useState } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { cancelOrderShop, cancelReasonLabels, type CancelReason } from '@/lib/supabaseSellerOrders';

interface Props {
  orderShopId: string;
  orderNumber: string;
  onClose: () => void;
  /** Annulation enregistrée (ou déjà enregistrée) : la page recharge la commande. */
  onDone: (orderCancelled: boolean) => void;
  /** La fonction n'existe pas en base : la page masque le bouton. */
  onUnavailable: () => void;
}

const reasons: CancelReason[] = ['out_of_stock', 'item_unavailable', 'other'];

// Fenêtre en deux temps : motif, puis confirmation claire (l'annulation est définitive).
export default function SellerCancelDialog({ orderShopId, orderNumber, onClose, onDone, onUnavailable }: Props) {
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError('');
    const result = await cancelOrderShop(orderShopId, reason, note);
    setBusy(false);
    if (result.unavailable) { onUnavailable(); return; }
    if (!result.ok) { setError(result.error ?? 'Impossible d’annuler la commande. Réessayez.'); setStep('reason'); return; }
    onDone(!!result.orderCancelled);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label="Annuler cette commande" className="card max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">
            {step === 'reason' ? 'Pourquoi ne pouvez-vous pas honorer cette commande ?' : 'Annuler définitivement ?'}
          </h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="flex-shrink-0 text-ink/50 hover:text-ink"><X size={18} /></button>
        </div>

        {step === 'reason' ? (
          <>
            <p className="text-xs text-ink/55">Commande {orderNumber}</p>
            <div className="space-y-2" role="radiogroup" aria-label="Motif">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${reason === r ? 'border-burgundy bg-burgundy/5 font-medium text-burgundy' : 'border-line text-ink/75'}`}
                >
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${reason === r ? 'border-burgundy' : 'border-ink/30'}`}>
                    {reason === r && <span className="h-2 w-2 rounded-full bg-burgundy" />}
                  </span>
                  {cancelReasonLabels[r]}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="cancel-note" className="mb-1 block text-xs font-medium text-ink/60">Précision (facultatif)</label>
              <textarea
                id="cancel-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                maxLength={200}
                className="input-field text-base"
                placeholder="Ex. : plus de taille M"
              />
            </div>
            {error && <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStep('confirm')} disabled={!reason} className="btn-primary">Continuer</button>
              <button type="button" onClick={onClose} className="btn-outline">Fermer</button>
            </div>
          </>
        ) : (
          <>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/70">
              <li>Votre part de la commande {orderNumber} est annulée, vous ne pourrez pas revenir en arrière.</li>
              <li>Le client est prévenu, et remboursé par Ezial s’il a déjà payé.</li>
              <li>Le stock est remis et aucune vente ne vous est versée pour cette commande.</li>
              <li>Le livreur est prévenu si besoin.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void submit()} disabled={busy} className="btn-danger">
                {busy && <Loader2 size={15} className="animate-spin" />} Oui, annuler la commande
              </button>
              <button type="button" onClick={() => setStep('reason')} disabled={busy} className="btn-outline">Retour</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
