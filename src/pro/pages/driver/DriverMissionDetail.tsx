import { useEffect, useRef, useState } from 'react';
import UrgentBadge from '@/components/UrgentBadge';
import { formatDeliveryWish } from '@/lib/deliveryDay';
import { usePro, type Incident } from '../../ProContext';
import NavigationAppPicker from '@/components/NavigationAppPicker';
import { haversineDistanceKm, formatDistanceKm, telHref, type GeoPoint } from '@/utils/geo';
import {
  ArrowLeft, MapPin, Navigation, Phone, CheckCircle2, Package,
  AlertTriangle, X, Camera, Clock, ChevronDown, Lock,
} from 'lucide-react';

// Ezial Livreur — une seule page par mission (demande de la propriétaire,
// 25 nov. 2026) : accepter, récupérer chaque colis, livrer et confirmer se
// font ici, sans changer de page. Plus d'étiquette à imprimer ni de bouton
// « Commencer la livraison » : la mission passe « en livraison » toute
// seule quand le dernier colis est récupéré (voir collectParcel).

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

type IncidentTarget = { phase: 'collection'; shopId: string } | { phase: 'delivery' };

export default function DriverMissionDetail({ missionId }: { missionId: string }) {
  const {
    navigate, driverVisibleMissions, acceptMission,
    collectParcel, startDelivery, completeDelivery, reportIncident,
  } = usePro();

  const mission = driverVisibleMissions.find((m) => m.id === missionId);
  const [incidentTarget, setIncidentTarget] = useState<IncidentTarget | null>(null);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentComment, setIncidentComment] = useState('');
  const [deliveryCode, setDeliveryCode] = useState('');
  const [navTarget, setNavTarget] = useState<{ point: GeoPoint; label?: string } | null>(null);
  const [proofPhoto, setProofPhoto] = useState('');
  const [proofPhotoFile, setProofPhotoFile] = useState<File | null>(null);
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState<'accept' | 'collect' | 'deliver' | null>(null);
  // Étape ouverte choisie par le livreur (sinon : la prochaine à faire).
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [deliveryOpenChoice, setDeliveryOpenChoice] = useState<boolean | null>(null);

  const isAssigned = Boolean(mission?.driverId);
  const isDelivered = mission?.step === 'delivered';
  const allCollected = Boolean(mission && mission.collections.length > 0 && mission.collections.every((c) => c.collected));

  // Rattrapage : une mission restée « colis récupérés » (coupure réseau
  // juste après le dernier colis) passe en livraison automatiquement,
  // une seule fois, sans bouton.
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mission || !isAssigned || mission.step !== 'all_collected') return;
    if (autoStartedRef.current === mission.id) return;
    autoStartedRef.current = mission.id;
    void startDelivery(mission.id);
  }, [mission, isAssigned, startDelivery]);

  // Quand le dernier colis est récupéré, l'étape « Livrer au client »
  // s'ouvre et vient à l'écran toute seule.
  const deliveryRef = useRef<HTMLLIElement | null>(null);
  const wasAllCollectedRef = useRef(allCollected);
  useEffect(() => {
    if (allCollected && !wasAllCollectedRef.current) {
      deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    wasAllCollectedRef.current = allCollected;
  }, [allCollected]);

  if (!mission) {
    return (
      <div className="text-center py-16">
        <Package size={36} className="mx-auto text-ink/20" />
        <p className="mt-3 text-sm text-ink/55">Mission introuvable</p>
        <button onClick={() => navigate('/driver')} className="btn-outline mt-4 min-h-[44px]">Retour à l'accueil</button>
      </div>
    );
  }

  const total = mission.collections.length;
  const collectedCount = mission.collections.filter((c) => c.collected).length;
  const nextCollection = mission.collections.find((c) => !c.collected);
  const chosenOpen = openShopId ? mission.collections.find((c) => c.shopId === openShopId && !c.collected) : undefined;
  const openCollection = chosenOpen ?? nextCollection;
  const deliveryOpen = allCollected && (deliveryOpenChoice ?? true);
  const hasDestinationCoords = mission.destinationLatitude != null && mission.destinationLongitude != null;
  const slotText = formatDeliveryWish(mission.slotDate, mission.slot);

  // Estimation honnête à vol d'oiseau (première boutique → client), jamais
  // présentée comme un vrai trajet.
  const firstWithCoords = mission.collections.find((c) => c.latitude != null && c.longitude != null);
  const distanceKm = firstWithCoords && hasDestinationCoords
    ? haversineDistanceKm(
      { latitude: firstWithCoords.latitude!, longitude: firstWithCoords.longitude! },
      { latitude: mission.destinationLatitude!, longitude: mission.destinationLongitude! },
    )
    : null;

  const openNav = (latitude: number | undefined, longitude: number | undefined, label: string) => {
    if (latitude == null || longitude == null) return;
    setNavTarget({ point: { latitude, longitude }, label });
  };

  const handleAccept = async () => {
    setBusy('accept');
    await acceptMission(mission.id);
    setBusy(null);
  };

  const handleCollect = async (shopId: string) => {
    setBusy('collect');
    const { error } = await collectParcel(mission.id, shopId);
    setBusy(null);
    if (!error) setOpenShopId(null);
  };

  const handleComplete = async () => {
    if (!proofPhotoFile || !deliveryCode) return;
    setBusy('deliver');
    setCodeError('');
    // Le serveur exige le statut « en livraison » : rattrapage silencieux
    // si le passage automatique n'a pas encore abouti.
    if (mission.step !== 'to_customer') {
      const started = await startDelivery(mission.id);
      if (started.error) {
        setBusy(null);
        setCodeError(started.error);
        return;
      }
    }
    const result = await completeDelivery(mission.id, deliveryCode, proofPhotoFile);
    setBusy(null);
    if (result.error) setCodeError(result.error);
  };

  const openIncident = (target: IncidentTarget) => {
    setIncidentTarget(target);
    setIncidentReason('');
    setIncidentComment('');
  };

  const submitIncident = () => {
    if (!incidentReason || !incidentTarget) return;
    const incident: Incident = {
      phase: incidentTarget.phase,
      shopId: incidentTarget.phase === 'collection' ? incidentTarget.shopId : undefined,
      reason: incidentReason,
      comment: incidentComment || undefined,
      reportedAt: new Date().toISOString(),
    };
    reportIncident(mission.id, incident);
    setIncidentTarget(null);
  };

  const header = (
    <div className="space-y-3">
      <button onClick={() => navigate('/driver')} className="-ml-1 flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={16} /> Accueil
      </button>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold text-ink">
          Commande {mission.orderId}{mission.urgent && <UrgentBadge />}
        </h1>
        <p className="mt-0.5 text-xs text-ink/50">
          {total} boutique{total > 1 ? 's' : ''} · livraison {mission.destination ? `à ${mission.destination}` : 'au client'}
        </p>
      </div>
      {mission.incident && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-orange-600" />
          <div>
            <p className="text-sm font-medium text-orange-700">Problème signalé : {mission.incident.reason}</p>
            {mission.incident.comment && <p className="mt-0.5 text-xs text-orange-600">{mission.incident.comment}</p>}
          </div>
        </div>
      )}
    </div>
  );

  // === Livrée : confirmation sur la même page ===
  if (isDelivered) {
    return (
      <div className="space-y-5">
        {header}
        <div className="card p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">Livraison confirmée</h2>
          <p className="mt-1 text-sm text-ink/55">La commande {mission.orderId} est livrée. Merci !</p>
          {mission.deliveredAt && (
            <p className="mt-1 text-xs text-ink/45">
              Le {new Date(mission.deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={() => navigate('/driver')} className="btn-primary min-h-[52px] w-full text-base">Retour à l'accueil</button>
      </div>
    );
  }

  const incidentSheet = incidentTarget && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setIncidentTarget(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Signaler un problème"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Signaler un problème</h2>
          <button onClick={() => setIncidentTarget(null)} aria-label="Fermer" className="flex h-11 w-11 items-center justify-center text-ink/40 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        {incidentTarget.phase === 'collection' && (
          <p className="mb-3 text-xs text-ink/50">
            Boutique : {mission.collections.find((c) => c.shopId === incidentTarget.shopId)?.shopName}
          </p>
        )}
        <div className="space-y-2">
          {(incidentTarget.phase === 'collection' ? collectionIncidentReasons : deliveryIncidentReasons).map((reason) => (
            <button
              key={reason}
              onClick={() => setIncidentReason(reason)}
              className={`min-h-[44px] w-full rounded-lg border p-3 text-left text-sm font-medium transition-all ${
                incidentReason === reason
                  ? 'border-burgundy bg-burgundy/5 text-burgundy'
                  : 'border-line bg-white text-ink/70 hover:border-ink/20'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>
        <label className="mb-1.5 mt-4 block text-xs font-medium text-ink/60" htmlFor="incident-comment">Commentaire (optionnel)</label>
        <textarea
          id="incident-comment"
          className="input-field"
          rows={2}
          value={incidentComment}
          onChange={(e) => setIncidentComment(e.target.value)}
          placeholder="Ajouter un détail..."
        />
        <button onClick={submitIncident} disabled={!incidentReason} className="btn-primary mt-4 min-h-[52px] w-full text-base">
          Envoyer le signalement
        </button>
      </div>
    </div>
  );

  // === Mission disponible : résumé + un seul bouton ===
  if (!isAssigned) {
    return (
      <div className="space-y-5">
        {header}
        <div className="card divide-y divide-line">
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Livrer à</p>
            <p className="mt-1 flex items-center gap-1.5 text-base font-semibold text-ink"><MapPin size={16} className="text-burgundy" /> {mission.destination || 'Quartier non précisé'}</p>
            {mission.destinationAddress && <p className="mt-0.5 pl-[22px] text-sm text-ink/60">{mission.destinationAddress}</p>}
            {distanceKm != null && <p className="mt-1 pl-[22px] text-xs text-ink/50">Environ {formatDistanceKm(distanceKm)} à vol d'oiseau depuis la 1re boutique</p>}
          </div>
          {slotText && (
            <div className="p-4">
              <p className={`text-xs font-semibold uppercase tracking-wider ${mission.urgent ? 'text-burgundy-ruby' : 'text-ink/40'}`}>
                {mission.urgent ? 'Urgent : créneau à respecter' : 'Créneau'}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink"><Clock size={15} className="text-ink/40" /> {slotText}</p>
            </div>
          )}
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Boutiques à visiter ({total})</p>
            <ol className="mt-2 space-y-2">
              {mission.collections.map((c, i) => (
                <li key={c.shopId} className="flex items-start gap-2.5">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-xs font-semibold text-burgundy">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{c.shopName}</p>
                    {(c.area || c.address) && <p className="text-xs text-ink/50">{[c.area, c.address].filter(Boolean).join(' · ')}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-xs text-ink/45">Le téléphone du client s'affiche après acceptation.</p>
        {/* Toujours visible au-dessus de la barre du bas, même sur petit écran. */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-gradient-to-t from-cream via-cream/95 to-transparent px-4 pb-2 pt-4">
          <button onClick={() => void handleAccept()} disabled={busy !== null} className="btn-primary min-h-[52px] w-full text-base">
            {busy === 'accept' ? 'Acceptation…' : 'Accepter la livraison'}
          </button>
        </div>
      </div>
    );
  }

  // === Mission acceptée : check-list sur la même page ===
  return (
    <div className="space-y-5">
      {header}

      {/* Progression */}
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{collectedCount}/{total} {total > 1 ? 'boutiques récupérées' : 'boutique récupérée'}</span>
          {allCollected && <span className="text-xs font-medium text-green-700">Tous les colis en main</span>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${total > 0 ? (collectedCount / total) * 100 : 0}%` }} />
        </div>
      </div>

      <ol className="space-y-3">
        {mission.collections.map((c, i) => {
          if (c.collected) {
            return (
              <li key={c.shopId} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 size={22} className="flex-shrink-0 text-green-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-green-800">{i + 1}. Récupéré chez {c.shopName}</p>
                </div>
              </li>
            );
          }
          const isOpen = openCollection?.shopId === c.shopId;
          if (!isOpen) {
            return (
              <li key={c.shopId}>
                <button
                  onClick={() => setOpenShopId(c.shopId)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-ink/20 text-xs font-semibold text-ink/50">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">Récupérer chez {c.shopName}</span>
                    {c.area && <span className="block truncate text-xs text-ink/50">{c.area}</span>}
                  </span>
                  <ChevronDown size={18} className="flex-shrink-0 text-ink/30" />
                </button>
              </li>
            );
          }
          return (
            <li key={c.shopId} className="rounded-xl border-2 border-burgundy bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-burgundy text-xs font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink">Récupérer chez {c.shopName}</p>
                  {(c.area || c.address) && (
                    <p className="mt-0.5 flex items-start gap-1 text-sm text-ink/60"><MapPin size={14} className="mt-0.5 flex-shrink-0 text-ink/40" /> {[c.area, c.address].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="mt-1 text-xs text-ink/45">Commande {mission.orderId}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => openNav(c.latitude, c.longitude, c.shopName)}
                  disabled={c.latitude == null || c.longitude == null}
                  className="flex min-h-[44px] items-center gap-1.5 px-1 text-sm font-medium text-burgundy disabled:text-ink/30"
                >
                  <Navigation size={16} /> Itinéraire
                </button>
                <button
                  onClick={() => openIncident({ phase: 'collection', shopId: c.shopId })}
                  className="min-h-[44px] px-1 text-sm text-ink/50 hover:text-burgundy"
                >
                  Signaler un problème
                </button>
              </div>
              <button
                onClick={() => void handleCollect(c.shopId)}
                disabled={busy !== null}
                className="btn-primary mt-2 min-h-[52px] w-full text-base"
              >
                <Package size={18} /> {busy === 'collect' ? 'Enregistrement…' : 'Colis récupéré'}
              </button>
            </li>
          );
        })}

        {/* Dernière étape : livrer au client (accordéon) */}
        <li ref={deliveryRef} className={`scroll-mt-20 rounded-xl border-2 ${allCollected ? 'border-burgundy bg-white' : 'border-line bg-white/60'}`}>
          <button
            onClick={() => allCollected && setDeliveryOpenChoice(!deliveryOpen)}
            disabled={!allCollected}
            aria-expanded={deliveryOpen}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
          >
            {allCollected
              ? <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-burgundy text-white"><MapPin size={13} /></span>
              : <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-ink/20 text-ink/40"><Lock size={11} /></span>}
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold ${allCollected ? 'text-ink' : 'text-ink/50'}`}>Dernière étape : livrer au client</span>
              <span className="block truncate text-xs text-ink/50">
                {allCollected ? (mission.destination || 'Adresse ci-dessous') : 'Après la récupération de tous les colis'}
              </span>
            </span>
            {allCollected && <ChevronDown size={18} className={`flex-shrink-0 text-ink/40 transition-transform ${deliveryOpen ? 'rotate-180' : ''}`} />}
          </button>

          {deliveryOpen && (
            <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
              {/* Client */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink/45">Client</p>
                  <p className="truncate text-sm font-medium text-ink">{mission.customerName.split(' ')[0]}</p>
                  {mission.customerPhone && <p className="truncate text-sm text-ink/60">{mission.customerPhone}</p>}
                </div>
                {mission.customerPhone && (
                  <a href={telHref(mission.customerPhone)} className="btn-outline min-h-[44px] flex-shrink-0 px-4">
                    <Phone size={16} /> Appeler
                  </a>
                )}
              </div>

              {/* Adresse */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink/45">Adresse</p>
                  <p className="text-sm text-ink">{[mission.destination, mission.destinationAddress].filter(Boolean).join(' · ') || 'Non précisée'}</p>
                  {slotText && <p className={`mt-0.5 text-xs ${mission.urgent ? 'font-semibold text-burgundy-ruby' : 'text-ink/50'}`}>{mission.urgent ? 'Urgent · ' : ''}{slotText}</p>}
                </div>
                <button
                  onClick={() => openNav(mission.destinationLatitude, mission.destinationLongitude, 'Client')}
                  disabled={!hasDestinationCoords}
                  className="flex min-h-[44px] flex-shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-burgundy disabled:text-ink/30"
                >
                  <Navigation size={16} /> Itinéraire
                </button>
              </div>

              {/* Confirmation */}
              <div className="space-y-3 rounded-lg bg-cream/60 p-3">
                <div>
                  <label htmlFor="delivery-code" className="block text-sm font-medium text-ink">1. Code donné par le client</label>
                  <input
                    id="delivery-code"
                    className="input-field mt-1.5 text-center font-mono text-lg tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    placeholder="____"
                    value={deliveryCode}
                    onChange={(e) => { setDeliveryCode(e.target.value.replace(/\D/g, '')); setCodeError(''); }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">2. Photo du colis remis</p>
                  {proofPhoto ? (
                    <div className="relative mt-1.5 h-36 overflow-hidden rounded-lg bg-cream">
                      <img src={proofPhoto} alt="Preuve de livraison" className="h-full w-full object-cover" />
                      <button
                        onClick={() => { setProofPhoto(''); setProofPhotoFile(null); }}
                        aria-label="Retirer la photo"
                        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-ink/70"
                      >
                        <span className="rounded-full bg-white/90 p-1"><X size={16} /></span>
                      </button>
                    </div>
                  ) : (
                    <label className="mt-1.5 flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-white text-sm text-ink/60 hover:border-burgundy/30">
                      <Camera size={18} className="text-ink/40" /> Prendre la photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setProofPhotoFile(file);
                            const reader = new FileReader();
                            reader.onload = (ev) => setProofPhoto(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                {codeError && <p className="text-sm text-burgundy" role="alert">{codeError}</p>}
                <button
                  onClick={() => void handleComplete()}
                  disabled={!deliveryCode || !proofPhotoFile || busy !== null}
                  className="btn-primary min-h-[52px] w-full text-base disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={18} /> {busy === 'deliver' ? 'Confirmation…' : 'Confirmer la livraison'}
                </button>
              </div>

              <button onClick={() => openIncident({ phase: 'delivery' })} className="min-h-[44px] w-full text-center text-sm text-ink/50 hover:text-burgundy">
                Signaler un problème
              </button>
            </div>
          )}
        </li>
      </ol>

      {incidentSheet}
      {navTarget && <NavigationAppPicker point={navTarget.point} label={navTarget.label} onClose={() => setNavTarget(null)} />}
    </div>
  );
}
