import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { categoryMap, type CategoryId } from '@/data/categories';
import { productsByCategory, productsBySubcategory, type Product } from '@/data/products';
import { getFilters, type FilterGroup } from '@/data/filters';
import ProductGrid from '@/components/ProductGrid';
import CategorySidebar from '@/components/CategorySidebar';
import { FilterPanel, FilterDrawer, type SelectedFilters } from '@/components/FilterPanel';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';

const sortOptions = [{ id: 'populaire', label: 'Popularité' }, { id: 'prix-asc', label: 'Prix croissant' }, { id: 'prix-desc', label: 'Prix décroissant' }, { id: 'nouveau', label: 'Nouveautés' }];

export default function CategoryPage({ categoryId, subId }: { categoryId: string; subId?: string }) {
  const { navigate } = useApp();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [sort, setSort] = useState('populaire');

  const cat = categoryMap[categoryId as CategoryId];
  const sub = subId ? cat?.subcategories.find((s) => s.id === subId) : undefined;
  const filters: FilterGroup[] = getFilters(categoryId, subId);

  const baseProducts: Product[] = useMemo(() => subId ? productsBySubcategory(categoryId, subId) : productsByCategory(categoryId), [categoryId, subId]);

  const filtered = useMemo(() => {
    let result = [...baseProducts];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    Object.entries(selectedFilters).forEach(([group, values]) => {
      if (!values?.length) return;
      if (group === 'prix') { result = result.filter((p) => matchesPrice(p.price, values)); }
      else {
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
      case 'nouveau': result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
      default: result.sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
    }
    return result;
  }, [baseProducts, selectedFilters, sort]);

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
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
          <button onClick={() => setFiltersOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-ink/30 lg:hidden"><SlidersHorizontal size={16} />Filtres</button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2"><span className="hidden sm:inline text-xs text-ink/45">Trier par</span><select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink focus:border-burgundy focus:outline-none">{sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        </div>
        <div className="flex gap-8">
          <div className="hidden lg:block w-[220px] flex-shrink-0"><div className="sticky top-[140px]"><FilterPanel filters={filters} selected={selectedFilters} onChange={setSelectedFilters} onClear={() => setSelectedFilters({})} /></div></div>
          <div className="min-w-0 flex-1"><ProductGrid products={filtered} columns={4} /></div>
        </div>
      </div>
      <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} selected={selectedFilters} onChange={setSelectedFilters} onClear={() => setSelectedFilters({})} />
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
