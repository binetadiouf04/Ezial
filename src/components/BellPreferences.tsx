import { useEffect, useState } from 'react';
import { Megaphone, MessageCircle } from 'lucide-react';
import BellSwitchRow from './BellSwitchRow';
import { getMyWhatsAppConsent, setMyWhatsAppConsent } from '@/lib/supabaseWhatsApp';
import { getMarketingPushConsent, setMarketingPushConsent } from '@/lib/supabaseMarketingPush';

// Réglages des autres notifications, au même endroit que l'activation des
// notifications du téléphone : directement dans la cloche. Chaque ligne est un
// interrupteur enregistré dès le clic. Aucune ligne ne s'affiche si la
// fonction n'existe pas (WhatsApp pas installé) : jamais d'interrupteur qui ne
// ferait rien.
export type BellAudience = 'customer' | 'seller' | 'driver';

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
    <BellSwitchRow
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
    <BellSwitchRow
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
