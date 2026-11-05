import { useState } from 'react';
import { usePro } from '../../ProContext';
import type { SubscriptionPaymentMethod } from '@/lib/supabaseSellerSubscription';
import { PREMIUM_PRICE_FCFA } from '@/data/subscriptionPlans';
import { ArrowLeft, Smartphone, AlertCircle } from 'lucide-react';

// Ezial no longer validates subscription payments manually: a payment must
// be confirmed automatically, server-side, by an authenticated Wave/Orange
// Money webhook — there is no "send the manual reference, wait for an
// admin to check it" step any more (that path, and confirmSubscriptionPayment/
// rejectSubscriptionPayment's manual-admin role in it, are retired for any
// NEW payment; see supabaseAdminSubscriptions.ts, kept only to let an admin
// resolve whatever was already pending_review before this change).
//
// Real Wave/Orange Money merchant credentials are not available yet, so
// there is nothing to wire this récapitulatif's "Payer" action to — rather
// than inventing a successful transaction or falling back to the old manual
// flow, this page says plainly that online payment is temporarily
// unavailable. Free and the 30-day trial stay fully available in the
// meantime (see SellerSubscription.tsx). The moment real credentials exist,
// this page's payment method choice + webhook verification is exactly what
// gets wired up — no rebuild needed.
export default function SellerSubscriptionPayment() {
  const { navigate } = usePro();
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('wave');

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
        <div className="flex gap-2">
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
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-amber-700" />
        <p className="text-sm text-amber-800">
          Le paiement en ligne Ezial Premium est temporairement indisponible : la connexion sécurisée à {method === 'wave' ? 'Wave' : 'Orange Money'} n'est pas encore activée. Revenez bientôt — votre forfait Free et votre essai Premium gratuit de 30 jours restent accessibles dès maintenant.
        </p>
      </div>

      <button disabled className="btn-primary w-full opacity-50">
        Payer {PREMIUM_PRICE_FCFA.toLocaleString('fr-FR')} FCFA
      </button>

      <p className="text-xs text-ink/45 text-center">
        Important : une fois un abonnement Premium payé, cette boutique ne pourra plus revenir au forfait Free — seul le renouvellement restera possible en cas d'expiration. L'abonnement n'est activé qu'après une confirmation authentifiée du paiement, jamais sur une simple déclaration.
      </p>
    </div>
  );
}
