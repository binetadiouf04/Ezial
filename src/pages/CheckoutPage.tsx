import { useState } from 'react';
import { useApp, type Order, type ShopFulfillment, type DeliveryPreference, type DeliveryStepStatus, quartierToZone, deliveryWindows } from '@/store/AppContext';
import { formatFCFA, isRealCatalogId } from '@/data/products';
import { getShop } from '@/data/shops';
import { paymentMethods as paymentMethodsData } from '@/data/payments';
import { createOrderInSupabase, type CreateOrderPayload, type CreateOrderShopFulfillmentInput, type CreatedOrderResult } from '@/lib/supabaseOrders';
import { searchAddress, type GeocodeResult } from '@/lib/geocoding';
import CheckoutSteps from '@/components/CheckoutSteps';
import LocationPickerMap from '@/components/LocationPickerMap';
import { Check, Truck, Store, Smartphone, Wallet, Clock, Loader2, AlertCircle, AlertTriangle, MapPin, Navigation, Search } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const paymentIcons: Record<string, typeof Smartphone> = { wave: Smartphone, orange: Smartphone, paypal: Wallet };
const paymentMethods = paymentMethodsData.map((p) => ({ ...p, icon: paymentIcons[p.id] ?? Smartphone }));

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';
type LocationMode = 'gps' | 'manual';

