import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, Smartphone, X } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { formatFCFA } from '@/data/products';
import {
  fetchAdminCompensations, markCompensationsPaid, formatDakarDateTime, COMPENSATION_METHOD_LABELS, PROMOTIONS_MISSING_MESSAGE,
  type CompensationMethod, type CompensationStatus, type PromotionCompensation,
} from '@/lib/supabaseAdminPromotions';

// « À reverser aux vendeurs » : part des réductions de campagne rattachée à
// chaque boutique, financée par Ezial et payée à la main par l'administratrice.

const FILTERS: { id: CompensationStatus; label: string }[] = [
  { id: 'due', label: 'À payer' },
  { id: 'paid', label: 'Payées' },
  { id: 'cancelled', label: 'Annulées' },
];

const statusStyles: Record<CompensationStatus, string> = {
  due: 'bg-amber-50 text-amber-700 border-amber-100',
  paid: 'bg-green-50 text-green-700 border-green-100',
  cancelled: 'bg-ink/5 text-ink/50 border-line',
};
const statusLabels: Record<CompensationStatus, string> = { due: 'À payer', paid: 'Payée', cancelled: 'Annulée' };

interface ShopDue { key: string; name: string; total: number; ids: string[]; orangeMoney: string | null; wave: string | null }

function CopyButton({ label, text, id, copied, onCopy }: { label: string; text: string; id: string; copied: string | null; onCopy: (id: string, text: string) => void }) {
  const state = copied === id ? 'ok' : copied === `${id}:ko` ? 'ko' : null;
  return (
    <button type="button" onClick={() => onCopy(id, text)} className="btn-outline flex-shrink-0 px-3 py-1.5 text-xs">
      {state === 'ok' ? <Check size={13} /> : <Copy size={13} />} {state === 'ok' ? 'Copié' : state === 'ko' ? 'Copie impossible' : label}
    </button>
  );
}

