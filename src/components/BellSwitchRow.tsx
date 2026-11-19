import { AlertCircle, Loader2 } from 'lucide-react';

// Une ligne de réglage de la cloche : icône, titre, description, interrupteur.
// Toutes les lignes (notifications du téléphone, WhatsApp, promotions) utilisent
// cette même mise en forme.
export default function BellSwitchRow({ icon, title, description, checked, saving = false, disabled = false, onToggle, error = '' }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  saving?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  error?: string;
}) {
  return (
    <div className="border-b border-line px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink/55">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving || disabled}
          role="switch"
          aria-checked={checked}
          aria-label={title}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-burgundy' : 'bg-ink/15'} disabled:opacity-50`}
        >
          {saving
            ? <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
            : <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />}
        </button>
      </div>
      {error && <p className="mt-1.5 flex items-start gap-1 text-[11px] text-burgundy"><AlertCircle size={11} className="mt-0.5 flex-shrink-0" /> {error}</p>}
    </div>
  );
}
