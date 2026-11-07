import { useState, Suspense, lazy } from 'react';
import { usePro } from '../ProContext';
import { useApp } from '@/store/AppContext';
import type { Role } from '../data';
import LoginForm from '../components/LoginForm';
import SellerAuthPanel from '../components/SellerAuthPanel';
import DriverLoginPanel from '../components/DriverLoginPanel';
import PlusHighlights from '@/components/PlusHighlights';
import {
  FREE_PRODUCT_LIMIT, PREMIUM_PRODUCT_LIMIT, FREE_COMMISSION_PERCENT, PREMIUM_COMMISSION_PERCENT, FREE_AD_PRODUCTS_LABEL,
  PLUS_AD_PRODUCTS_LABEL, PLUS_PLAN_NAME, PLUS_BILLING, TRIAL_DAYS, formatFcfa,
} from '@/data/subscriptionPlans';
import { Loader2, ArrowLeft, ArrowRight, ShieldCheck, Bike, Check, Crown } from 'lucide-react';

// Each role's layout (and every page it pulls in) is its own chunk — a
// seller logging in never has to download the admin dashboard's code, or
// the driver app's, and vice versa.
const SellerLayout = lazy(() => import('../layouts/SellerLayout'));
const DriverLayout = lazy(() => import('../layouts/DriverLayout'));
const AdminLayout = lazy(() => import('../layouts/AdminLayout'));

// Summary of the two plans on the Ezial Pro landing — numbers from
// src/shared/plans.js; the full comparison lives on /info/tarifs-vendeurs.
const planSummaries = [
  {
    id: 'free',
    name: 'Ezial Free',
    price: '0 FCFA',
    priceNote: 'Gratuit, sans limite de durée',
    points: [
      `Jusqu’à ${FREE_PRODUCT_LIMIT} produits publiés`,
      `${FREE_COMMISSION_PERCENT} % de commission par vente`,
      `${FREE_AD_PRODUCTS_LABEL} produit mis en avant dans les publicités Ezial`,
    ],
  },
  {
    id: 'plus',
    name: PLUS_PLAN_NAME,
    price: formatFcfa(PLUS_BILLING.quarterly.priceFcfa),
    priceNote: `tous les 3 mois, ou ${formatFcfa(PLUS_BILLING.annual.priceFcfa)} par an`,
    points: [
      `${PREMIUM_PRODUCT_LIMIT} produits publiés`,
      `${PREMIUM_COMMISSION_PERCENT} % de commission au lieu de ${FREE_COMMISSION_PERCENT} %, même pendant vos promotions`,
      `${PLUS_AD_PRODUCTS_LABEL} produits dans les publicités Ezial`,
      'Accès à la Sélection Ezial',
      `Essai gratuit de ${TRIAL_DAYS} jours`,
    ],
  },
] as const;

function ProRouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <Loader2 size={24} className="animate-spin text-ink/30" />
    </div>
  );
}

