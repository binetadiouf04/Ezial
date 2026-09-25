import { useState } from 'react';
import type { DriverAuthInfo, DriverLoginStatus } from '@/lib/supabaseDriverAuth';
import { ArrowLeft, KeyRound, Lock, Loader2, AlertCircle } from 'lucide-react';

type View = 'username' | 'create_pin' | 'enter_pin';

interface DriverLoginPanelProps {
  onBack: () => void;
  onLogin: (username: string, name: string) => void;
  checkUsername: (username: string) => Promise<DriverLoginStatus | { error: string }>;
  createPin: (username: string, pin: string) => Promise<DriverAuthInfo | { error: string }>;
  signIn: (username: string, pin: string) => Promise<DriverAuthInfo | { error: string }>;
}

const PIN_LENGTH = 6;

function sanitizePin(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

export default function DriverLoginPanel({ onBack, onLogin, checkUsername, createPin, signIn }: DriverLoginPanelProps) {
  const [view, setView] = useState<View>('username');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const backToUsername = () => {
    setView('username');
    setPin('');
    setPinConfirm('');
    setError('');
  };

  const handleContinue = async () => {
    if (!username.trim()) { setError("Veuillez saisir votre nom d'utilisateur."); return; }
    setError('');
    setSubmitting(true);
    const status = await checkUsername(username);
    setSubmitting(false);
    if (typeof status === 'object') { setError(status.error); return; }
    if (status === 'not_found') { setError('Compte livreur introuvable.'); return; }
    if (status === 'suspended') { setError('Votre accès livreur est suspendu.'); return; }
    setView(status === 'needs_pin_setup' ? 'create_pin' : 'enter_pin');
  };

  const handleCreatePin = async () => {
    if (pin.length !== PIN_LENGTH) { setError(`Le NIP doit comporter ${PIN_LENGTH} chiffres.`); return; }
    if (pin !== pinConfirm) { setError('Les deux NIP ne correspondent pas.'); return; }
    setError('');
    setSubmitting(true);
    const result = await createPin(username, pin);
    setSubmitting(false);
    if ('error' in result) { setError(result.error); return; }
    onLogin(result.username, result.name);
  };

  const handleSignIn = async () => {
    if (pin.length !== PIN_LENGTH) { setError(`Le NIP doit comporter ${PIN_LENGTH} chiffres.`); return; }
    setError('');
    setSubmitting(true);
    const result = await signIn(username, pin);
    setSubmitting(false);
    if ('error' in result) { setError(result.error); return; }
    onLogin(result.username, result.name);
  };

  return (
    <div className="mx-auto max-w-md slide-up">
      <button onClick={view === 'username' ? onBack : backToUsername} className="mb-6 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="card p-8">
        <h2 className="font-display text-2xl font-semibold text-ink">Espace Livreur</h2>
        <p className="mt-1.5 text-sm text-ink/55">
          {view === 'username' && "Connectez-vous avec votre nom d'utilisateur."}
          {view === 'create_pin' && 'Première connexion — créez votre NIP.'}
          {view === 'enter_pin' && 'Entrez votre NIP.'}
        </p>

        {error && <p className="mt-4 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}</p>}

        {view === 'username' && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom d'utilisateur</label>
              <div className="relative">
                <KeyRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleContinue(); }}
                  className="input-field pl-11"
                  placeholder="moussa01"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>
            <button onClick={() => void handleContinue()} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Vérification...</> : 'Continuer'}
            </button>
          </div>
        )}

        {view === 'create_pin' && (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-ink/45">Choisissez un NIP à {PIN_LENGTH} chiffres — vous vous en resservirez à chaque connexion.</p>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">NIP</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => { setPin(sanitizePin(e.target.value)); setError(''); }}
                  maxLength={PIN_LENGTH}
                  className="input-field pl-11 text-center tracking-[0.5em] font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Confirmer le NIP</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinConfirm}
                  onChange={(e) => { setPinConfirm(sanitizePin(e.target.value)); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreatePin(); }}
                  maxLength={PIN_LENGTH}
                  className="input-field pl-11 text-center tracking-[0.5em] font-mono"
                />
              </div>
            </div>
            <button onClick={() => void handleCreatePin()} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Création...</> : 'Créer mon NIP et me connecter'}
            </button>
          </div>
        )}

        {view === 'enter_pin' && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">NIP</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => { setPin(sanitizePin(e.target.value)); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSignIn(); }}
                  maxLength={PIN_LENGTH}
                  className="input-field pl-11 text-center tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>
            </div>
            <button onClick={() => void handleSignIn()} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Connexion...</> : 'Se connecter'}
            </button>
            <p className="text-center text-xs text-ink/45">
              NIP oublié ? <span className="font-medium">Contactez un administrateur Ezial pour le réinitialiser.</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
