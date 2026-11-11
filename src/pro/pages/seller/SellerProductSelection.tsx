import { useEffect, useMemo, useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import SmartImage from '@/components/SmartImage';
import { fetchSellerProducts, type SellerProductSummary } from '@/lib/supabaseSellerProducts';
import { fetchSellerSubscription, type SellerSubscriptionInfo } from '@/lib/supabaseSellerSubscription';
import { fetchPlanUnpublishedProducts, choosePublishedProducts } from '@/lib/supabaseProductSelection';
import { PLUS_PLAN_NAME } from '@/data/subscriptionPlans';
import { ArrowLeft, Check, Loader2, Package, AlertCircle } from 'lucide-react';

// « Choisir mes produits en ligne » — after the end of an Ezial Plus trial or
// subscription the server keeps the shop's best-selling products online
// within the Free limit and takes the others offline (never deleted). Here
// the seller picks which ones stay online instead. Only their own published
// or offline products are listed (never a draft, a reported product or a
// deleted one); the limit and ownership are enforced again server-side.
export default function SellerProductSelection() {
  const { navigate, sellerSupabaseShopId, sellerShopIsOfficial } = usePro();
  const [products, setProducts] = useState<SellerProductSummary[]>([]);
  const [subscription, setSubscription] = useState<SellerSubscriptionInfo | null>(null);
  const [offlineByPlan, setOfflineByPlan] = useState<Set<string>>(new Set());
  const [supported, setSupported] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!sellerSupabaseShopId) return;
    let cancelled = false;
    void Promise.all([
      fetchSellerProducts(sellerSupabaseShopId),
      fetchSellerSubscription(sellerSupabaseShopId, { isOfficial: sellerShopIsOfficial }),
      fetchPlanUnpublishedProducts(sellerSupabaseShopId),
    ]).then(([rows, sub, offline]) => {
      if (cancelled) return;
      const choosable = rows.filter((p) => p.status === 'active' || p.status === 'disabled');
      setProducts(choosable);
      setSubscription(sub);
      setSupported(offline.supported);
      setOfflineByPlan(new Set(offline.ids));
      setSelected(new Set(choosable.filter((p) => p.status === 'active').map((p) => p.id)));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId, sellerShopIsOfficial]);

  const limit = sellerShopIsOfficial ? Infinity : (subscription?.productLimit ?? 10);
  const unchanged = useMemo(
    () => products.every((p) => (p.status === 'active') === selected.has(p.id)),
    [products, selected],
  );

  const toggle = (id: string) => {
    setSaved(false);
    setError('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < limit) next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const result = await choosePublishedProducts([...selected]);
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setProducts((prev) => prev.map((p) => ({ ...p, status: selected.has(p.id) ? 'active' : 'disabled' })));
    setOfflineByPlan((prev) => new Set([...prev].filter((id) => !selected.has(id))));
    setSaved(true);
  };

  const full = selected.size >= limit;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <button onClick={() => navigate('/seller/produits')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Produits
      </button>

      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Choisir mes produits en ligne</h1>
        <p className="mt-1 text-sm text-ink/60">
          {Number.isFinite(limit)
            ? <>Votre forfait permet <strong className="font-semibold text-ink">{limit} produits publiés</strong>. Cochez ceux à garder en ligne : les autres restent dans votre boutique, hors ligne, avec leurs photos, prix et historique. Rien n’est supprimé.</>
            : 'Cochez les produits à garder en ligne. Rien n’est supprimé.'}
        </p>
        {Number.isFinite(limit) && subscription && !subscription.isProActive && (
          <p className="mt-2 text-sm text-ink/60">
            Avec {PLUS_PLAN_NAME}, publiez jusqu’à 30 produits.{' '}
            <button onClick={() => navigate('/seller/abonnement')} className="font-medium text-burgundy hover:underline">Voir les formules</button>
          </p>
        )}
      </div>

      {!supported && !loading && (
        <p className="flex items-start gap-2 rounded-lg bg-cream px-4 py-3 text-sm text-ink/70">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          Cette sélection n’est pas encore disponible. Utilisez « Activer » / « Désactiver » dans la liste des produits.
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : products.length === 0 ? (
        <div className="card p-10 text-center">
          <Package size={32} className="mx-auto text-ink/20" />
          <p className="mt-3 text-sm text-ink/55">Aucun produit publié ou hors ligne pour le moment.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {products.map((p) => {
            const checked = selected.has(p.id);
            const disabled = !checked && full;
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 p-4 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-cream/40'}`}>
                  <input type="checkbox" className="sr-only" checked={checked} disabled={disabled || !supported} onChange={() => toggle(p.id)} />
                  <span aria-hidden="true" className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${checked ? 'border-burgundy bg-burgundy text-white' : 'border-ink/25 bg-white'}`}>
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
                    {p.imageUrl ? <SmartImage src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-ink/20"><Package size={18} /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-ink/45">
                      {formatFCFA(p.price)} · {p.status === 'active' ? 'En ligne' : offlineByPlan.has(p.id) ? 'Hors ligne (limite du forfait)' : 'Hors ligne'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* Barre d'action fixe : compteur + enregistrement */}
      {!loading && products.length > 0 && supported && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-64" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <p className="flex-1 text-sm text-ink/70">
              {saved && unchanged
                ? <span className="flex items-center gap-1 text-green-700"><Check size={15} /> Enregistré</span>
                : <><strong className="font-semibold text-ink">{selected.size}</strong>{Number.isFinite(limit) ? ` / ${limit}` : ''} en ligne</>}
            </p>
            <button onClick={() => void save()} disabled={saving || unchanged} className="btn-primary whitespace-nowrap disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          {error && <p className="mx-auto mt-2 max-w-2xl text-sm text-burgundy">{error}</p>}
        </div>
      )}
    </div>
  );
}
