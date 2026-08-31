import { useState } from 'react';
import { usePro, type Incident } from '../../ProContext';
import { formatFCFA } from '../../data';
import { StatusChip } from '../../components/StatusChip';
import {
  ArrowLeft, MapPin, Navigation, Phone, CheckCircle2, Package,
  AlertTriangle, X, Camera,
} from 'lucide-react';

const collectionIncidentReasons = [
  'Boutique fermée',
  'Commande pas prête',
  'Colis introuvable',
  'Problème avec le colis',
  'Adresse de la boutique introuvable',
  'Autre',
];

const deliveryIncidentReasons = [
  'Client absent',
  'Client injoignable',
  'Adresse introuvable',
  'Problème avec le colis',
  'Autre',
];

export default function DriverMissionDetail({ missionId }: { missionId: string }) {
  const {
    navigate, missions, acceptMission, activeMission,
    collectParcel, startDelivery, completeDelivery, reportIncident,
  } = usePro();

  const mission = missions.find((m) => m.id === missionId);
  const [showIncident, setShowIncident] = useState(false);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentComment, setIncidentComment] = useState('');
  const [incidentPhase, setIncidentPhase] = useState<'collection' | 'delivery'>('collection');
  const [incidentShopId, setIncidentShopId] = useState<string | undefined>(undefined);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [proofPhoto, setProofPhoto] = useState('');
  const [codeError, setCodeError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  if (!mission) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Mission introuvable</p>
        <button onClick={() => navigate('/driver/livraisons')} className="btn-outline mt-4">Retour</button>
      </div>
    );
  }

  const isAssigned = mission.driverId === 'me' || mission.driverId === 'abdou';
  const isAvailable = !mission.driverId && mission.collections.every((c) => c.status === 'ready');
  const allCollected = mission.collections.every((c) => c.collected);
  const collectedCount = mission.collections.filter((c) => c.collected).length;
  const isDelivered = mission.step === 'delivered';
  const currentCollection = mission.collections.find((c) => !c.collected);

  const handleAccept = () => {
    if (activeMission) return;
    acceptMission(mission.id);
  };

  const handleComplete = () => {
    if (!proofPhoto) return;
    const success = completeDelivery(mission.id, deliveryCode, proofPhoto);
    if (success) {
      setShowSuccess(true);
      setCodeError('');
    } else {
      setCodeError('Code de livraison incorrect');
    }
  };

  const openIncidentCollection = (shopId: string) => {
    setIncidentPhase('collection');
    setIncidentShopId(shopId);
    setShowIncident(true);
    setIncidentReason('');
    setIncidentComment('');
  };

  const openIncidentDelivery = () => {
    setIncidentPhase('delivery');
    setIncidentShopId(undefined);
    setShowIncident(true);
    setIncidentReason('');
    setIncidentComment('');
  };

  const submitIncident = () => {
    if (!incidentReason) return;
    const incident: Incident = {
      phase: incidentPhase,
      shopId: incidentShopId,
      reason: incidentReason,
      comment: incidentComment || undefined,
      reportedAt: new Date().toISOString(),
    };
    reportIncident(mission.id, incident);
    setShowIncident(false);
  };

  // === Success screen ===
  if (showSuccess) {
    return (
      <div className="space-y-5">
        <div className="card p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">Livraison terminée</h2>
          <p className="mt-1 text-sm text-ink/55">Commande {mission.orderId} livrée avec succès</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-burgundy/10 px-4 py-2">
            <span className="text-lg font-bold text-burgundy">+ {formatFCFA(mission.earnings)}</span>
          </div>
        </div>
        <button onClick={() => navigate('/driver')} className="btn-primary w-full">Retour à l'accueil</button>
      </div>
    );
  }

  // === Incident modal ===
  if (showIncident) {
    const reasons = incidentPhase === 'collection' ? collectionIncidentReasons : deliveryIncidentReasons;
    return (
      <div className="space-y-4">
        <button onClick={() => setShowIncident(false)} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
          <ArrowLeft size={16} /> Retour
        </button>
        <h1 className="font-display text-xl font-semibold text-ink">Signaler un problème</h1>
        <div className="card p-5 space-y-4">
          <div className="space-y-2">
            {reasons.map((reason) => (
              <button
                key={reason}
                onClick={() => setIncidentReason(reason)}
                className={`w-full rounded-lg p-3 text-left text-sm font-medium transition-all border ${
                  incidentReason === reason
                    ? 'bg-burgundy/5 border-burgundy text-burgundy'
                    : 'bg-white border-line text-ink/70 hover:border-ink/20'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Commentaire (optionnel)</label>
            <textarea
              className="input-field"
              rows={2}
              value={incidentComment}
              onChange={(e) => setIncidentComment(e.target.value)}
              placeholder="Ajouter un détail..."
            />
          </div>
          <button onClick={submitIncident} disabled={!incidentReason} className="btn-primary w-full disabled:opacity-40">
            Envoyer le signalement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/driver/livraisons')} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Livraisons
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{mission.orderId}</h1>
          <p className="text-xs text-ink/45 mt-0.5">{mission.collections.length} collectes · 1 livraison</p>
        </div>
        {isDelivered && <StatusChip status="delivered" size="md" />}
      </div>

      {/* Incident banner */}
      {mission.incident && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-700">Signalement : {mission.incident.reason}</p>
            {mission.incident.comment && <p className="text-xs text-orange-600 mt-0.5">{mission.incident.comment}</p>}
          </div>
        </div>
      )}

      {/* === PRE-ACCEPTANCE === */}
      {isAvailable && !isAssigned && (
        <>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Collectes</h2>
            <div className="space-y-4">
              {mission.collections.map((c, i) => (
                <div key={c.shopId} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-burgundy/10 text-burgundy text-sm font-semibold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{c.shopName}</p>
                    <p className="text-xs text-ink/50 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {c.address}</p>
                    <p className="text-xs text-ink/45 mt-0.5">{c.parcelCount} colis</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-3">Livraison</h2>
            <p className="text-sm font-medium text-ink">{mission.destination}</p>
            <p className="text-xs text-ink/50 mt-0.5">{mission.destinationAddress}</p>
          </div>

          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm text-ink/55">Gain</span>
            <span className="font-display text-lg font-semibold text-burgundy">{formatFCFA(mission.earnings)}</span>
          </div>

          <button
            onClick={handleAccept}
            disabled={!!activeMission}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {activeMission ? 'Vous avez déjà une livraison en cours' : 'Accepter la livraison'}
          </button>
        </>
      )}

      {/* === COLLECTION WORKFLOW === */}
      {isAssigned && !isDelivered && mission.step !== 'to_customer' && (
        <>
          {/* Progress */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-ink">Collectes</span>
              <span className="text-xs font-medium text-burgundy">{collectedCount} / {mission.collections.length} récupérées</span>
            </div>
            <div className="space-y-2">
              {mission.collections.map((c) => (
                <div key={c.shopId} className="flex items-center gap-2 text-sm">
                  {c.collected ? (
                    <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
                  ) : (
                    <div className="h-[18px] w-[18px] rounded-full border-2 border-ink/20 flex-shrink-0" />
                  )}
                  <span className={c.collected ? 'text-ink/50 line-through' : 'text-ink font-medium'}>{c.shopName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All collected */}
          {allCollected && (
            <div className="card p-5 bg-green-50 border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-green-600" />
                <p className="text-sm font-medium text-green-700">Tous les colis sont récupérés</p>
              </div>
              <button onClick={() => startDelivery(mission.id)} className="btn-primary w-full mt-4">
                Commencer la livraison
              </button>
            </div>
          )}

          {/* Current collection — one action at a time */}
          {!allCollected && currentCollection && (
            <div className="card p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-burgundy mb-1">
                  Collecte {collectedCount + 1} / {mission.collections.length}
                </p>
                <p className="text-lg font-semibold text-ink">{currentCollection.shopName}</p>
                <p className="text-sm text-ink/50 flex items-center gap-1.5 mt-1"><MapPin size={14} className="text-ink/40" /> {currentCollection.address}</p>
              </div>

              <div className="space-y-1.5 text-sm border-t border-line pt-3">
                <p className="text-xs text-ink/45">Référence commande</p>
                <p className="font-mono text-ink">{mission.orderId}</p>
                <p className="text-xs text-ink/45 mt-2">Colis</p>
                <p className="text-ink flex items-center gap-1.5"><Package size={14} className="text-ink/40" /> {currentCollection.parcelCount} colis</p>
              </div>

              <button
                onClick={() => alert('Navigation vers la boutique (mock)')}
                className="btn-outline w-full flex items-center justify-center gap-2"
              >
                <Navigation size={16} /> Ouvrir l'itinéraire
              </button>

              <div className="space-y-2 pt-1">
                <button onClick={() => collectParcel(mission.id, currentCollection.shopId)} className="btn-primary w-full">
                  Confirmer la récupération
                </button>
                <button onClick={() => openIncidentCollection(currentCollection.shopId)} className="text-sm text-ink/50 hover:text-burgundy w-full text-center py-2">
                  Problème
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* === DELIVERY TO CUSTOMER === */}
      {isAssigned && mission.step === 'to_customer' && !isDelivered && (
        <>
          <div className="card p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-burgundy">Livraison client</p>
            <div>
              <p className="text-xs text-ink/45 mb-0.5">Client</p>
              <p className="text-ink font-medium">{mission.customerName.split(' ')[0]}</p>
            </div>
            <div>
              <p className="text-xs text-ink/45 mb-0.5">Téléphone</p>
              <p className="text-ink flex items-center gap-1.5"><Phone size={14} className="text-ink/40" /> {mission.customerPhone}</p>
            </div>
            <div>
              <p className="text-xs text-ink/45 mb-0.5">Adresse</p>
              <p className="text-ink flex items-center gap-1.5"><MapPin size={14} className="text-ink/40" /> {mission.destinationAddress}</p>
            </div>
            {mission.slot && (
              <div>
                <p className="text-xs text-ink/45 mb-0.5">Créneau</p>
                <p className="text-ink">{mission.slot}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => alert(`Appel au ${mission.customerPhone} (mock)`)}
              className="btn-outline flex-1 flex items-center justify-center gap-2"
            >
              <Phone size={16} /> Appeler
            </button>
            <button
              onClick={() => alert('Navigation vers le client (mock)')}
              className="btn-outline flex-1 flex items-center justify-center gap-2"
            >
              <Navigation size={16} /> Itinéraire
            </button>
          </div>

          {/* Delivery code */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Code de livraison</h2>
            <p className="text-xs text-ink/45">Entrez le code fourni par le client</p>
            <input
              className="input-field text-center text-lg font-mono tracking-[0.5em]"
              maxLength={4}
              placeholder="____"
              value={deliveryCode}
              onChange={(e) => { setDeliveryCode(e.target.value.replace(/\D/g, '')); setCodeError(''); }}
            />
            {codeError && <p className="text-xs text-burgundy">{codeError}</p>}
          </div>

          {/* Proof photo */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink">Preuve photo</h2>
            <p className="text-xs text-ink/45">Prenez une photo du colis remis au client.</p>
            {proofPhoto ? (
              <div className="relative rounded-lg overflow-hidden h-40 bg-cream">
                <img src={proofPhoto} alt="Preuve" className="h-full w-full object-cover" />
                <button onClick={() => setProofPhoto('')} className="absolute top-2 right-2 rounded-full bg-white/90 p-1 text-ink/60">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-line cursor-pointer hover:border-burgundy/30 transition-colors">
                <Camera size={24} className="text-ink/30" />
                <span className="mt-2 text-xs text-ink/45">Ajouter une photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setProofPhoto(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            )}
          </div>

          <button
            onClick={handleComplete}
            disabled={!deliveryCode || !proofPhoto}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmer la livraison
          </button>
          <button onClick={openIncidentDelivery} className="text-sm text-ink/50 hover:text-burgundy w-full text-center py-2">
            Problème
          </button>
        </>
      )}

      {/* === COMPLETED === */}
      {isDelivered && (
        <>
          <div className="card p-5 bg-green-50 border-green-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" />
              <p className="text-sm font-medium text-green-700">Livraison terminée</p>
            </div>
            {mission.deliveredAt && (
              <p className="text-xs text-green-600 mt-1.5">
                Livrée le {new Date(mission.deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm text-ink/55">Gain</span>
            <span className="font-display text-lg font-semibold text-burgundy">+ {formatFCFA(mission.earnings)}</span>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-ink/50 mb-3">Collectes</p>
            <div className="space-y-2">
              {mission.collections.map((c) => (
                <div key={c.shopId} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <span className="text-ink/70">{c.shopName}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => navigate('/driver')} className="btn-outline w-full">Retour à l'accueil</button>
        </>
      )}
    </div>
  );
}
