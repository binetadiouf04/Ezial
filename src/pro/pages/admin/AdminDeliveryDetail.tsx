import { usePro } from '../../ProContext';
import { formatDateTime } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import { ArrowLeft, Store, MapPin, User, Phone, AlertTriangle, CheckCircle2, Circle, Package } from 'lucide-react';

export default function AdminDeliveryDetail({ missionId }: { missionId: string }) {
  const { missions, navigate, allDrivers, resolvedIncidents, resolveIncident } = usePro();

  const mission = missions.find((m) => m.id === missionId);
  if (!mission) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-ink/55">Livraison introuvable</p>
        <button onClick={() => navigate('/admin/livraisons')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const driver = allDrivers.find((d) => d.id === mission.driverId);
  const hasIncident = mission.incident && !resolvedIncidents.includes(mission.id);
  const collectedCount = mission.collections.filter((c) => c.collected).length;

  const stepLabels: Record<string, string> = {
    accepted: 'Disponible',
    to_collection: 'En collecte',
    collected: 'En collecte',
    all_collected: 'Colis récupérés',
    to_customer: 'En livraison',
    arrived: 'Arrivé',
    delivered: 'Livrée',
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/livraisons')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Livraisons
      </button>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{mission.orderId}</h1>
        <StatusChip status={mission.step === 'delivered' ? 'delivered' : mission.step === 'to_customer' ? 'out_for_delivery' : 'preparing'} size="md" />
      </div>

      {/* Driver */}
      {driver && (
        <button onClick={() => navigate(`/admin/livreurs/${driver.id}`)} className="card w-full p-4 flex items-center gap-3 text-left">
          <div className="h-10 w-10 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
            <User size={18} className="text-burgundy" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-ink">{driver.name}</p>
            <p className="text-xs text-ink/45 font-mono">{driver.identifier}</p>
          </div>
          <span className="text-xs text-burgundy font-medium">Voir profil</span>
        </button>
      )}

      {/* Collections */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Collectes</h2>
          <span className="text-xs font-medium text-burgundy">{collectedCount} / {mission.collections.length} récupérées</span>
        </div>
        <div className="space-y-4">
          {mission.collections.map((c, i) => (
            <div key={c.shopId} className="flex items-start gap-3">
              {c.collected ? (
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={20} className="text-ink/20 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <button onClick={() => navigate(`/admin/boutiques/${c.shopId}`)} className="text-sm font-medium text-ink hover:text-burgundy">{c.shopName}</button>
                <p className="text-xs text-ink/45 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {c.address}</p>
                <p className="text-xs text-ink/35 flex items-center gap-1 mt-0.5"><Package size={11} /> {c.parcelCount} colis</p>
                {c.collected && c.collectedAt && (
                  <p className="text-xs text-green-600 mt-0.5">Récupéré : {formatDateTime(c.collectedAt)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Destination */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-2">Destination</h2>
        <p className="text-sm font-medium text-ink">{mission.destination}</p>
        {mission.destinationAddress && <p className="text-xs text-ink/45 mt-0.5">{mission.destinationAddress}</p>}
        <div className="mt-3 pt-3 border-t border-line space-y-1.5">
          <p className="text-sm text-ink flex items-center gap-1.5"><User size={14} className="text-ink/40" /> {mission.customerName}</p>
          <p className="text-sm text-ink flex items-center gap-1.5"><Phone size={14} className="text-ink/40" /> {mission.customerPhone}</p>
          {mission.slot && <p className="text-xs text-ink/45">Créneau : {mission.slot}</p>}
        </div>
      </div>

      {/* Incident */}
      {mission.incident && (
        <div className={`rounded-lg border p-4 ${hasIncident ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className={hasIncident ? 'text-orange-600' : 'text-green-600'} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${hasIncident ? 'text-orange-700' : 'text-green-700'}`}>
                {hasIncident ? 'Incident ouvert' : 'Incident résolu'}
              </p>
              <p className={`text-xs mt-1 ${hasIncident ? 'text-orange-600' : 'text-green-600'}`}>{mission.incident.reason}</p>
              {mission.incident.comment && <p className={`text-xs mt-0.5 ${hasIncident ? 'text-orange-500' : 'text-green-500'}`}>« {mission.incident.comment} »</p>}
              {mission.incident.shopId && (
                <p className={`text-xs mt-0.5 ${hasIncident ? 'text-orange-500' : 'text-green-500'}`}>
                  Boutique: {mission.collections.find((c) => c.shopId === mission.incident!.shopId)?.shopName}
                </p>
              )}
              <p className={`text-xs mt-0.5 ${hasIncident ? 'text-orange-500' : 'text-green-500'}`}>Signalé : {formatDateTime(mission.incident.reportedAt)}</p>
              {hasIncident && (
                <button onClick={() => resolveIncident(mission.id)} className="mt-2 text-xs font-medium text-orange-700 hover:underline">Marquer comme résolu</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delivery proof */}
      {mission.step === 'delivered' && mission.deliveredAt && (
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="text-sm font-medium text-ink">Livrée le {formatDateTime(mission.deliveredAt)}</p>
          </div>
          {mission.proofPhoto && (
            <div className="mt-3 rounded-lg overflow-hidden h-32 bg-cream">
              <img src={mission.proofPhoto.startsWith('data:') ? mission.proofPhoto : 'https://images.pexels.com/photos/19816456/pexels-photo-19816456.jpeg?auto=compress&cs=tinysrgb&h=200'} alt="Preuve" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      )}

      {/* Order link */}
      <button onClick={() => navigate(`/admin/commandes/${mission.orderId}`)} className="text-sm text-burgundy font-medium hover:underline">Voir la commande</button>
    </div>
  );
}
