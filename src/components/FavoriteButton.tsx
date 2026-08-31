import { Heart } from 'lucide-react';
import { useApp } from '@/store/AppContext';

export default function FavoriteButton({ productId, className = '', size = 20 }: { productId: string; className?: string; size?: number }) {
  const { isFavorite, toggleFavorite } = useApp();
  const active = isFavorite(productId);
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(productId); }}
      aria-label={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm p-2 transition-all hover:scale-110 active:scale-95 ${className}`}
    >
      <Heart size={size} className={active ? 'fill-burgundy text-burgundy' : 'text-ink/50'} strokeWidth={active ? 2 : 1.8} />
    </button>
  );
}
