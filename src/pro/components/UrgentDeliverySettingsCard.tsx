import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Plus, Trash2, Zap, AlertCircle, Check } from 'lucide-react';
import {
  fetchUrgentDeliverySettings, saveUrgentDeliverySettings,
  type UrgentDeliverySettings, type UrgentSlotSetting,
} from '@/lib/supabaseUrgentDelivery';
import { URGENT_DELIVERY_FEE_FCFA } from '@/lib/urgentDelivery';
import { formatFCFA } from '../data';

// Réglages de la livraison urgente (Ezial Admin › Livraisons). Masqué tant que
// la migration docs/sql/lancement-livraison-urgente.sql n'est pas exécutée.
// Tout est revérifié par admin_update_urgent_delivery_settings() ; les
// messages d'erreur affichés sont ceux du serveur.

const MAX_SLOTS = 8;
const DAY_CHOICES = [
  { value: 0, label: 'Aujourd’hui seulement' },
  { value: 1, label: 'Aujourd’hui et demain' },
  { value: 2, label: 'Jusqu’à après-demain' },
  { value: 3, label: '3 jours à l’avance' },
  { value: 7, label: '7 jours à l’avance' },
];

type Draft = Omit<UrgentDeliverySettings, 'updatedAt'>;

function toDraft(s: UrgentDeliverySettings): Draft {
  return { enabled: s.enabled, minLeadMinutes: s.minLeadMinutes, maxDaysAhead: s.maxDaysAhead, slots: s.slots.map((x) => ({ ...x })) };
}

export default function UrgentDeliverySettingsCard() {
  const [state, setState] = useState<'loading' | 'hidden' | 'error' | 'ready'>('loading');
  const [saved, setSaved] = useState<UrgentDeliverySettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchUrgentDeliverySettings().then((res) => {
      if (cancelled) return;
      if (!res.supported) { setState('hidden'); return; }
      if ('error' in res) { setState('error'); return; }
      if (!res.settings) { setState('hidden'); return; }
      setSaved(res.settings);
      setDraft(toDraft(res.settings));
      setState('ready');
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'hidden' || state === 'loading') return null;
  if (state === 'error') {
    return <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> Impossible de lire les réglages de la livraison urgente.</p>;
  }
  if (!draft || !saved) return null;

  const setSlot = (index: number, patch: Partial<UrgentSlotSetting>) => {
    setDraft({ ...draft, slots: draft.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await saveUrgentDeliverySettings(draft);
    setSaving(false);
    if ('error' in res) { setMessage({ kind: 'error', text: res.error }); return; }
    setSaved(res.settings);
    setDraft(toDraft(res.settings));
    setMessage({ kind: 'ok', text: 'Réglages enregistrés. Le site les applique immédiatement.' });
  };

  const activeSlots = saved.slots.filter((s) => s.enabled).length;
  const dayChoices = DAY_CHOICES.some((c) => c.value === draft.maxDaysAhead)
    ? DAY_CHOICES
    : [...DAY_CHOICES, { value: draft.maxDaysAhead, label: `${draft.maxDaysAhead} jours à l’avance` }];

  return (
    <section className="card p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <Zap size={18} className="flex-shrink-0 text-burgundy" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Livraison urgente</p>
          <p className="text-xs text-ink/50">
            {saved.enabled ? `Proposée aux clients · ${activeSlots} créneau${activeSlots > 1 ? 'x' : ''} · +${formatFCFA(URGENT_DELIVERY_FEE_FCFA)} par commande` : 'Non proposée aux clients'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${saved.enabled ? 'bg-green-50 text-green-700' : 'bg-ink/5 text-ink/55'}`}>{saved.enabled ? 'Ouverte' : 'Fermée'}</span>
        <ChevronDown size={16} className={`flex-shrink-0 text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 rounded border-ink/30 text-burgundy focus:ring-burgundy/30" checked={draft.enabled} onChange={(e) => { setDraft({ ...draft, enabled: e.target.checked }); setMessage(null); }} />
            <span className="text-sm text-ink">Proposer la livraison urgente au paiement</span>
          </label>
          <p className="text-xs text-ink/50">
            Supplément fixe de {formatFCFA(URGENT_DELIVERY_FEE_FCFA)} par commande, fixé par le serveur et versé à Ezial (jamais aux vendeurs). Proposé seulement si au moins une boutique est livrée à domicile.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="urgent-lead">Délai minimal avant le début du créneau (minutes)</label>
              <input id="urgent-lead" type="number" min={0} max={1440} step={15} className="input-field" value={draft.minLeadMinutes}
                onChange={(e) => { setDraft({ ...draft, minLeadMinutes: Math.max(0, Math.round(Number(e.target.value) || 0)) }); setMessage(null); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/60" htmlFor="urgent-days">Jours proposés</label>
              <select id="urgent-days" className="input-field" value={draft.maxDaysAhead} onChange={(e) => { setDraft({ ...draft, maxDaysAhead: Number(e.target.value) }); setMessage(null); }}>
                {dayChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink/60">Créneaux (heure de Dakar). L’heure limite est la dernière heure, le jour même, pour commander ce créneau.</p>
            {draft.slots.length === 0 && <p className="text-sm text-ink/45">Aucun créneau.</p>}
            {draft.slots.map((slot, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <input aria-label="Libellé du créneau" className="input-field flex-1" maxLength={40} value={slot.label} onChange={(e) => setSlot(i, { label: e.target.value })} placeholder="Ex. : 18h–20h" />
                  <label className="flex items-center gap-1.5 text-xs text-ink/65">
                    <input type="checkbox" className="h-4 w-4 rounded border-ink/30 text-burgundy" checked={slot.enabled} onChange={(e) => setSlot(i, { enabled: e.target.checked })} /> Actif
                  </label>
                  <button type="button" onClick={() => { setDraft({ ...draft, slots: draft.slots.filter((_, j) => j !== i) }); setMessage(null); }} aria-label={`Supprimer le créneau ${slot.label}`} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-burgundy/5 hover:text-burgundy">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[11px] text-ink/50">Début<input type="time" className="input-field mt-0.5" value={slot.start} onChange={(e) => setSlot(i, { start: e.target.value })} /></label>
                  <label className="text-[11px] text-ink/50">Fin<input type="time" className="input-field mt-0.5" value={slot.end} onChange={(e) => setSlot(i, { end: e.target.value })} /></label>
                  <label className="text-[11px] text-ink/50">Heure limite<input type="time" className="input-field mt-0.5" value={slot.cutoff} onChange={(e) => setSlot(i, { cutoff: e.target.value })} /></label>
                </div>
              </div>
            ))}
            {draft.slots.length < MAX_SLOTS && (
              <button type="button" onClick={() => { setDraft({ ...draft, slots: [...draft.slots, { label: '', start: '', end: '', cutoff: '', enabled: true }] }); setMessage(null); }} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
                <Plus size={15} /> Ajouter un créneau
              </button>
            )}
          </div>

          {message && (
            <p className={`flex items-start gap-1.5 rounded-lg p-3 text-sm ${message.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-burgundy/5 text-burgundy'}`}>
              {message.kind === 'ok' ? <Check size={15} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />} {message.text}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => { setDraft(toDraft(saved)); setMessage(null); }} disabled={saving} className="btn-outline">Annuler</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
