import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { ModerationInput } from '../ProContext';

interface ModerationModalProps {
  title: string;
  reasons: string[];
  /** Short warning shown under the title, e.g. what happens once confirmed. */
  notice?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (input: ModerationInput) => void;
}

export default function ModerationModal({ title, reasons, notice, confirmLabel = 'Confirmer', danger = true, onCancel, onConfirm }: ModerationModalProps) {
  const [reason, setReason] = useState('');
  const [vendorMessage, setVendorMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm({ reason, vendorMessage: vendorMessage.trim() || undefined, internalNote: internalNote.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="card max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onCancel}><X size={18} className="text-ink/40" /></button>
        </div>

        {notice && (
          <div className="flex items-start gap-2 mb-4 rounded-lg bg-orange-50 border border-orange-100 p-3">
            <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-700">{notice}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Raison</label>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`w-full rounded-lg border p-2.5 text-left text-sm font-medium transition-all ${reason === r ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line bg-white text-ink/70 hover:border-ink/20'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Message au vendeur <span className="font-normal text-ink/35">(visible par le vendeur)</span></label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Ce que le vendeur doit corriger ou savoir…"
              value={vendorMessage}
              onChange={(e) => setVendorMessage(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Note interne <span className="font-normal text-ink/35">(visible uniquement par les Admins)</span></label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Contexte réservé à l'équipe Ezial…"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="btn-outline flex-1">Annuler</button>
          <button
            onClick={handleConfirm}
            disabled={!reason}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-burgundy hover:bg-burgundy-deep'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
