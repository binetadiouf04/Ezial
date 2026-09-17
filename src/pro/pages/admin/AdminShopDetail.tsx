import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminShopDetail, type AdminShopDetail as AdminShopDetailData } from '@/lib/supabaseAdminData';
import { formatFCFA, shopModerationReasons } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import FlagModal from '../../components/FlagModal';
import { createModerationFlag, fetchModerationFlags, resolveModerationFlag, latestUnresolvedFlag, type ModerationFlagRow } from '@/lib/supabaseModeration';
import { ArrowLeft, Phone, MapPin, Loader2, Flag } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminShopDetail({ shopId }: { shopId: string }) {
  const { navigate } = usePro();
  const [shop, setShop] = useState<AdminShopDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [flags, setFlags] = useState<ModerationFlagRow[]>([]);
  const [showFlagModal, setShowFlagModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [detail, flagRows] = await Promise.all([fetchAdminShopDetail(shopId), fetchModerationFlags('shop', shopId)]);
      setShop(detail);
      setFlags(flagRows);
      if (!detail) setLoadError('Boutique introuvable.');
    } catch {
      setLoadError('Impossible de charger la boutique. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);

  const handleFlag = async (note: string) => {
    const result = await createModerationFlag('shop', shopId, note);
    if (!result.error) {
      setShowFlagModal(false);
      await load();
    }
  };

  const handleResolve = async (flagId: string) => {
    await resolveModerationFlag(flagId);
    await load();
  };

  const activeFlag = latestUnresolvedFlag(flags);

  if (loading) {
    return <div className="py-16 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>;
  }

  if (loadError || !shop) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">{loadError || 'Boutique introuvable'}</p>
        <button onClick={() => navigate('/admin/boutiques')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/boutiques')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Boutiques
      </button>

      {/* Shop header */}
      <div className="card p-5 flex items-center gap-4">
        {shop.logoUrl && <SmartImage src={shop.logoUrl} alt="" className="h-16 w-16 rounded-xl object-cover flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold text-ink truncate">{shop.name}</h1>
          {shop.sellerCode && <p className="text-xs text-ink/45 font-mono mt-0.5">{shop.sellerCode}</p>}
        </div>
        <StatusChip status={shop.status} size="md" />
      </div>

      {activeFlag ? (
        <div className="card border-orange-200 bg-orange-50 p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-700"><Flag size={14} /> Signalée</p>
          <p className="text-sm text-orange-800">« {activeFlag.note} »</p>
          <p className="text-xs text-orange-600/70">{formatDateTime(activeFlag.createdAt)}</p>
          <button onClick={() => handleResolve(activeFlag.id)} className="btn-outline text-sm mt-1">Marquer comme résolu</button>
        </div>
      ) : (
        <button onClick={() => setShowFlagModal(true)} className="flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
          <Flag size={14} /> Signaler cette boutique
        </button>
      )}

      {/* Info */}
      <div className="card divide-y divide-line">
        {shop.description && (
          <div className="flex items-start justify-between gap-4 p-4">
            <span className="text-sm text-ink/55 flex-shrink-0">Description</span>
            <span className="text-sm text-ink text-right">{shop.description}</span>
          </div>
        )}
        {shop.phone && (
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55 flex items-center gap-1.5"><Phone size={13} className="text-ink/35" /> Téléphone</span>
            <span className="text-sm font-medium text-ink">{shop.phone}</span>
          </div>
        )}
        {(shop.address || shop.neighborhood) && (
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-ink/55 flex items-center gap-1.5"><MapPin size={13} className="text-ink/35" /> Adresse</span>
            <span className="text-sm font-medium text-ink text-right">{[shop.address, shop.neighborhood].filter(Boolean).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Products */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Produits ({shop.products.length})</h2>
        <div className="space-y-3">
          {shop.products.length === 0 ? (
            <div className="card p-6 text-center"><p className="text-sm text-ink/45">Aucun produit.</p></div>
          ) : (
            shop.products.map((product) => (
              <div key={product.id} className="card p-3 flex items-center gap-3">
                {product.imageUrl && <SmartImage src={product.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                  <p className="text-xs text-ink/45">{formatFCFA(product.price)} · Stock : {product.stock}</p>
                </div>
                <StatusChip status={product.status} />
              </div>
            ))
          )}
        </div>
      </div>

      {showFlagModal && (
        <FlagModal title="Signaler cette boutique" quickReasons={shopModerationReasons} onCancel={() => setShowFlagModal(false)} onConfirm={handleFlag} />
      )}
    </div>
  );
}
