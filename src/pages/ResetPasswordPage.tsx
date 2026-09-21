import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import PasswordField from '@/components/PasswordField';
import { Check, Loader2, AlertCircle } from 'lucide-react';

const EXPIRED_OR_USED_ERROR = "Ce lien a déjà été utilisé ou n'est plus valide. Demandez un nouveau lien pour choisir un nouveau mot de passe.";

// Standalone — rendered by App.tsx OUTSIDE AppProvider/ProProvider the
// moment a Supabase password-recovery link is detected, since the same
// recovery link can belong to a customer, a seller or an admin account and
// none of those contexts need to be mounted just to set a new password.
// By the time the form is submitted, supabase-js has already turned the
// recovery link's URL into a real (recovery-scoped) session automatically
// (detectSessionInUrl, on by default) — updateUser() below just needs that
// session to already exist, which it does.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [linkValid, setLinkValid] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    // detectSessionInUrl runs on client creation, so by the time this effect
    // runs a valid recovery link has already become a real session — no
    // session at all means the link was already used, or is malformed/expired.
    supabase.auth.getSession().then(({ data }) => setLinkValid(data.session ? 'valid' : 'invalid'));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) { setLinkValid('invalid'); return; }
    setDone(true);
  };

  const goTo = (hash: string) => {
    window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}${hash}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream/40 px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-display text-xl font-semibold text-ink">Nouveau mot de passe</h1>
        {linkValid === 'checking' ? (
          <div className="mt-6 flex justify-center"><Loader2 size={20} className="animate-spin text-ink/30" /></div>
        ) : done ? (
          <div className="mt-5 space-y-4">
            <p className="flex items-center gap-2 text-sm font-medium text-green-700"><Check size={16} /> Mot de passe mis à jour.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => goTo('#/profil')} className="btn-primary w-full">Aller à Mon compte</button>
              <button onClick={() => goTo('#/pro')} className="btn-outline w-full">Aller à Ezial Pro</button>
            </div>
          </div>
        ) : linkValid === 'invalid' ? (
          <div className="mt-5 space-y-4">
            <p className="flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {EXPIRED_OR_USED_ERROR}</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => goTo('#/profil')} className="btn-primary w-full">Demander un nouveau lien (client)</button>
              <button onClick={() => goTo('#/pro')} className="btn-outline w-full">Demander un nouveau lien (vendeur)</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-ink/55">Choisissez un nouveau mot de passe pour votre compte.</p>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Nouveau mot de passe</label>
              <PasswordField value={password} onChange={setPassword} placeholder="8 caractères minimum" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Confirmer le mot de passe</label>
              <PasswordField value={confirm} onChange={setConfirm} />
            </div>
            {error && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}</p>}
            <button onClick={() => void handleSubmit()} disabled={submitting} className="btn-primary w-full">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Mise à jour...</> : 'Mettre à jour le mot de passe'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
