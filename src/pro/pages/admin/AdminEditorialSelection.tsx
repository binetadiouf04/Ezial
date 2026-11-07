import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminEditorialData, addEditorialPick, removeEditorialPick, reorderEditorialPicks,
  EDITORIAL_PICKS_MAX, EDITORIAL_TABLE_MISSING_MESSAGE,
  type AdminEditorialPick, type AdminEditorialProduct,
} from '@/lib/supabaseAdminEditorial';
import { formatFcfa } from '@/data/subscriptionPlans';
import SmartImage from '@/components/SmartImage';
import { AlertCircle, ArrowDown, ArrowUp, Crown, Info, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react';

// Admin screen of the "Sélection Ezial" (homepage recommendations). The
// database enforces every rule (Ezial Plus shop, active product, 12 items
// at most, admins only); this screen lists, adds, removes and reorders.

const SEARCH_RESULTS_LIMIT = 30;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ProductThumb({ product }: { product: AdminEditorialProduct | null }) {
  return (
    <SmartImage
      src={product?.imageUrl ?? ''}
      alt=""
      className="h-14 w-12 flex-shrink-0 rounded-lg bg-cream object-cover"
    />
  );
}

// Why a selected product is currently not shown on the homepage, if it isn't.
function hiddenReason(pick: AdminEditorialPick): string | null {
  if (!pick.product) return 'Produit introuvable : retirez-le de la sélection.';
  if (pick.product.status !== 'active') return 'Produit non publié : masqué sur l’accueil.';
  if (!pick.product.shopIsPlus) return 'Boutique sans Ezial Plus actif : masqué sur l’accueil.';
  return null;
}

export default function AdminEditorialSelection() {
  const [picks, setPicks] = useState<AdminEditorialPick[]>([]);
  const [eligible, setEligible] = useState<AdminEditorialProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setLoadError('');
    const data = await fetchAdminEditorialData();
    setMissingTable(Boolean(data.missingTable));
    setLoadError(data.error ?? '');
    setPicks(data.picks);
    setEligible(data.eligible);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isFull = picks.length >= EDITORIAL_PICKS_MAX;

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const list = q
      ? eligible.filter((p) => normalize(`${p.name} ${p.reference} ${p.shopName}`).includes(q))
      : eligible;
    return list.slice(0, SEARCH_RESULTS_LIMIT);
  }, [eligible, query]);

  const handleAdd = async (product: AdminEditorialProduct) => {
    setBusyId(product.id);
    setActionError('');
    const result = await addEditorialPick(product.id);
    setBusyId(null);
    if (result.error) { setActionError(result.error); return; }
    await load(false);
  };

  const handleRemove = async (pick: AdminEditorialPick) => {
    setBusyId(pick.id);
    setActionError('');
    const result = await removeEditorialPick(pick.id);
    setBusyId(null);
    if (result.error) { setActionError(result.error); return; }
    await load(false);
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= picks.length) return;
    const reordered = [...picks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPicks(reordered);
    setBusyId(reordered[target].id);
    setActionError('');
    const result = await reorderEditorialPicks(reordered.map((p) => p.id));
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      await load(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={22} className="text-burgundy" aria-hidden="true" />
          <h1 className="font-display text-2xl font-semibold text-ink">Sélection Ezial</h1>
        </div>
        {!missingTable && !loading && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isFull ? 'bg-burgundy text-white' : 'bg-burgundy/10 text-burgundy'}`}>
            {picks.length} / {EDITORIAL_PICKS_MAX}
          </span>
        )}
      </div>

      <div className="card flex items-start gap-3 p-4">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-burgundy" aria-hidden="true" />
        <div className="space-y-1 text-sm text-ink/70">
          <p><span className="font-semibold text-ink">Réservé aux boutiques Ezial Plus</span> ; choisissez des produits pertinents et disponibles.</p>
          <p className="text-xs text-ink/50">
            {EDITORIAL_PICKS_MAX} produits au maximum, affichés sur l’accueil dans l’ordre ci-dessous. Un produit reste en sélection mais n’est plus affiché dès qu’il n’est plus publié ou que sa boutique n’a plus Ezial Plus.
          </p>
        </div>
      </div>

      {missingTable && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {EDITORIAL_TABLE_MISSING_MESSAGE}
        </p>
      )}
      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {actionError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : !missingTable && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          {/* Current selection, in display order */}
          <section aria-labelledby="editorial-current" className="min-w-0 space-y-3">
            <h2 id="editorial-current" className="text-sm font-semibold text-ink">Sélection actuelle</h2>
            {picks.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun produit sélectionné : la Sélection Ezial n’apparaît pas sur l’accueil.</p></div>
            ) : (
              <ol className="card divide-y divide-line">
                {picks.map((pick, index) => {
                  const reason = hiddenReason(pick);
                  const busy = busyId === pick.id;
                  return (
                    <li key={pick.id} className="flex items-center gap-3 p-3 sm:p-4">
                      <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-ink/40">{index + 1}</span>
                      <ProductThumb product={pick.product} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{pick.product?.name ?? 'Produit introuvable'}</p>
                        {pick.product && (
                          <p className="truncate text-xs text-ink/50">{pick.product.shopName}{pick.product.reference ? ` · ${pick.product.reference}` : ''}</p>
                        )}
                        {reason && <p className="mt-0.5 text-xs font-medium text-amber-700">{reason}</p>}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          onClick={() => void handleMove(index, -1)}
                          disabled={index === 0 || busyId !== null}
                          aria-label={`Monter « ${pick.product?.name ?? 'ce produit'} »`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/60 hover:bg-cream disabled:opacity-30"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          onClick={() => void handleMove(index, 1)}
                          disabled={index === picks.length - 1 || busyId !== null}
                          aria-label={`Descendre « ${pick.product?.name ?? 'ce produit'} »`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink/60 hover:bg-cream disabled:opacity-30"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          onClick={() => void handleRemove(pick)}
                          disabled={busyId !== null}
                          aria-label={`Retirer « ${pick.product?.name ?? 'ce produit'} » de la sélection`}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-burgundy hover:bg-burgundy/5 disabled:opacity-30"
                        >
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Products that can be added */}
          <section aria-labelledby="editorial-add" className="min-w-0 space-y-3">
            <h2 id="editorial-add" className="text-sm font-semibold text-ink">Ajouter un produit</h2>
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, référence ou boutique…"
                aria-label="Rechercher un produit d’une boutique Ezial Plus"
                className="input-field pl-10"
              />
            </div>
            {isFull && (
              <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/60">La sélection est complète ({EDITORIAL_PICKS_MAX} produits) : retirez un produit pour en ajouter un autre.</p>
            )}
            {eligible.length === 0 ? (
              <div className="card p-8 text-center">
                <Crown size={26} className="mx-auto text-ink/20" aria-hidden="true" />
                <p className="mt-2 text-sm text-ink/45">Aucun produit disponible : aucune boutique Ezial Plus n’a de produit publié en dehors de la sélection.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="card p-8 text-center"><p className="text-sm text-ink/45">Aucun produit ne correspond à « {query} ».</p></div>
            ) : (
              <ul className="card divide-y divide-line">
                {results.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 p-3 sm:p-4">
                    <ProductThumb product={product} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{product.name}</p>
                      <p className="truncate text-xs text-ink/50">{product.shopName}{product.reference ? ` · ${product.reference}` : ''}</p>
                      <p className="text-xs text-ink/45">{formatFcfa(product.price)}</p>
                    </div>
                    <button
                      onClick={() => void handleAdd(product)}
                      disabled={isFull || busyId !== null}
                      className="flex flex-shrink-0 items-center gap-1 rounded-full bg-burgundy px-3.5 py-2 text-xs font-semibold text-white hover:bg-burgundy-deep disabled:opacity-40"
                    >
                      {busyId === product.id ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Ajouter
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {eligible.length > SEARCH_RESULTS_LIMIT && results.length === SEARCH_RESULTS_LIMIT && (
              <p className="text-center text-xs text-ink/40">{SEARCH_RESULTS_LIMIT} premiers résultats affichés : affinez la recherche.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