export default function ProEntryPage() {
  const { role, login, verifySellerLogin, signUpSellerAccount, continueAsSellerWithCurrentAccount, requestSellerPasswordReset, resendSellerConfirmationEmail, resendSellerConfirmationForLogin, verifyAdminLogin, checkDriverUsername, createDriverPin, signInDriverWithPin } = usePro();
  const { customerUser, navigate: navigateApp } = useApp();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [sellerInitialView, setSellerInitialView] = useState<'login' | 'signup'>('login');

  // If seller is logged in, render the seller layout
  if (role === 'seller') {
    return <Suspense fallback={<ProRouteFallback />}><SellerLayout /></Suspense>;
  }

  // If driver is logged in, render the driver layout
  if (role === 'driver') {
    return <Suspense fallback={<ProRouteFallback />}><DriverLayout /></Suspense>;
  }

  // If admin is logged in, render the admin layout
  if (role === 'admin') {
    return <Suspense fallback={<ProRouteFallback />}><AdminLayout /></Suspense>;
  }

  // Login form for selected role — seller gets its own richer panel
  // (login/signup/forgot password); admin/driver keep the simple form.
  if (selectedRole === 'seller') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <SellerAuthPanel
          onBack={() => setSelectedRole(null)}
          onLogin={(id, name, shopInfo) => login('seller', id, name, shopInfo)}
          verifySeller={verifySellerLogin}
          signUpSeller={signUpSellerAccount}
          loggedInCustomer={customerUser ? { label: customerUser.firstName || customerUser.email || customerUser.phone || 'votre compte' } : null}
          continueWithCurrentAccount={continueAsSellerWithCurrentAccount}
          requestPasswordReset={requestSellerPasswordReset}
          resendConfirmationEmail={resendSellerConfirmationEmail}
          resendConfirmationForLogin={resendSellerConfirmationForLogin}
          initialView={sellerInitialView}
        />
      </div>
    );
  }

  if (selectedRole === 'driver') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <DriverLoginPanel
          onBack={() => setSelectedRole(null)}
          onLogin={(id, name) => login('driver', id, name)}
          checkUsername={checkDriverUsername}
          createPin={createDriverPin}
          signIn={signInDriverWithPin}
        />
      </div>
    );
  }

  if (selectedRole) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <LoginForm role={selectedRole} onBack={() => setSelectedRole(null)} onLogin={(id, name, shopInfo) => login(selectedRole, id, name, shopInfo)} verifySeller={verifySellerLogin} verifyAdmin={verifyAdminLogin} />
      </div>
    );
  }

  // Entry screen — Ezial Pro's primary audience is sellers, so this is a
  // seller-focused landing, not a three-way role picker: what Ezial offers
  // (the two plans and the four Ezial Plus advantages, from
  // src/shared/plans.js), then the seller actions. Admin/driver access
  // (staff, not public signup) stays one tap away at the bottom, instead
  // of sharing top billing with "Créer ma boutique".
  const goToSignup = () => { setSellerInitialView('signup'); setSelectedRole('seller'); };
  const goToLogin = () => { setSellerInitialView('login'); setSelectedRole('seller'); };

  return (
    <div className="relative min-h-screen bg-cream">
      <div className="container-pro pb-14 pt-16 sm:pt-20">
        <button onClick={() => navigateApp('/')} className="absolute left-4 top-5 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink sm:left-6 sm:top-6">
          <ArrowLeft size={16} /> Marketplace
        </button>

        <div className="mx-auto w-full max-w-md text-center slide-up">
          <p className="eyebrow mb-3">Ezial Pro</p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Votre boutique commence ici.</h1>
          <p className="mt-3 text-sm text-ink/60 sm:text-base">Créez votre boutique, publiez vos produits et gérez vos commandes depuis un seul espace.</p>

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-2.5">
            <button onClick={goToSignup} className="btn-primary w-full">Créer ma boutique</button>
            <button onClick={goToLogin} className="btn-outline w-full">Se connecter à Ezial Pro</button>
          </div>
        </div>

        {/* The two plans, summarized */}
        <section aria-labelledby="pro-plans-title" className="mx-auto mt-16 max-w-5xl">
          <div className="text-center">
            <p className="eyebrow mb-2">Nos formules</p>
            <h2 id="pro-plans-title" className="section-title">Deux formules pour vendre sur Ezial</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5">
            {planSummaries.map((plan) => {
              const plus = plan.id === 'plus';
              return (
                <div key={plan.id} className={`flex flex-col rounded-2xl p-6 sm:p-7 ${plus ? 'bg-burgundy text-white shadow-xl shadow-burgundy/20' : 'border border-line bg-white'}`}>
                  <p className={`flex items-center gap-2 font-display text-2xl font-semibold ${plus ? 'text-white' : 'text-ink'}`}>
                    {plus && <Crown size={19} className="text-champagne" aria-hidden="true" />} {plan.name}
                  </p>
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                    <span className={`font-display text-3xl font-semibold ${plus ? 'text-white' : 'text-ink'}`}>{plan.price}</span>
                    <span className={`text-sm ${plus ? 'text-white/70' : 'text-ink/50'}`}>{plan.priceNote}</span>
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {plan.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm leading-snug">
                        <Check size={16} className={`mt-0.5 flex-shrink-0 ${plus ? 'text-champagne' : 'text-burgundy'}`} aria-hidden="true" />
                        <span className={plus ? 'text-white/90' : 'text-ink/70'}>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* The four Ezial Plus advantages, in full */}
        <section aria-labelledby="pro-plus-title" className="mx-auto mt-14 max-w-5xl">
          <div className="mb-8 text-center">
            <p className="eyebrow mb-2">{PLUS_PLAN_NAME}</p>
            <h2 id="pro-plus-title" className="section-title">Ce qu’{PLUS_PLAN_NAME} apporte à votre boutique</h2>
          </div>
          <PlusHighlights />
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => navigateApp('/info/tarifs-vendeurs')} className="btn-outline w-full sm:w-auto">
              Voir les tarifs vendeurs <ArrowRight size={15} />
            </button>
            <button onClick={goToSignup} className="btn-primary w-full sm:w-auto">Créer ma boutique</button>
          </div>
        </section>

        {/* Staff access — always visible (not a gate), but visually
            subordinate (smaller, muted label) so it never competes with
            the seller actions above. No public signup is possible from
            here: each card opens the exact same admin/driver login screen
            already reached from the old picker — server-side role checks
            are untouched. */}
        <div className="mx-auto mt-16 w-full max-w-sm border-t border-line pt-6 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink/35">Autres espaces</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSelectedRole('admin')} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-3 py-4 text-center transition-colors hover:border-burgundy/30 hover:bg-cream">
              <ShieldCheck size={20} className="text-ink/60" />
              <span className="text-sm font-medium text-ink/70">Administrateur</span>
            </button>
            <button onClick={() => setSelectedRole('driver')} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-3 py-4 text-center transition-colors hover:border-burgundy/30 hover:bg-cream">
              <Bike size={20} className="text-ink/60" />
              <span className="text-sm font-medium text-ink/70">Livreur</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
