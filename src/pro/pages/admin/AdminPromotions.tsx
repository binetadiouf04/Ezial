import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Pause, Pencil, Play, Plus, Square } from 'lucide-react';
import { formatFCFA } from '@/data/products';
import {
  fetchAdminPromotions, fetchActiveShopOptions, fetchDeliveryNeighborhoods, setAdminPromotionStatus,
  formatDakarDateTime, KIND_LABELS, PROMOTIONS_MISSING_MESSAGE,
  type AdminPromotion, type AdminShopOption, type DeliveryNeighborhood, type PromotionStatus,
} from '@/lib/supabaseAdminPromotions';
import ConfirmDialog from '../../components/blog/ConfirmDialog';
import PromotionForm from './promotions/PromotionForm';
import CompensationsPanel from './promotions/CompensationsPanel';

// Campagnes promotionnelles — phase 1 (contrat : docs/promotions/contrat-phase1.md).
// Ezial finance toujours la réduction ; la commission du vendeur ne change pas.

type View = 'campaigns' | 'compensations';
type Pending = { promo: AdminPromotion; status: Exclude<PromotionStatus, 'draft'> } | null;

type DisplayStatus = 'draft' | 'scheduled' | 'running' | 'expired' | 'exhausted' | 'paused' | 'ended';

const displayLabels: Record<DisplayStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Programmée',
  running: 'En cours',
  expired: 'Expirée',
  exhausted: 'Épuisée',
  paused: 'Suspendue',
  ended: 'Terminée',
};
const displayStyles: Record<DisplayStatus, string> = {
  draft: 'bg-ink/5 text-ink/60 border-line',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-100',
  running: 'bg-green-50 text-green-700 border-green-100',
  expired: 'bg-ink/5 text-ink/50 border-line',
  exhausted: 'bg-orange-50 text-orange-700 border-orange-100',
  paused: 'bg-amber-50 text-amber-700 border-amber-100',
  ended: 'bg-ink/5 text-ink/45 border-line',
};

function displayStatus(p: AdminPromotion, now: number): DisplayStatus {
  if (p.status !== 'active') return p.status === 'paused' ? 'paused' : p.status;
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return 'expired';
  if ((p.maxUsesTotal !== null && p.usesCount >= p.maxUsesTotal) || (p.budgetMax !== null && p.budgetUsed >= p.budgetMax)) return 'exhausted';
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return 'scheduled';
  return 'running';
}

