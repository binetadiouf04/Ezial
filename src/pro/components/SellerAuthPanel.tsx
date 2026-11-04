import { useState, useEffect } from 'react';
import type { SellerShopInfo } from '../ProContext';
import type { SignUpSellerInput } from '@/lib/supabaseSellerAuth';
import { isValidEmail } from '@/lib/authErrors';
import PasswordField from '@/components/PasswordField';
import { ArrowLeft, Lock, KeyRound, Loader2, AlertCircle, Check, MailCheck, Store, UserCheck } from 'lucide-react';

type View = 'current_account' | 'login' | 'signup' | 'forgot' | 'pending_confirmation';

interface SellerAuthPanelProps {
  onBack: () => void;
  onLogin: (identifier: string, name: string, shopInfo: SellerShopInfo) => void;
  verifySeller: (identifier: string, password: string) => Promise<{ shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { error: string; code?: 'unconfirmed' }>;
  signUpSeller: (input: SignUpSellerInput) => Promise<{ status: 'confirmed'; shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { status: 'pending_confirmation' } | { error: string; code?: 'email_taken' }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  resendConfirmationEmail: (email: string) => Promise<{ error?: string }>;
  // Login-screen resend — the seller may have typed a username, not an
  // email, so this resolves it server-side before resending.
  resendConfirmationForLogin: (identifier: string) => Promise<{ error?: string }>;
  // When the visitor is already signed in as a customer on this device —
  // "Devenir vendeur" then never has to ask for an email/password again,
  // the live session is itself the proof of identity.
  loggedInCustomer?: { label: string } | null;
  continueWithCurrentAccount?: (input: { shopName: string; username: string }) => Promise<{ status: 'confirmed'; shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { error: string }>;
}

export default function SellerAuthPanel({ onBack, onLogin, verifySeller, signUpSeller, requestPasswordReset, resendConfirmationEmail, resendConfirmationForLogin, loggedInCustomer, continueWithCurrentAccount }: SellerAuthPanelProps) {
  const [view, setView] = useState<View>(loggedInCustomer ? 'current_account' : 'login');
  const [currentShopName, setCurrentShopName] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');

  // The customer session restore (AppProvider) resolves asynchronously, so
  // loggedInCustomer can still be null on this panel's very first render —
  // this catches it switching to truthy a moment later, without ever
  // overriding a tab the visitor already picked for themselves.
  useEffect(() => {
    if (loggedInCustomer && view === 'login') setView('current_account');
  }, [loggedInCustomer, view]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loginUnconfirmed, setLoginUnconfirmed] = useState(false);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');

  const switchView = (v: View) => { setView(v); setError(''); setNotice(''); setEmailTaken(false); setLoginUnconfirmed(false); };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) { setError('Veuillez saisir votre identifiant et votre mot de passe.'); return; }
    setError(''); setLoginUnconfirmed(false); setSubmitting(true);
    const result = await verifySeller(identifier, password);
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      if (result.code === 'unconfirmed') setLoginUnconfirmed(true);
      return;
    }
    onLogin(result.shop.sellerId, result.shop.name, { supabaseShopId: result.shop.supabaseShopId, isOfficial: result.shop.isOfficial });
  };

  const handleResendFromLogin = async () => {
    setResending(true);
    const result = await resendConfirmationForLogin(identifier.trim());
    setResending(false);
    if (result.error) setError(result.error);
    else setNotice('Un nouveau lien vient de vous être envoyé par email.');
  };

  const handleContinueWithCurrentAccount = async () => {
    if (!continueWithCurrentAccount) return;
    if (!currentShopName.trim() || !currentUsername.trim()) { setError('Tous les champs sont obligatoires.'); return; }
    if (!/^[a-zA-Z0-9]{4,32}$/.test(currentUsername.trim())) { setError("Le nom d'utilisateur doit contenir 4 à 32 lettres/chiffres, sans espace."); return; }
    setError(''); setSubmitting(true);
    const result = await continueWithCurrentAccount({ shopName: currentShopName, username: currentUsername });
    setSubmitting(false);
    if ('error' in result) { setError(result.error); return; }
    onLogin(result.shop.sellerId, result.shop.name, { supabaseShopId: result.shop.supabaseShopId, isOfficial: result.shop.isOfficial });
  };

