import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, ShieldCheck, ShieldAlert, Smartphone, X } from 'lucide-react';
import {
  getMfaState, startTotpEnrollment, confirmTotpEnrollment, cancelTotpEnrollment, removeFactor, normalizeTotpCode,
  MAX_VERIFIED_FACTORS, type MfaFactor, type MfaState, type TotpEnrollment,
} from '@/lib/supabaseMfa';
import { formatDate } from '../data';

// Double authentification du compte administrateur (TOTP, application
// d'authentification). Deux appareils au plus : un principal et un de
// secours. Le secret et les codes ne sont jamais enregistrés par le site.

const FACTOR_NAMES = ['Ezial Admin', 'Ezial Admin (secours)'];

export default function AdminMfaCard() {
  const [state, setState] = useState<MfaState | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [toRemove, setToRemove] = useState<MfaFactor | null>(null);

  const reload = useCallback(async () => { setState(await getMfaState()); }, []);
  useEffect(() => { void reload(); }, [reload]);

  const factors = state?.status === 'ready' ? state.verifiedFactors : [];

  const handleStart = async () => {
    setBusy(true); setError(''); setNotice('');
    const usedNames = new Set(factors.map((f) => f.friendlyName));
    const name = FACTOR_NAMES.find((n) => !usedNames.has(n)) ?? `Ezial Admin ${Date.now()}`;
    const result = await startTotpEnrollment(name);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setEnrollment(result);
    setCode('');
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment || code.length !== 6) return;
    setBusy(true); setError('');
    const result = await confirmTotpEnrollment(enrollment.factorId, code);
    setBusy(false);
    if (!result.ok) { setError(result.error); setCode(''); return; }
    setEnrollment(null);
    setCode('');
    setNotice('Appareil enregistré. Le code vous sera demandé à chaque connexion à l’administration.');
    await reload();
  };

  const handleCancel = async () => {
    if (enrollment) await cancelTotpEnrollment(enrollment.factorId);
    setEnrollment(null); setCode(''); setError('');
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    setBusy(true); setError('');
    const result = await removeFactor(toRemove.id);
    setBusy(false);
    setToRemove(null);
    if (!result.ok) { setError(result.error); return; }
    setNotice('Appareil retiré.');
    await reload();
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* copie indisponible : la clé reste affichée */ }
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${factors.length > 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {factors.length > 0 ? <ShieldCheck size={20} strokeWidth={1.6} aria-hidden="true" /> : <ShieldAlert size={20} strokeWidth={1.6} aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Double authentification</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Après votre mot de passe, un code à 6 chiffres généré par une application d’authentification
            (Google Authenticator, Microsoft Authenticator, 1Password…) est demandé à chaque connexion à l’administration.
          </p>
        </div>
      </div>

      {state === null && <p className="flex items-center gap-2 text-sm text-ink/50"><Loader2 size={15} className="animate-spin" /> Chargement…</p>}
      {state && state.status !== 'ready' && <p role="alert" className="text-sm text-burgundy">{state.error}</p>}
      {notice && <p className="flex items-start gap-1.5 text-sm text-green-700"><Check size={15} className="mt-0.5 flex-shrink-0" /> {notice}</p>}
      {error && <p role="alert" className="text-sm text-burgundy">{error}</p>}

      {state?.status === 'ready' && !enrollment && (
        <>
          {factors.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              Non activée : aujourd’hui, le mot de passe seul ouvre l’administration.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {factors.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm">
                    <Smartphone size={16} className="flex-shrink-0 text-ink/45" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{f.friendlyName ?? 'Appareil'}</span>
                      <span className="block text-xs text-ink/50">Actif depuis le {formatDate(f.createdAt)}</span>
                    </span>
                  </span>
                  <button type="button" onClick={() => { setToRemove(f); setNotice(''); }} className="flex-shrink-0 text-xs font-medium text-burgundy hover:underline">Retirer</button>
                </li>
              ))}
            </ul>
          )}

          {factors.length === 1 && (
            <p className="text-sm leading-relaxed text-ink/60">
              Ajoutez un second appareil de secours : si le premier est perdu, vous gardez l’accès.
              Sans appareil, l’accès ne se récupère que depuis le tableau de bord Supabase.
            </p>
          )}

          {factors.length < MAX_VERIFIED_FACTORS && (
            <button type="button" onClick={() => void handleStart()} disabled={busy} className={factors.length === 0 ? 'btn-primary w-full sm:w-auto' : 'btn-outline w-full sm:w-auto'}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {factors.length === 0 ? 'Activer la double authentification' : 'Ajouter un appareil de secours'}
            </button>
          )}
        </>
      )}

      {enrollment && (
        <form onSubmit={(e) => void handleConfirm(e)} className="space-y-4 rounded-xl bg-cream/50 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
            <li>Ouvrez votre application d’authentification et ajoutez un compte.</li>
            <li>Scannez ce QR code, ou saisissez la clé ci-dessous.</li>
            <li>Entrez le code à 6 chiffres affiché par l’application.</li>
          </ol>
          {enrollment.qrCodeSvg && (
            <img src={enrollment.qrCodeSvg} alt="QR code à scanner avec l’application d’authentification" width={176} height={176} className="mx-auto rounded-lg border border-line bg-white p-2" />
          )}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink/60">Clé à saisir manuellement</span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs text-ink">{enrollment.secret}</code>
              <button type="button" onClick={() => void copySecret()} className="btn-outline flex-shrink-0 px-3 py-2 text-xs">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink/60">Code à 6 chiffres</span>
            <input
              className="input-field text-center font-mono text-lg tracking-[0.4em]"
              value={code}
              onChange={(e) => { setCode(normalizeTotpCode(e.target.value)); setError(''); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary">
              {busy && <Loader2 size={15} className="animate-spin" />} Confirmer
            </button>
            <button type="button" onClick={() => void handleCancel()} className="btn-outline">Annuler</button>
          </div>
        </form>
      )}

      {toRemove && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation" onClick={() => setToRemove(null)}>
          <div role="dialog" aria-modal="true" aria-label="Retirer cet appareil" className="card w-full max-w-sm space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">Retirer cet appareil ?</h3>
              <button type="button" onClick={() => setToRemove(null)} aria-label="Fermer" className="text-ink/50 hover:text-ink"><X size={18} /></button>
            </div>
            <p className="text-sm leading-relaxed text-ink/65">
              {factors.length <= 1
                ? 'C’est votre seul appareil : la double authentification sera désactivée et le mot de passe seul ouvrira de nouveau l’administration.'
                : `« ${toRemove.friendlyName ?? 'Appareil'} » ne pourra plus servir à vous connecter. L’autre appareil reste actif.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleRemove()} disabled={busy} className="btn-primary">
                {busy && <Loader2 size={15} className="animate-spin" />} Retirer
              </button>
              <button type="button" onClick={() => setToRemove(null)} className="btn-outline">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
