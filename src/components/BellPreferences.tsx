import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Megaphone, MessageCircle } from 'lucide-react';
import { getMyWhatsAppConsent, setMyWhatsAppConsent } from '@/lib/supabaseWhatsApp';
import { getMarketingPushConsent, setMarketingPushConsent } from '@/lib/supabaseMarketingPush';

// Réglages des autres notifications, au même endroit que l'activation des
// notifications du téléphone : directement dans la cloche. Chaque ligne est un
// interrupteur enregistré dès le clic. Aucune ligne ne s'affiche si la
// fonction n'existe pas (WhatsApp pas installé) : jamais d'interrupteur qui ne
// ferait rien.
export type BellAudience = 'customer' | 'seller' | 'driver';

function SwitchRow({ icon, title, description, checked, saving, onToggle, error }: {
  icon: React.ReactNode; title: string; description: string; checked: boolean; saving: boolean; onToggle: () => void; error: string;
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
          disabled={saving}
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

function WhatsAppRow({ audience }: { audience: 'customer' | 'seller' }) {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getMyWhatsAppConsent().then((r) => {
      if (cancelled || !r.supported || 'error' in r) return;
      setChecked(r.optedIn);
      setVisible(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  const toggle = async () => {
    setSaving(true);
    setError('');
    const r = await setMyWhatsAppConsent(!checked, audience === 'seller' ? 'boutique' : 'compte');
    setSaving(false);
    if (!r.supported) { setVisible(false); return; }
    if ('error' in r) { setError(r.error); return; }
    setChecked(r.optedIn);
  };

  return (
    <SwitchRow
      icon={<MessageCircle size={14} />}
      title={audience === 'seller' ? 'Rappel WhatsApp' : 'Messages WhatsApp'}
      description={audience === 'seller'
        ? 'Un seul message, 24 h après une commande que vous n’avez pas encore prise en charge.'
        : 'Confirmation de commande et avis de livraison en cours. 2 messages au plus par commande.'}
      checked={checked}
      saving={saving}
      onToggle={() => void toggle()}
      error={error}
    />
  );
}

function PromoRow() {
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getMarketingPushConsent().then((v) => { if (!cancelled) { setChecked(v); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  if (!loaded) return null;

  const toggle = async () => {
    setSaving(true);
    setError('');
    const r = await setMarketingPushConsent(!checked);
    setSaving(false);
    if (r.error) { setError('Votre préférence n’a pas pu être enregistrée. Réessayez.'); return; }
    setChecked(!checked);
  };

  return (
    <SwitchRow
      icon={<Megaphone size={14} />}
      title="Promotions"
      description="Nouvelles collections et offres limitées, sur votre téléphone."
      checked={checked}
      saving={saving}
      onToggle={() => void toggle()}
      error={error}
    />
  );
}

export default function BellPreferences({ audience }: { audience: BellAudience }) {
  if (audience === 'driver') return null;
  return (
    <>
      <WhatsAppRow audience={audience} />
      {audience === 'customer' && <PromoRow />}
    </>
  );
}
