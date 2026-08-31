import { usePro } from '../../ProContext';
import { formatFCFA } from '../../data';
import { Truck, MapPin, Store, ChevronRight, Navigation, CheckCircle2, Power, Package } from 'lucide-react';

export default function DriverHome() {
  const { name, driverAvailable, setDriverAvailable, navigate, activeMission, availableMissions, acceptMission, completedMissions, collectParcel, startDelivery } = usePro();

  const completedToday = completedMissions.filter((m) => {
    if (!m.deliveredAt) return false;
    return new Date(m.deliveredAt).toDateString() === new Date().toDateString();
  }).length;

  // Calculate live weekly earnings from completed missions + base
  const sessionEarnings = completedMissions
    .filter((m) => m.deliveredAt)
    .reduce((sum, m) => sum + m.earnings, 0);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Bonjour, {name}</h1>

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
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${driverAvailable ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </button>

      {!driverAvailable && (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink/50">Vous êtes actuellement indisponible.</p>
        </div>
      )}

      {driverAvailable && (
        <>
          {/* Active delivery — the driver's main screen while a mission is running */}
          {activeMission && (() => {
            const nextCollection = activeMission.collections.find((c) => !c.collected);
            return (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">Livraison en cours</p>
                <div className="card p-4 border-burgundy/30 bg-burgundy/5">
                  <button
                    onClick={() => navigate(`/driver/livraisons/${activeMission.id}`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-sm font-semibold text-burgundy">{activeMission.orderId}</span>
                      <span className="text-xs font-medium text-burgundy flex items-center gap-1">
                        {activeMission.step === 'to_collection' && <><Truck size={13} /> En collecte</>}
                        {activeMission.step === 'all_collected' && <><CheckCircle2 size={13} /> Colis récupérés</>}
                        {activeMission.step === 'to_customer' && <><Navigation size={13} /> En livraison</>}
                      </span>
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {activeMission.collections.map((c) => (
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
                    <div className="flex items-center justify-between text-xs text-ink/50 mb-1">
                      <span className="flex items-center gap-1"><MapPin size={12} /> → {activeMission.destination}</span>
                      <span className="font-semibold text-burgundy">{formatFCFA(activeMission.earnings)}</span>
                    </div>
                  </button>

                  {/* Direct action for the current step — no extra navigation needed */}
                  <div className="mt-3 pt-3 border-t border-burgundy/10 space-y-2">
                    {activeMission.step === 'to_collection' && nextCollection && (
                      <button onClick={() => collectParcel(activeMission.id, nextCollection.shopId)} className="btn-primary w-full flex items-center justify-center gap-2">
                        <Package size={16} /> Confirmer la récupération
                      </button>
                    )}
                    {activeMission.step === 'all_collected' && (
                      <button onClick={() => startDelivery(activeMission.id)} className="btn-primary w-full flex items-center justify-center gap-2">
                        <Navigation size={16} /> Commencer la livraison
                      </button>
                    )}
                    {activeMission.step === 'to_customer' && (
                      <button onClick={() => navigate(`/driver/livraisons/${activeMission.id}`)} className="btn-primary w-full flex items-center justify-center gap-2">
                        <CheckCircle2 size={16} /> Confirmer la livraison
                      </button>
                    )}
                    <button onClick={() => navigate(`/driver/livraisons/${activeMission.id}`)} className="w-full text-center text-xs text-ink/45 hover:text-burgundy flex items-center justify-center gap-1 py-1">
                      Voir le détail <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Available deliveries with ACCEPT button directly on card */}
          {!activeMission && (
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
                      <div className="flex items-center justify-between border-t border-line pt-3">
                        <div>
                          <p className="text-xs text-ink/45">Gain</p>
                          <p className="text-sm font-semibold text-burgundy">{formatFCFA(mission.earnings)}</p>
                        </div>
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
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={() => navigate('/driver/livraisons')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">Terminées aujourd'hui</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{completedToday}</p>
            </button>
            <button onClick={() => navigate('/driver/revenus')} className="card p-4 text-left">
              <p className="text-xs text-ink/45">Revenus semaine</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{formatFCFA(47250 + sessionEarnings)}</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
