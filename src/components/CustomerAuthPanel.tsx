import { useState } from 'react';
import { useApp, rememberResumeRoute } from '@/store/AppContext';
import PasswordField from '@/components/PasswordField';
import PhoneField from '@/components/PhoneField';
import { isValidEmail, capitalizeFirst } from '@/lib/authErrors';
import { User, Check, AlertCircle, Loader2, MailCheck, ArrowLeft } from 'lucide-react';

type AuthView = 'login' | 'signup' | 'forgot' | 'pending_confirmation';

// Customer login / signup / forgot password — used by "Mon compte"
// (ProfilePage) and by the checkout, where an account is now required to
// order. Signing in or a signup confirmed on the spot updates customerUser
// in AppContext, so the page hosting this panel simply re-renders signed-in.
//
// resumeRouteAfterConfirmation: where the confirmation link should bring
// the customer back (AuthConfirmPage reads it), stored every time a
// confirmation email is sent from here. The checkout passes '/checkout' so
// a brand-new customer lands straight back on their order, cart intact.
export default function CustomerAuthPanel({ onBack, initialView = 'login', subtitle, resumeRouteAfterConfirmation }: {
  onBack: () => void;
  initialView?: 'login' | 'signup';
  subtitle?: string;
  resumeRouteAfterConfirmation?: string;
}) {
  const { signInCustomerAccount, signUpCustomerAccount, requestPasswordReset, resendConfirmationEmail } = useApp();
  const [view, setView] = useState<AuthView>(initialView);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginUnconfirmed, setLoginUnconfirmed] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');

  const switchView = (v: AuthView) => { setView(v); setError(''); setEmailTaken(false); setLoginUnconfirmed(false); setNotice(''); };
  const rememberResume = () => { if (resumeRouteAfterConfirmation) rememberResumeRoute(resumeRouteAfterConfirmation); };

  const handleLogin = async () => {
    setError(''); setNotice(''); setLoginUnconfirmed(false);
    if (!loginId.trim() || !loginPassword) { setError('Renseignez votre email et votre mot de passe.'); return; }
    if (!isValidEmail(loginId)) { setError('Adresse email invalide.'); return; }
    setSubmitting(true);
    const result = await signInCustomerAccount(loginId.trim(), loginPassword);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      if (result.code === 'unconfirmed') setLoginUnconfirmed(true);
    }
  };

  const handleResendFromLogin = async () => {
    setResending(true);
    const result = await resendConfirmationEmail(loginId.trim());
    setResending(false);
    if (result.error) setError(result.error);
    else { rememberResume(); setNotice('Un nouveau lien vient de vous être envoyé par email.'); }
  };

  const handleSignup = async () => {
    setError(''); setEmailTaken(false); setNotice('');
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom sont obligatoires.'); return; }
    if (!email.trim()) { setError('L\'adresse email est obligatoire.'); return; }
    if (!isValidEmail(email)) { setError('Adresse email invalide.'); return; }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setSubmitting(true);
    const result = await signUpCustomerAccount({ firstName, lastName, phone: phone.trim() || undefined, email: email.trim(), password });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      if (result.code === 'email_taken') setEmailTaken(true);
      return;
    }
    if (result.status === 'pending_confirmation') { rememberResume(); setView('pending_confirmation'); }
  };

  const handleReset = async () => {
    setError(''); setNotice('');
    if (!resetEmail.trim()) { setError('Renseignez votre email.'); return; }
    setSubmitting(true);
    const result = await requestPasswordReset(resetEmail.trim());
    setSubmitting(false);
    if (result.error) setError(result.error);
    else setNotice('Lien envoyé. Vérifiez votre boîte mail et vos spams si vous ne le trouvez pas.');
  };

  const handleResendConfirmation = async () => {
    setResending(true); setError('');
    const result = await resendConfirmationEmail(email.trim());
    setResending(false);
    if (result.error) setError(result.error);
    else { rememberResume(); setNotice('Un nouveau lien vient de vous être envoyé par email.'); }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      {view !== 'pending_confirmation' && (
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><User size={26} /></div>
          <h1 className="font-display text-xl font-semibold text-ink">
            {view === 'login' ? 'Se connecter' : view === 'signup' ? 'Créer mon compte' : 'Mon compte'}
          </h1>
          <p className="mt-1 text-sm text-ink/55">
            {view === 'forgot' ? 'Réinitialisez votre mot de passe.' : subtitle ?? (view === 'login' ? 'Accédez à votre compte Ezial.' : 'Suivez vos commandes, vos favoris et vos adresses.')}
          </p>
        </div>
      )}

      {/* No login/signup tab switcher — the page hosting this panel
          (AccountEntryPage, or the checkout's own account step) makes that
          choice and opens this panel directly on the right view via
          initialView. */}

      {error && (
        <div className="mb-4 rounded-lg bg-burgundy/5 p-3">
          <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}</p>
          {emailTaken && (
            <div className="mt-2.5 flex gap-2 pl-[22px]">
              <button onClick={() => { setLoginId(email); switchView('login'); }} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-burgundy border border-burgundy/30 hover:bg-burgundy/5">Se connecter</button>
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
      {notice && <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700"><Check size={15} className="mt-0.5 flex-shrink-0" /> {notice}</p>}

      {view === 'login' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label>
            <input type="email" className="input-field" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label>
            <PasswordField value={loginPassword} onChange={setLoginPassword} />
          </div>
          <button onClick={() => void handleLogin()} disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Connexion...</> : 'Se connecter'}
          </button>
          <button onClick={() => switchView('forgot')} className="w-full text-center text-xs font-medium text-burgundy hover:underline">Mot de passe oublié ?</button>
        </div>
      )}

      {view === 'signup' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label><input className="input-field" value={firstName} onChange={(e) => setFirstName(capitalizeFirst(e.target.value))} /></div>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label><input className="input-field" value={lastName} onChange={(e) => setLastName(capitalizeFirst(e.target.value))} /></div>
          </div>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label><input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone (optionnel)</label><PhoneField value={phone} onChange={setPhone} /></div>
          <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label><PasswordField value={password} onChange={setPassword} placeholder="8 caractères minimum" /></div>
          <button onClick={() => void handleSignup()} disabled={submitting} className="btn-primary w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Créer mon compte'}
          </button>
        </div>
      )}

      {view === 'pending_confirmation' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700"><MailCheck size={22} /></div>
          <p className="text-sm text-ink/70">Un lien de confirmation vous a été envoyé par email.</p>
          {resumeRouteAfterConfirmation && (
            <p className="text-xs text-ink/55">Ouvrez-le sur cet appareil : vous reviendrez directement à votre commande, votre panier est conservé.</p>
          )}
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
        <div className="space-y-4">
          <p className="text-xs text-ink/50">Fonctionne uniquement si un email a été renseigné sur le compte.</p>
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
  );
}
