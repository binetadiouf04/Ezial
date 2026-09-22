import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { categories, type CategoryId } from '@/data/categories';
import { useApp } from '@/store/AppContext';

export default function CategorySidebar() {
  const { navigate, route } = useApp();
  const [expanded, setExpanded] = useState<CategoryId | null>(null);
  const activeCat = route.match(/^\/categorie\/(\w+)/)?.[1] as CategoryId | undefined;
  const toggle = (id: CategoryId) => setExpanded((prev) => prev === id ? null : id);

  return (
    <aside className="sticky top-[76px] hidden lg:block w-[250px] flex-shrink-0 self-start">
      <div className="py-6 pr-4">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">Catégories</h2>
        <nav className="space-y-0.5">
          {categories.map((cat) => {
            const isActive = activeCat === cat.id;
            const isOpen = expanded === cat.id || isActive;
            return (
              <div key={cat.id}>
                <button onClick={() => toggle(cat.id)} className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'text-burgundy font-medium' : 'text-ink/80 hover:bg-cream'}`}>
                  <span className="flex items-center gap-2.5">{isActive && <span className="h-4 w-0.5 rounded-full bg-burgundy" />}{cat.label}</span>
                  <ChevronDown size={15} className={`text-ink/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="ml-4 mb-1 mt-0.5 space-y-0.5 border-l border-line pl-3">
                    {cat.subcategories.map((sub) => <button key={sub.id} onClick={() => navigate(`/categorie/${cat.id}/${sub.id}`)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink/60 transition-colors hover:bg-cream hover:text-burgundy">{sub.label}</button>)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
