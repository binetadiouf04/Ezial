import { useState } from 'react';
import { usePro } from '../../ProContext';
import { StatusChip } from '../../components/StatusChip';
import { ChevronRight, AlertTriangle } from 'lucide-react';

type Filter = 'available' | 'collecting' | 'delivering' | 'delivered' | 'incident';

const filters: { id: Filter; label: string }[] = [
  { id: 'available', label: 'Disponibles' },
  { id: 'collecting', label: 'En collecte' },
  { id: 'delivering', label: 'En livraison' },
  { id: 'delivered', label: 'Livrées' },
  { id: 'incident', label: 'Avec incident' },
];

export default function AdminDeliveries() {
  const { missions, navigate, allDrivers, resolvedIncidents } = usePro();
  const [filter, setFilter] = useState<Filter>('available');

  const getDriverName = (driverId?: string) => {
    if (!driverId) return 'Non assigné';
    if (driverId === 'me') return 'Vous';
    const driver = allDrivers.find((d) => d.id === driverId);
    return driver?.name ?? driverId;
  };

  const getMissionStatus = (m: typeof missions[number]) => {
    if (m.incident && !resolvedIncidents.includes(m.id)) return 'incident';
    if (m.step === 'delivered') return 'delivered';
    if (m.step === 'to_customer') return 'delivering';
    if (m.driverId) return 'collecting';
    return 'available';
  };

  const filtered = missions.filter((m) => {
    if (filter === 'incident') return m.incident && !resolvedIncidents.includes(m.id);
    return getMissionStatus(m) === filter;
  });

  const statusLabels: Record<string, string> = {
    available: 'Disponible',
    collecting: 'En collecte',
    delivering: 'En livraison',
    delivered: 'Livrée',
    incident: 'Incident',
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Livraisons</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60 hover:border-ink/20'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink/45">Aucune livraison</p>
          </div>
        ) : (
          filtered.map((mission) => {
            const status = getMissionStatus(mission);
            const hasIncident = mission.incident && !resolvedIncidents.includes(mission.id);
            return (
              <button key={mission.id} onClick={() => navigate(`/admin/livraisons/${mission.id}`)} className="card w-full p-4 text-left hover:card-shadow transition-all">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-sm font-semibold text-ink">{mission.orderId}</p>
                  {hasIncident ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                      <AlertTriangle size={12} /> Incident
                    </span>
                  ) : (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status === 'delivered' ? 'bg-ink/5 text-ink/60 border-line' : status === 'available' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>
                      {statusLabels[status]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-ink/65">
                  <span className="text-ink/45 text-xs">Livreur:</span>
                  <span className="font-medium text-ink/80">{getDriverName(mission.driverId)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-ink/45">
                  <span>{mission.collections.length} collectes · → {mission.destination}</span>
                  <ChevronRight size={16} className="text-ink/20" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
