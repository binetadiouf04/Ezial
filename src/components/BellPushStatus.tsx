import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getPushSupportStatus, isDeviceRegisteredForUser, isPushKeyConfigured, subscribeToPush, unsubscribeFromPush, type PushSupportStatus } from '@/lib/supabasePush';
import BellSwitchRow from './BellSwitchRow';
import type { BellAudience } from './BellPreferences';

// Notifications de CET appareil, dans la cloche : un interrupteur comme les
// autres réglages. Quand l'appareil ne peut pas les recevoir, l'interrupteur
// est grisé et la description dit pourquoi (au lieu de masquer l'option).
type BellPushState = PushSupportStatus | 'registered' | 'checking';

const WHAT: Record<BellAudience, string> = {
  customer: 'Alertes de commande, même quand Ezial est fermé.',
  seller: 'Nouvelles commandes, même quand Ezial est fermé.',
  driver: 'Nouvelles missions, même quand Ezial est fermé.',
};

export default function BellPushStatus({ audience = 'customer' }: { audience?: BellAudience }) {
  const [state, setState] = useState<BellPushState>('checking');
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id ?? null;
      const browser = getPushSupportStatus();
      // Autorisation déjà donnée : encore faut-il que CET appareil soit enregistré pour CE compte.
      const next: BellPushState = browser === 'granted' ? ((await isDeviceRegisteredForUser()) ? 'registered' : 'default') : browser;
      if (cancelled) return;
      setUserId(id);
      setState(next);
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking' || !userId) return null;

  const toggle = async () => {
    setError('');
    setSaving(true);
    if (state === 'registered' || state === 'granted') {
      await unsubscribeFromPush(userId);
      setSaving(false);
      setState('default');
      return;
    }
    const result = await subscribeToPush(userId);
    setSaving(false);
    if (result.error) { setError(result.error); setState(getPushSupportStatus() === 'denied' ? 'denied' : 'default'); return; }
    setState('registered');
  };

  const active = state === 'registered' || state === 'granted';
  const canToggle = state === 'default' || active;
  const description = active || state === 'default'
    ? WHAT[audience]
    : state === 'ios-install-required'
      ? 'Ouvrez Ezial depuis son icône sur l’écran d’accueil pour les activer.'
      : state === 'denied'
        ? 'Bloquées : autorisez-les dans les réglages du téléphone (Notifications, Ezial).'
        : isPushKeyConfigured()
          ? 'Ce navigateur ne permet pas les notifications.'
          : 'Pas encore activées sur Ezial.';

  return (
    <BellSwitchRow
      icon={<Bell size={14} />}
      title="Notifications du téléphone"
      description={description}
      checked={active}
      saving={saving}
      disabled={!canToggle}
      onToggle={() => void toggle()}
      error={error}
    />
  );
}
