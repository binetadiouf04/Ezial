import { useState, useEffect } from 'react';
import { getMarketingPushConsent, setMarketingPushConsent } from '@/lib/supabaseMarketingPush';
import { Megaphone, Loader2 } from 'lucide-react';

// Separate, explicit opt-in for promotional pushes (new collections,
// promos, limited offers) — distinct from NotificationOptIn, which only
// covers transactional order-tracking push. Defaults to off; recorded
// consent persists even if the customer later disables/re-enables push
// entirely, since the two are independent settings.
export default function MarketingPushToggle() {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMarketingPushConsent().then((v) => { setConsent(v); setLoading(false); });
  }, []);

  const toggle = async () => {
    const next = !consent;
    setSaving(true);
    const result = await setMarketingPushConsent(next);
    setSaving(false);
    if (!result.error) setConsent(next);
  };

  if (loading) return null;

  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Megaphone size={16} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">Notifications promotionnelles</p>
        <p className="mt-0.5 text-xs text-ink/55">Nouvelles collections, promotions, offres limitées.</p>
        <p className="mt-0.5 text-xs text-ink/55">Activez pour recevoir des promotions exclusives — indépendant du suivi de commande ci-dessus.</p>
      </div>
      <button
        onClick={() => void toggle()}
        disabled={saving}
        role="switch"
        aria-checked={consent}
        className={`relative flex-shrink-0 h-6 w-11 rounded-full transition-colors ${consent ? 'bg-burgundy' : 'bg-ink/15'} disabled:opacity-50`}
      >
        {saving ? (
          <Loader2 size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
        ) : (
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${consent ? 'translate-x-5' : 'translate-x-0'}`} />
        )}
      </button>
    </div>
  );
}
