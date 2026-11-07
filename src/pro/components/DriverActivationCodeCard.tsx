import { useState } from 'react';
import { Copy, Check, KeyRound } from 'lucide-react';
import { formatActivationCode, type DriverActivationCode } from '@/lib/supabaseAdminDrivers';

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// Shown to the admin right after an activation code was generated (new
// driver or PIN reset). The code is displayed only here, once: only its
// hash is stored, so a lost code means generating a new one.
export default function DriverActivationCodeCard({ username, activation }: { username: string; activation: DriverActivationCode }) {
  const [copied, setCopied] = useState(false);
  const formatted = formatActivationCode(activation.code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Nom d'utilisateur : ${username}\nCode d'activation : ${formatted}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permission, older browser): the code stays readable on screen.
    }
  };

  return (
    <div className="rounded-lg bg-cream p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink/45">Nom d'utilisateur</p>
          <p className="font-mono text-sm font-semibold text-ink">{username}</p>
        </div>
        <button onClick={() => void copy()} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:text-ink">
          {copied ? <><Check size={13} className="text-green-600" /> Copié</> : <><Copy size={13} /> Copier</>}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink/45"><KeyRound size={12} /> Code d'activation</p>
      <p className="mt-0.5 font-mono text-2xl font-semibold tracking-[0.2em] text-burgundy">{formatted}</p>
      <p className="mt-2 text-xs text-ink/55">
        Valable jusqu'au {formatExpiry(activation.expiresAt)}. Communiquez-le au livreur de vive voix ou par téléphone :
        il le saisira à sa première connexion pour créer son NIP. Ce code ne sera plus affiché ; s'il est perdu, générez-en un nouveau.
      </p>
    </div>
  );
}
