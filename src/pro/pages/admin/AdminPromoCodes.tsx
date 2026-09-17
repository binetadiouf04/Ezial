import { useState, useEffect, useCallback } from 'react';
import {
  fetchPromoCodes, createPromoCode, updatePromoCode, deletePromoCode,
  type AdminPromoCode, type PromoCodeInput, type PromoDiscountType,
} from '@/lib/supabaseAdminPromoCodes';
import { formatFCFA } from '../../data';
import { Plus, Loader2, AlertCircle, Pencil, Trash2, X, Check } from 'lucide-react';

const emptyInput: PromoCodeInput = { code: '', discountType: 'percent', discountValue: 10, minOrderAmount: null, startDate: null, endDate: null, isActive: true };

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

function isExpired(code: AdminPromoCode): boolean {
  return Boolean(code.endDate && new Date(code.endDate).getTime() < Date.now());
}

export default function AdminPromoCodes() {
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<PromoCodeInput>(emptyInput);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCodes(await fetchPromoCodes());
    } catch {
      setLoadError('Impossible de charger les codes promo. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startNew = () => { setForm(emptyInput); setFormError(''); setEditing('new'); };
  const startEdit = (c: AdminPromoCode) => {
    setForm({ code: c.code, discountType: c.discountType, discountValue: c.discountValue, minOrderAmount: c.minOrderAmount, startDate: c.startDate, endDate: c.endDate, isActive: c.isActive });
    setFormError('');
    setEditing(c.id);
  };
  const cancel = () => setEditing(null);

  const save = async () => {
    if (!form.code.trim()) { setFormError('Le code est obligatoire.'); return; }
    if (!form.discountValue || form.discountValue <= 0) { setFormError('La valeur de réduction doit être positive.'); return; }
    if (form.discountType === 'percent' && form.discountValue > 100) { setFormError('Un pourcentage ne peut pas dépasser 100.'); return; }
    setFormError('');
    setSaving(true);
    const result = editing === 'new' ? await createPromoCode(form) : await updatePromoCode(editing as string, form);
    setSaving(false);
    if (result.error) { setFormError(result.error); return; }
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    await deletePromoCode(id);
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Codes promo</h2>
        {editing === null && <button onClick={startNew} className="btn-outline"><Plus size={15} /> Nouveau code</button>}
      </div>

      {loadError && <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}</p>}

      {editing !== null && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink">{editing === 'new' ? 'Nouveau code promo' : 'Modifier le code'}</h3>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Code</label>
            <input className="input-field font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EZIAL10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Type de réduction</label>
              <select className="input-field" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as PromoDiscountType })}>
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (FCFA)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Valeur</label>
              <input type="number" min={1} className="input-field" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Minimum de commande (optionnel)</label>
            <input type="number" min={0} className="input-field" value={form.minOrderAmount ?? ''} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value ? Number(e.target.value) : null })} placeholder="Ex : 10000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Date de début (optionnel)</label>
              <input type="date" className="input-field" value={toDateInputValue(form.startDate)} onChange={(e) => setForm({ ...form, startDate: e.target.value || null })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Date de fin (optionnel)</label>
              <input type="date" className="input-field" value={toDateInputValue(form.endDate)} onChange={(e) => setForm({ ...form, endDate: e.target.value || null })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Actif
          </label>
          {formError && <p className="text-xs text-burgundy">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={saving} className="btn-primary flex-1">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer</button>
            <button onClick={cancel} className="btn-outline flex-1"><X size={15} /> Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : codes.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun code promo pour le moment.</p></div>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.id} className="card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">{c.code}</span>
                  {!c.isActive && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/50">Inactif</span>}
                  {isExpired(c) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">Expiré</span>}
                </div>
                <p className="text-xs text-ink/50 mt-0.5">
                  {c.discountType === 'percent' ? `-${c.discountValue}%` : `-${formatFCFA(c.discountValue)}`}
                  {c.minOrderAmount ? ` · min. ${formatFCFA(c.minOrderAmount)}` : ''}
                  {c.endDate ? ` · jusqu'au ${new Date(c.endDate).toLocaleDateString('fr-FR')}` : ''}
                </p>
              </div>
              <button onClick={() => startEdit(c)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-cream"><Pencil size={14} /></button>
              <button onClick={() => void remove(c.id)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-burgundy/5 hover:text-burgundy"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
