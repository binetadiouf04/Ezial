import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import VendorNoticeBanner from '../../components/VendorNoticeBanner';
import ShopLocationMap from '../../components/ShopLocationMap';
import { fetchShopLocation, updateShopLocation } from '@/lib/supabaseSellerShop';
import { searchAddress, type GeocodeResult } from '@/lib/geocoding';
import { Check, KeyRound, Image as ImageIcon, Camera, MapPin, Loader2, AlertTriangle, AlertCircle, Navigation, Pencil, Search } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type LocationStatus = 'idle' | 'requesting' | 'denied' | 'unsupported' | 'error';
type LocationMode = 'gps' | 'manual';

export default function SellerShop() {
  const { sellerShop, updateSellerShop, updateSellerPin, identifier, sellerSupabaseShopId, getLatestModeration } = usePro();
  const latestModeration = sellerShop ? getLatestModeration('shop', sellerShop.id) : null;
  const [form, setForm] = useState({
    name: sellerShop?.name ?? '',
    description: sellerShop?.description ?? '',
    contact: sellerShop?.contact ?? '',
    pickupAddress: sellerShop?.pickupAddress ?? '',
    banner: sellerShop?.banner ?? '',
    logo: sellerShop?.logo ?? '',
    pickupEnabled: sellerShop?.pickupEnabled ?? false,
    deliveryEnabled: sellerShop?.deliveryEnabled ?? true,
    hours: 'Lun–Sam : 9h–18h',
  });
  const [saved, setSaved] = useState(false);

  // PIN change — fields are never pre-filled with the current PIN, and are
  // cleared right after a successful save, so it's never shown in clear.
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaved, setPinSaved] = useState(false);

  // Shop location (shops.latitude/longitude) — read/written directly on the
  // real Supabase shop row via sellerSupabaseShopId, never through the mock
  // sellerShop/updateSellerShop state which has no coordinate fields.
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationSaved, setLocationSaved] = useState(false);
  const [locationMode, setLocationMode] = useState<LocationMode>('gps');

  // Manual entry — the seller's own device position (e.g. this Ezial Pro
  // session) is never assumed to be where the shop actually is. Coordinates
  // are only ever set via an address search or by pointing at the map —
  // never typed as raw numbers, and never shown to the seller as numbers.
  const [manualPosition, setManualPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [manualAdjusted, setManualAdjusted] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[] | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!sellerSupabaseShopId) { setLocationLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const loc = await fetchShopLocation(sellerSupabaseShopId);
      if (cancelled) return;
      if (loc && loc.latitude != null && loc.longitude != null) setLocation({ latitude: loc.latitude, longitude: loc.longitude });
      setLocationLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  const requestShopLocation = useCallback(() => {
    if (!sellerSupabaseShopId) return;
    if (!('geolocation' in navigator)) { setLocationStatus('unsupported'); return; }
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const result = await updateShopLocation(sellerSupabaseShopId, latitude, longitude);
        if ('error' in result && result.error) { setLocationStatus('error'); return; }
        setLocation({ latitude, longitude });
        setLocationStatus('idle');
        setLocationSaved(true);
        setTimeout(() => setLocationSaved(false), 2000);
      },
      () => { setLocationStatus('denied'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [sellerSupabaseShopId]);

  const openManualMode = () => {
    setManualPosition(location ? { lat: location.latitude, lng: location.longitude } : null);
    setManualAdjusted(false);
    setSelectedLabel(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError('');
    setManualError('');
    setLocationMode('manual');
  };

  const applySearchResult = (result: GeocodeResult) => {
    setManualPosition({ lat: result.lat, lng: result.lng });
    setSelectedLabel(result.label);
    setManualAdjusted(false);
    setSearchResults(null);
    setSearchError('');
  };

  const handleSearchAddress = async () => {
    const query = searchQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const results = await searchAddress(query);
      if (results.length === 0) {
        setSearchError('Adresse introuvable. Essayez avec le quartier, la commune ou un lieu connu à proximité.');
      } else if (results.length === 1) {
        applySearchResult(results[0]);
      } else {
        setSearchResults(results);
      }
    } catch {
      setSearchError('La recherche a échoué. Vérifiez votre connexion et réessayez.');
    } finally {
      setSearching(false);
    }
  };

  const handleMapPick = (lat: number, lng: number) => {
    setManualPosition({ lat, lng });
    setManualAdjusted(true);
  };

  const handleSaveManualLocation = async () => {
    if (!sellerSupabaseShopId || !manualPosition) return;
    setManualError('');
    setManualSaving(true);
    const result = await updateShopLocation(sellerSupabaseShopId, manualPosition.lat, manualPosition.lng);
    setManualSaving(false);
    if ('error' in result && result.error) { setManualError(result.error); return; }
    setLocation({ latitude: manualPosition.lat, longitude: manualPosition.lng });
    setLocationSaved(true);
    setTimeout(() => setLocationSaved(false), 2000);
  };

  const handleSave = () => {
    updateSellerShop(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setForm((f) => ({ ...f, logo: URL.createObjectURL(file) }));
  };

  const handleBannerFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setForm((f) => ({ ...f, banner: URL.createObjectURL(file) }));
  };

  const handleSavePin = () => {
    setPinError('');
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('Le PIN doit contenir exactement 4 chiffres.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('Les deux PIN ne correspondent pas.');
      return;
    }
    const ok = updateSellerPin(newPin);
    if (!ok) {
      setPinError('Le PIN doit contenir exactement 4 chiffres.');
      return;
    }
    setNewPin('');
    setConfirmPin('');
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Ma boutique</h1>
        <p className="mt-1 text-sm text-ink/55">Gérez les informations de votre boutique</p>
      </div>

      {latestModeration && <VendorNoticeBanner entry={latestModeration} />}

      {locationLoaded && !location && (
        <div className="card flex items-start gap-2.5 border-amber-300 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-800">Ajoutez la localisation de votre boutique pour pouvoir recevoir des commandes en livraison.</p>
        </div>
      )}

      {/* Seller identifier — read-only */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink/50">Identifiant vendeur</p>
          <p className="mt-1 font-mono text-sm font-semibold text-ink">{identifier}</p>
        </div>
        <span className="text-xs text-ink/35">Non modifiable</span>
      </div>

      {/* PIN — security */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><KeyRound size={15} className="text-ink/40" /> Code PIN</h2>
          <p className="mt-1 text-xs text-ink/45">Utilisé avec votre identifiant pour vous connecter. Il n'est jamais affiché une fois enregistré.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Nouveau PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="input-field font-mono tracking-[0.5em]"
              placeholder="••••"
              maxLength={4}
              value={newPin}
              onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Confirmer le PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="input-field font-mono tracking-[0.5em]"
              placeholder="••••"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }}
            />
          </div>
        </div>
        {pinError && <p className="text-xs text-burgundy">{pinError}</p>}
        <div className="flex items-center gap-3">
          <button onClick={handleSavePin} className="btn-outline">Enregistrer le PIN</button>
          {pinSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> PIN mis à jour</span>}
        </div>
      </div>

      {/* Shop info form */}
      <div className="card p-5 space-y-5">
        {/* Logo upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Logo de la boutique</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
              {form.logo ? (
                <SmartImage src={form.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={20} /></div>
              )}
            </div>
            <label className="btn-outline cursor-pointer text-sm">
              {form.logo ? 'Changer le logo' : 'Ajouter le logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoFile(e.target.files)} />
            </label>
          </div>
        </div>

        {/* Banner upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Image de couverture</label>
          <div className="h-32 overflow-hidden rounded-lg border border-line bg-cream">
            {form.banner ? (
              <SmartImage src={form.banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={24} /></div>
            )}
          </div>
          <label className="btn-outline mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm">
            <Camera size={14} /> {form.banner ? "Changer l'image de couverture" : "Ajouter une image de couverture"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleBannerFile(e.target.files)} />
          </label>
          <p className="mt-1.5 text-xs text-ink/40">Vos photos sont automatiquement recadrées à l'affichage, sans déformation.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom de la boutique</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Utilisez le nom sous lequel vos clients vous connaissent.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Description</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">
            Présentez ce que vous vendez, votre spécialité et ce qui distingue votre boutique. Cette description est visible publiquement — mentionnez naturellement vos produits, votre style et votre localisation.
          </p>
          <p className="mt-1 text-xs text-ink/35 italic">
            Ex. : « Maison Fatou propose des vêtements féminins modernes et des pièces d'inspiration africaine à Dakar : robes, ensembles et tenues pour toutes les occasions. »
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
          <input className="input-field" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Numéro permettant à Ezial de vous contacter.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse / quartier</label>
          <input className="input-field" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Indiquez précisément où se trouve votre boutique ou votre point de retrait.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Horaires</label>
          <input className="input-field" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Indiquez les horaires auxquels les commandes peuvent être préparées ou retirées.</p>
        </div>

        {/* Fulfillment options */}
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.deliveryEnabled} onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Livraison Ezial activée
          </label>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.pickupEnabled} onChange={(e) => setForm({ ...form, pickupEnabled: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Retrait en boutique activé
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} className="btn-primary">Enregistrer</button>
          {saved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Enregistré</span>}
        </div>
      </div>

      {/* Shop GPS location — separate from the text address above. Used
          only to compute delivery fees server-side; never shown to
          customers. */}
      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5"><MapPin size={15} className="text-ink/40" /> Localisation de la boutique</h2>
          <p className="mt-1 text-xs text-ink/45">
            Cette position GPS sert uniquement à calculer les frais de livraison de vos commandes. Elle n'est jamais affichée publiquement aux clients.
          </p>
        </div>

        {!sellerSupabaseShopId ? (
          <p className="text-xs text-ink/40">Disponible une fois votre boutique connectée à votre compte vendeur.</p>
        ) : (
          <>
            {location ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-700"><Check size={15} /> Localisation GPS enregistrée</p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700"><AlertTriangle size={15} /> Localisation GPS non enregistrée</p>
            )}
            <p className="text-xs text-ink/45 leading-relaxed">
              La position enregistrée doit représenter l'emplacement réel de la boutique — pas l'endroit où vous vous trouvez en ce moment. Si vous administrez Ezial Pro loin de votre boutique, utilisez la saisie manuelle plutôt que votre position actuelle.
            </p>

            {/* Mode toggle */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setLocationMode('gps')} className={locationMode === 'gps' ? 'btn-primary' : 'btn-outline'}>
                <Navigation size={14} /> Utiliser ma position actuelle
              </button>
              <button type="button" onClick={openManualMode} className={locationMode === 'manual' ? 'btn-primary' : 'btn-outline'}>
                <Pencil size={14} /> Définir la localisation manuellement
              </button>
            </div>

            {locationMode === 'gps' && (
              <div className="space-y-3 rounded-lg border border-line p-3.5">
                <p className="text-xs text-ink/50">À utiliser uniquement lorsque vous vous trouvez physiquement dans la boutique.</p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={requestShopLocation} disabled={locationStatus === 'requesting'} className="btn-outline">
                    {locationStatus === 'requesting' ? <><Loader2 size={15} className="animate-spin" /> Détection en cours...</> : <><MapPin size={15} /> {location ? 'Mettre à jour avec ma position actuelle' : 'Utiliser ma position actuelle'}</>}
                  </button>
                  {locationSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Position enregistrée</span>}
                </div>
                {locationStatus === 'denied' && (
                  <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Accès à la position refusé. Autorisez la géolocalisation dans les réglages de votre navigateur.</p>
                )}
                {locationStatus === 'unsupported' && (
                  <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Votre navigateur ne prend pas en charge la géolocalisation.</p>
                )}
                {locationStatus === 'error' && (
                  <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Impossible d'enregistrer la position. Réessayez.</p>
                )}
              </div>
            )}

            {locationMode === 'manual' && (
              <div className="space-y-3 rounded-lg border border-line p-3.5">
                <p className="text-xs text-ink/50">
                  Adresse déclarée : {form.pickupAddress ? <span className="font-medium text-ink/70">{form.pickupAddress}</span> : 'non renseignée — voir le champ "Adresse / quartier" ci-dessus'}
                </p>

                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Rechercher une adresse ou un lieu</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-field min-w-0 flex-1"
                      placeholder="Ex. : Sacré-Cœur 3, Dakar"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearchAddress(); } }}
                    />
                    <button type="button" onClick={() => void handleSearchAddress()} disabled={searching || !searchQuery.trim()} className="btn-outline flex-shrink-0">
                      {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      <span className="hidden sm:inline">Rechercher</span>
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-ink/40">Exemple : Cité Soprim, Dakar · Sea Plaza Dakar · Sacré-Cœur 3, Dakar</p>
                </div>

                {searchError && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {searchError}</p>}

                {searchResults && searchResults.length > 0 && (
                  <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {searchResults.map((r) => (
                      <button key={r.id} type="button" onClick={() => applySearchResult(r)} className="block w-full px-3 py-2.5 text-left text-sm text-ink/75 hover:bg-cream/60">
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}

                {(selectedLabel || manualAdjusted) && (
                  <div className="rounded-lg bg-cream/50 p-2.5 space-y-0.5">
                    {selectedLabel && <p className="flex items-start gap-1.5 text-sm text-ink/75"><MapPin size={14} className="mt-0.5 flex-shrink-0 text-burgundy" /> {selectedLabel}</p>}
                    {manualAdjusted && <p className="text-xs text-ink/45">Position ajustée manuellement sur la carte.</p>}
                  </div>
                )}

                <ShopLocationMap position={manualPosition} onChange={handleMapPick} />
                <p className="text-xs text-ink/40">Cliquez sur la carte ou faites glisser le repère pour ajuster précisément l'emplacement réel de la boutique.</p>
                {manualError && <p className="text-xs text-burgundy">{manualError}</p>}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void handleSaveManualLocation()} disabled={manualSaving || !manualPosition} className="btn-primary">
                    {manualSaving ? <><Loader2 size={15} className="animate-spin" /> Enregistrement...</> : 'Enregistrer cette position'}
                  </button>
                  {locationSaved && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Position enregistrée</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
