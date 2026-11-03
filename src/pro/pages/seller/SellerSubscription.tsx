import { useEffect, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import {
  fetchSellerSubscription,
  fetchActiveProductCount,
  fetchSubscriptionPayments,
  submitSubscriptionPayment,
  FREE_PRODUCT_LIMIT,
  PRO_PRODUCT_LIMIT,
  PRO_PRICE_FCFA,
  type SellerSubscriptionInfo,
  type SubscriptionPaymentRow,
  type SubscriptionPaymentMethod,
} from '@/lib/supabaseSellerSubscription';
import { Crown, Package, Calendar, Loader2, Check, Smartphone } from 'lucide-react';

export default function SellerSubscription() {
  const { sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [info, setInfo] = useState<SellerSubscriptionInfo | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [payments, setPayments] = useState<SubscriptionPaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('wave');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!sellerSupabaseShopId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      fetchSellerSubscription(sellerSupabaseShopId),
      fetchActiveProductCount(sellerSupabaseShopId),
      fetchSubscriptionPayments(sellerSupabaseShopId),
    ]).then(([sub, count, pays]) => {
      if (cancelled) return;
      setInfo(sub);
      setActiveCount(count);
      setPayments(pays);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  const hasPendingPayment = payments.some((p) => p.status === 'pending_review');

  const handleSubmit = async () => {
    if (!sellerSupabaseShopId || !reference.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    const result = await submitSubscriptionPayment(sellerSupabaseShopId, method, reference);
    setSubmitting(false);
    if (result.error) { setSubmitError(result.error); return; }
    setSubmitted(true);
    setShowForm(false);
    setReference('');
    const pays = await fetchSubscriptionPayments(sellerSupabaseShopId);
    setPayments(pays);
  };

  if (sellerShopIsOfficial) {
    return (
      <div className="card p-10 text-center">
        <Crown size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Les boutiques officielles Ezial ne sont pas soumises aux abonnements.</p>
      </div>
    );
  }

  if (!sellerSupabaseShopId) {
    return (
      <div className="card p-10 text-center">
        <Crown size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Votre compte vendeur n'est relié à aucune boutique Supabase réelle. Contactez EZIAL.</p>
      </div>
    );
  }

  if (isLoading || !info) {
    return <div className="p-10 text-center"><p className="text-sm text-ink/50">Chargement…</p></div>;
  }

  const inTrial = info.isProActive && info.trialUsed && info.trialEnd && !payments.some((p) => p.status === 'confirmed');
  const validityDate = info.isProActive ? info.proUntil : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Mon abonnement</h1>
        <p className="mt-1 text-sm text-ink/55">Votre forfait Ezial et vos limites de produits</p>
      </div>

      {/* Current plan */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Crown size={18} className={info.isProActive ? 'text-burgundy' : 'text-ink/30'} />
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {info.isProActive ? 'Ezial Pro' : 'Gratuit'}
              </p>
              {info.isProActive && (
                <p className="text-xs text-ink/50">{inTrial ? 'Essai gratuit de 30 jours' : 'Abonnement actif'}</p>
              )}
            </div>
          </div>
          {!info.isProActive && !hasPendingPayment && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex-shrink-0">
              Activer Pro
            </button>
          )}
          {info.isProActive && !hasPendingPayment && (
            <button onClick={() => setShowForm(true)} className="btn-outline flex-shrink-0">
              Renouveler Pro
            </button>
          )}
        </div>

        {hasPendingPayment && (
          <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            Votre demande de paiement est en cours de vérification par Ezial.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-cream p-3">
            <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Package size={13} /> Produits actifs</p>
            <p className="mt-1 text-lg font-semibold text-ink">{activeCount} / {info.productLimit}</p>
          </div>
          <div className="rounded-lg bg-cream p-3">
            <p className="text-xs font-medium text-ink/50 flex items-center gap-1.5"><Calendar size={13} /> {info.isProActive ? "Valable jusqu'au" : 'Essai utilisé'}</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {validityDate ? formatDate(validityDate) : info.trialUsed ? 'Oui' : 'Non'}
            </p>
          </div>
        </div>

        {!info.isProActive && (
          <p className="mt-3 text-xs text-ink/50">
            Passez à Ezial Pro : {PRO_PRODUCT_LIMIT} produits actifs, mise en avant sur la marketplace, priorité sur les campagnes publicitaires — {PRO_PRICE_FCFA.toLocaleString('fr-FR')} FCFA / 3 mois.
          </p>
        )}
      </div>

      {/* Payment form */}
      {showForm && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">Activer / renouveler Ezial Pro</h2>
          <p className="text-xs text-ink/55 mb-4">
            Envoyez {PRO_PRICE_FCFA.toLocaleString('fr-FR')} FCFA par Wave ou Orange Money, puis indiquez votre référence de transaction ci-dessous. Un administrateur Ezial vérifiera le paiement et activera votre abonnement.
          </p>

          <div className="flex gap-2 mb-3">
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

          <label className="block text-xs font-medium text-ink/60 mb-1.5">Référence de la transaction</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ex. WAVE-7F3K2P ou référence Orange Money"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink focus:border-burgundy focus:outline-none"
          />
          {submitError && <p className="mt-2 text-sm text-burgundy">{submitError}</p>}

          <div className="mt-4 flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-outline flex-1">Annuler</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || !reference.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
              Envoyer la demande
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <p className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <Check size={15} /> Demande envoyée. Vous serez notifié dès validation.
        </p>
      )}

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Historique des paiements</h2>
          <div className="card divide-y divide-line">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{p.amount.toLocaleString('fr-FR')} FCFA — {p.method === 'wave' ? 'Wave' : 'Orange Money'}</p>
                  <p className="text-xs text-ink/45 mt-0.5 font-mono">{p.reference}</p>
                  <p className="text-xs text-ink/40 mt-0.5">{formatDate(p.requestedAt)}</p>
                </div>
                <StatusChip
                  status={p.status}
                  label={p.status === 'pending_review' ? 'En vérification' : p.status === 'confirmed' ? 'Confirmé' : 'Refusée'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-ink/40">
        Le forfait Gratuit permet jusqu'à {FREE_PRODUCT_LIMIT} produits actifs. En cas d'expiration de l'abonnement Pro, votre boutique repasse automatiquement en Gratuit sans perte de données : vous choisissez vous-même quels produits rester actifs.
      </p>
    </div>
  );
}
