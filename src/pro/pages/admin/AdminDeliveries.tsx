import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import { fetchAdminDeliveries } from '@/lib/supabaseAdminDeliveries';
import {
  DELIVERY_FILTERS, PHASE_LABEL, countByFilter, filterDeliveries,
  type AdminDelivery, type DeliveryFilter, type DeliveryPhase,
} from '@/lib/adminDeliveriesCore';
import { formatDateTime } from '../../data';
import { ChevronRight, Loader2, AlertCircle, Camera, RefreshCw } from 'lucide-react';

const PHASE_STYLE: Record<DeliveryPhase, string> = {
  available: 'bg-green-50 text-green-700 border-green-100',
  collecting: 'bg-violet-50 text-violet-700 border-violet-100',
  delivering: 'bg-violet-50 text-violet-700 border-violet-100',
  delivered: 'bg-ink/5 text-ink/60 border-line',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

export default function AdminDeliveries() {
  const { navigate } = usePro();
  const [deliveries, setDeliveries] = useState<AdminDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<DeliveryFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const result = await fetchAdminDeliveries();
    if ('error' in result) setLoadError(result.error);
    else setDeliveries(result.deliveries);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = countByFilter(deliveries);
  const filtered = filterDeliveries(deliveries, filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Livraisons</h1>
        <button onClick={() => void load()} disabled={loading} aria-label="Actualiser" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink/55 hover:text-ink disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Filtrer les livraisons">
        {DELIVERY_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${filter === f.id ? 'border-burgundy bg-burgundy text-white' : 'border-line bg-white text-ink/65 hover:border-ink/25 hover:text-ink'}`}
          >
            {f.label} <span className={filter === f.id ? 'text-white/70' : 'text-ink/35'}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {loadError}
        </p>
      )}

      {loading && deliveries.length === 0 ? (
        <div className="card p-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-ink/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink/45">{deliveries.length === 0 ? 'Aucune livraison pour le moment.' : 'Aucune livraison dans cette catégorie.'}</p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {filtered.map((d) => (
            <button key={d.id} onClick={() => navigate(`/admin/livraisons/${d.id}`)} className="card w-full p-4 text-left transition-all hover:card-shadow">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-ink">{d.orderNumber || 'Commande'}</p>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${PHASE_STYLE[d.phase]}`}>{PHASE_LABEL[d.phase]}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-ink/65">
                <span className="text-xs text-ink/45">Livreur :</span>
                <span className="font-medium text-ink/80">{d.driverName || 'Non assigné'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink/45">
                <span className="min-w-0 truncate">
                  {d.stops.length} collecte{d.stops.length > 1 ? 's' : ''}{d.neighborhood ? ` · → ${d.neighborhood}` : ''} · {formatDateTime(d.createdAt)}
                </span>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  {d.proofPath && <Camera size={13} className="text-burgundy/60" aria-label="Photo de preuve disponible" />}
                  <ChevronRight size={16} className="text-ink/20" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
