import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { usePro } from '../ProContext';
import { normalizeTotpCode } from '@/lib/supabaseMfa';

// Seconde étape de la connexion administrateur : le code à 6 chiffres de
// l'application d'authentification. Tant qu'il n'est pas validé, aucun écran
// de l'administration ne s'affiche et aucune donnée n'est chargée (le serveur
// refuse de toute façon les requêtes d'une session non validée).
export default function AdminMfaChallenge() {
  const { submitAdminMfaCode, logout } = usePro();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    setError('');
    const result = await submitAdminMfaCode(code);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      setCode('');
      if (result.fatal) logout();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <form onSubmit={(e) => void handleSubmit(e)} className="card w-full max-w-sm space-y-5 p-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
            <ShieldCheck size={24} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Vérification en deux étapes</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
            Saisissez le code à 6 chiffres affiché par votre application d’authentification.
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink/60">Code de vérification</span>
          <input
            className="input-field text-center font-mono text-xl tracking-[0.4em]"
            value={code}
            onChange={(e) => { setCode(normalizeTotpCode(e.target.value)); setError(''); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            autoFocus
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error && <p role="alert" className="text-sm text-burgundy">{error}</p>}
        <button type="submit" disabled={code.length !== 6 || submitting} className="btn-primary w-full">
          {submitting && <Loader2 size={16} className="animate-spin" />} Vérifier
        </button>
        <button type="button" onClick={logout} className="w-full text-center text-sm font-medium text-ink/55 hover:text-ink">
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
