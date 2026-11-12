import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminShops, updateShopStatus, type AdminShopSummary } from '@/lib/supabaseAdminData';
import { StatusChip } from '../../components/StatusChip';
import FlagModal from '../../components/FlagModal';
import { Search, Loader2, AlertCircle, Check, Ban, Crown } from 'lucide-react';
import { formatDate } from '../../data';
import SmartImage from '@/components/SmartImage';

const suspensionReasons = ['Produits suspects ou contrefaits', 'Informations trompeuses', 'Comportement inapproprié', 'Non-conformité répétée'];

// Statut 'paused' : boutique mise en pause par son propre vendeur (masquée
// du site public). StatusChip garde « En pause » pour les campagnes ; ici
// on précise qui a mis la boutique en pause.
const PAUSED_BY_SELLER_LABEL = 'En pause (par le vendeur)';

type PlanFilter = 'all' | 'trial' | 'plus' | 'free';
const PLAN_FILTERS: { id: PlanFilter; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'trial', label: 'Essais gratuits' },
  { id: 'plus', label: 'Abonnées Ezial Plus' },
  { id: 'free', label: 'Free' },
];

function matchesPlan(shop: AdminShopSummary, filter: PlanFilter): boolean {
  const k = shop.subscription.kind;
  if (filter === 'all') return true;
  if (filter === 'trial') return k === 'trial';
  if (filter === 'plus') return k === 'plus' || k === 'official';
  return k === 'free' || k === 'trial_ended';
}

// Ligne « formule » d'une boutique : essai en cours (avec sa date de fin),
// abonnement payé, essai terminé ou Free.
function SubscriptionLine({ sub }: { sub: AdminShopSummary['subscription'] }) {
  const days = sub.daysLeft !== null ? ` · ${sub.daysLeft} jour${sub.daysLeft > 1 ? 's' : ''} restant${sub.daysLeft > 1 ? 's' : ''}` : '';
  if (sub.kind === 'official') return <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><Crown size={12} /> Ezial Plus — boutique officielle</p>;
  if (sub.kind === 'trial' && sub.until) {
    const notStarted = sub.trialStart && new Date(sub.trialStart) > new Date();
    return (
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
        <Crown size={12} /> Essai gratuit {notStarted ? `du ${formatDate(sub.trialStart as string)} ` : ''}jusqu’au {formatDate(sub.until)}{days}
      </p>
    );
  }
  if (sub.kind === 'plus' && sub.until) {
    return <p className="mt-1 flex items-center gap-1 text-xs text-burgundy"><Crown size={12} /> Ezial Plus {sub.billingPeriod === 'annual' ? 'annuel' : sub.billingPeriod === 'quarterly' ? 'trimestriel' : ''} jusqu’au {formatDate(sub.until)}{days}</p>;
  }
  if (sub.kind === 'trial_ended') return <p className="mt-1 text-xs text-ink/45">Essai terminé{sub.until ? ` le ${formatDate(sub.until)}` : ''} · Free</p>;
  return <p className="mt-1 text-xs text-ink/45">Free · essai non utilisé</p>;
}

export default function AdminShops() {
  const { navigate } = usePro();
  const [shops, setShops] = useState<AdminShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setShops(await fetchAdminShops());
    } catch {
      setLoadError('Impossible de charger les boutiques. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (shopId: string, status: 'active' | 'suspended' | 'rejected', reason?: string) => {
    setActing(shopId);
    setActionError('');
    const result = await updateShopStatus(shopId, status, reason);
    setActing(null);
    if (result.error) { setActionError(result.error); return; }
    setShops((prev) => prev.map((s) => s.id === shopId ? { ...s, status, suspensionReason: status === 'suspended' ? (reason ?? null) : null } : s));
  };

  const confirmSuspend = async (reason: string) => {
    if (!suspendTarget) return;
    await act(suspendTarget, 'suspended', reason);
    setSuspendTarget(null);
  };

  const filtered = shops.filter((s) => {
    if (!matchesPlan(s, planFilter)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.sellerCode ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Boutiques</h1>

      {(loadError || actionError) && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError || actionError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input className="input-field pl-9" placeholder="Rechercher une boutique" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Formule : essais gratuits offerts, abonnées, Free */}
          <div className="flex flex-wrap gap-2">
            {PLAN_FILTERS.map((f) => {
              const n = shops.filter((s) => matchesPlan(s, f.id)).length;
              return (
                <button key={f.id} onClick={() => setPlanFilter(f.id)} className={`chip ${planFilter === f.id ? 'chip-active' : ''}`}>
                  {f.label} ({n})
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucune boutique trouvée.</p></div>
            ) : (
              filtered.map((shop) => (
                <div key={shop.id} className="card w-full p-4 flex items-center gap-3">
                  <button onClick={() => navigate(`/admin/boutiques/${shop.id}`)} className="flex flex-1 min-w-0 items-center gap-3 text-left">
                    {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{shop.name}</p>
                      {shop.sellerCode && <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerCode}</p>}
                      <SubscriptionLine sub={shop.subscription} />
                      <p className="text-xs text-ink/45 mt-1.5">{shop.activeProductCount} produit{shop.activeProductCount > 1 ? 's' : ''} actif{shop.activeProductCount > 1 ? 's' : ''}</p>
                      {shop.status === 'suspended' && shop.suspensionReason && <p className="text-xs text-burgundy mt-1">Motif : {shop.suspensionReason}</p>}
                    </div>
                  </button>
                  <StatusChip status={shop.status} size="md" label={shop.status === 'paused' ? PAUSED_BY_SELLER_LABEL : undefined} />
                  {shop.status === 'active' && (
                    <button onClick={() => setSuspendTarget(shop.id)} disabled={acting === shop.id} title="Désactiver la boutique" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-burgundy/5 hover:text-burgundy"><Ban size={16} /></button>
                  )}
                  {shop.status !== 'active' && (
                    <button onClick={() => void act(shop.id, 'active')} disabled={acting === shop.id} title="Activer" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-green-50 hover:text-green-700"><Check size={16} /></button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {suspendTarget && (
        <FlagModal
          title="Désactiver la boutique"
          quickReasons={suspensionReasons}
          confirmLabel="Désactiver"
          onCancel={() => setSuspendTarget(null)}
          onConfirm={confirmSuspend}
        />
      )}
    </div>
  );
}
