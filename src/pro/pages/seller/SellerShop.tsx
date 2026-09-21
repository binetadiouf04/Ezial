import { useState, useEffect, useCallback } from 'react';
import { usePro } from '../../ProContext';
import VendorNoticeBanner, { type VendorNotice } from '../../components/VendorNoticeBanner';
import LocationPickerMap from '@/components/LocationPickerMap';
import { StatusChip } from '../../components/StatusChip';
import {
  fetchShopLocation, updateShopLocation, fetchShopOnboarding, updateShopOnboarding,
  submitShopForReview, uploadShopAsset, type ShopOnboardingData,
} from '@/lib/supabaseSellerShop';
import { fetchModerationFlags, latestUnresolvedFlag } from '@/lib/supabaseModeration';
import { searchAddress, type GeocodeResult } from '@/lib/geocoding';
import { quartiers } from '@/store/AppContext';
import { categories } from '@/data/categories';
import { supabase } from '@/lib/supabaseClient';
import NotificationOptIn from '@/components/NotificationOptIn';
import { Check, Image as ImageIcon, Camera, MapPin, Loader2, AlertTriangle, AlertCircle, Navigation, Pencil, Search, Send, Trash2 } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

type LocationStatus = 'idle' | 'requesting' | 'denied' | 'unsupported' | 'error';
type LocationMode = 'gps' | 'manual';

const emptyForm: ShopOnboardingData = {
  name: '', description: '', phone: '', addressText: '', neighborhood: '',
  logoUrl: '', coverUrl: '', categoryFocus: '', pickupEnabled: false,
  status: 'draft', latitude: null, longitude: null,
};

