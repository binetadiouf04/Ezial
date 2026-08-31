import { useState } from 'react';
import type { Role } from '../data';
import { ArrowLeft, Lock, KeyRound } from 'lucide-react';

interface LoginFormProps {
  role: Role;
  onBack: () => void;
  onLogin: (identifier: string, name: string) => void;
}

const roleConfig: Record<Role, { title: string; subtitle: string; placeholder: string; hint: string; demoId: string; demoName: string }> = {
  admin: {
    title: 'Administration',
    subtitle: "Accès réservé à l'équipe EZIAL.",
    placeholder: 'admin@ezial.sn',
    hint: 'Saisissez votre email et mot de passe.',
    demoId: 'admin@ezial.sn',
    demoName: 'Admin EZIAL',
  },
  seller: {
    title: 'Espace Vendeur',
    subtitle: 'Connectez-vous avec votre identifiant unique.',
    placeholder: 'MAISONFATOU4827',
    hint: 'Votre identifiant a été fourni par EZIAL lors de la création de votre boutique.',
    demoId: 'MAISONFATOU4827',
    demoName: 'Maison Fatou',
  },
  driver: {
    title: 'Espace Livreur',
    subtitle: 'Connectez-vous avec votre identifiant unique.',
    placeholder: 'ABDOU7314',
    hint: 'Votre identifiant a été fourni par EZIAL lors de votre inscription.',
    demoId: 'ABDOU7314',
    demoName: 'Abdou',
  },
};

export default function LoginForm({ role, onBack, onLogin }: LoginFormProps) {
  const cfg = roleConfig[role];
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'admin') {
      if (!email.trim() || !password.trim()) {
        setError('Veuillez remplir tous les champs.');
        return;
      }
      onLogin(email.trim(), cfg.demoName);
    } else {
      if (!identifier.trim()) {
        setError('Veuillez saisir votre identifiant.');
        return;
      }
      onLogin(identifier.trim().toUpperCase(), cfg.demoName);
    }
  };

  const fillDemo = () => {
    if (role === 'admin') {
      setEmail(cfg.demoId);
      setPassword('ezial2026');
    } else {
      setIdentifier(cfg.demoId);
    }
    setError('');
  };

  return (
    <div className="mx-auto max-w-md slide-up">
      <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="card p-8">
        <h2 className="font-display text-2xl font-semibold text-ink">{cfg.title}</h2>
        <p className="mt-1.5 text-sm text-ink/55">{cfg.subtitle}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {role === 'admin' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className="input-field"
                  placeholder={cfg.placeholder}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    className="input-field pl-11"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Identifiant unique</label>
              <div className="relative">
                <KeyRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  className="input-field pl-11 font-mono uppercase tracking-wider"
                  placeholder={cfg.placeholder}
                  autoCapitalize="characters"
                />
              </div>
              <p className="mt-2 text-xs text-ink/45">{cfg.hint}</p>
            </div>
          )}

          {error && <p className="text-sm text-burgundy">{error}</p>}

          <button type="submit" className="btn-primary w-full">
            Se connecter
          </button>
        </form>

        <div className="mt-5 border-t border-line pt-4">
          <button onClick={fillDemo} className="text-xs font-medium text-burgundy hover:underline">
            Utiliser le compte de démonstration ({cfg.demoId})
          </button>
        </div>
      </div>
    </div>
  );
}
