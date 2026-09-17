import { useState } from 'react';
import type { SellerShopInfo } from '../ProContext';
import type { SignUpSellerInput } from '@/lib/supabaseSellerAuth';
import { isValidEmail } from '@/lib/authErrors';
import { ArrowLeft, Lock, KeyRound, Loader2, AlertCircle, Check, MailCheck } from 'lucide-react';

type View = 'login' | 'signup' | 'forgot' | 'pending_confirmation';

interface SellerAuthPanelProps {
  onBack: () => void;
  onLogin: (identifier: string, name: string, shopInfo: SellerShopInfo) => void;
  verifySeller: (identifier: string, password: string) => Promise<{ shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { error: string }>;
  signUpSeller: (input: SignUpSellerInput) => Promise<{ status: 'confirmed'; shop: { sellerId: string; name: string; supabaseShopId: string; isOfficial: boolean } } | { status: 'pending_confirmation' } | { error: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
}

export default function SellerAuthPanel({ onBack, onLogin, verifySeller, signUpSeller, requestPasswordReset }: SellerAuthPanelProps) {
  const [view, setView] = useState<View>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');

  const switchView = (v: View) => { setView(v); setError(''); setNotice(''); };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) { setError('Veuillez saisir votre identifiant et votre mot de passe.'); return; }
    setError(''); setSubmitting(true);
    const result = await verifySeller(identifier, password);
    setSubmitting(false);
    if ('error' in result) { setError(result.error); return; }
    onLogin(result.shop.sellerId, result.shop.name, { supabaseShopId: result.shop.supabaseShopId, isOfficial: result.shop.isOfficial });
  };

  const handleSignup = async () => {
    if (!shopName.trim() || !email.trim() || !username.trim()) { setError('Tous les champs sont obligatoires.'); return; }
    if (!isValidEmail(email)) { setError('Adresse email invalide.'); return; }
    if (!/^[a-zA-Z0-9]{4,32}$/.test(username.trim())) { setError("Le nom d'utilisateur doit contenir 4 à 32 lettres/chiffres, sans espace."); return; }
    if (signupPassword.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setError(''); setSubmitting(true);
    const result = await signUpSeller({ shopName, email, username, password: signupPassword });
    setSubmitting(false);
    if ('error' in result) { setError(result.error); return; }
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

  return (
    <div className="mx-auto max-w-md slide-up">
      <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="card p-8">
        <h2 className="font-display text-2xl font-semibold text-ink">Espace Vendeur</h2>
        <p className="mt-1.5 text-sm text-ink/55">
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

        {error && <p className="mt-4 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}
        {notice && <p className="mt-4 flex items-start gap-1.5 text-sm text-green-700"><Check size={14} className="mt-0.5 flex-shrink-0" /> {notice}</p>}

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
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className="input-field pl-11" placeholder="••••••••" />
              </div>
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
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label><input type="password" className="input-field" placeholder="8 caractères minimum" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} /></div>
            <button onClick={() => void handleSignup()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Créer le compte'}
            </button>
          </div>
        )}

        {view === 'pending_confirmation' && (
          <div className="mt-5 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700"><MailCheck size={22} /></div>
            <p className="text-sm text-ink/70">Un lien de confirmation vous a été envoyé par email. Cliquez dessus pour activer votre compte, puis revenez vous connecter ici.</p>
            <button onClick={() => switchView('login')} className="btn-outline w-full">Retour à la connexion</button>
          </div>
        )}

        {view === 'forgot' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-ink/50">Fonctionne uniquement si votre compte a un email réel (comptes vendeurs créés avant cette mise à jour : contactez EZIAL).</p>
            <div><label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label><input type="email" className="input-field" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /></div>
            <button onClick={() => void handleReset()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Envoi...</> : 'Envoyer le lien de réinitialisation'}
            </button>
            <button onClick={() => switchView('login')} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Retour à la connexion</button>
          </div>
        )}
      </div>
    </div>
  );
}
