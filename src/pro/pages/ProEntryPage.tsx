import { useState, Suspense, lazy } from 'react';
import { usePro } from '../ProContext';
import { useApp } from '@/store/AppContext';
import type { Role } from '../data';
import LoginForm from '../components/LoginForm';
import SellerAuthPanel from '../components/SellerAuthPanel';
import DriverLoginPanel from '../components/DriverLoginPanel';
import PricingCards from '@/components/PricingCards';
import { Loader2, ArrowLeft, ShieldCheck, Bike } from 'lucide-react';

// Each role's layout (and every page it pulls in) is its own chunk — a
// seller logging in never has to download the admin dashboard's code, or
// the driver app's, and vice versa.
const SellerLayout = lazy(() => import('../layouts/SellerLayout'));
const DriverLayout = lazy(() => import('../layouts/DriverLayout'));
const AdminLayout = lazy(() => import('../layouts/AdminLayout'));

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
  // seller-focused landing, not a three-way role picker: the seller
  // actions, then the two plan cards (with the 3 mois / Annuel toggle) and
  // nothing else about the plans — the full comparison lives on
  // /info/tarifs-vendeurs. Admin/driver access
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

        {/* The two plans — every choice starts with creating the shop */}
        <section aria-labelledby="pro-plans-title" className="mx-auto mt-16 max-w-5xl">
          <div className="mb-8 text-center">
            <p className="eyebrow mb-2">Nos formules</p>
            <h2 id="pro-plans-title" className="section-title">Deux formules pour vendre sur Ezial</h2>
          </div>
          <PricingCards
            freeButtonLabel="Commencer gratuitement"
            onContinueFree={goToSignup}
            onStartTrial={goToSignup}
            onSubscribe={goToSignup}
          />
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