  const handleSignup = async () => {
    if (!shopName.trim() || !email.trim() || !username.trim()) { setError('Tous les champs sont obligatoires.'); return; }
    if (!isValidEmail(email)) { setError('Adresse email invalide.'); return; }
    if (!/^[a-zA-Z0-9]{4,32}$/.test(username.trim())) { setError("Le nom d'utilisateur doit contenir 4 à 32 lettres/chiffres, sans espace."); return; }
    if (signupPassword.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setError(''); setEmailTaken(false); setSubmitting(true);
    const result = await signUpSeller({ shopName, email, username, password: signupPassword });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      if (result.code === 'email_taken') setEmailTaken(true);
      return;
    }
    if (result.status === 'pending_confirmation') { setView('pending_confirmation'); return; }
    onLogin(result.shop.sellerId, result.shop.name, { supabaseShopId: result.shop.supabaseShopId, isOfficial: result.shop.isOfficial });
  };

  const handleReset = async () => {
    if (!resetEmail.trim()) { setError('Renseignez votre email.'); return; }
    setError(''); setNotice(''); setSubmitting(true);
    const result = await requestPasswordReset(resetEmail.trim());
    setSubmitting(false);
    if (result.error) setError(result.error);
    else setNotice('Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.');
  };

  const handleResendConfirmation = async () => {
    setResending(true); setError('');
    const result = await resendConfirmationEmail(email.trim());
    setResending(false);
    if (result.error) setError(result.error);
    else setNotice('Un nouveau lien vient de vous être envoyé par email.');
  };

