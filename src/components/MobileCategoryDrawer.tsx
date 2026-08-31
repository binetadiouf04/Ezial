import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { categories, type CategoryId } from '@/data/categories';
import { useApp } from '@/store/AppContext';

export default function MobileCategoryDrawer() {
  const { categoryDrawerOpen, setCategoryDrawerOpen, navigate } = useApp();
  const [selectedCat, setSelectedCat] = useState<CategoryId | null>(null);
  if (!categoryDrawerOpen) return null;
  const selectedCategory = selectedCat ? categories.find((c) => c.id === selectedCat) : null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-ink/30 fade-in" onClick={() => setCategoryDrawerOpen(false)} />
      <div className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-white slide-up flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          {selectedCategory ? (
            <button onClick={() => setSelectedCat(null)} className="flex items-center gap-1 text-sm font-medium text-ink"><ChevronLeft size={18} /><span className="font-display text-base font-semibold">{selectedCategory.label}</span></button>
          ) : <h2 className="font-display text-base font-semibold tracking-wide">Catégories</h2>}
          <button onClick={() => setCategoryDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-cream" aria-label="Fermer"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {!selectedCategory ? (
            <nav className="divide-y divide-line">
              {categories.map((cat) => <button key={cat.id} onClick={() => setSelectedCat(cat.id)} className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-cream"><span className="text-[15px] font-medium text-ink">{cat.label}</span><ChevronRight size={18} className="text-ink/30" /></button>)}
            </nav>
          ) : (
            <nav className="divide-y divide-line">
              <button onClick={() => navigate(`/categorie/${selectedCategory.id}`)} className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-cream"><span className="text-[15px] font-semibold text-burgundy">Tout {selectedCategory.label}</span><ChevronRight size={18} className="text-burgundy" /></button>
              {selectedCategory.subcategories.map((sub) => <button key={sub.id} onClick={() => navigate(`/categorie/${selectedCategory.id}/${sub.id}`)} className="flex w-full items-center justify-between px-4 py-3.5 pl-6 text-left hover:bg-cream"><span className="text-[15px] text-ink/80">{sub.label}</span><ChevronRight size={16} className="text-ink/25" /></button>)}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
