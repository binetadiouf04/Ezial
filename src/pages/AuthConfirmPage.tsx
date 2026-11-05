import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { shopForCurrentUser, resendSellerConfirmation, signInSeller } from '@/lib/supabaseSellerAuth';
import { resendCustomerConfirmation, signInCustomer } from '@/lib/supabaseCustomerAuth';
import { consumeLastBrowseRoute } from '@/store/AppContext';
import { isValidEmail } from '@/lib/authErrors';
import { Check, Loader2, AlertCircle, MailCheck } from 'lucide-react';

type Status = 'checking' | 'success' | 'invalid';

// Standalone — rendered by App.tsx OUTSIDE AppProvider/ProProvider the
// moment a Supabase signup-confirmation link is detected (type=signup),
// exactly like ResetPasswordPage already does for type=recovery. Keeping
// it standalone is what avoids every "premature React redirect" this was
// built to fix: AppProvider's own hash router, its catalog fetch, its
// hashchange listener — none of them exist yet to race ahead and repaint
// the plain homepage before the session is actually established and this
// page has decided where to send the visitor.
//
// By the time this mounts, supabase-js has already (or is about to)
// consume the link's token — supabase.auth.getSession() awaits that
// internal detectSessionInUrl/PKCE-exchange pass before resolving, for
// either flow type the project might be configured with, so this is never
// a race against it.
export default function AuthConfirmPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [destinationLabel, setDestinationLabel] = useState('');
  // Which space the visitor picked on the "invalid" screen — also decides
  // which signIn/resend function the forms below call.
  const [space, setSpace] = useState<'none' | 'customer' | 'seller'>('none');
  // 'login' is the default and recommended action here, not 'resend': a
  // confirmation link can come back with no recoverable session even
  // though the account IS already confirmed — e.g. an email provider's
  // own security scanner prefetches and consumes the one-time link before
  // the visitor ever clicks it. For that real, common case, asking for a
  // new link achieves nothing (the account was never actually stuck) —
  // the visitor just needs to log in with their password, same as any
  // other confirmed account. Resend stays one tap away for a genuinely
  // expired/unconfirmed account.
  const [action, setAction] = useState<'login' | 'resend'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          setStatus('invalid');
          return;
        }

        // A shop row already exists (created server-side at signUp() time,
        // before confirmation — see signUpSeller) for a seller signup, never
        // for a customer one — a reliable, server-verified signal for which
        // space to open, independent of whatever emailRedirectTo Supabase
        // actually honored.
        const shop = await shopForCurrentUser();
        if (cancelled) return;
        setStatus('success');
        setDestinationLabel(shop ? `boutique « ${shop.shopName} »` : 'compte Ezial');
        // A customer returns to whatever they were actually browsing
        // before signing up (their cart, already in localStorage, carries
        // over on its own) — never a seller, who always goes to the
        // dashboard regardless, matching "jamais rediriger un client vers
        // Ezial Pro" in the other direction too (a seller never lands on
        // a stray customer-side route from before their own signup).
        const resumeRoute = !shop ? consumeLastBrowseRoute() : null;
        setTimeout(() => {
          if (cancelled) return;
          goToRoute(shop ? '/pro' : (resumeRoute || '/'));
        }, 900);
      } catch {
        // A network blip, an already-consumed token, or a malformed link —
        // never leave the visitor stuck on an infinite spinner either way.
        if (!cancelled) setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Takes a plain app route ('/pro', '/') and always prepends the '#' itself
  // — BASE_URL already ends in '/', so concatenating a route without it
  // produces a literal double slash (https://www.ezial.net//pro), which
  // GitHub Pages serves as its own 404 instead of letting the SPA's hash
  // router ever see it. This is exactly the bug a live confirmation link
  // hit: confirmation and session worked, but this redirect was malformed.
  const goToRoute = (route: string) => {
    window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}#${route}`;
  };

  const handleResend = async () => {
    if (!resendEmail.trim() || !isValidEmail(resendEmail)) { setResendError('Adresse email invalide.'); return; }
    setResending(true); setResendError(''); setResendNotice('');
    const result = space === 'seller'
      ? await resendSellerConfirmation(resendEmail.trim())
      : await resendCustomerConfirmation(resendEmail.trim());
    setResending(false);
    if (result.error) setResendError(result.error);
    else setResendNotice('Un nouveau lien vient de vous être envoyé par email.');
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !isValidEmail(loginEmail)) { setLoginError('Adresse email invalide.'); return; }
    if (!loginPassword) { setLoginError('Mot de passe requis.'); return; }
    setLoggingIn(true); setLoginError('');
    const result = space === 'seller'
      ? await signInSeller(loginEmail.trim(), loginPassword)
      : await signInCustomer(loginEmail.trim(), loginPassword);
    setLoggingIn(false);
    if ('error' in result) { setLoginError(result.error); return; }
    goToRoute(space === 'seller' ? '/pro' : (consumeLastBrowseRoute() || '/'));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream/40 px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        {status === 'checking' && (
          <>
            <Loader2 size={28} className="mx-auto animate-spin text-ink/30" />
            <h1 className="mt-4 font-display text-lg font-semibold text-ink">Confirmation en cours…</h1>
            <p className="mt-1.5 text-sm text-ink/55">Vérification de votre adresse email.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700"><Check size={22} /></div>
            <h1 className="mt-4 font-display text-lg font-semibold text-ink">Adresse confirmée</h1>
            <p className="mt-1.5 text-sm text-ink/55">Vous êtes connecté. Direction votre {destinationLabel}…</p>
            <Loader2 size={18} className="mx-auto mt-4 animate-spin text-ink/25" />
          </>
        )}

        {status === 'invalid' && (
          <div className="text-left">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><AlertCircle size={22} /></div>
            <h1 className="mt-4 text-center font-display text-lg font-semibold text-ink">Impossible de confirmer automatiquement</h1>
            <p className="mt-1.5 text-center text-sm text-ink/60">
              Ce lien n'a pas pu ouvrir de session dans ce navigateur. Si votre compte est déjà confirmé, connectez-vous simplement ci-dessous — sinon demandez un nouveau lien.
            </p>

            {space === 'none' ? (
              <div className="mt-5 flex flex-col gap-2">
                <button onClick={() => setSpace('customer')} className="btn-primary w-full">Continuer sur Ezial</button>
                <button onClick={() => setSpace('seller')} className="btn-outline w-full">Continuer sur Ezial Pro</button>
              </div>
            ) : action === 'login' ? (
              <div className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label>
                  <input type="email" className="input-field" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="vous@exemple.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label>
                  <input type="password" className="input-field" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" />
                </div>
                {loginError && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {loginError}</p>}
                <button onClick={() => void handleLogin()} disabled={loggingIn} className="btn-primary w-full">
                  {loggingIn ? 'Connexion…' : 'Se connecter'}
                </button>
                <div className="flex items-center justify-between pt-1">
                  <button onClick={() => { setSpace('none'); setLoginError(''); }} className="text-xs font-medium text-ink/50 hover:underline">Retour</button>
                  <button onClick={() => { setAction('resend'); setLoginError(''); }} className="text-xs font-medium text-burgundy hover:underline">Compte pas encore confirmé ?</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label>
                  <input type="email" className="input-field" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder="vous@exemple.com" />
                </div>
                {resendError && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {resendError}</p>}
                {resendNotice && <p className="flex items-start gap-1.5 text-xs text-green-700"><MailCheck size={13} className="mt-0.5 flex-shrink-0" /> {resendNotice}</p>}
                <button onClick={() => void handleResend()} disabled={resending} className="btn-primary w-full">
                  {resending ? 'Envoi…' : 'Envoyer un nouveau lien'}
                </button>
                <button onClick={() => { setAction('login'); setResendError(''); setResendNotice(''); }} className="w-full text-center text-xs font-medium text-ink/50 hover:underline">Retour à la connexion</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
