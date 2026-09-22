import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, User, Home, LayoutGrid, Store, Percent } from 'lucide-react';
import { categories, publicCategories, type CategoryId } from '@/data/categories';
import { useApp } from '@/store/AppContext';

type View = 'main' | 'categories';

export default function MobileCategoryDrawer() {
  const { categoryDrawerOpen, setCategoryDrawerOpen, navigate } = useApp();
  const [view, setView] = useState<View>('main');
  const [selectedCat, setSelectedCat] = useState<CategoryId | null>(null);
  if (!categoryDrawerOpen) return null;
  const selectedCategory = selectedCat ? categories.find((c) => c.id === selectedCat) : null;

  const goToMain = () => { setSelectedCat(null); setView('main'); };
  const goToCategories = () => { setSelectedCat(null); setView('categories'); };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-ink/30 fade-in" onClick={() => setCategoryDrawerOpen(false)} />
      <div className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-white slide-up flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          {selectedCategory ? (
            <button onClick={() => setSelectedCat(null)} className="flex items-center gap-1 text-sm font-medium text-ink"><ChevronLeft size={18} /><span className="font-display text-base font-semibold">{selectedCategory.label}</span></button>
          ) : view === 'categories' ? (
            <button onClick={goToMain} className="flex items-center gap-1 text-sm font-medium text-ink"><ChevronLeft size={18} /><span className="font-display text-base font-semibold">Toutes les catégories</span></button>
          ) : (
            <h2 className="font-display text-base font-semibold tracking-wide">Menu</h2>
          )}
          <button onClick={() => setCategoryDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-cream" aria-label="Fermer"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {view === 'main' && (
            // Deliberately short and mobile-first: two destinations up top
            // (Home, then the categories drill-in — never the full category
            // list dumped straight into the main menu), Boutiques/Promotions
            // grouped just below, Mon compte pinned to the bottom, separated
            // from the rest. Large tap targets throughout, no secondary
            // links.
            <>
              <nav className="divide-y divide-line border-b border-line">
                <button onClick={() => navigate('/')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-cream">
                  <Home size={19} className="text-ink/60" /><span className="text-[15px] font-medium text-ink">Accueil</span>
                </button>
                <button onClick={goToCategories} className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-cream">
                  <span className="flex items-center gap-3"><LayoutGrid size={19} className="text-ink/60" /><span className="text-[15px] font-medium text-ink">Toutes les catégories</span></span>
                  <ChevronRight size={18} className="text-ink/30" />
                </button>
              </nav>
              <nav className="divide-y divide-line border-b border-line">
                <button onClick={() => navigate('/boutiques')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-cream">
                  <Store size={19} className="text-ink/60" /><span className="text-[15px] font-medium text-ink">Boutiques</span>
                </button>
                <button onClick={() => navigate('/promos')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-cream">
                  <Percent size={19} className="text-ink/60" /><span className="text-[15px] font-medium text-ink">Promotions</span>
                </button>
              </nav>

              <div className="flex-1" />

              <nav className="border-t border-line">
                <button onClick={() => navigate('/profil')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-cream">
                  <User size={19} className="text-ink/60" /><span className="text-[15px] font-medium text-ink">Mon compte</span>
                </button>
              </nav>
            </>
          )}

          {view === 'categories' && !selectedCategory && (
            <nav className="divide-y divide-line py-1">
              {publicCategories.map((cat) => (
                <button key={cat.id} onClick={() => setSelectedCat(cat.id)} className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-cream">
                  <span className="text-[15px] font-medium text-ink">{cat.label}</span>
                  <ChevronRight size={18} className="text-ink/30" />
                </button>
              ))}
            </nav>
          )}

          {selectedCategory && (
            <nav className="divide-y divide-line py-1">
              <button onClick={() => navigate(`/categorie/${selectedCategory.id}`)} className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-cream"><span className="text-[15px] font-semibold text-burgundy">Tout {selectedCategory.label}</span><ChevronRight size={18} className="text-burgundy" /></button>
              {selectedCategory.subcategories.map((sub) => <button key={sub.id} onClick={() => navigate(`/categorie/${selectedCategory.id}/${sub.id}`)} className="flex w-full items-center justify-between px-4 py-4 pl-6 text-left hover:bg-cream"><span className="text-[15px] text-ink/80">{sub.label}</span><ChevronRight size={16} className="text-ink/25" /></button>)}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
