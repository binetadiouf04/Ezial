import { useState, useEffect } from 'react';
import { getMyWhatsAppConsent, setMyWhatsAppConsent } from '@/lib/supabaseWhatsApp';
import { MessageCircle, Loader2, AlertCircle } from 'lucide-react';

// Consentement WhatsApp explicite (désactivé par défaut), un seul par compte :
// le même réglage vaut côté acheteur et côté vendeur. Enregistré dès le clic,
// indépendamment du bouton « Enregistrer » du formulaire voisin. Masqué tant
// que le module WhatsApp n'est pas installé (migration non exécutée) ou si la
// préférence ne peut pas être lue — jamais d'interrupteur qui ne ferait rien.
interface Props {
  source: 'compte' | 'boutique';
  label: string;
  description: string;
  /** 'card' : bloc autonome (profil) ; 'inline' : à l'intérieur d'un formulaire existant. */
  variant?: 'card' | 'inline';
}

export default function WhatsAppConsentToggle({ source, label, description, variant = 'card' }: Props) {
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getMyWhatsAppConsent().then((result) => {
      if (cancelled || !result.supported || 'error' in result) return;
      setConsent(result.optedIn);
      setVisible(true);
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    const next = !consent;
    setSaving(true);
    setError('');
    const result = await setMyWhatsAppConsent(next, source);
    setSaving(false);
    if (!result.supported) { setVisible(false); return; }
    if ('error' in result) { setError(result.error); return; }
    setConsent(result.optedIn);
  };

  if (!visible) return null;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><MessageCircle size={16} /></span>
        <div className="flex-1 min-w-0">
          {variant === 'card' && <p className="text-sm font-semibold text-ink">Notifications WhatsApp</p>}
          <p className={variant === 'card' ? 'mt-0.5 text-sm text-ink/75' : 'text-sm font-medium text-ink'}>{label}</p>
          <p className="mt-0.5 text-xs text-ink/55">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={saving}
          role="switch"
          aria-checked={consent}
          aria-label={label}
          className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors ${consent ? 'bg-burgundy' : 'bg-ink/15'} disabled:opacity-50`}
        >
          {saving ? (
            <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
          ) : (
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${consent ? 'translate-x-5' : 'translate-x-0'}`} />
          )}
        </button>
      </div>
      {error && <p className="mt-2 flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}</p>}
    </>
  );

  return variant === 'card'
    ? <div className="card p-4">{content}</div>
    : <div className="mt-3 rounded-lg border border-line bg-cream/40 p-3">{content}</div>;
}
