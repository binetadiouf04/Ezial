import { useState } from 'react';
import { usePro } from '../../ProContext';
import { submitSubscriptionPayment, type SubscriptionPaymentMethod } from '@/lib/supabaseSellerSubscription';
import { PREMIUM_PRICE_FCFA } from '@/data/subscriptionPlans';
import { ArrowLeft, Check, Loader2, AlertCircle, Smartphone, Info } from 'lucide-react';

// A real Wave/Orange Money API integration isn't available yet (no
// merchant credentials) — see supabaseSellerSubscription.ts. Until then
// this stays declarative, exactly like a customer order's own payment
// reference step: the seller sends the money themselves, then gives Ezial
// the transaction reference to verify, rather than paying through an
// embedded checkout. Never claims a payment succeeded on its own.
export default function SellerSubscriptionPayment() {
  const { sellerSupabaseShopId, navigate } = usePro();
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('wave');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!sellerSupabaseShopId || !reference.trim()) return;
    setSubmitting(true);
    setError('');
    const result = await submitSubscriptionPayment(sellerSupabaseShopId, method, reference);
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700"><Check size={26} /></div>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Référence envoyée</h1>
          <p className="mt-1.5 text-sm text-ink/60">Un administrateur Ezial va vérifier votre paiement. Votre abonnement Premium sera activé dès confirmation — vous serez notifié.</p>
        </div>
        <button onClick={() => navigate('/seller/abonnement')} className="btn-primary w-full">Retour à Mon abonnement</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-2">
      <button onClick={() => navigate('/seller/abonnement')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <h1 className="font-display text-xl font-semibold text-ink">S'abonner à Ezial Premium</h1>

      {/* Récapitulatif */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Récapitulatif</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink/55">Abonnement</span><span className="font-medium text-ink">Ezial Premium</span></div>
          <div className="flex justify-between"><span className="text-ink/55">Durée</span><span className="font-medium text-ink">3 mois</span></div>
          <div className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold text-ink">Total</span><span className="font-display text-lg font-semibold text-burgundy">{PREMIUM_PRICE_FCFA.toLocaleString('fr-FR')} FCFA</span></div>
        </div>
      </div>

      {/* Moyen de paiement */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-3">Moyen de paiement</p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMethod('wave')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${method === 'wave' ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line text-ink/60'}`}
          >
            <Smartphone size={15} /> Wave
          </button>
          <button
            onClick={() => setMethod('orange_money')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${method === 'orange_money' ? 'border-burgundy bg-burgundy/5 text-burgundy' : 'border-line text-ink/60'}`}
          >
            <Smartphone size={15} /> Orange Money
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-cream p-3 mb-4">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-ink/40" />
          <p className="text-xs text-ink/60">
            Envoyez {PREMIUM_PRICE_FCFA.toLocaleString('fr-FR')} FCFA par {method === 'wave' ? 'Wave' : 'Orange Money'} vers le contact Ezial, puis indiquez ci-dessous la référence de votre transaction. Le paiement en ligne direct sera bientôt disponible.
          </p>
        </div>

        <label className="block text-xs font-medium text-ink/60 mb-1.5">Référence de la transaction</label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ex. WAVE-7F3K2P ou référence Orange Money"
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink focus:border-burgundy focus:outline-none"
        />
        {error && <p className="mt-2 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={submitting || !reference.trim()}
        className="btn-primary w-full flex items-center justify-center gap-1.5"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
        Payer {PREMIUM_PRICE_FCFA.toLocaleString('fr-FR')} FCFA
      </button>

      <p className="text-xs text-ink/45 text-center">
        L'abonnement est activé uniquement après vérification du paiement par un administrateur Ezial — jamais automatiquement.
      </p>
    </div>
  );
}
