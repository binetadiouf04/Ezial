import type { Shop } from '@/data/shops';
import { useApp } from '@/store/AppContext';
import Rating from './Rating';
import SmartImage from './SmartImage';

export default function ShopCard({ shop }: { shop: Shop }) {
  const { navigate } = useApp();
  return (
    <button onClick={() => navigate(`/boutique/${shop.id}`)} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white text-left transition-all hover:card-shadow">
      <div className="relative h-28 w-full overflow-hidden bg-cream"><SmartImage src={shop.banner} alt={shop.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" /></div>
      <div className="flex items-center gap-3 p-4">
        <SmartImage src={shop.logo} alt={shop.name} className="h-12 w-12 rounded-full border-2 border-white object-cover -mt-8 shadow-sm" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink group-hover:text-burgundy transition-colors">{shop.name}</h3>
          <p className="text-xs text-ink/50">{shop.followers.toLocaleString('fr-FR')} abonnés</p>
        </div>
        {shop.rating && <Rating rating={shop.rating} count={shop.reviewCount} showCount={false} />}
      </div>
    </button>
  );
}
