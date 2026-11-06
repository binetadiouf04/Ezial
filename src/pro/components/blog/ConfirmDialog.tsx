import { X, Loader2 } from 'lucide-react';

// Small confirmation modal used by the blog admin (delete, unpublish, leave).
export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel = 'Annuler', danger = false, busy = false, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="blog-confirm-title" className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="blog-confirm-title" className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onCancel} disabled={busy} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
        </div>
        <p className="mb-5 text-sm text-ink/60">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={busy} className="btn-outline flex-1 px-4">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-burgundy hover:bg-burgundy-deep'}`}
          >
            {busy && <Loader2 size={15} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
