import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface FlagModalProps {
  title: string;
  quickReasons: string[];
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void> | void;
}

/**
 * Admin-only "Signaler" action — the note is stored as a real
 * moderation_flags row and is visible to the seller of the flagged shop/
 * product (never to customers). Quick-pick chips just insert common
 * reasons into the free-text note; there is no separate reason field to
 * keep the schema (and this feature) minimal.
 */
export default function FlagModal({ title, quickReasons, onCancel, onConfirm }: FlagModalProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const appendReason = (reason: string) => {
    setNote((n) => (n.trim() ? `${n.trim()} — ${reason}` : reason));
  };

  const handleConfirm = async () => {
    if (!note.trim()) { setError('Ajoutez un commentaire pour le vendeur.'); return; }
    setError('');
    setSaving(true);
    await onConfirm(note.trim());
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onCancel}><X size={18} className="text-ink/40" /></button>
        </div>

        <div className="flex items-start gap-2 mb-4 rounded-lg bg-orange-50 border border-orange-100 p-3">
          <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">Ce commentaire sera visible par le vendeur, jamais par les clients.</p>
        </div>

        <div className="space-y-1.5 mb-4">
          {quickReasons.map((r) => (
            <button key={r} type="button" onClick={() => appendReason(r)} className="w-full rounded-lg border border-line bg-white p-2.5 text-left text-sm text-ink/70 hover:border-ink/20 transition-colors">
              {r}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-ink/60 mb-1.5">Commentaire pour le vendeur</label>
        <textarea className="input-field" rows={3} placeholder="Ce que le vendeur doit corriger ou savoir…" value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} />

        {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
          <button onClick={handleConfirm} disabled={saving} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40">
            {saving ? 'Envoi…' : 'Signaler'}
          </button>
        </div>
      </div>
    </div>
  );
}