  return (
    <div className="mx-auto max-w-md slide-up">
      <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="card p-8">
        <h2 className="font-display text-2xl font-semibold text-ink">Espace Vendeur</h2>
        <p className="mt-1.5 text-sm text-ink/55">
          {view === 'current_account' && 'Créez votre boutique avec votre compte Ezial.'}
          {view === 'login' && 'Connectez-vous avec votre identifiant et votre mot de passe.'}
          {view === 'signup' && 'Créez le compte de votre boutique Ezial.'}
          {view === 'pending_confirmation' && 'Vérifiez votre boîte mail.'}
          {view === 'forgot' && 'Réinitialisez votre mot de passe.'}
        </p>

        {(view === 'login' || view === 'signup') && (
          <div className="mt-5 flex rounded-full border border-line p-1">
            <button onClick={() => switchView('login')} className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${view === 'login' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>Se connecter</button>
            <button onClick={() => switchView('signup')} className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${view === 'signup' ? 'bg-burgundy text-white' : 'text-ink/60'}`}>Inscrire ma boutique</button>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>
            {emailTaken && (
              <div className="mt-2.5 flex gap-2 pl-[22px]">
                <button onClick={() => { setIdentifier(email); switchView('login'); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-burgundy border border-burgundy/30 hover:bg-burgundy/5">Se connecter</button>
                <button onClick={() => { setResetEmail(email); switchView('forgot'); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink/60 border border-line hover:bg-cream">Mot de passe oublié</button>
              </div>
            )}
            {loginUnconfirmed && (
              <div className="mt-2.5 pl-[22px]">
                <button onClick={() => void handleResendFromLogin()} disabled={resending} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-burgundy border border-burgundy/30 hover:bg-burgundy/5">
                  {resending ? 'Envoi...' : 'Renvoyer le lien de confirmation'}
                </button>
              </div>
            )}
          </div>
        )}
        {notice && <p className="mt-4 flex items-start gap-1.5 text-sm text-green-700"><Check size={14} className="mt-0.5 flex-shrink-0" /> {notice}</p>}

        {view === 'current_account' && loggedInCustomer && (
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 p-3">
              <UserCheck size={16} className="text-green-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">Vous êtes déjà connecté comme <strong>{loggedInCustomer.label}</strong>. Votre boutique sera créée avec ce compte — vous gardez aussi votre accès client.</p>
            </div>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label><input className="input-field" value={currentShopName} onChange={(e) => setCurrentShopName(e.target.value)} /></div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom d'utilisateur Ezial</label>
              <input className="input-field font-mono" placeholder="ex: maisonfatou" value={currentUsername} onChange={(e) => setCurrentUsername(e.target.value)} />
              <p className="mt-1 text-[11px] text-ink/40">4 à 32 lettres/chiffres, sans espace. Utilisé pour vous connecter à l'espace vendeur.</p>
            </div>
            <button onClick={() => void handleContinueWithCurrentAccount()} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-1.5">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : <><Store size={16} /> Créer ma boutique</>}
            </button>
            <button onClick={() => switchView('login')} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Ce n'est pas vous ? Utiliser un autre compte</button>
          </div>
        )}

        {view === 'login' && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Identifiant (nom d'utilisateur ou email)</label>
              <div className="relative">
                <KeyRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input type="text" value={identifier} onChange={(e) => { setIdentifier(e.target.value); setError(''); }} className="input-field pl-11" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label>
              <PasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} placeholder="••••••••" leftIcon={<Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />} />
            </div>
            <button onClick={() => void handleLogin()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Connexion...</> : 'Se connecter'}
            </button>
            <button onClick={() => switchView('forgot')} className="w-full text-center text-xs font-medium text-burgundy hover:underline">Mot de passe oublié ?</button>
          </div>
        )}

        {view === 'signup' && (
          <div className="mt-5 space-y-4">
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label><input className="input-field" value={shopName} onChange={(e) => setShopName(e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom d'utilisateur Ezial</label>
              <input className="input-field font-mono" placeholder="ex: maisonfatou" value={username} onChange={(e) => setUsername(e.target.value)} />
              <p className="mt-1 text-[11px] text-ink/40">4 à 32 lettres/chiffres, sans espace. Utilisé pour vous connecter.</p>
            </div>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label><PasswordField value={signupPassword} onChange={setSignupPassword} placeholder="8 caractères minimum" /></div>
            <button onClick={() => void handleSignup()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Créer le compte'}
            </button>
          </div>
        )}

        {view === 'pending_confirmation' && (
          <div className="mt-5 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700"><MailCheck size={22} /></div>
            <p className="text-sm text-ink/70">Un lien de confirmation vous a été envoyé par email.</p>
            <p className="text-xs text-ink/45">Vous ne voyez rien ? Vérifiez vos spams.</p>
            <button onClick={() => void handleResendConfirmation()} disabled={resending} className="text-xs font-medium text-burgundy hover:underline">
              {resending ? 'Envoi...' : 'Renvoyer le lien'}
            </button>
            <div className="flex flex-col gap-2">
              <button onClick={() => switchView('signup')} className="btn-outline w-full">Modifier mon adresse e-mail</button>
              <button onClick={() => switchView('login')} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Retour à la connexion</button>
            </div>
          </div>
        )}

        {view === 'forgot' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-ink/50">Fonctionne uniquement si votre compte a un email réel (comptes vendeurs créés avant cette mise à jour : contactez EZIAL).</p>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label><input type="email" className="input-field" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /></div>
            <button onClick={() => void handleReset()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Envoi...</> : 'Envoyer le lien de réinitialisation'}
            </button>
            {notice && (
              <button onClick={() => void handleReset()} disabled={submitting} className="w-full text-center text-xs font-medium text-burgundy hover:underline">Renvoyer le lien</button>
            )}
            <button onClick={() => switchView('login')} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Retour à la connexion</button>
          </div>
        )}
      </div>
    </div>
  );
}
