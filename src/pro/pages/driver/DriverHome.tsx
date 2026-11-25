import { useState, useEffect } from 'react';
import UrgentBadge from '@/components/UrgentBadge';
import { usePro } from '../../ProContext';
import { supabase } from '@/lib/supabaseClient';
import NotificationOptIn from '@/components/NotificationOptIn';
import NotificationGateModal from '@/components/NotificationGateModal';
import { Truck, MapPin, Store, ChevronRight, Power } from 'lucide-react';

export default function DriverHome() {
  const { name, driverAvailable, setDriverAvailable, navigate, activeMissions, availableMissions, acceptMission, completedMissions } = usePro();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Après acceptation, le livreur arrive directement sur la page unique de
  // la mission (récupérations puis livraison), sans autre étape.
  const handleAccept = async (missionId: string) => {
    setAcceptingId(missionId);
    const { error } = await acceptMission(missionId);
    setAcceptingId(null);
    if (!error) navigate(`/driver/livraisons/${missionId}`);
  };
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null)); }, []);

  const completedToday = completedMissions.filter((m) => {
    if (!m.deliveredAt) return false;
    return new Date(m.deliveredAt).toDateString() === new Date().toDateString();
  }).length;

  const toCollectCount = availableMissions.length + activeMissions.filter((m) => m.step === 'to_collection').length;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Bonjour, {name}</h1>

      {authUserId && (
        <>
          <NotificationGateModal userId={authUserId} label="Notifications de nouvelles missions" />
          <NotificationOptIn userId={authUserId} label="Notifications de nouvelles missions" />
        </>
      )}

      {/* Availability toggle */}
      <button
        onClick={() => setDriverAvailable(!driverAvailable)}
        className={`w-full rounded-2xl p-4 flex items-center justify-between transition-all ${
          driverAvailable ? 'bg-green-50 border border-green-200' : 'bg-ink/5 border border-line'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${driverAvailable ? 'bg-green-500' : 'bg-ink/30'}`}>
            <Power size={20} className="text-white" />
          </div>
          <div className="text-left">
            <p className={`text-sm font-semibold ${driverAvailable ? 'text-green-700' : 'text-ink/60'}`}>
              {driverAvailable ? 'Disponible' : 'Indisponible'}
            </p>
            <p className="text-xs text-ink/45">
              {driverAvailable ? 'Vous recevez les livraisons' : 'Touchez pour reprendre'}
            </p>
          </div>
        </div>
        <div className={`relative h-7 w-12 rounded-full transition-colors ${driverAvailable ? 'bg-green-500' : 'bg-ink/20'}`}>
          <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${driverAvailable ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </button>

      {!driverAvailable && (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink/50">Vous êtes actuellement indisponible.</p>
        </div>
      )}

      {driverAvailable && (
        <>
          {/* Active deliveries — a driver can run several at once (pickups
              proches, même secteur), so every one gets its own card. */}
          {activeMissions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
                Livraison{activeMissions.length > 1 ? 's' : ''} en cours ({activeMissions.length})
              </p>
              <div className="space-y-3">
                {activeMissions.map((mission) => {
                  const collected = mission.collections.filter((c) => c.collected).length;
                  const total = mission.collections.length;
                  const nextCollection = mission.collections.find((c) => !c.collected);
                  return (
                    <button
                      key={mission.id}
                      onClick={() => navigate(`/driver/livraisons/${mission.id}`)}
                      className="card w-full p-4 text-left border-burgundy/30 bg-burgundy/5"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="flex items-center gap-2 font-mono text-sm font-semibold text-burgundy">{mission.orderId}{mission.urgent && <UrgentBadge />}</span>
                        <span className="text-xs font-medium text-ink/60">{collected}/{total} récupérée{collected > 1 ? 's' : ''}</span>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {nextCollection
                          ? <><Store size={14} className="text-ink/40" /> Prochaine étape : {nextCollection.shopName}</>
                          : <><MapPin size={14} className="text-ink/40" /> Prochaine étape : livrer à {mission.destination || 'au client'}</>}
                      </p>
                      <span className="btn-primary mt-3 min-h-[48px] w-full">
                        Continuer <ChevronRight size={16} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available deliveries — always shown, even with missions already
              in progress, so a driver can pick up a nearby one too. */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">Livraisons disponibles</p>
            {availableMissions.length === 0 ? (
              <div className="card p-6 text-center">
                <Truck size={28} className="mx-auto text-ink/20" />
                <p className="mt-2 text-sm text-ink/45">Aucune livraison disponible pour le moment.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableMissions.map((mission) => (
                  <div key={mission.id} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-2 font-mono text-sm font-semibold text-ink">{mission.orderId}{mission.urgent && <UrgentBadge />}</span>
                      <span className="text-xs text-ink/45">{mission.collections.length} points de collecte</span>
                    </div>
                    <div className="space-y-1 mb-3">
                      <p className="flex items-center gap-1.5 text-sm text-ink/65">
                        <Store size={13} className="text-ink/35" /> {mission.collections.map((c) => c.shopName).join(' · ')}
                      </p>
                      <p className="flex items-center gap-1.5 text-sm text-ink/65">
                        <MapPin size={13} className="text-ink/35" /> → {mission.destination}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      <button
                        onClick={() => navigate(`/driver/livraisons/${mission.id}`)}
                        className="min-h-[44px] px-2 text-sm text-ink/55 hover:text-burgundy"
                      >
                        Détails
                      </button>
                      <button
                        onClick={() => void handleAccept(mission.id)}
                        disabled={acceptingId !== null}
                        className="btn-primary min-h-[44px]"
                      >
                        {acceptingId === mission.id ? 'Acceptation…' : 'Accepter la livraison'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick stats — no financial data, ever (the driver is paid
             monthly outside this app) */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">À récupérer</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink [font-variant-numeric:lining-nums_tabular-nums]">{toCollectCount}</p>
            </button>
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">En cours</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink [font-variant-numeric:lining-nums_tabular-nums]">{activeMissions.length}</p>
            </button>
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">Livrées aujourd'hui</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink [font-variant-numeric:lining-nums_tabular-nums]">{completedToday}</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