export default function CompensationsPanel() {
  const [filter, setFilter] = useState<CompensationStatus>('due');
  const [items, setItems] = useState<PromotionCompensation[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<CompensationMethod>('wave');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (status: CompensationStatus) => {
    setLoading(true);
    setLoadError('');
    setSelected([]);
    const res = await fetchAdminCompensations(status);
    setLoading(false);
    if (res.missing) { setMissing(true); return; }
    setMissing(false);
    setItems(res.items);
    if (res.error) setLoadError(res.error);
  }, []);

  useEffect(() => { void load(filter); }, [load, filter]);

  // Total à payer par boutique (filtre « À payer »).
  const byShop = useMemo(() => {
    const map = new Map<string, ShopDue>();
    for (const c of items) {
      if (c.status !== 'due') continue;
      const key = c.shopId ?? c.shopName;
      const entry = map.get(key) ?? { key, name: c.shopName, total: 0, ids: [], orangeMoney: null, wave: null };
      entry.total += c.amount;
      entry.ids.push(c.id);
      entry.orangeMoney = entry.orangeMoney ?? c.payoutOrangeMoney;
      entry.wave = entry.wave ?? c.payoutWave;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [items]);

  const selectedTotal = items.filter((c) => selected.includes(c.id)).reduce((s, c) => s + c.amount, 0);
  // Une seule boutique sélectionnée : on affiche ses numéros de versement.
  const selectedShopKeys = [...new Set(items.filter((c) => selected.includes(c.id)).map((c) => c.shopId ?? c.shopName))];
  const payShop = selectedShopKeys.length === 1 ? byShop.find((b) => b.key === selectedShopKeys[0]) ?? null : null;

  const openPay = (shop: ShopDue | null) => {
    if (shop) setSelected(shop.ids);
    setMethod(shop?.orangeMoney ? 'orange_money' : shop?.wave ? 'wave' : 'wave');
    setPayError('');
    setCopied(null);
    setPayOpen(true);
  };
  const copy = async (id: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? id : `${id}:ko`);
    window.setTimeout(() => setCopied((c) => (c === id || c === `${id}:ko` ? null : c)), 2000);
  };
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirmPaid = async () => {
    setPaying(true);
    setPayError('');
    const res = await markCompensationsPaid(selected, method, reference, note);
    setPaying(false);
    if (res.error) { setPayError(res.error); return; }
    const n = selected.length;
    setPayOpen(false);
    setReference('');
    setNote('');
    setNotice(`${n} compensation${n > 1 ? 's' : ''} marquée${n > 1 ? 's' : ''} payée${n > 1 ? 's' : ''} (${formatFCFA(selectedTotal)}).`);
    void load(filter);
  };

  if (missing) {
    return <div className="card p-8 text-center"><p className="text-sm text-ink/55">{PROMOTIONS_MISSING_MESSAGE}</p></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/55">Ce qu’Ezial reverse à chaque boutique pour les réductions de campagne (part vendeur déjà déduite), payé à la main.</p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les compensations">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => { setNotice(''); setFilter(f.id); }} className={`chip ${filter === f.id ? 'chip-active' : ''}`} aria-pressed={filter === f.id}>{f.label}</button>
        ))}
      </div>

      {notice && <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700"><Check size={15} /> {notice}</p>}
      {loadError && <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}</p>}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          {filter === 'due' && byShop.length > 0 && (
            <div className="card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Total à payer par boutique</h3>
                <p className="font-display text-lg font-semibold text-burgundy">{formatFCFA(byShop.reduce((s, b) => s + b.total, 0))}</p>
              </div>
              <ul className="divide-y divide-line">
                {byShop.map((b) => {
                  return (
                    <li key={b.key} className="flex items-center gap-3 py-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-ink">{b.name} <span className="text-xs text-ink/45">· {b.ids.length} commande{b.ids.length > 1 ? 's' : ''}</span></p>
                      <p className="flex-shrink-0 text-sm font-semibold text-ink">{formatFCFA(b.total)}</p>
                      <button type="button" onClick={() => openPay(b)} className="btn-primary flex-shrink-0 px-4 py-1.5 text-xs">Payer</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {items.length === 0 ? (
            <div className="card p-8 text-center"><p className="text-sm text-ink/45">{filter === 'due' ? 'Rien à reverser pour le moment.' : filter === 'paid' ? 'Aucune compensation payée.' : 'Aucune compensation annulée.'}</p></div>
          ) : (
            <div className="card divide-y divide-line">
              {items.map((c) => {
                const selectable = c.status === 'due';
                const on = selected.includes(c.id);
                return (
                  <label key={c.id} className={`flex items-start gap-3 p-3.5 sm:p-4 ${selectable ? 'cursor-pointer hover:bg-cream/40' : ''}`}>
                    {selectable && (
                      <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="mt-1 h-4 w-4 flex-shrink-0 rounded border-line text-burgundy focus:ring-burgundy" aria-label={`Sélectionner ${c.orderNumber ?? c.id}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{c.shopName}</p>
                          <p className="truncate text-xs text-ink/50"><span className="font-mono">{c.orderNumber ?? '—'}</span>{c.promotionName ? ` · ${c.promotionName}` : ''}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-semibold text-ink">{formatFCFA(c.amount)}</p>
                          <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles[c.status]}`}>{statusLabels[c.status]}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-ink/45">
                        {c.status === 'paid'
                          ? `Payée le ${formatDakarDateTime(c.paidAt)}${c.paidMethod ? ` · ${COMPENSATION_METHOD_LABELS[c.paidMethod] ?? c.paidMethod}` : ''}${c.paidReference ? ` · réf. ${c.paidReference}` : ''}`
                          : `Créée le ${formatDakarDateTime(c.createdAt)}`}
                      </p>
                      {(c.grossAllocation !== null || c.sellerShare !== null) && (
                        <p className="mt-0.5 text-[11px] text-ink/55">
                          {c.grossAllocation !== null ? `Réduction totale ${formatFCFA(c.grossAllocation)}` : ''}
                          {c.grossAllocation !== null && c.sellerShare !== null ? ' · ' : ''}
                          {c.sellerShare !== null ? `part vendeur ${formatFCFA(c.sellerShare)}` : ''}
                        </p>
                      )}
                      {c.note && <p className="mt-0.5 break-words text-[11px] text-ink/45">Note : {c.note}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected.length > 0 && (
        <div className="card sticky bottom-3 z-10 flex flex-wrap items-center gap-3 p-3 card-shadow">
          <p className="min-w-0 flex-1 text-sm text-ink">{selected.length} sélectionnée{selected.length > 1 ? 's' : ''} · <strong>{formatFCFA(selectedTotal)}</strong></p>
          <button type="button" onClick={() => setSelected([])} className="btn-ghost px-3">Désélectionner</button>
          <button type="button" onClick={() => openPay(null)} className="btn-primary px-5 py-2.5"><Check size={15} /> Marquer payé</button>
        </div>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={paying ? undefined : () => setPayOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="pay-title" className="font-display text-lg font-semibold text-ink">{payShop ? `Payer ${payShop.name}` : 'Marquer payé'}</h3>
              <button type="button" onClick={() => setPayOpen(false)} disabled={paying} aria-label="Fermer"><X size={18} className="text-ink/40" /></button>
            </div>
            {payShop && (
              <div className="mb-4 space-y-2 rounded-xl border border-line bg-cream/50 p-3">
                {([['om', 'Orange Money', payShop.orangeMoney], ['wave', 'Wave', payShop.wave]] as const).map(([id, label, number]) => (
                  <div key={id} className="flex items-center gap-2">
                    <Smartphone size={15} className="flex-shrink-0 text-ink/40" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-ink/50">{label}</p>
                      <p className={`truncate text-sm ${number ? 'font-mono font-semibold text-ink' : 'text-ink/45'}`}>{number ?? 'Aucun numéro enregistré'}</p>
                    </div>
                    {number && <CopyButton label="Copier le numéro" text={number.replace(/\s/g, '')} id={id} copied={copied} onCopy={(i, t) => void copy(i, t)} />}
                  </div>
                ))}
                <div className="flex items-center gap-2 border-t border-line pt-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-ink/50">Montant total à payer</p>
                    <p className="font-display text-xl font-semibold text-burgundy">{formatFCFA(selectedTotal)}</p>
                  </div>
                  <CopyButton label="Copier le montant" text={String(selectedTotal)} id="amount" copied={copied} onCopy={(i, t) => void copy(i, t)} />
                </div>
                <p className="text-[11px] text-ink/55">Envoyez le montant depuis votre application Orange Money ou Wave, puis marquez comme payé.</p>
              </div>
            )}
            <p className="mb-4 text-sm text-ink/60">{selected.length} compensation{selected.length > 1 ? 's' : ''} · <strong className="text-ink">{formatFCFA(selectedTotal)}</strong></p>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink/60">Moyen de paiement</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(COMPENSATION_METHOD_LABELS) as CompensationMethod[]).map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={`chip ${method === m ? 'chip-active' : ''}`}>{COMPENSATION_METHOD_LABELS[m]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="pay-ref" className="mb-1.5 block text-xs font-medium text-ink/60">Référence (facultatif)</label>
                <input id="pay-ref" className="input-field" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="Ex : identifiant de transaction Wave" />
              </div>
              <div>
                <label htmlFor="pay-note" className="mb-1.5 block text-xs font-medium text-ink/60">Note (facultatif)</label>
                <textarea id="pay-note" className="input-field min-h-[72px]" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </div>
              {payError && <p className="text-xs text-burgundy" role="alert">{payError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setPayOpen(false)} disabled={paying} className="btn-outline flex-1 px-4">Annuler</button>
                <button type="button" onClick={() => void confirmPaid()} disabled={paying} className="btn-primary flex-1 px-4">
                  {paying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Marquer payé
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
