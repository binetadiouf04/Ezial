import type { Product, ProductStatus } from '../data';
import { formatFCFA, formatDate } from '../data';
import { StatusChip } from './StatusChip';
import { Package } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

interface ProductRowProps {
  product: Product;
  overrideStatus?: ProductStatus;
  onClick?: () => void;
  actions?: React.ReactNode;
}

export default function ProductRow({ product, overrideStatus, onClick, actions }: ProductRowProps) {
  const status = overrideStatus ?? product.status;
  return (
    <div className="flex items-center gap-3 p-3 border-b border-line last:border-0">
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-cream">
        {product.image ? (
          <SmartImage src={product.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/20"><Package size={20} /></div>
        )}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <p className="text-sm font-medium text-ink leading-snug line-clamp-1">{product.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <StatusChip status={status} />
          {product.stock > 0 ? (
            <span className="text-xs text-ink/45">{product.stock} en stock</span>
          ) : (
            <span className="text-xs text-red-600">Rupture</span>
          )}
        </div>
        {product.submittedDate && (
          <p className="mt-0.5 text-xs text-ink/35">Soumis le {formatDate(product.submittedDate)}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-ink">{formatFCFA(product.price)}</p>
        {actions && <div className="mt-1">{actions}</div>}
      </div>
    </div>
  );
}
