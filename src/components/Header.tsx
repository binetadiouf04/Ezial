import { useState, useEffect, useRef } from 'react';
import { Search, Heart, ShoppingBag, User, Menu } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import Logo from './Logo';
import { searchProducts } from '@/data/products';
import { categories, categoryMap } from '@/data/categories';
import SmartImage from './SmartImage';

export default function Header() {
  const { navigate, cartCount, setCategoryDrawerOpen, route } = useApp();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => { if (blurTimer.current) window.clearTimeout(blurTimer.current); }, []);

  const { products: matches, shops: shopMatches } = query.trim().length >= 2 ? searchProducts(query) : { products: [], shops: [] };
  const hasResults = matches.length > 0 || shopMatches.length > 0;
  const showDropdown = focused && query.trim().length >= 2;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) { navigate(`/recherche?q=${encodeURIComponent(query.trim())}`); setFocused(false); inputRef.current?.blur(); }
  };

  const onHome = route === '/' || route === '';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="container-pro">
        <div className="flex h-16 items-center gap-3 lg:h-[68px] lg:gap-6">
          <div className="flex items-center gap-2 lg:gap-4">
            <button onClick={() => setCategoryDrawerOpen(true)} className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-cream lg:hidden" aria-label="Ouvrir les catégories"><Menu size={22} /></button>
            <Logo onClick={() => navigate('/')} />
          </div>

          <form onSubmit={submit} className="relative flex-1 max-w-2xl mx-auto hidden sm:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" size={18} />
              <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current); setFocused(true); }} onBlur={() => { blurTimer.current = window.setTimeout(() => setFocused(false), 150); }} placeholder="Rechercher un produit, une boutique..." className="w-full rounded-full border border-line bg-cream/60 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink/40 transition-colors focus:border-burgundy focus:bg-white focus:outline-none focus:ring-1 focus:ring-burgundy/20" />
            </div>
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-line bg-white py-2 shadow-xl slide-up">
                {hasResults ? (
                  <>
                    {shopMatches.length > 0 && <div className="px-4 py-1.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink/40">Boutiques</p></div>}
                    {shopMatches.slice(0, 2).map((s) => (
                      <button key={s.id} onMouseDown={() => navigate(`/boutique/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-cream"><SmartImage src={s.logo} alt="" className="h-8 w-8 rounded-full object-cover" /><span className="text-sm font-medium text-ink">{s.name}</span></button>
                    ))}
                    {matches.length > 0 && <div className="px-4 py-1.5 mt-1"><p className="text-[10px] font-semibold uppercase tracking-wider text-ink/40">Produits</p></div>}
                    {matches.slice(0, 5).map((p) => (
                      <button key={p.id} onMouseDown={() => navigate(`/produit/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-cream"><SmartImage src={p.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{p.name}</p><p className="text-xs text-ink/45">{categoryMap[p.category]?.label}</p></div><span className="text-sm font-semibold text-ink">{p.price.toLocaleString('fr-FR')} F</span></button>
                    ))}
                    <button onMouseDown={() => submit({ preventDefault: () => {} } as React.FormEvent)} className="mt-1 block w-full border-t border-line px-4 py-3 text-left text-sm font-medium text-burgundy hover:bg-cream">Voir tous les résultats pour « {query.trim()} »</button>
                  </>
                ) : (
                  <div className="px-4 py-6 text-center"><p className="text-sm text-ink/50">Aucun résultat pour « {query.trim()} ».</p><p className="mt-1 text-xs text-ink/35">Essayez : perruque, parfum, robe, bracelet...</p></div>
                )}
              </div>
            )}
          </form>

          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            <button onClick={() => navigate('/recherche')} className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-cream sm:hidden" aria-label="Rechercher"><Search size={20} /></button>
            <button onClick={() => navigate('/profil')} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink hover:bg-cream sm:flex"><User size={18} /><span>Compte</span></button>
            <button onClick={() => navigate('/favoris')} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-cream sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:gap-1.5 sm:text-sm sm:font-medium" aria-label="Favoris">
              <Heart size={20} /><span className="hidden sm:inline">Favoris</span>
            </button>
            <button onClick={() => navigate('/panier')} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-cream sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:gap-1.5 sm:text-sm sm:font-medium" aria-label="Panier">
              <ShoppingBag size={20} /><span className="hidden sm:inline">Panier</span>
              {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-semibold text-white sm:static sm:ml-0.5">{cartCount}</span>}
            </button>
          </div>
        </div>
      </div>
      {!onHome && (
        <div className="hidden lg:block border-t border-line bg-white">
          <div className="container-pro">
            <nav className="flex items-center gap-6 h-11 overflow-x-auto no-scrollbar">
              {categories.map((c) => <button key={c.id} onClick={() => navigate(`/categorie/${c.id}`)} className="whitespace-nowrap text-sm font-medium text-ink/70 hover:text-burgundy transition-colors">{c.label}</button>)}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
