import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { Truck, MapPin, Store, ChevronRight, CheckCircle2, Navigation, Clock } from 'lucide-react';

type Tab = 'active' | 'available' | 'completed';

export default function DriverMissions() {
  const { navigate, activeMission, availableMissions, completedMissions } = usePro();
  const [tab, setTab] = useState<Tab>(activeMission ? 'active' : 'available');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'active', label: 'En cours', count: activeMission ? 1 : 0 },
    { id: 'available', label: 'Disponibles', count: availableMissions.length },
    { id: 'completed', label: 'Terminées', count: completedMissions.length },
  ];

  const renderMissionCard = (mission: typeof availableMissions[number], isActive = false, isCompleted = false) => (
    <button
      key={mission.id}
      onClick={() => navigate(`/driver/livraisons/${mission.id}`)}
      className={`card w-full p-4 text-left transition-all hover:card-shadow ${isActive ? 'border-burgundy/30 bg-burgundy/5' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-semibold text-ink">{mission.orderId}</span>
        {isActive && (
          <span className="text-xs font-medium text-burgundy flex items-center gap-1">
            {mission.step === 'to_collection' && <><Truck size={13} /> En collecte</>}
            {mission.step === 'all_collected' && <><CheckCircle2 size={13} /> Prêt à livrer</>}
            {mission.step === 'to_customer' && <><Navigation size={13} /> En livraison</>}
          </span>
        )}
        {isCompleted && <span className="text-xs font-medium text-green-600 flex items-center gap-1"><CheckCircle2 size={13} /> Livrée</span>}
      </div>

      <div className="space-y-1 mb-2">
        {mission.collections.map((c) => (
          <div key={c.shopId} className="flex items-center gap-1.5 text-sm text-ink/65">
            <Store size={13} className="text-ink/35" /> {c.shopName}
            {isActive && c.collected && <CheckCircle2 size={13} className="text-green-600 ml-1" />}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <div className="flex items-center gap-2 text-xs text-ink/45">
          <span className="flex items-center gap-1"><MapPin size={12} /> {mission.destination}</span>
          {isCompleted && mission.deliveredAt && <span className="flex items-center gap-1"><Clock size={12} /> {formatDate(mission.deliveredAt)}</span>}
        </div>
        <span className="text-sm font-semibold text-burgundy">{formatFCFA(mission.earnings)}</span>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Livraisons</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-burgundy text-white' : 'bg-white border border-line text-ink/60'}`}
          >
            {t.label} {t.count > 0 && `(${t.count})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-3">
        {tab === 'active' && (
          activeMission ? renderMissionCard(activeMission, true) : (
            <div className="card p-8 text-center">
              <Truck size={28} className="mx-auto text-ink/20" />
              <p className="mt-2 text-sm text-ink/45">Aucune livraison en cours</p>
            </div>
          )
        )}

        {tab === 'available' && (
          availableMissions.length === 0 ? (
            <div className="card p-8 text-center">
              <Truck size={28} className="mx-auto text-ink/20" />
              <p className="mt-2 text-sm text-ink/45">Aucune livraison disponible pour le moment.</p>
            </div>
          ) : (
            availableMissions.map((m) => renderMissionCard(m))
          )
        )}

        {tab === 'completed' && (
          completedMissions.length === 0 ? (
            <div className="card p-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-ink/20" />
              <p className="mt-2 text-sm text-ink/45">Aucune livraison terminée</p>
            </div>
          ) : (
            completedMissions.map((m) => renderMissionCard(m, false, true))
          )
        )}
      </div>
    </div>
  );
}