export default function CheckoutPage() {
  const { cart, cartSubtotal, clearCart, navigate, addOrder, catalogProducts } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', quartier: 'Plateau', address: '', landmark: '', instructions: '' });
  const [preference, setPreference] = useState<DeliveryPreference>({ type: 'none' });
  const [payment, setPayment] = useState('wave');
  const [shopFulfillments, setShopFulfillments] = useState<Record<string, 'delivery' | 'pickup'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationMode, setLocationMode] = useState<LocationMode>('gps');

  // Manual address search — the delivery position is independent from the
  // typed deliveryAddress text (form.address): picking a search result or
  // dragging the map marker here never writes into form.address, and no
  // raw coordinate is ever shown to the customer.
  const [manualAdjusted, setManualAdjusted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[] | null>(null);
  const [searchNotice, setSearchNotice] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const hasMockItem = cart.some((item) => !isRealCatalogId(item.productId));

  if (cart.length === 0) {
    return <div className="container-pro py-20 text-center"><p className="text-sm text-ink/60">Votre panier est vide</p><button onClick={() => navigate('/')} className="btn-primary mt-4">Découvrir les produits</button></div>;
  }

  // Un produit de démonstration Ezial n'existe pas dans Supabase — aucune
  // commande réelle ne peut jamais le référencer. On bloque tout le
  // parcours plutôt que de le retirer nous-mêmes ou de l'ignorer en
  // silence.
  if (hasMockItem) {
    return (
      <div className="container-pro py-20 text-center max-w-md mx-auto">
        <AlertTriangle size={42} className="mx-auto text-burgundy" />
        <p className="mt-4 text-sm text-ink/70">Un ou plusieurs produits de démonstration Ezial sont encore dans votre panier et doivent être retirés avant de finaliser votre commande.</p>
        <button onClick={() => navigate('/panier')} className="btn-primary mt-6">Retourner au panier</button>
      </div>
    );
  }

  const shopIdsInCart = [...new Set(cart.map((i) => i.shopId))];
  const shopsInCart = shopIdsInCart.map((id) => getShop(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const zone = quartierToZone[form.quartier];

  const getShopFulfillment = (shopId: string): 'delivery' | 'pickup' => shopFulfillments[shopId] ?? 'delivery';

  const hasDeliveryShops = shopsInCart.some((s) => getShopFulfillment(s.id) === 'delivery');
  // Estimation affichée pendant le parcours uniquement — le frais réel est
  // calculé par create_order() à partir de la distance boutiques -> client
  // (voir la RPC) et peut différer légèrement de cette estimation par
  // quartier ; le montant définitif s'affiche sur la confirmation.
  const estimatedDeliveryFee = hasDeliveryShops ? zone.fee : 0;
  const estimatedTotal = cartSubtotal + estimatedDeliveryFee;

  const validateInfo = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Ce champ est obligatoire.';
    if (!form.lastName.trim()) e.lastName = 'Ce champ est obligatoire.';
    if (!form.phone.trim()) e.phone = 'Ce champ est obligatoire.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Position du LIVREUR jamais utilisée ici — c'est la position de
  // l'appareil du client au moment du checkout qui sert de point de
  // livraison. Approximation MVP assumée : voir le message affiché dans
  // l'étape "Réception". Aucune coordonnée n'est jamais inventée si
  // l'accès est refusé ou indisponible.
  const requestLocation = () => {
    if (!('geolocation' in navigator)) { setLocationStatus('unsupported'); return; }
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationStatus('granted'); },
      () => { setLocationStatus('denied'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const openManualLocationMode = () => {
    setManualAdjusted(false);
    setSelectedLabel(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError('');
    setSearchNotice('');
    setLocationMode('manual');
  };

  const applySearchResult = (result: GeocodeResult, notice = '') => {
    setLocation({ lat: result.lat, lng: result.lng });
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
        // Never a dead end: the map right below stays available for the
        // customer to place the point by hand.
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
    setLocation({ lat, lng });
    setManualAdjusted(true);
    setSearchError('');
  };

  const mapToLocalOrder = (result: CreatedOrderResult): Order => {
    const fulfillments: ShopFulfillment[] = result.shops.map((s) => ({
      shopId: s.shop_id,
      type: s.fulfillment_type,
      deliveryFee: 0, // frais consolidé au niveau de la commande, jamais par boutique
      pickupCode: s.pickup_code ?? undefined,
      status: 'preparing',
      pickupStatus: s.fulfillment_type === 'pickup' ? 'preparing' : undefined,
    }));
    return {
      // order_number généré par create_order() — jamais localement.
      id: result.order.order_number,
      supabaseOrderId: result.order.id,
      date: result.order.created_at,
      customer: form,
      items: result.items.map((it) => ({
        productId: it.product_id,
        shopId: it.shop_id,
        quantity: it.quantity,
        variants: it.selected_options ?? {},
        unitPrice: it.unit_price,
        variantId: it.variant_id ?? undefined,
      })),
      subtotal: result.order.products_subtotal,
      delivery: result.order.delivery_fee,
      total: result.order.total_amount,
      shopFulfillments: fulfillments,
      preference: hasDeliveryShops ? preference : undefined,
      payment,
      status: (result.order.status as DeliveryStepStatus) ?? 'confirmed',
    };
  };

  const placeOrder = async () => {
    if (hasDeliveryShops && !location) {
      setSubmitError('Position de livraison manquante. Autorisez la géolocalisation ou choisissez le retrait en boutique.');
      return;
    }
    setSubmitError('');
    setProcessing(true);
    // finally garantit que "processing" ne reste jamais bloqué, y compris
    // sur une exception inattendue — le panier n'est jamais vidé tant que
    // la commande n'est pas réellement créée dans Supabase.
    try {
      const shopFulfillmentsPayload: Record<string, CreateOrderShopFulfillmentInput> = {};
      for (const shop of shopsInCart) {
        const type = getShopFulfillment(shop.id);
        shopFulfillmentsPayload[shop.id] = {
          type,
          date: type === 'delivery' && preference.type === 'preferred' ? preference.date ?? null : null,
          window: type === 'delivery' && preference.type === 'preferred' ? preference.window ?? null : null,
        };
      }

      // Jamais de prix, sous-total, réduction, frais de livraison ou total
      // dans ce payload — create_order() relit tout depuis Supabase.
      const payload: CreateOrderPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        neighborhood: form.quartier,
        deliveryAddress: form.address.trim() || undefined,
        deliveryNotes: [form.landmark.trim() && `Point de repère : ${form.landmark.trim()}`, form.instructions.trim()].filter(Boolean).join('. ') || undefined,
        latitude: hasDeliveryShops ? location?.lat ?? null : null,
        longitude: hasDeliveryShops ? location?.lng ?? null : null,
        preferredDeliveryDate: hasDeliveryShops && preference.type === 'preferred' ? preference.date ?? null : null,
        preferredDeliverySlot: hasDeliveryShops && preference.type === 'preferred' ? preference.window ?? null : null,
        paymentMethod: payment,
        shopFulfillments: shopFulfillmentsPayload,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          selectedOptions: item.variants,
          quantity: item.quantity,
        })),
      };

      const outcome = await createOrderInSupabase(payload);
      if ('error' in outcome) {
        setSubmitError(outcome.error);
        return;
      }

      const order = mapToLocalOrder(outcome.result);
      addOrder(order);
      clearCart();
      navigate(`/commande/${order.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setProcessing(false);
    }
  };

  const steps = [
    { id: 'info', label: 'Coordonnées' },
    { id: 'fulfillment', label: 'Réception' },
    { id: 'payment', label: 'Paiement' },
    { id: 'confirm', label: 'Confirmation' },
  ];

  // Pickup-only shops (to show pickup cards)
  const pickupShops = shopsInCart.filter((s) => getShopFulfillment(s.id) === 'pickup');

  return (
    <div className="container-pro py-6 max-w-3xl">
      <div className="mb-8"><CheckoutSteps steps={steps} current={step} /></div>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Step 0: Customer info */}
          {step === 0 && (
            <div className="space-y-5 fade-in">
              <h2 className="font-display text-xl font-semibold">Vos coordonnées</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Prénom</label>
                  <input className="input-field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  {errors.firstName && <p className="mt-1 text-xs text-burgundy">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Nom</label>
                  <input className="input-field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  {errors.lastName && <p className="mt-1 text-xs text-burgundy">{errors.lastName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Téléphone</label>
                <input className="input-field" placeholder="+221 ..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                {errors.phone && <p className="mt-1 text-xs text-burgundy">{errors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Email (optionnel)</label>
                <input type="email" className="input-field" placeholder="vous@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Quartier</label>
                <select className="input-field" value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })}>
                  {Object.keys(quartierToZone).map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Adresse de livraison</label>
                <input className="input-field" placeholder="Ex : Villa 12, Rue 4, Sacré-Cœur 3" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Point de repère (optionnel)</label>
                <input className="input-field" placeholder="Ex: près de la pharmacie, en face de..." value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Instructions pour la livraison (facultatif)</label>
                <textarea className="input-field" rows={2} placeholder="Ex. Appelez-moi en arrivant, portail noir..." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
              </div>
              <button onClick={() => { if (validateInfo()) setStep(1); }} className="btn-primary w-full">Continuer</button>
            </div>
          )}

          {/* Step 1: Fulfillment */}
          {step === 1 && (
            <div className="space-y-5 fade-in">
              <h2 className="font-display text-xl font-semibold">Mode de réception</h2>

              {/* Per-shop delivery/pickup choice */}
              {shopsInCart.map((shop) => {
                const current = getShopFulfillment(shop.id);
                const shopItems = cart.filter((i) => i.shopId === shop.id);
                return (
                  <div key={shop.id} className="card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <SmartImage src={shop.logo} alt="" className="h-8 w-8 rounded-full object-cover" />
                      <p className="text-sm font-semibold text-ink">{shop.name}</p>
                      <span className="text-xs text-ink/40 ml-auto">{shopItems.length} article{shopItems.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      <button onClick={() => setShopFulfillments({ ...shopFulfillments, [shop.id]: 'delivery' })} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${current === 'delivery' ? 'border-burgundy bg-burgundy/5' : 'border-line'}`}>
                        <Truck size={18} className={current === 'delivery' ? 'text-burgundy' : 'text-ink/40'} />
                        <div><p className="text-sm font-medium text-ink">Livraison</p><p className="text-xs text-ink/50">Dakar sous 4–48 h</p></div>
                        {current === 'delivery' && <Check size={16} className="ml-auto text-burgundy" />}
                      </button>
                      {shop.pickupEnabled && (
                        <button onClick={() => setShopFulfillments({ ...shopFulfillments, [shop.id]: 'pickup' })} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${current === 'pickup' ? 'border-burgundy bg-burgundy/5' : 'border-line'}`}>
                          <Store size={18} className={current === 'pickup' ? 'text-burgundy' : 'text-ink/40'} />
                          <div>
                            <p className="text-sm font-medium text-ink">Retrait en boutique</p>
                            <p className="text-xs text-ink/50">{shop.address} · {shop.pickupEta}</p>
                          </div>
                          {current === 'pickup' && <Check size={16} className="ml-auto text-burgundy" />}
                        </button>
                      )}
                    </div>
                    {current === 'pickup' && (
                      <div className="rounded-lg bg-cream/40 p-3 fade-in">
                        <p className="text-xs text-ink/55 leading-relaxed">Vous pourrez récupérer votre commande dès qu'elle sera marquée prête. {shop.pickupEta}.</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ONE consolidated Ezial delivery card */}
              {hasDeliveryShops && (
                <div className="rounded-xl border border-burgundy/20 bg-burgundy/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <Truck size={20} className="text-burgundy" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Livraison Ezial</p>
                      <p className="text-xs text-ink/55">Dakar sous 4–48 h · ~{formatFCFA(zone.fee)} (estimation)</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-ink/45 leading-relaxed">Ezial regroupe vos articles des différentes boutiques en une seule livraison vers votre adresse. Le frais exact est calculé à la validation, selon la distance réelle.</p>
                </div>
              )}

              {/* Position de livraison — requise dès qu'une boutique livre */}
              {hasDeliveryShops && (
                <div className="rounded-xl border border-line p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5"><MapPin size={16} className="text-burgundy" /> Position de livraison</h3>
                  <p className="text-xs font-medium text-ink/70 leading-relaxed">
                    Cette position est utilisée pour calculer vos frais de livraison.
                  </p>

                  {location ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-green-700"><Check size={15} /> Position de livraison définie</p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700"><AlertTriangle size={15} /> Position de livraison non définie</p>
                  )}

                  {/* Mode toggle */}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLocationMode('gps')} className={locationMode === 'gps' ? 'btn-primary' : 'btn-outline'}>
                      <Navigation size={14} /> Utiliser ma position actuelle
                    </button>
                    <button type="button" onClick={openManualLocationMode} className={locationMode === 'manual' ? 'btn-primary' : 'btn-outline'}>
                      <Search size={14} /> Rechercher une adresse
                    </button>
                  </div>

                  {locationMode === 'gps' && (
                    <div className="space-y-2 rounded-lg border border-line p-3.5">
                      <p className="text-xs text-ink/50">Utilise la position GPS actuelle de votre appareil.</p>
                      <button type="button" onClick={requestLocation} disabled={locationStatus === 'requesting'} className="btn-outline w-full">
                        {locationStatus === 'requesting' ? <><Loader2 size={15} className="animate-spin" /> Détection en cours...</> : <><MapPin size={15} /> {locationStatus === 'granted' ? 'Actualiser ma position' : 'Utiliser ma position actuelle'}</>}
                      </button>
                      {locationStatus === 'denied' && (
                        <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Accès à la position refusé. Autorisez la géolocalisation dans les réglages de votre navigateur, ou choisissez le retrait en boutique si disponible.</p>
                      )}
                      {locationStatus === 'unsupported' && (
                        <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Votre navigateur ne prend pas en charge la géolocalisation. Choisissez le retrait en boutique si disponible.</p>
                      )}
                    </div>
                  )}

                  {locationMode === 'manual' && (
                    <div className="space-y-3 rounded-lg border border-line p-3.5">
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

                      <LocationPickerMap position={location} onChange={handleMapPick} />
                      <p className="text-xs text-ink/40">Cliquez sur la carte ou faites glisser le repère pour préciser l'emplacement exact de livraison. Vous pouvez rechercher une autre adresse à tout moment.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Pickup shop info */}
              {pickupShops.map((shop) => (
                <div key={`pickup-${shop.id}`} className="rounded-lg bg-cream/40 p-3 space-y-1">
                  <p className="text-xs text-ink/55 flex items-center gap-1.5"><Store size={12} /> {shop.name} · {shop.address}</p>
                  <p className="text-xs text-ink/55 flex items-center gap-1.5"><Clock size={12} /> {shop.pickupEta}</p>
                </div>
              ))}

              {/* Delivery preference (only if at least one delivery) */}
              {hasDeliveryShops && (
                <div className="border-t border-line pt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-ink">Avez-vous une préférence de livraison ?</h3>
                  <div className="space-y-2">
                    <button onClick={() => setPreference({ type: 'none' })} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${preference.type === 'none' ? 'border-burgundy bg-burgundy/5' : 'border-line'}`}>
                      <Clock size={16} className={preference.type === 'none' ? 'text-burgundy' : 'text-ink/40'} />
                      <span className="text-sm font-medium text-ink">Sans préférence</span>
                    </button>
                    <button onClick={() => setPreference({ type: 'preferred', date: tomorrowISO(), window: deliveryWindows[0] })} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${preference.type === 'preferred' ? 'border-burgundy bg-burgundy/5' : 'border-line'}`}>
                      <Clock size={16} className={preference.type === 'preferred' ? 'text-burgundy' : 'text-ink/40'} />
                      <span className="text-sm font-medium text-ink">Avec préférence</span>
                    </button>
                  </div>
                  {preference.type === 'preferred' && (
                    <div className="space-y-3 fade-in pl-1">
                      <div>
                        <label className="block text-xs font-medium text-ink/60 mb-1.5">Date souhaitée</label>
                        <input type="date" className="input-field" min={tomorrowISO()} value={preference.date} onChange={(e) => setPreference({ ...preference, date: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink/60 mb-1.5">Créneau préféré</label>
                        <select className="input-field" value={preference.window} onChange={(e) => setPreference({ ...preference, window: e.target.value })}>
                          {deliveryWindows.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <p className="text-xs text-ink/40 leading-relaxed flex items-start gap-1.5">
                        <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                        Nous ferons notre possible pour respecter votre préférence. Le créneau n'est pas garanti.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="btn-outline flex-1">Retour</button>
                <button onClick={() => setStep(2)} disabled={hasDeliveryShops && !location} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">Continuer</button>
              </div>
            </div>
          )}

          {/* Step 2: Payment + Summary */}
          {step === 2 && (
            <div className="space-y-5 fade-in">
              <h2 className="font-display text-xl font-semibold">Paiement</h2>

              {/* Product-first summary */}
              <div className="card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-ink">Votre commande</h3>
                <div className="space-y-4">
                  {cart.map((item, i) => {
                    const p = catalogProducts.find((cp) => cp.id === item.productId);
                    if (!p) return null;
                    const price = item.unitPrice ?? p.price;
                    const shop = getShop(item.shopId);
                    return (
                      <div key={i} className="flex gap-3">
                        <SmartImage src={p.images[0]} alt="" className="h-16 w-14 rounded-lg object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink line-clamp-1">{p.name}</p>
                          {Object.entries(item.variants).length > 0 && (
                            <p className="text-xs text-ink/50 mt-0.5">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                          )}
                          <p className="text-xs text-ink/50">Quantité : {item.quantity}</p>
                          {shop && <p className="text-[11px] text-ink/35 mt-0.5">Vendu par {shop.name}</p>}
                        </div>
                        <span className="text-sm font-semibold text-ink flex-shrink-0">{formatFCFA(price * item.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-line pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-ink/60">Produits</span><span className="font-medium">{formatFCFA(cartSubtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-ink/60">Livraison Ezial (estimation)</span><span className="font-medium">{estimatedDeliveryFee > 0 ? formatFCFA(estimatedDeliveryFee) : 'Gratuit'}</span></div>
                  <div className="border-t border-line pt-1.5 flex justify-between"><span className="font-medium text-ink">Total estimé</span><span className="font-semibold text-ink">{formatFCFA(estimatedTotal)}</span></div>
                  {hasDeliveryShops && <p className="text-[11px] text-ink/40">Le montant exact de la livraison est calculé à la validation et confirmé sur votre reçu.</p>}
                </div>
              </div>

              <p className="text-sm text-ink/55">Choisissez votre mode de paiement. Simulation uniquement, aucun paiement réel.</p>
              <div className="space-y-3">
                {paymentMethods.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button key={p.id} onClick={() => setPayment(p.id)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors ${payment === p.id ? 'border-burgundy bg-burgundy/5' : 'border-line'}`}>
                      <Icon size={20} className={payment === p.id ? 'text-burgundy' : 'text-ink/40'} />
                      <div><p className="text-sm font-medium text-ink">{p.label}</p><p className="text-xs text-ink/45">{p.description}</p></div>
                      {payment === p.id && <Check size={17} className="ml-auto text-burgundy" />}
                    </button>
                  );
                })}
              </div>

              {submitError && (
                <p className="flex items-start gap-1.5 rounded-lg bg-burgundy/5 p-3 text-sm text-burgundy">
                  <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-outline flex-1" disabled={processing}>Retour</button>
                <button onClick={placeOrder} className="btn-primary flex-1" disabled={processing}>
                  {processing ? <><Loader2 size={17} className="animate-spin" /> Traitement...</> : `Payer ${formatFCFA(estimatedTotal)} (estimé)`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:sticky lg:top-[90px] lg:self-start">
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-ink">Votre commande</h3>
            <div className="max-h-56 space-y-3 overflow-y-auto">
              {cart.map((item, i) => {
                const p = catalogProducts.find((cp) => cp.id === item.productId);
                if (!p) return null;
                const price = item.unitPrice ?? p.price;
                const shop = getShop(item.shopId);
                return (
                  <div key={i} className="flex gap-2.5">
                    <SmartImage src={p.images[0]} alt="" className="h-12 w-10 rounded object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink line-clamp-1">{p.name}</p>
                      {Object.entries(item.variants).length > 0 && (
                        <p className="text-[11px] text-ink/45">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
                      )}
                      <p className="text-[11px] text-ink/35">Vendu par {shop?.name}</p>
                    </div>
                    <span className="text-xs font-medium text-ink flex-shrink-0">{formatFCFA(price * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink/60">Produits</span><span className="font-medium">{formatFCFA(cartSubtotal)}</span></div>
              <div className="flex justify-between">
                <span className="text-ink/60">Livraison Ezial</span>
                <span className="font-medium">{step >= 1 && estimatedDeliveryFee > 0 ? `~${formatFCFA(estimatedDeliveryFee)}` : step < 1 ? 'À calculer' : 'Gratuit'}</span>
              </div>
              <div className="border-t border-line pt-1.5 flex justify-between">
                <span className="font-medium text-ink">Total estimé</span>
                <span className="font-semibold text-ink">{formatFCFA(estimatedTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
