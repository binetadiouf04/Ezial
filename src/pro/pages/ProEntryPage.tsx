import { useState, Suspense, lazy } from 'react';
import { usePro } from '../ProContext';
import { useApp } from '@/store/AppContext';
import type { Role } from '../data';
import LoginForm from '../components/LoginForm';
import AdminMfaChallenge from '../components/AdminMfaChallenge';
import SellerAuthPanel from '../components/SellerAuthPanel';
import DriverLoginPanel from '../components/DriverLoginPanel';
import { getStaffSpace } from '@/lib/staffSpace';
import { useNoIndex } from '@/lib/seoHead';
import { BECOME_SELLER_ROUTE } from '@/lib/sellerIntent';
import { Loader2 } from 'lucide-react';

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
  const { role, adminMfaChallenge, login, verifySellerLogin, signUpSellerAccount, continueAsSellerWithCurrentAccount, requestSellerPasswordReset, resendSellerConfirmationEmail, resendSellerConfirmationForLogin, verifyAdminLogin, checkDriverUsername, createDriverPin, signInDriverWithPin } = usePro();
  const { customerUser, navigate: navigateApp } = useApp();
  // admin.ezial.net → administrateur, livreur.ezial.net → livreur. Ces deux
  // espaces n'existent plus sur le site public : ni lien, ni écran, et une
  // session de ce type n'y ouvre rien. Le site public n'ouvre que l'espace
  // vendeur. Les droits restent contrôlés côté serveur dans tous les cas.
  const staffSpace = getStaffSpace();
  useNoIndex(staffSpace !== null);
  // On the public site, /pro is the seller sign-in itself: « Ma boutique »
  // opens it on login (?vue=connexion), « Devenir vendeur » on shop creation
  // (?vue=inscription). The commercial presentation (plans, steps) lives on
  // /devenir-vendeur, not here.
  const [selectedRole, setSelectedRole] = useState<Role | null>(staffSpace ?? 'seller');
  const [sellerInitialView] = useState<'login' | 'signup'>(() =>
    new URLSearchParams(window.location.search).get('vue') === 'inscription' ? 'signup' : 'login');

  const roleAllowedHere = role === 'seller' ? staffSpace === null : role === staffSpace;

  // Connexion administrateur en attente du code à 6 chiffres : rien d'autre
  // ne s'affiche dans l'espace administrateur tant qu'il n'est pas validé.
  if (adminMfaChallenge && staffSpace === 'admin') {
    return <AdminMfaChallenge />;
  }

  // If seller is logged in, render the seller layout
  if (role === 'seller' && roleAllowedHere) {
    return <Suspense fallback={<ProRouteFallback />}><SellerLayout /></Suspense>;
  }

  // If driver is logged in, render the driver layout
  if (role === 'driver' && roleAllowedHere) {
    return <Suspense fallback={<ProRouteFallback />}><DriverLayout /></Suspense>;
  }

  // If admin is logged in, render the admin layout
  if (role === 'admin' && roleAllowedHere) {
    return <Suspense fallback={<ProRouteFallback />}><AdminLayout /></Suspense>;
  }

  // Login form for selected role — seller gets its own richer panel
  // (login/signup/forgot password); admin/driver keep the simple form.
  if (selectedRole === 'seller') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <SellerAuthPanel
          onBack={() => navigateApp(sellerInitialView === 'signup' ? BECOME_SELLER_ROUTE : '/')}
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
          onBack={staffSpace ? undefined : () => setSelectedRole(null)}
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
        <LoginForm role={selectedRole} onBack={staffSpace ? undefined : () => setSelectedRole(null)} onLogin={(id, name, shopInfo) => login(selectedRole, id, name, shopInfo)} verifySeller={verifySellerLogin} verifyAdmin={verifyAdminLogin} />
      </div>
    );
  }

  // Only reachable on a staff host with no role picked (never: staffSpace
  // always preselects it) — kept as a safe fallback.
  return <ProRouteFallback />;
}
