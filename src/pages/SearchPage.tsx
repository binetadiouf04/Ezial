import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { searchProducts } from '@/data/products';
import { categories } from '@/data/categories';
import ProductGrid from '@/components/ProductGrid';
import ShopCard from '@/components/ShopCard';
import { Search as SearchIcon, X } from 'lucide-react';

export default function SearchPage({ query }: { query: string }) {
  const { navigate } = useApp();
  const [input, setInput] = useState(query);
  const { products, shops } = searchProducts(query);
  const suggestions = query.trim().length >= 2 ? categories.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 3) : [];

  const submit = (e: React.FormEvent) => { e.preventDefault(); if (input.trim()) navigate(`/recherche?q=${encodeURIComponent(input.trim())}`); };

  return (
    <div className="container-pro py-6">
      <form onSubmit={submit} className="relative mx-auto mb-8 max-w-2xl">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" size={18} />
        <input autoFocus type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Rechercher un produit, une boutique..." className="w-full rounded-full border border-line bg-cream/60 py-3 pl-11 pr-12 text-sm focus:border-burgundy focus:bg-white focus:outline-none focus:ring-1 focus:ring-burgundy/20" />
        {input && <button type="button" onClick={() => setInput('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"><X size={18} /></button>}
      </form>
      <div className="mb-6"><h1 className="font-display text-2xl font-semibold text-ink">{query ? `Résultats pour « ${query} »` : 'Recherche'}</h1><p className="mt-1 text-sm text-ink/55">{products.length + shops.length} résultat{products.length + shops.length > 1 ? 's' : ''}</p></div>
      {suggestions.length > 0 && <div className="mb-6 flex flex-wrap gap-2">{suggestions.map((c) => <button key={c.id} onClick={() => navigate(`/categorie/${c.id}`)} className="chip">{c.label}</button>)}</div>}
      {shops.length > 0 && <section className="mb-10"><h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink/50">Boutiques</h2><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{shops.map((s) => <ShopCard key={s.id} shop={s} />)}</div></section>}
      {products.length > 0 && <section><h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink/50">Produits</h2><ProductGrid products={products} columns={4} /></section>}
      {products.length === 0 && shops.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <SearchIcon size={40} className="text-ink/20" /><p className="mt-4 text-sm text-ink/60">Aucun résultat pour « {query} ».</p><p className="mt-1 text-xs text-ink/40">Essayez : perruque, parfum, robe, bracelet, skincare...</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">{categories.slice(0, 5).map((c) => <button key={c.id} onClick={() => navigate(`/categorie/${c.id}`)} className="chip">{c.label}</button>)}</div>
        </div>
      )}
    </div>
  );
}
