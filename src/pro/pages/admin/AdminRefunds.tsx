import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import {
  fetchRefunds, markRefunded, REFUND_METHOD_LABELS, CANCEL_REASON_LABELS,
  type RefundRow, type RefundMethod,
} from '@/lib/supabaseAdminRefunds';
import { formatFCFA } from '@/data/products';
import { Loader2, AlertCircle, Phone, Check, Undo2, X } from 'lucide-react';

type Tab = 'to_refund' | 'refunded';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const paymentLabel = (m: string | null) => (m === 'orange_money' ? 'Orange Money' : m === 'wave' ? 'Wave' : m === 'paypal' ? 'PayPal' : m ?? '—');

// Remboursements à effectuer après l'annulation d'une part de commande par sa boutique.
// Aucun remboursement automatique : l'administratrice rembourse puis note le moyen et la référence.
export default function AdminRefunds() {
  const { navigate } = usePro();
  const [tab, setTab] = useState<Tab>('to_refund');
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<RefundRow | null>(null);
  const [method, setMethod] = useState<RefundMethod>('orange_money');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await fetchRefunds(tab);
    setLoading(false);
    if (!result.supported) { setSupported(false); setRows([]); return; }
    setSupported(true);
    setRows(result.rows);
    if (result.error) setError(result.error);
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const openForm = (row: RefundRow) => {
    setTarget(row);
    setMethod(row.paymentMethod === 'wave' ? 'wave' : 'orange_money');
    setReference('');
    setNote('');
    setFormError('');
  };

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    setFormError('');
    const result = await markRefunded(target.id, method, reference, note);
    setBusy(false);
    if (result.error) { setFormError(result.error); return; }
    setTarget(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Remboursements à effectuer</h1>
        <p className="mt-1 text-sm text-ink/55">Parts de commandes annulées par leur boutique après paiement du client. Remboursez depuis Orange Money ou Wave, puis cliquez sur « Marquer remboursé ».</p>
      </div>

      <div className="flex gap-2">
        {([['to_refund', 'À rembourser'], ['refunded', 'Remboursés']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>{label}</button>
        ))}
      </div>

      {!supported && (
        <div className="card p-8 text-center"><p className="text-sm text-ink/55">Les remboursements apparaîtront ici après la mise à jour de la base (annulation par la boutique).</p></div>
      )}
      {error && <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>}

      {supported && (loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center"><p className="text-sm text-ink/45">{tab === 'to_refund' ? 'Aucun remboursement à effectuer.' : 'Aucun remboursement effectué pour le moment.'}</p></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <button onClick={() => navigate(`/admin/commandes/${r.orderId}`)} className="font-mono text-sm font-semibold text-burgundy hover:underline">{r.orderNumber}</button>
                  <p className="mt-0.5 text-xs text-ink/55">Boutique : {r.shopName} · {CANCEL_REASON_LABELS[r.reason] ?? r.reason}{r.note ? ` (« ${r.note} »)` : ''}</p>
                  <p className="text-xs text-ink/40">Annulée le {formatDateTime(r.cancelledAt)}</p>
                </div>
                <p className="text-lg font-semibold text-ink">{formatFCFA(r.amount)}</p>
              </div>
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink/70">
                <p>Client : <span className="font-medium text-ink">{r.customerName}</span></p>
                {r.customerPhone && <p className="flex items-center gap-1.5"><Phone size={13} className="text-ink/40" /> <a href={`tel:${r.customerPhone}`} className="underline">{r.customerPhone}</a></p>}
                <p>Payé par : {paymentLabel(r.paymentMethod)}{r.paymentReference ? ` · réf. ${r.paymentReference}` : ''}</p>
              </div>
              {r.refundStatus === 'to_refund' ? (
                <button onClick={() => openForm(r)} className="btn-primary mt-3 w-full min-h-[44px]"><Undo2 size={15} /> Marquer remboursé</button>
              ) : (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  <Check size={15} className="mt-0.5 flex-shrink-0" />
                  <span>Remboursé le {formatDateTime(r.refundedAt)} via {r.refundMethod ? REFUND_METHOD_LABELS[r.refundMethod] : '—'}{r.refundReference ? ` · réf. ${r.refundReference}` : ''}{r.refundNote ? ` · ${r.refundNote}` : ''}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      ))}

      {target && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation" onClick={busy ? undefined : () => setTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label="Marquer remboursé" className="card max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">Marquer remboursé</h3>
              <button type="button" onClick={() => setTarget(null)} disabled={busy} aria-label="Fermer" className="text-ink/50 hover:text-ink"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink/65">{formatFCFA(target.amount)} à {target.customerName} · {target.orderNumber}. Confirmez seulement après avoir envoyé l’argent.</p>
            <div>
              <label htmlFor="refund-method" className="mb-1 block text-xs font-medium text-ink/60">Moyen utilisé</label>
              <select id="refund-method" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)} className="input-field text-base">
                {(Object.keys(REFUND_METHOD_LABELS) as RefundMethod[]).map((m) => <option key={m} value={m}>{REFUND_METHOD_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="refund-ref" className="mb-1 block text-xs font-medium text-ink/60">Référence de l’envoi (facultatif)</label>
              <input id="refund-ref" value={reference} onChange={(e) => setReference(e.target.value.slice(0, 120))} className="input-field text-base" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="refund-note" className="mb-1 block text-xs font-medium text-ink/60">Note (facultatif)</label>
              <input id="refund-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} className="input-field text-base" autoComplete="off" />
            </div>
            {formError && <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {formError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary">{busy && <Loader2 size={15} className="animate-spin" />} Confirmer le remboursement</button>
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="btn-outline">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
