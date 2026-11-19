import { useState } from 'react';
import { parseWaistCm, waistError, formatWaistCm, WAIST_LABEL } from '@/lib/waistMeasure';

// Tour de taille d'une ligne Baya dans le panier : affiché, modifiable avant la
// commande. Une ligne sans mesure valide (ancien panier) ouvre directement la
// saisie : la commande reste bloquée tant qu'elle n'est pas renseignée.
export default function WaistEditor({ value, onSave, size = 'md' }: { value?: number; onSave: (cm: number) => void; size?: 'sm' | 'md' }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const open = editing || value === undefined;
  const textSize = 'text-xs';

  const save = () => {
    const parsed = parseWaistCm(text);
    if (parsed === null) { setMsg(waistError(text) ?? ''); return; }
    onSave(parsed);
    setEditing(false);
    setMsg('');
  };

  if (!open) {
    return (
      <p className={`mt-0.5 ${textSize} text-ink/55`}>
        Tour de taille : <span className="font-medium text-ink/75">{formatWaistCm(value!)}</span>
        <button type="button" onClick={() => { setText(String(value).replace('.', ',')); setMsg(''); setEditing(true); }} className="ml-2 font-medium text-burgundy underline underline-offset-2">Modifier</button>
      </p>
    );
  }

  return (
    <div className="mt-1.5">
      <label className={`block ${textSize} font-medium text-ink/65`} htmlFor={`waist-edit-${size}`}>{WAIST_LABEL}{value === undefined ? ' — à renseigner' : ''}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`waist-edit-${size}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ex. 82"
          aria-invalid={msg ? 'true' : 'false'}
          value={text}
          onChange={(e) => { setText(e.target.value); setMsg(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          className={`w-24 rounded-lg border bg-white px-2.5 py-1.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-burgundy/20 ${msg ? 'border-burgundy' : 'border-ink/20'}`}
        />
        <button type="button" onClick={save} className="rounded-full bg-burgundy px-3 py-1.5 text-xs font-semibold text-white">Enregistrer</button>
        {value !== undefined && <button type="button" onClick={() => { setEditing(false); setMsg(''); }} className="text-xs font-medium text-ink/55 hover:text-ink">Annuler</button>}
      </div>
      {msg && <p role="alert" className="mt-1 text-xs text-burgundy">{msg}</p>}
    </div>
  );
}
