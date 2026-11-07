import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { activateSellerTrial } from '@/lib/supabaseSellerSubscription';
import { PLUS_HIGHLIGHTS, TRIAL_DAYS, TRIAL_PRELAUNCH_NOTE, FREE_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT } from '@/data/subscriptionPlans';
import { LAUNCH_DATE_ISO, LAUNCH_DATE_LABEL } from '@/shared/siteInfo';
import { PlusHighlightIcon } from '@/components/PlusHighlights';
import { ArrowLeft, Check, Crown, Loader2, AlertCircle, Smartphone, Calendar, ShieldCheck } from 'lucide-react';

export default function SellerTrialActivation({ onActivated }: { onActivated?: () => void } = {}) {
  const { sellerSupabaseShopId, navigate } = usePro();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  // Before the official launch, activate_seller_trial() starts the 30 days
  // on launch day; the Ezial Plus advantages are active right away.
  const beforeLaunch = Date.now() < Date.parse(`${LAUNCH_DATE_ISO}T00:00:00Z`);

  const handleActivate = async () => {
    if (!sellerSupabaseShopId) return;
    setActivating(true);
    setError('');
    const result = await activateSellerTrial(sellerSupabaseShopId);
    setActivating(false);
    if (result.error) { setError(result.error); return; }
    if (result.alreadyUsed) { setError('L’essai gratuit a déjà été utilisé pour cette boutique.'); return; }
    setTrialEnd(result.trialEnd ?? null);
    // activate_seller_trial() also records plan_chosen=true server-side —
    // this just keeps SellerLayout's own gate in sync immediately, instead
    // of it re-blocking "/seller" with a stale planChosen=false until the
    // next full reload.
    onActivated?.();
  };

  if (trialEnd) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700"><Check size={26} /></div>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Essai Ezial Plus activé !</h1>
          <p className="mt-1.5 text-sm text-ink/60">Vos avantages Ezial Plus sont actifs jusqu'au <strong>{formatDate(trialEnd)}</strong>.</p>
          {beforeLaunch && (
            <p className="mt-2 text-sm text-ink/60">Votre essai démarre le {LAUNCH_DATE_LABEL} ; vos avantages Ezial Plus sont déjà actifs.</p>
          )}
        </div>
        <button onClick={() => navigate('/seller')} className="btn-primary w-full">Aller à mon tableau de bord</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-2">
      <button onClick={() => navigate('/seller/abonnement')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><Crown size={26} /></div>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink">Essayez Ezial Plus gratuitement</h1>
        <p className="mt-1.5 text-sm text-ink/60">{TRIAL_DAYS} jours avec tous les avantages Ezial Plus, sans paiement.</p>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-4">Vos avantages pendant l’essai</p>
        <ul className="space-y-4">
          {PLUS_HIGHLIGHTS.map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
                <PlusHighlightIcon id={h.id} size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{h.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink/60">{h.text}</p>
                {h.note && <p className="mt-1 text-[11px] leading-snug text-ink/40">{h.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-start gap-2.5 text-sm text-ink/70">
          <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-ink/40" />
          <span>Aucun paiement demandé, aucun numéro Wave ou Orange Money obligatoire.</span>
        </div>
        <div className="flex items-start gap-2.5 text-sm text-ink/70">
          <Calendar size={15} className="mt-0.5 flex-shrink-0 text-ink/40" />
          <span>{beforeLaunch ? TRIAL_PRELAUNCH_NOTE : `L’essai commence dès son activation et dure ${TRIAL_DAYS} jours.`}</span>
        </div>
        <div className="flex items-start gap-2.5 text-sm text-ink/70">
          <Smartphone size={15} className="mt-0.5 flex-shrink-0 text-ink/40" />
          <span>Une seule période d'essai par boutique.</span>
        </div>
      </div>

      <p className="text-xs text-ink/50 text-center">
        À la fin de l’essai, vous choisissez : vous abonner à Ezial Plus pour le conserver, ou continuer avec Ezial Free. Sans abonnement, votre boutique repasse au forfait Free ({FREE_PRODUCT_LIMIT} produits publiés, commission de {FREE_COMMISSION_PERCENT} %) ; vos données et vos produits sont conservés.
      </p>

      {error && <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}

      <button onClick={() => void handleActivate()} disabled={activating} className="btn-primary w-full flex items-center justify-center gap-1.5">
        {activating ? <Loader2 size={16} className="animate-spin" /> : null}
        Activer mes 30 jours gratuits
      </button>
    </div>
  );
}
