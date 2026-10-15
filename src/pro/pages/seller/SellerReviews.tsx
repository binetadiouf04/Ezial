import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchSellerReviews, type SellerReview } from '@/lib/supabaseSellerReviews';
import Rating from '@/components/Rating';
import { Loader2, AlertCircle } from 'lucide-react';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SellerReviews() {
  const { sellerShop } = usePro();
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!sellerShop) return;
    setLoading(true);
    setLoadError('');
    try {
      setReviews(await fetchSellerReviews(sellerShop.id));
    } catch {
      setLoadError('Impossible de charger les avis. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [sellerShop]);

  useEffect(() => { void load(); }, [load]);

  const average = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Avis clients</h1>
        <p className="text-sm text-ink/55 mt-1">Les avis déposés sur vos produits. Vous pouvez les consulter mais ne pouvez pas les modifier ni les supprimer — contactez l'équipe Ezial pour signaler un avis abusif.</p>
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : (
        <>
          {reviews.length > 0 && (
            <div className="card p-4 flex items-center gap-3">
              <Rating rating={average} count={reviews.length} size="md" />
            </div>
          )}
          <div className="card divide-y divide-line">
            {reviews.length === 0 ? (
              <p className="p-8 text-center text-sm text-ink/45">Aucun avis pour le moment.</p>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{rev.productName}</p>
                    <span className="text-xs text-ink/40 flex-shrink-0">{formatDate(rev.createdAt)}</span>
                  </div>
                  <div className="mt-1.5"><Rating rating={rev.rating} showCount={false} /></div>
                  {rev.comment && <p className="mt-2 text-sm text-ink/70">{rev.comment}</p>}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
