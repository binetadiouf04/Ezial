import { useState, useEffect } from 'react';
import { usePro } from '../../ProContext';
import { supabase } from '@/lib/supabaseClient';
import NotificationOptIn from '@/components/NotificationOptIn';
import NotificationGateModal from '@/components/NotificationGateModal';
import { Truck, MapPin, Store, ChevronRight, Navigation, CheckCircle2, Power, Package } from 'lucide-react';

export default function DriverHome() {
  const { name, driverAvailable, setDriverAvailable, navigate, activeMissions, availableMissions, acceptMission, completedMissions, collectParcel, startDelivery } = usePro();
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
                  const nextCollection = mission.collections.find((c) => !c.collected);
                  return (
                    <div key={mission.id} className="card p-4 border-burgundy/30 bg-burgundy/5">
                      <button
                        onClick={() => navigate(`/driver/livraisons/${mission.id}`)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-mono text-sm font-semibold text-burgundy">{mission.orderId}</span>
                          <span className="text-xs font-medium text-burgundy flex items-center gap-1">
                            {mission.step === 'to_collection' && <><Truck size={13} /> En collecte</>}
                            {mission.step === 'all_collected' && <><CheckCircle2 size={13} /> Colis récupérés</>}
                            {mission.step === 'to_customer' && <><Navigation size={13} /> En livraison</>}
                          </span>
                        </div>
                        <div className="space-y-1.5 mb-3">
                          {mission.collections.map((c) => (
                            <div key={c.shopId} className="flex items-center gap-2 text-sm">
                              {c.collected ? (
                                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                              ) : (
                                <div className="h-4 w-4 rounded-full border-2 border-ink/20 flex-shrink-0" />
                              )}
                              <span className={c.collected ? 'text-ink/50 line-through' : 'text-ink font-medium'}>{c.shopName}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-ink/50 mb-1">
                          <MapPin size={12} /> → {mission.destination}
                        </div>
                      </button>

                      {/* Direct action for the current step — no extra navigation needed */}
                      <div className="mt-3 pt-3 border-t border-burgundy/10 space-y-2">
                        {mission.step === 'to_collection' && nextCollection && (
                          <button onClick={() => collectParcel(mission.id, nextCollection.shopId)} className="btn-primary w-full flex items-center justify-center gap-2">
                            <Package size={16} /> Confirmer la récupération
                          </button>
                        )}
                        {mission.step === 'all_collected' && (
                          <button onClick={() => startDelivery(mission.id)} className="btn-primary w-full flex items-center justify-center gap-2">
                            <Navigation size={16} /> Commencer la livraison
                          </button>
                        )}
                        {mission.step === 'to_customer' && (
                          <button onClick={() => navigate(`/driver/livraisons/${mission.id}`)} className="btn-primary w-full flex items-center justify-center gap-2">
                            <CheckCircle2 size={16} /> Confirmer la livraison
                          </button>
                        )}
                        <button onClick={() => navigate(`/driver/livraisons/${mission.id}`)} className="w-full text-center text-xs text-ink/45 hover:text-burgundy flex items-center justify-center gap-1 py-1">
                          Voir le détail <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
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
                      <span className="font-mono text-sm font-semibold text-ink">{mission.orderId}</span>
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
                    <div className="flex items-center justify-end border-t border-line pt-3">
                      <button
                        onClick={() => acceptMission(mission.id)}
                        className="btn-primary"
                      >
                        Accepter la livraison
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
              <p className="mt-1 font-display text-xl font-semibold text-ink">{toCollectCount}</p>
            </button>
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">En cours</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{activeMissions.length}</p>
            </button>
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">Livrées aujourd'hui</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{completedToday}</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
