import { useState } from 'react';
import { usePro } from '../../ProContext';
import { formatFCFA, formatDate } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Phone, Truck, Wallet, Calendar, AlertTriangle, X } from 'lucide-react';

export default function AdminDriverDetail({ driverId }: { driverId: string }) {
  const { allDrivers, missions, navigate, toggleDriverStatus, markDriverPaid, driverPayoutStatuses } = usePro();
  const [showSuspend, setShowSuspend] = useState(false);

  const driver = allDrivers.find((d) => d.id === driverId);
  if (!driver) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Livreur introuvable</p>
        <button onClick={() => navigate('/admin/livreurs')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const driverMissions = missions.filter((m) => m.driverId === driver.id);
  const currentMission = driverMissions.find((m) => m.step !== 'delivered');
  const completedDriverMissions = driverMissions.filter((m) => m.step === 'delivered');
  const isSuspended = driver.status === 'suspended';
  const payoutStatus = driverPayoutStatuses[driver.id] ?? 'pending';

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/livreurs')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Livreurs
      </button>

      {/* Header */}
      <div className="card p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
          <span className="font-display text-xl font-semibold text-burgundy">{driver.name.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold text-ink">{driver.name}</h1>
          <p className="text-xs text-ink/45 font-mono mt-0.5">{driver.identifier}</p>
        </div>
        <StatusChip status={driver.status} size="md" />
      </div>

      {/* Info */}
      <div className="card divide-y divide-line">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Phone size={15} className="text-ink/35" /> Téléphone</span>
          <span className="text-sm font-medium text-ink">{driver.phone}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Calendar size={15} className="text-ink/35" /> Membre depuis</span>
          <span className="text-sm font-medium text-ink">{formatDate(driver.joinDate)}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-ink/55 flex items-center gap-2"><Truck size={15} className="text-ink/35" /> Livraisons (semaine)</span>
          <span className="text-sm font-semibold text-ink">{driver.weeklyDeliveries}</span>
        </div>
      </div>

      {/* Current mission */}
      {currentMission ? (
        <button onClick={() => navigate(`/admin/livraisons/${currentMission.id}`)} className="card w-full p-4 flex items-center gap-3 text-left border-violet-100 bg-violet-50/50">
          <Truck size={20} className="text-violet-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">Mission en cours</p>
            <p className="text-xs text-ink/45 font-mono">{currentMission.orderId} · → {currentMission.destination}</p>
          </div>
          <span className="text-xs text-violet-600 font-medium">Voir</span>
        </button>
      ) : (
        <div className="card p-4">
          <p className="text-sm text-ink/45">Aucune mission en cours</p>
        </div>
      )}

      {/* Earnings */}
      <div className="card p-5 space-y-2">
        <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider flex items-center gap-1.5"><Wallet size={14} /> Revenus</p>
        <div className="flex justify-between text-sm">
          <span className="text-ink/55">Cette semaine</span>
          <span className="font-medium text-ink">{formatFCFA(driver.weeklyEarnings)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink/55">Cette année</span>
          <span className="font-medium text-ink">{formatFCFA(driver.yearlyEarnings)}</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-line">
          <span className="font-semibold text-ink">À verser</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{formatFCFA(driver.weeklyEarnings)}</span>
            <StatusChip status={payoutStatus} />
          </div>
        </div>
        {payoutStatus !== 'paid' && (
          <button onClick={() => markDriverPaid(driver.id)} className="btn-outline w-full mt-2">Marquer comme versé</button>
        )}
      </div>

      {/* Recent deliveries */}
      {completedDriverMissions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Livraisons terminées</h2>
          <div className="card divide-y divide-line">
            {completedDriverMissions.map((m) => (
              <button key={m.id} onClick={() => navigate(`/admin/livraisons/${m.id}`)} className="flex items-center justify-between p-4 w-full text-left hover:bg-cream/40 transition-colors">
                <div>
                  <p className="font-mono text-sm font-medium text-ink">{m.orderId}</p>
                  <p className="text-xs text-ink/45">{m.destination}</p>
                </div>
                <span className="text-sm font-semibold text-ink">{formatFCFA(m.earnings)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status actions */}
      <div className="pt-2">
        {isSuspended ? (
          <button onClick={() => toggleDriverStatus(driver.id, 'active')} className="btn-primary w-full">Réactiver le livreur</button>
        ) : (
          <button onClick={() => setShowSuspend(true)} className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">Suspendre</button>
        )}
      </div>

      {/* Suspend confirmation */}
      {showSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowSuspend(false)}>
          <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-ink">Suspendre le livreur</h3>
              <button onClick={() => setShowSuspend(false)}><X size={18} className="text-ink/40" /></button>
            </div>
            <div className="flex items-start gap-2 mb-5">
              <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-ink/55">Le livreur ne pourra plus accepter de nouvelles missions.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSuspend(false)} className="btn-outline flex-1">Retour</button>
              <button onClick={() => { toggleDriverStatus(driver.id, 'suspended'); setShowSuspend(false); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