function valueLabel(p: AdminPromotion): string {
  if (p.kind === 'fixed') return `−${formatFCFA(p.value)}`;
  if (p.kind === 'percent') return `−${p.value} %${p.maxDiscount ? ` (max ${formatFCFA(p.maxDiscount)})` : ''}`;
  return p.deliveryCap ? `Livraison offerte jusqu’à ${formatFCFA(p.deliveryCap)}` : 'Livraison offerte';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function targetsLabel(p: AdminPromotion): string {
  if (p.targets.length === 0) return 'Tout le catalogue';
  const count = (t: string) => p.targets.filter((x) => x.type === t).length;
  return [
    count('shop') && plural(count('shop'), 'boutique'),
    count('category') && plural(count('category'), 'catégorie'),
    count('subcategory') && plural(count('subcategory'), 'sous-catégorie'),
    count('product') && plural(count('product'), 'produit'),
  ].filter(Boolean).join(' · ');
}

const confirmTexts: Record<Exclude<PromotionStatus, 'draft'>, { title: string; label: string; done: string; message: (name: string) => string }> = {
  active: { title: 'Activer la campagne', label: 'Activer', done: 'Campagne activée', message: (n) => `« ${n} » s’appliquera aux commandes pendant sa période.` },
  paused: { title: 'Suspendre la campagne', label: 'Suspendre', done: 'Campagne suspendue', message: (n) => `« ${n} » ne s’appliquera plus jusqu’à sa réactivation. Les commandes déjà passées ne changent pas.` },
  ended: { title: 'Terminer la campagne', label: 'Terminer définitivement', done: 'Campagne terminée', message: (n) => `« ${n} » sera terminée définitivement : elle ne pourra plus être réactivée. Les commandes déjà passées ne changent pas.` },
};

function Stat({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-ink/45">{label}</p>
      <p className={`text-sm ${strong ? 'font-semibold' : 'font-medium'} ${negative ? 'text-burgundy' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

export default function AdminPromotions() {
  const [view, setView] = useState<View>('campaigns');
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shops, setShops] = useState<AdminShopOption[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<DeliveryNeighborhood[]>([]);
  const [neighborhoodsMissing, setNeighborhoodsMissing] = useState(false);
  const [editing, setEditing] = useState<AdminPromotion | 'new' | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const res = await fetchAdminPromotions();
    setLoading(false);
    if (res.missing) { setMissing(true); return; }
    setMissing(false);
    setPromotions(res.items);
    if (res.error) setLoadError(res.error);
  }, []);

  const loadNeighborhoods = useCallback(async () => {
    const res = await fetchDeliveryNeighborhoods();
    if (res.missing) { setNeighborhoodsMissing(true); return; }
    setNeighborhoodsMissing(false);
    setNeighborhoods(res.items);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (missing) return;
    void fetchActiveShopOptions().then(setShops);
    void loadNeighborhoods();
  }, [missing, loadNeighborhoods]);

  const confirmStatus = async () => {
    if (!pending) return;
    setBusy(true);
    setActionError('');
    const res = await setAdminPromotionStatus(pending.promo.id, pending.status);
    setBusy(false);
    setPending(null);
    if (res.error) { setNotice(''); setActionError(res.error); return; }
    setNotice(`${confirmTexts[pending.status].done} : « ${pending.promo.name} ».`);
    void load();
  };

  if (missing) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-ink/55">{PROMOTIONS_MISSING_MESSAGE}</p>
      </div>
    );
  }

  if (editing !== null) {
    return (
      <PromotionForm
        key={editing === 'new' ? 'new' : editing.id}
        promotion={editing === 'new' ? null : editing}
        shops={shops}
        neighborhoods={neighborhoods}
        neighborhoodsMissing={neighborhoodsMissing}
        onNeighborhoodsChanged={() => void loadNeighborhoods()}
        onCancel={() => setEditing(null)}
        onSaved={(msg) => { setEditing(null); setNotice(msg); void load(); }}
      />
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line p-1 w-fit" role="tablist">
          <button role="tab" aria-selected={view === 'campaigns'} onClick={() => setView('campaigns')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${view === 'campaigns' ? 'bg-ink text-white' : 'text-ink/60'}`}>Campagnes</button>
          <button role="tab" aria-selected={view === 'compensations'} onClick={() => setView('compensations')} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${view === 'compensations' ? 'bg-ink text-white' : 'text-ink/60'}`}>À reverser aux vendeurs</button>
        </div>
        {view === 'campaigns' && (
          <button onClick={() => { setNotice(''); setActionError(''); setEditing('new'); }} className="btn-primary px-5 py-2.5"><Plus size={15} /> Créer une campagne</button>
        )}
      </div>

      {view === 'compensations' ? <CompensationsPanel /> : (
        <>
          {notice && <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-3 text-sm text-green-700"><Check size={15} className="flex-shrink-0" /> {notice}</p>}
          {(loadError || actionError) && <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy" role="alert"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {actionError || loadError}</p>}

          {loading ? (
            <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
          ) : promotions.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-ink/45">Aucune campagne pour le moment.</p>
              <p className="mt-1 text-xs text-ink/40">Ezial finance la réduction ; la part des vendeurs est inscrite à reverser.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promotions.map((p) => {
                const ds = displayStatus(p, now);
                const s = p.stats;
                const canActivate = p.status === 'draft' || p.status === 'paused';
                return (
                  <article key={p.id} className="card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink break-words">{p.name}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {p.code
                            ? <span className="rounded-md bg-burgundy/5 px-2 py-0.5 font-mono text-xs font-semibold text-burgundy">{p.code}</span>
                            : <span className="rounded-md bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/60">Automatique</span>}
                          <span className="text-xs text-ink/55">{KIND_LABELS[p.kind]} · {valueLabel(p)}</span>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${displayStyles[ds]}`}>{displayLabels[ds]}</span>
                    </div>

                    <p className="mt-2 text-xs text-ink/55">
                      Du {formatDakarDateTime(p.startsAt)} au {formatDakarDateTime(p.endsAt)} <span className="text-ink/40">(heure de Dakar)</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink/45">
                      {targetsLabel(p)} · {p.neighborhoodIds.length === 0 ? 'Tous les quartiers' : plural(p.neighborhoodIds.length, 'quartier')}
                      {p.audience === 'new_customers' ? ' · Nouveaux clients' : ''}
                      {p.minAmount > 0 ? ` · Min. ${formatFCFA(p.minAmount)}` : ''}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg bg-cream/50 p-3 sm:grid-cols-4">
                      <Stat label="Utilisations" value={`${p.usesCount} / ${p.maxUsesTotal ?? '∞'}`} />
                      <Stat label="Budget utilisé" value={p.budgetMax !== null ? `${formatFCFA(p.budgetUsed)} / ${formatFCFA(p.budgetMax)}` : formatFCFA(p.budgetUsed)} />
                      <Stat label="Budget restant" value={p.budgetMax === null ? 'Sans limite' : formatFCFA(s.budgetRemaining ?? Math.max(0, p.budgetMax - p.budgetUsed))} />
                      <Stat label="Commandes" value={String(s.orders)} />
                      <Stat label="Réduction produits" value={formatFCFA(s.productDiscount)} />
                      <Stat label="Livraison offerte" value={formatFCFA(s.deliveryDiscount)} />
                      <Stat label="Coût Ezial" value={formatFCFA(s.ezialCost)} />
                      <Stat label="CA produits" value={formatFCFA(s.sales)} />
                      <Stat label="Commissions" value={formatFCFA(s.commissions)} />
                      <Stat label="Revenu Ezial après promo" value={formatFCFA(s.ezialNet)} strong negative={s.ezialNet < 0} />
                    </div>

                    {p.status !== 'ended' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => { setNotice(''); setEditing(p); }} className="btn-outline px-4 py-2"><Pencil size={14} /> Modifier</button>
                        {canActivate && <button onClick={() => { setActionError(''); setPending({ promo: p, status: 'active' }); }} className="btn-outline px-4 py-2"><Play size={14} /> Activer</button>}
                        {p.status === 'active' && <button onClick={() => { setActionError(''); setPending({ promo: p, status: 'paused' }); }} className="btn-outline px-4 py-2"><Pause size={14} /> Suspendre</button>}
                        <button onClick={() => { setActionError(''); setPending({ promo: p, status: 'ended' }); }} className="btn-ghost px-4 py-2 text-burgundy"><Square size={13} /> Terminer</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {pending && (
        <ConfirmDialog
          title={confirmTexts[pending.status].title}
          message={confirmTexts[pending.status].message(pending.promo.name)}
          confirmLabel={confirmTexts[pending.status].label}
          danger={pending.status === 'ended'}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmStatus()}
        />
      )}
    </div>
  );
}
