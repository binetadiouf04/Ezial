import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { categoryMap, type CategoryId } from '@/data/categories';
import type { Product } from '@/data/products';
import { getFilters, type FilterGroup } from '@/data/filters';
import ProductGrid from '@/components/ProductGrid';
import CategorySidebar from '@/components/CategorySidebar';
import { FilterPanel, FilterDrawer, type SelectedFilters } from '@/components/FilterPanel';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';

// "Popularité" was a sort tier keyed off isTrending — a flag only ever set
// on the static demo catalog (every real Supabase product maps it to
// undefined, see supabaseCatalog.ts), so it silently did nothing for real
// data. Dropped rather than kept as a fake signal; "recent" (real
// createdAt, not the same isNew-boolean bucket either) is the honest
// default instead. "Meilleures évaluations" isn't here yet for the same
// reason — rating/reviewCount are hardcoded to 0 for every real product
// until the reviews system actually aggregates public.reviews into the
// catalog fetch.
const sortOptions = [{ id: 'recent', label: 'Plus récents' }, { id: 'prix-asc', label: 'Prix croissant' }, { id: 'prix-desc', label: 'Prix décroissant' }];

export default function CategoryPage({ categoryId, subId }: { categoryId: string; subId?: string }) {
  const { navigate, catalogProducts, catalogShops, catalogLoading } = useApp();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [sort, setSort] = useState('recent');

  const cat = categoryMap[categoryId as CategoryId];
  const sub = subId ? cat?.subcategories.find((s) => s.id === subId) : undefined;
  const categoryFilters: FilterGroup[] = getFilters(categoryId, subId);
  // The "type" filter group (Type de vêtement / Type de chaussure...) is the
  // real sub-subcategory list for Vêtements/Chaussures (Traditionnel,
  // Robes, Ensembles...) — reused as-is from filters.ts, never duplicated
  // into a second hardcoded list. Surfaced as chips right on the page (all
  // screen sizes) instead of leaving it discoverable only inside the
  // filters drawer/panel, which is the bug being fixed here.
  const typeFilterGroup = sub ? categoryFilters.find((f) => f.id === 'type') : undefined;
  const toggleTypeFilter = (opt: string) => {
    const current = selectedFilters.type ?? [];
    const next = current.includes(opt) ? current.filter((o) => o !== opt) : [...current, opt];
    setSelectedFilters({ ...selectedFilters, type: next });
  };

  // catalogProducts (real Supabase catalog, official-shop-only for now —
  // see AppContext) — this used to filter the static demo array directly,
  // which meant a real vendor's products never showed up when browsing by
  // category at all, only when linked to directly or found via search.
  const baseProducts: Product[] = useMemo(
    () => catalogProducts.filter((p) => p.category === categoryId && (!subId || p.subcategory === subId)),
    [catalogProducts, categoryId, subId],
  );

  // Universal filters — meaningful in every category, never baked into
  // filters.ts's per-category attribute lists. "Boutique" is dynamic: only
  // shops actually present in the current result set, never a stale global
  // shop list a selection here could never match.
  const shopNamesPresent = useMemo(() => {
    const shopIds = new Set(baseProducts.map((p) => p.shopId));
    return catalogShops.filter((s) => shopIds.has(s.id)).map((s) => s.name).sort();
  }, [baseProducts, catalogShops]);

  const allFilters: FilterGroup[] = useMemo(() => [
    ...categoryFilters,
    { id: 'disponibilite', label: 'Disponibilité', options: ['En stock'] },
    { id: 'promotions', label: 'Promotions', options: ['En promotion'] },
    ...(shopNamesPresent.length > 1 ? [{ id: 'boutique', label: 'Boutique', options: shopNamesPresent, collapsible: true }] : []),
  ], [categoryFilters, shopNamesPresent]);

  const filtered = useMemo(() => {
    let result = [...baseProducts];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    Object.entries(selectedFilters).forEach(([group, values]) => {
      if (!values?.length) return;
      if (group === 'prix') { result = result.filter((p) => matchesPrice(p.price, values)); }
      else if (group === 'disponibilite') { result = result.filter((p) => p.stock > 0); }
      else if (group === 'promotions') { result = result.filter((p) => p.isPromo); }
      else if (group === 'boutique') {
        const shopIdsByName = new Map(catalogShops.map((s) => [s.name, s.id]));
        const selectedShopIds = new Set(values.map((v) => shopIdsByName.get(v)).filter(Boolean));
        result = result.filter((p) => selectedShopIds.has(p.shopId));
      } else {
        const gnorm = norm(group);
        result = result.filter((p) => {
          const variantMatch = p.variants.some((v) => norm(v.name) === gnorm && v.values.some((val) => values.includes(val)));
          const detailMatch = p.details.some((d) => {
            const dnorm = norm(d.label);
            return (dnorm === gnorm || dnorm === gnorm.replace(/produit$/, '') || dnorm === gnorm.replace(/decheveu$/, '')) && values.some((val) => d.value.toLowerCase().includes(val.toLowerCase()));
          });
          const fieldMatch = (gnorm === 'texture' && p.texture && values.includes(p.texture)) ||
            (gnorm === 'matiere' && p.hairMaterial && values.includes(p.hairMaterial)) ||
            (gnorm === 'matiere' && p.details.some((d) => norm(d.label) === 'matiere' && values.some((v) => d.value.toLowerCase().includes(v.toLowerCase()))));
          const nameMatch = values.some((val) => p.name.toLowerCase().includes(val.toLowerCase()));
          return variantMatch || detailMatch || fieldMatch || nameMatch;
        });
      }
    });
    switch (sort) {
      case 'prix-asc': result.sort((a, b) => a.price - b.price); break;
      case 'prix-desc': result.sort((a, b) => b.price - a.price); break;
      default: result.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
    return result;
  }, [baseProducts, selectedFilters, sort, catalogShops]);

  if (!cat) return <div className="container-pro py-20 text-center text-ink/50">Catégorie introuvable.</div>;

  return (
    <div className="container-pro flex gap-8 py-6">
      <CategorySidebar />
      <div className="min-w-0 flex-1">
        <nav className="mb-4 flex items-center gap-1.5 text-xs text-ink/40">
          <button onClick={() => navigate('/')} className="hover:text-burgundy">Accueil</button><ChevronRight size={12} />
          <button onClick={() => navigate(`/categorie/${cat.id}`)} className="hover:text-burgundy">{cat.label}</button>
          {sub && <><ChevronRight size={12} /><span className="text-ink/70">{sub.label}</span></>}
        </nav>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{sub ? sub.label : cat.label}</h1>
          <p className="mt-2 text-sm text-ink/55">{filtered.length} produit{filtered.length > 1 ? 's' : ''}{!sub && cat.subcategories.length > 0 && ' · découvrez nos sous-catégories'}</p>
        </div>
        {!sub && <div className="mb-6 flex flex-wrap gap-2">{cat.subcategories.map((s) => <button key={s.id} onClick={() => navigate(`/categorie/${cat.id}/${s.id}`)} className="chip">{s.label}</button>)}</div>}
        {typeFilterGroup && typeFilterGroup.options.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {typeFilterGroup.options.map((opt) => (
              <button key={opt} onClick={() => toggleTypeFilter(opt)} className={`chip flex-shrink-0 ${selectedFilters.type?.includes(opt) ? 'chip-active' : ''}`}>{opt}</button>
            ))}
          </div>
        )}
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
          <button onClick={() => setFiltersOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink/30 md:hidden"><SlidersHorizontal size={16} />Filtres</button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2"><span className="hidden sm:inline text-xs text-ink/45">Trier par</span><select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink focus:border-burgundy focus:outline-none">{sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        </div>
        <div className="flex gap-8">
          {/* Shown from md (tablet) up, not just lg — on an iPad-width
             screen the content column has plenty of room for this and the
             3-column grid together; only phones need the drawer instead. */}
          <div className="hidden md:block w-[220px] flex-shrink-0"><div className="sticky top-[140px]"><FilterPanel filters={allFilters} selected={selectedFilters} onChange={setSelectedFilters} onClear={() => setSelectedFilters({})} /></div></div>
          <div className="min-w-0 flex-1">
            {catalogLoading ? <p className="py-16 text-center text-sm text-ink/45">Chargement des produits…</p> : <ProductGrid products={filtered} columns={4} />}
          </div>
        </div>
      </div>
      <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={allFilters} selected={selectedFilters} onChange={setSelectedFilters} onClear={() => setSelectedFilters({})} />
    </div>
  );
}

function matchesPrice(price: number, values: string[]): boolean {
  return values.some((v) => {
    if (v.startsWith('Moins de')) { const n = parseInt(v.replace(/[^\d]/g, '')); return price < n; }
    if (v.startsWith('Plus de')) { const n = parseInt(v.replace(/[^\d]/g, '')); return price > n; }
    const nums = v.match(/\d+/g);
    if (nums && nums.length >= 2) { const [min, max] = nums.map(Number); return price >= min && price <= max; }
    return false;
  });
}