export default function SellerShop() {
  const { identifier, sellerSupabaseShopId, deleteSellerAccount } = usePro();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const result = await deleteSellerAccount();
    setDeleting(false);
    if (result.error) { setDeleteError(result.error); return; }
    window.location.hash = '/';
  };

  // Real moderation flag on this shop (public.moderation_flags), never the
  // mock moderationHistory — adapted into VendorNoticeBanner's expected
  // shape since that component only reads action/reason/vendorMessage.
  const [latestModeration, setLatestModeration] = useState<VendorNotice | null>(null);
  useEffect(() => {
    if (!sellerSupabaseShopId) return;
    let cancelled = false;
    fetchModerationFlags('shop', sellerSupabaseShopId).then((flags) => {
      if (cancelled) return;
      const active = latestUnresolvedFlag(flags);
      setLatestModeration(active ? { action: 'flagged', vendorMessage: active.note } : null);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  // Real Supabase-backed onboarding form — replaces the old mock-only
  // sellerShop/updateSellerShop state, which never actually persisted
  // anything beyond the current session.
  const [form, setForm] = useState<ShopOnboardingData>(emptyForm);
  const [formLoaded, setFormLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (!sellerSupabaseShopId) { setFormLoaded(true); return; }
    let cancelled = false;
    fetchShopOnboarding(sellerSupabaseShopId).then((data) => {
      if (cancelled) return;
      if (data) setForm(data);
      setFormLoaded(true);
    });
    return () => { cancelled = true; };
  }, [sellerSupabaseShopId]);

  // Push notifications are keyed by auth.uid(), not the shop id — fetched
  // once here since ProContext doesn't otherwise expose the raw user id.
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null));
  }, []);

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
  const [searchNotice, setSearchNotice] = useState('');
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
    setSearchNotice('');
    setManualError('');
    setLocationMode('manual');
  };

  const applySearchResult = (result: GeocodeResult, notice = '') => {
    setManualPosition({ lat: result.lat, lng: result.lng });
    setSelectedLabel(result.label);
    setManualAdjusted(false);
    setSearchResults(null);
    setSearchError('');
    setSearchNotice(notice);
  };

  const handleSearchAddress = async () => {
    const query = searchQuery.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    setSearchNotice('');
    try {
      const { results, usedFallback } = await searchAddress(query);
      const notice = usedFallback ? 'Lieu exact non trouvé. Voici les résultats les plus proches.' : '';
      if (results.length === 0) {
        setSearchError('Adresse introuvable. Essayez avec le quartier, la commune ou un lieu connu à proximité, ou placez le repère directement sur la carte.');
      } else if (results.length === 1) {
        applySearchResult(results[0], notice);
      } else {
        setSearchResults(results);
        setSearchNotice(notice);
      }
    } catch {
      setSearchError('La recherche a échoué. Vérifiez votre connexion et réessayez, ou placez le repère directement sur la carte.');
    } finally {
      setSearching(false);
    }
  };

  const handleMapPick = (lat: number, lng: number) => {
    setManualPosition({ lat, lng });
    setManualAdjusted(true);
    setSearchError('');
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

  const handleSave = async () => {
    if (!sellerSupabaseShopId) return;
    setSaveError('');
    setSaving(true);
    const result = await updateShopOnboarding(sellerSupabaseShopId, form);
    setSaving(false);
    if (result.error) { setSaveError(result.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSubmitForReview = async () => {
    setSaveError('');
    setSubmitting(true);
    const result = await submitShopForReview();
    setSubmitting(false);
    if (result.error) { setSaveError(result.error); return; }
    setForm((f) => ({ ...f, status: 'pending' }));
  };

  const handleLogoFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/') || !sellerSupabaseShopId) return;
    setUploadingLogo(true);
    const result = await uploadShopAsset(sellerSupabaseShopId, 'logo', file);
    setUploadingLogo(false);
    if (result.url) setForm((f) => ({ ...f, logoUrl: result.url as string }));
  };

  const handleBannerFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/') || !sellerSupabaseShopId) return;
    setUploadingCover(true);
    const result = await uploadShopAsset(sellerSupabaseShopId, 'cover', file);
    setUploadingCover(false);
    if (result.url) setForm((f) => ({ ...f, coverUrl: result.url as string }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Ma boutique</h1>
        <p className="mt-1 text-sm text-ink/55">Gérez les informations de votre boutique</p>
      </div>

      {latestModeration && <VendorNoticeBanner entry={latestModeration} />}

      {authUserId && <NotificationOptIn userId={authUserId} label="Notifications de nouvelles commandes" />}

      {/* Onboarding status — the seller can prepare/edit their shop while
          waiting, but only submitShopForReview() (draft → pending) is
          reachable from here; 'active' is admin-only. */}
      {formLoaded && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-ink/50">Statut de la boutique</p>
              <div className="mt-1.5"><StatusChip status={form.status} size="md" /></div>
            </div>
            {form.status === 'draft' && (
              <button onClick={() => void handleSubmitForReview()} disabled={submitting} className="btn-primary flex-shrink-0">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Envoi...</> : <><Send size={15} /> Soumettre pour validation</>}
              </button>
            )}
          </div>
          {form.status === 'draft' && <p className="text-xs text-ink/45">Complétez les informations ci-dessous puis soumettez votre boutique à l'équipe Ezial. Vous pouvez continuer à la préparer (produits inclus) en attendant.</p>}
          {form.status === 'pending' && <p className="text-xs text-ink/45">Votre demande est en cours d'examen par l'équipe Ezial. Vous pouvez continuer à préparer vos produits.</p>}
          {form.status === 'rejected' && <p className="text-xs text-burgundy">Votre demande précédente n'a pas été approuvée. Vous pouvez mettre à jour les informations puis soumettre à nouveau.</p>}
          {form.status === 'suspended' && <p className="text-xs text-burgundy">Votre boutique est actuellement suspendue par Ezial. Contactez l'équipe Ezial pour plus d'informations.</p>}
        </div>
      )}

      {locationLoaded && !location && (
        <div className="card flex items-start gap-2.5 border-amber-300 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-800">Ajoutez la localisation de votre boutique pour pouvoir recevoir des commandes en livraison.</p>
        </div>
      )}

      {/* Seller identifier — read-only */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink/50">Nom d'utilisateur / identifiant</p>
          <p className="mt-1 font-mono text-sm font-semibold text-ink">{identifier}</p>
        </div>
        <span className="text-xs text-ink/35">Non modifiable</span>
      </div>

      {/* Shop info form */}
      <div className="card p-5 space-y-5">
        {/* Logo upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Logo de la boutique</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-cream">
              {form.logoUrl ? (
                <SmartImage src={form.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={20} /></div>
              )}
            </div>
            <label className="btn-outline cursor-pointer text-sm">
              {uploadingLogo ? <><Loader2 size={14} className="animate-spin" /> Envoi...</> : form.logoUrl ? 'Changer le logo' : 'Ajouter le logo'}
              <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={(e) => void handleLogoFile(e.target.files)} />
            </label>
          </div>
        </div>

        {/* Banner upload */}
        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Image de couverture</label>
          <div className="h-32 overflow-hidden rounded-lg border border-line bg-cream">
            {form.coverUrl ? (
              <SmartImage src={form.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink/25"><ImageIcon size={24} /></div>
            )}
          </div>
          <label className="btn-outline mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm">
            <Camera size={14} /> {uploadingCover ? 'Envoi...' : form.coverUrl ? "Changer l'image de couverture" : "Ajouter une image de couverture"}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingCover} onChange={(e) => void handleBannerFile(e.target.files)} />
          </label>
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
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Catégorie principale</label>
          <select className="input-field" value={form.categoryFocus} onChange={(e) => setForm({ ...form, categoryFocus: e.target.value })}>
            <option value="">Sélectionner...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
          <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Numéro permettant à Ezial de vous contacter.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Quartier</label>
          <select className="input-field" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}>
            <option value="">Sélectionner...</option>
            {quartiers.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse</label>
          <input className="input-field" value={form.addressText} onChange={(e) => setForm({ ...form, addressText: e.target.value })} />
          <p className="mt-1 text-xs text-ink/40">Indiquez précisément où se trouve votre boutique ou votre point de retrait.</p>
        </div>

        {/* Fulfillment options — delivery via Ezial is always available;
            pickup is the one real optional toggle (shops.pickup_enabled). */}
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={form.pickupEnabled} onChange={(e) => setForm({ ...form, pickupEnabled: e.target.checked })} className="h-4 w-4 rounded border-line text-burgundy focus:ring-burgundy" />
            Retrait en boutique activé
          </label>
        </div>

        {saveError && <p className="text-xs text-burgundy">{saveError}</p>}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => void handleSave()} disabled={saving} className="btn-primary">
            {saving ? <><Loader2 size={15} className="animate-spin" /> Enregistrement...</> : 'Enregistrer'}
          </button>
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
                  Adresse déclarée : {form.addressText ? <span className="font-medium text-ink/70">{form.addressText}</span> : 'non renseignée — voir le champ "Adresse" ci-dessus'}
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
                    <button type="button" onClick={() => void handleSearchAddress()} disabled={searching || !searchQuery.trim()} className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-3 text-sm font-medium text-ink transition-all hover:border-ink/30 active:scale-[0.98] disabled:opacity-40">
                      {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      Rechercher
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-ink/40">Exemple : Cité Soprim, Dakar · Sea Plaza Dakar · Sacré-Cœur 3, Dakar</p>
                </div>

                {searchError && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {searchError}</p>}

                {searchResults && searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchNotice && <p className="text-xs text-ink/50">{searchNotice}</p>}
                    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                      {searchResults.map((r) => (
                        <button key={r.id} type="button" onClick={() => applySearchResult(r, searchNotice)} className="block w-full px-3 py-2.5 text-left text-sm text-ink/75 hover:bg-cream/60">
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedLabel || manualAdjusted) && (
                  <div className="rounded-lg bg-cream/50 p-2.5 space-y-0.5">
                    {searchNotice && !manualAdjusted && <p className="text-xs text-ink/50">{searchNotice}</p>}
                    {selectedLabel && <p className="flex items-start gap-1.5 text-sm text-ink/75"><MapPin size={14} className="mt-0.5 flex-shrink-0 text-burgundy" /> {selectedLabel}</p>}
                    {manualAdjusted && <p className="text-xs text-ink/45">Position ajustée manuellement sur la carte.</p>}
                  </div>
                )}

                <LocationPickerMap position={manualPosition} onChange={handleMapPick} />
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

      {/* Zone dangereuse */}
      <div className="card border-burgundy/20 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-burgundy">Zone dangereuse</h2>
        <p className="text-xs text-ink/50">
          La suppression anonymise votre boutique et votre compte, et masque immédiatement la boutique du catalogue.
          Vos commandes passées restent conservées pour la comptabilité.
        </p>
        <button onClick={() => { setDeleteError(''); setDeleteConfirmOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-burgundy/30 px-4 py-2.5 text-sm font-medium text-burgundy hover:bg-burgundy/5">
          <Trash2 size={16} /> Supprimer mon compte vendeur
        </button>
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="font-display text-lg font-semibold text-ink">Supprimer votre boutique ?</h3>
            <p className="mt-2 text-sm text-ink/60">
              Votre boutique sera immédiatement retirée du catalogue et ses informations anonymisées ; votre compte sera déconnecté.
              Les commandes déjà passées restent conservées pour la comptabilité. Cette action est irréversible.
            </p>
            {deleteError && <p className="mt-3 flex items-start gap-1.5 text-sm text-burgundy"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {deleteError}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirmOpen(false)} className="btn-outline flex-1">Annuler</button>
              <button onClick={() => void handleDeleteAccount()} disabled={deleting} className="flex-1 rounded-lg bg-burgundy px-4 py-2.5 text-sm font-medium text-white hover:bg-burgundy/90 disabled:opacity-60">
                {deleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
