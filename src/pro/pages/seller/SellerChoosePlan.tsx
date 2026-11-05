import { useState } from 'react';
import { usePro } from '../../ProContext';
import PricingCards from '@/components/PricingCards';
import { chooseFreePlan } from '@/lib/supabaseSellerSubscription';
import { AlertCircle, Loader2 } from 'lucide-react';

// Shown once, right after a new seller's email is confirmed and their
// session is established — blocking (SellerLayout renders this instead of
// the dashboard/nav) until a real choice is recorded server-side
// (seller_subscriptions.plan_chosen). A seller who already chose never
// sees this again, on any future login or refresh.
export default function SellerChoosePlan({ onChosen }: { onChosen: () => void }) {
  const { navigate } = usePro();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleContinueFree = async () => {
    setSubmitting(true);
    setError('');
    const result = await chooseFreePlan();
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    onChosen();
  };

  return (
    <div className="min-h-screen bg-cream py-10">
      <div className="container-pro max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Choisissez votre formule</h1>
          <p className="mt-2 text-sm text-ink/55">Votre adresse est confirmée — une dernière étape avant de configurer votre boutique.</p>
        </div>

        {error && (
          <p className="mx-auto mb-4 flex max-w-sm items-start gap-1.5 rounded-lg bg-burgundy/5 px-3 py-2.5 text-sm text-burgundy">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}

        <PricingCards
          freeButtonLabel={submitting ? 'Activation…' : 'Continuer gratuitement'}
          freeButtonDisabled={submitting}
          onContinueFree={() => void handleContinueFree()}
          onStartTrial={() => navigate('/seller/abonnement/essai')}
          onSubscribe={() => navigate('/seller/abonnement/paiement')}
        />

        {submitting && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink/45">
            <Loader2 size={13} className="animate-spin" /> Activation de votre forfait Free…
          </div>
        )}
      </div>
    </div>
  );
}
