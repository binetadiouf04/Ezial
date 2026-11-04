import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { activateSellerTrial } from '@/lib/supabaseSellerSubscription';
import { PREMIUM_PRODUCT_LIMIT, PREMIUM_COMMISSION_PERCENT } from '@/data/subscriptionPlans';
import { ArrowLeft, Check, Crown, Loader2, AlertCircle, Smartphone, Calendar, ShieldCheck } from 'lucide-react';

const benefits = [
  `Jusqu'à ${PREMIUM_PRODUCT_LIMIT} produits publiés`,
  `Commission réduite à ${PREMIUM_COMMISSION_PERCENT} %`,
  'Possibilité de mise en avant sur l’accueil Ezial',
  'Priorité de sélection dans « Tendances du moment »',
  'Badge Ezial Premium sur la boutique',
  'Priorité de sélection pour les réseaux sociaux et publicités collectives Ezial',
];

export default function SellerTrialActivation() {
  const { sellerSupabaseShopId, navigate } = usePro();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [trialEnd, setTrialEnd] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!sellerSupabaseShopId) return;
    setActivating(true);
    setError('');
    const result = await activateSellerTrial(sellerSupabaseShopId);
    setActivating(false);
    if (result.error) { setError(result.error); return; }
    if (result.alreadyUsed) { setError('L’essai gratuit a déjà été utilisé pour cette boutique.'); return; }
    setTrialEnd(result.trialEnd ?? null);
  };

  if (trialEnd) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700"><Check size={26} /></div>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Essai Premium activé !</h1>
          <p className="mt-1.5 text-sm text-ink/60">Vos avantages Ezial Premium sont actifs jusqu'au <strong>{formatDate(trialEnd)}</strong>.</p>
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
        <h1 className="mt-4 font-display text-xl font-semibold text-ink">Essayez Ezial Premium gratuitement</h1>
        <p className="mt-1.5 text-sm text-ink/60">30 jours, tous les avantages inclus, sans aucun engagement.</p>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Ce que vous obtenez pendant 30 jours</p>
        <ul className="space-y-2.5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-ink/70">
              <Check size={15} className="mt-0.5 flex-shrink-0 text-burgundy" />
              {b}
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
          <span>L'essai commence dès son activation et dure 30 jours.</span>
        </div>
        <div className="flex items-start gap-2.5 text-sm text-ink/70">
          <Smartphone size={15} className="mt-0.5 flex-shrink-0 text-ink/40" />
          <span>Une seule période d'essai par boutique.</span>
        </div>
      </div>

      <p className="text-xs text-ink/50 text-center">
        À l'expiration, vous pourrez payer pour conserver Premium. Sans paiement, votre boutique repasse automatiquement en Free — aucune donnée ni produit n'est supprimé.
      </p>

      {error && <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}

      <button onClick={() => void handleActivate()} disabled={activating} className="btn-primary w-full flex items-center justify-center gap-1.5">
        {activating ? <Loader2 size={16} className="animate-spin" /> : null}
        Activer mes 30 jours gratuits
      </button>
    </div>
  );
}
