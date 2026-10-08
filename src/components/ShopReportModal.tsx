import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import type { ShopReportReason } from '@/lib/supabaseShopReports';

const reasons: { id: ShopReportReason; label: string }[] = [
  { id: 'contrefait', label: 'Produit suspect ou contrefait' },
  { id: 'trompeur', label: 'Informations trompeuses' },
  { id: 'comportement', label: 'Comportement inapproprié' },
  { id: 'autre', label: 'Autre' },
];

// Customer-facing report — stored in shop_reports, visible only to admins
// (never to the reported shop's seller). Submitting one never changes the
// shop's visibility itself; an admin reviews it separately.
export default function ShopReportModal({
  onCancel, onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: ShopReportReason, details: string) => Promise<{ error?: string }>;
}) {
  const [reason, setReason] = useState<ShopReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) { setError('Choisissez un motif.'); return; }
    setError('');
    setSubmitting(true);
    const result = await onConfirm(reason, details);
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ink flex items-center gap-1.5"><Flag size={16} /> Signaler cette boutique</h3>
          <button onClick={onCancel} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>

        {done ? (
          <div className="py-4 text-center">
            <p className="text-sm text-ink/70">Merci, votre signalement a été transmis à notre équipe.</p>
            <button onClick={onCancel} className="btn-primary w-full mt-5">Fermer</button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${reason === r.id ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Détails (facultatif)</label>
            <textarea className="input-field" rows={3} placeholder="Précisez si besoin…" value={details} onChange={(e) => setDetails(e.target.value)} />
            {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void submit()} disabled={submitting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40">
                {submitting ? 'Envoi…' : 'Envoyer le signalement'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
