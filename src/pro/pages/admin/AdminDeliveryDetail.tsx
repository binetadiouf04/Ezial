import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminDeliveries, fetchDeliveryProofUrl } from '@/lib/supabaseAdminDeliveries';
import { PHASE_LABEL, type AdminDelivery } from '@/lib/adminDeliveriesCore';
import { formatDateTime } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, MapPin, User, Phone, CheckCircle2, Circle, Package, Loader2, AlertCircle, ExternalLink, Camera } from 'lucide-react';

const PHASE_CHIP: Record<AdminDelivery['phase'], string> = {
  available: 'preparing', collecting: 'preparing', delivering: 'out_for_delivery', delivered: 'delivered', cancelled: 'cancelled',
};

export default function AdminDeliveryDetail({ missionId }: { missionId: string }) {
  const { navigate } = usePro();
  const [delivery, setDelivery] = useState<AdminDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofState, setProofState] = useState<'none' | 'loading' | 'ready' | 'error'>('none');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const result = await fetchAdminDeliveries();
    if ('error' in result) { setLoadError(result.error); setLoading(false); return; }
    const found = result.deliveries.find((d) => d.id === missionId) ?? null;
    setDelivery(found);
    setLoading(false);
    if (found?.proofPath) {
      setProofState('loading');
      const url = await fetchDeliveryProofUrl(found.proofPath);
      setProofUrl(url);
      setProofState(url ? 'ready' : 'error');
    } else {
      setProofUrl(null);
      setProofState('none');
    }
  }, [missionId]);
  useEffect(() => { void load(); }, [load]);

  const back = (
    <button onClick={() => navigate('/admin/livraisons')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
      <ArrowLeft size={16} /> Livraisons
    </button>
  );

  if (loading) {
    return <div className="space-y-5">{back}<div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div></div>;
  }
  if (loadError) {
    return (
      <div className="space-y-5">
        {back}
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}</p>
        <button onClick={() => void load()} className="btn-outline">Réessayer</button>
      </div>
    );
  }
  if (!delivery) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink/55">Livraison introuvable</p>
        <button onClick={() => navigate('/admin/livraisons')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const collectedCount = delivery.stops.filter((s) => s.collected).length;

  return (
    <div className="space-y-5">
      {back}

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-ink">{delivery.orderNumber || 'Commande'}</h1>
        <StatusChip status={PHASE_CHIP[delivery.phase]} size="md" label={PHASE_LABEL[delivery.phase]} />
      </div>

      {/* Livreur */}
      {delivery.driverId && (
        <button onClick={() => navigate(`/admin/livreurs/${delivery.driverId}`)} className="card flex w-full items-center gap-3 p-4 text-left">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10">
            <User size={18} className="text-burgundy" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">{delivery.driverName}</p>
            {delivery.acceptedAt && <p className="text-xs text-ink/45">Mission acceptée le {formatDateTime(delivery.acceptedAt)}</p>}
          </div>
          <span className="text-xs font-medium text-burgundy">Voir profil</span>
        </button>
      )}

      {/* Collectes */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Collectes</h2>
          <span className="text-xs font-medium text-burgundy">{collectedCount} / {delivery.stops.length} récupérées</span>
        </div>
        {delivery.stops.length === 0 ? (
          <p className="text-sm text-ink/45">Aucune collecte enregistrée.</p>
        ) : (
          <div className="space-y-4">
            {delivery.stops.map((s) => (
              <div key={s.id} className="flex items-start gap-3">
                {s.collected ? <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-green-600" /> : <Circle size={20} className="mt-0.5 flex-shrink-0 text-ink/20" />}
                <div className="min-w-0 flex-1">
                  {s.shopId
                    ? <button onClick={() => navigate(`/admin/boutiques/${s.shopId}`)} className="text-sm font-medium text-ink hover:text-burgundy">{s.shopName}</button>
                    : <p className="text-sm font-medium text-ink">{s.shopName}</p>}
                  {s.address && <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/45"><MapPin size={11} /> {s.address}</p>}
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/35"><Package size={11} /> 1 colis</p>
                  {s.collected && s.collectedAt && <p className="mt-0.5 text-xs text-green-600">Récupéré : {formatDateTime(s.collectedAt)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Destination */}
      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink">Destination</h2>
        <p className="text-sm font-medium text-ink">{delivery.neighborhood || 'Quartier non renseigné'}</p>
        {delivery.address && <p className="mt-0.5 text-xs text-ink/45">{delivery.address}</p>}
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          {delivery.customerName && <p className="flex items-center gap-1.5 text-sm text-ink"><User size={14} className="text-ink/40" /> {delivery.customerName}</p>}
          {delivery.customerPhone && <p className="flex items-center gap-1.5 text-sm text-ink"><Phone size={14} className="text-ink/40" /> {delivery.customerPhone}</p>}
          {delivery.slot && <p className="text-xs text-ink/45">Créneau : {delivery.slot}</p>}
        </div>
      </div>

      {/* Livraison et preuve */}
      {delivery.phase === 'delivered' && (
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="text-sm font-medium text-ink">Livrée{delivery.deliveredAt ? ` le ${formatDateTime(delivery.deliveredAt)}` : ''}</p>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink/55"><Camera size={13} /> Photo de preuve</p>
            {proofState === 'loading' && <div className="flex h-40 items-center justify-center rounded-lg bg-cream"><Loader2 size={18} className="animate-spin text-ink/30" /></div>}
            {proofState === 'ready' && proofUrl && (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg bg-cream" aria-label="Ouvrir la photo de preuve en grand">
                <img src={proofUrl} alt="Photo de preuve de livraison" className="max-h-80 w-full object-contain" />
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-white"><ExternalLink size={11} /> Agrandir</span>
              </a>
            )}
            {proofState === 'error' && <p className="rounded-lg bg-burgundy/5 p-3 text-xs text-burgundy">La photo n’a pas pu être chargée. Le lien est temporaire : actualisez la page.</p>}
            {proofState === 'none' && <p className="text-xs text-ink/45">Aucune photo de preuve enregistrée pour cette livraison.</p>}
          </div>
        </div>
      )}

      {/* Commande */}
      <button onClick={() => navigate(`/admin/commandes/${delivery.orderId}`)} className="text-sm font-medium text-burgundy hover:underline">Voir la commande</button>
    </div>
  );
}
