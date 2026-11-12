import { lazy, Suspense, useEffect, useState } from 'react';
import { useApp, type Order, type ShopFulfillment, type DeliveryPreference, type DeliveryStepStatus, quartierToZone, deliveryWindows } from '@/store/AppContext';
import { formatFCFA, isRealCatalogId, getVariantPrice } from '@/data/products';
import { fabricSaleModeUnit, formatFabricQuantity } from '@/data/categories';
import PriceDisplay from '@/components/PriceDisplay';
import { getShop } from '@/data/shops';
import { paymentMethods as paymentMethodsData } from '@/data/payments';
import { createOrderInSupabase, recordOrderCgvConsent, type CreateOrderPayload, type CreateOrderShopFulfillmentInput, type CreatedOrderResult } from '@/lib/supabaseOrders';
import { validatePromoCode } from '@/lib/supabasePromoCode';
import { reverseGeocode, type GeocodeResult } from '@/lib/geocoding';
import { useAddressSearch } from '@/lib/useAddressSearch';
import { estimateDeliveryFee, DELIVERY_FEE_FLOOR } from '@/lib/deliveryEstimate';
import { fetchDeliveryFeeQuote, type DeliveryFeeQuote } from '@/lib/supabaseDeliveryFee';
import CheckoutSteps from '@/components/CheckoutSteps';
import GoogleLocationPickerMap from '@/components/GoogleLocationPickerMap';
import PhoneField from '@/components/PhoneField';
import CustomerAuthPanel from '@/components/CustomerAuthPanel';
import { Check, Truck, Store, Smartphone, Clock, Loader2, AlertCircle, AlertTriangle, MapPin, Navigation, Search, ArrowLeft, Gift, UserCheck, ChevronDown, Wallet, FileText, Lock } from 'lucide-react';
import SmartImage from '@/components/SmartImage';

const InfoSheet = lazy(() => import('@/components/info/InfoSheet'));

const paymentIcons: Record<string, typeof Smartphone> = { wave: Smartphone, orange: Smartphone };
const paymentMethods = paymentMethodsData.map((p) => ({ ...p, icon: paymentIcons[p.id] ?? Smartphone }));

// Mirrors create_order()'s own fixed amount — for display only. The real
// charge always comes back from the RPC's response.
const GIFT_WRAP_FEE = 2000;

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// Reasonable draft of the checkout info form — never the payment method or
// anything order-specific — so a customer who refreshes or comes back
// later doesn't have to retype their name/phone/address every time. Kept
// even after a successful order, on purpose: it's exactly as useful for
// the next order. Silently no-ops if localStorage is unavailable.
const CHECKOUT_DRAFT_KEY = 'ezial-checkout-draft-v1';
type CheckoutForm = { firstName: string; lastName: string; phone: string; email: string; quartier: string; landmark: string; instructions: string };

function loadDraftForm(): Partial<CheckoutForm> {
  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistDraftForm(form: CheckoutForm): void {
  try {
    localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(form));
  } catch {
    // Ignore — the form still works for the current session.
  }
}

// Pastille de sélection des choix exclusifs (réception, préférence, paiement).
function Radio({ active }: { active: boolean }) {
  return (
    <span aria-hidden="true" className={`ml-auto flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border ${active ? 'border-burgundy' : 'border-ink/30'}`}>
      {active && <span className="h-2.5 w-2.5 rounded-full bg-burgundy" />}
    </span>
  );
}

// Shown instead of the checkout to a signed-out visitor: same two-choice
// shape as "Mon compte" (AccountEntryPage), then the shared login/signup
// panel. Signing in re-renders CheckoutPage signed-in, on the spot; a
// signup awaiting email confirmation comes back here via the confirmation
// link (resumeRouteAfterConfirmation).
function CheckoutAccountStep({ onBackToCart }: { onBackToCart: () => void }) {
  const [authStep, setAuthStep] = useState<'entry' | 'login' | 'signup'>('entry');
  if (authStep !== 'entry') {
    return (
      <div className="container-pro">
        <CustomerAuthPanel
          onBack={() => setAuthStep('entry')}
          initialView={authStep}
          subtitle={authStep === 'login' ? 'Connectez-vous pour finaliser votre commande.' : 'Créez votre compte pour finaliser votre commande.'}
          resumeRouteAfterConfirmation="/checkout"
        />
      </div>
    );
  }
  return (
    <div className="container-pro">
      <div className="mx-auto max-w-sm py-10 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-burgundy"><UserCheck size={26} /></div>
        <h1 className="font-display text-2xl font-semibold text-ink">Un compte pour commander</h1>
        <p className="mt-2 text-sm text-ink/55">Votre compte Ezial vous permet de recevoir votre facture et de suivre votre commande jusqu'à la livraison.</p>
        <div className="mt-8 flex flex-col gap-2.5">
          <button onClick={() => setAuthStep('signup')} className="btn-primary w-full">Créer mon compte</button>
          <button onClick={() => setAuthStep('login')} className="btn-outline w-full">J'ai déjà un compte</button>
          <button onClick={onBackToCart} className="mt-1 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"><ArrowLeft size={15} /> Retour au panier</button>
        </div>
      </div>
    </div>
  );
}

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';
type LocationMode = 'gps' | 'manual';

export default function CheckoutPage() {
  const { cart, cartSubtotal, clearCart, navigate, addOrder, catalogProducts, customerUser, authLoading } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CheckoutForm>(() => ({ firstName: '', lastName: '', phone: '', email: '', quartier: 'Plateau', landmark: '', instructions: '', ...loadDraftForm() }));
  const [preference, setPreference] = useState<DeliveryPreference>({ type: 'none' });
  const [payment, setPayment] = useState('wave');
  const [shopFulfillments, setShopFulfillments] = useState<Record<string, 'delivery' | 'pickup'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Distinct from any marketing-opt-in checkbox elsewhere — this one only
  // ever means "j'ai lu et j'accepte les CGV", unchecked by default, and
  // the version + timestamp are recorded server-side via record_order_cgv_consent()
  // right after the order itself is created.
  // Les conditions générales s'ouvrent dans une fenêtre, sans quitter le paiement.
  const [cgvOpen, setCgvOpen] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationMode, setLocationMode] = useState<LocationMode>('gps');
  // Real-road-distance quote from calculate-delivery-fee (Google Routes
  // API) — preferred for display the moment it resolves, and the only
  // thing ever sent on to create_order() as routeDistanceKm. Never
  // required: estimateDeliveryFee()'s Haversine estimate below covers
  // display while this is loading or if it fails, and create_order() has
  // its own Haversine fallback if this is simply never sent.
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryFeeQuote | null>(null);

  // Gift order — kept out of the persisted draft on purpose (recipient
  // details are typically one-off, unlike the buyer's own info). When
  // active, the recipient's own address/landmark replace the buyer's for
  // delivery purposes; the buyer's firstName/lastName/phone/email are never
  // touched.
  const [isGift, setIsGift] = useState(false);
  const [giftRecipientName, setGiftRecipientName] = useState('');
  const [giftRecipientPhone, setGiftRecipientPhone] = useState('');
  const [giftRecipientLandmark, setGiftRecipientLandmark] = useState('');
  const [giftShowBuyerName, setGiftShowBuyerName] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftWrap, setGiftWrap] = useState(false);

  // Promo code — this preview is purely for display; create_order() always
  // re-validates and recomputes the discount itself server-side, so a code
  // that becomes invalid between the preview and payment is simply rejected
  // there, never silently trusted here.
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Manual address search — no raw coordinate is ever shown to the
  // customer; selectedLabel is the reverse-geocoded human-readable form of
  // wherever the map/search lands on, and the only address text sent with
  // the order (there's no separate manually-typed address field anymore).
  const [manualAdjusted, setManualAdjusted] = useState(false);
  const addressSearch = useAddressSearch();
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  useEffect(() => { persistDraftForm(form); }, [form]);

  // Prefill from the connected profile — these fields were already given at
  // signup, so the account's own values take priority over a stale draft
  // (e.g. leftover test input from a previous, unfinished checkout) and only
  // fall back to the draft/blank when the account itself has nothing on
  // file. Runs once when the profile loads; the customer can still edit any
  // of it before paying.
  useEffect(() => {
    if (!customerUser) return;
    setForm((prev) => ({
      ...prev,
      firstName: customerUser.firstName || prev.firstName,
      lastName: customerUser.lastName || prev.lastName,
      phone: customerUser.phone || prev.phone,
      email: customerUser.email || prev.email,
      quartier: customerUser.quartier || prev.quartier,
      landmark: customerUser.landmark || prev.landmark,
    }));
  }, [customerUser]);

  // A minimal, self-contained echo of the delivery-shop-ids-in-cart
  // computation further down (which needs shopsInCart, only built after
  // the early returns below) — hooks can never be conditional, so this
  // quote-fetching effect has to live above those returns, keyed off
  // values already available from cart/shopFulfillments alone.
  const earlyDeliveryShopIds = [...new Set(
    cart.filter((i) => (shopFulfillments[i.shopId] ?? 'delivery') === 'delivery').map((i) => i.shopId),
  )];
  const earlyDeliveryShopIdsKey = earlyDeliveryShopIds.slice().sort().join(',');

  useEffect(() => {
    if (earlyDeliveryShopIds.length === 0 || !location) { setDeliveryQuote(null); return; }
    let cancelled = false;
    // Debounced — a map drag or quartier change fires many updates in a
    // row; only the one the customer settles on should spend a Google call.
    const timer = setTimeout(() => {
      void fetchDeliveryFeeQuote(earlyDeliveryShopIds, location.lat, location.lng).then((quote) => {
        if (!cancelled) setDeliveryQuote(quote);
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earlyDeliveryShopIdsKey, location?.lat, location?.lng]);

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

  // Un compte est obligatoire pour commander : c'est lui qui permet de
  // recevoir la facture et de suivre la commande. create_order() refuse de
  // toute façon un appel sans session côté serveur ; cet écran l'explique
  // avant, sans jamais toucher au panier (localStorage).
  if (authLoading) {
    return <div className="container-pro flex justify-center py-20"><Loader2 size={24} className="animate-spin text-ink/40" /></div>;
  }
  if (!customerUser) {
    return <CheckoutAccountStep onBackToCart={() => navigate('/panier')} />;
  }

  const shopIdsInCart = [...new Set(cart.map((i) => i.shopId))];
  const shopsInCart = shopIdsInCart.map((id) => getShop(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const getShopFulfillment = (shopId: string): 'delivery' | 'pickup' => shopFulfillments[shopId] ?? 'delivery';

  const hasDeliveryShops = shopsInCart.some((s) => getShopFulfillment(s.id) === 'delivery');

  // Whether there's an actual choice to show at all — a shop with no pickup
  // option is always delivery, so a per-shop card with one single,
  // permanently-selected "Livraison" button is pure noise when it's true
  // for every shop in the cart; the one consolidated Ezial delivery card
  // below already says that plainly.
  const anyShopOffersPickup = shopsInCart.some((s) => s.pickupEnabled);

  // Live mirror of create_order()'s own formula (Haversine, 100 FCFA/km,
  // min 800, max 4000) — for display only, recalculated the instant the
  // delivery position or the shop coordinates change. Never sent to the
  // RPC and never assumed to be the final charge: the amount actually
  // billed always comes back from create_order() itself. If any delivery
  // shop hasn't set its real coordinates yet in Ezial Pro, this stays
  // null rather than showing a number that could be wrong.
  const deliveryShopsInCart = shopsInCart.filter((s) => getShopFulfillment(s.id) === 'delivery');
  const deliveryShopCoords = deliveryShopsInCart.length > 0 && deliveryShopsInCart.every((s) => s.latitude != null && s.longitude != null)
    ? deliveryShopsInCart.map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }))
    : null;
  const deliveryFeeEstimate = hasDeliveryShops && location && deliveryShopCoords
    ? estimateDeliveryFee(deliveryShopCoords, location)
    : null;
  // The real Google Routes API quote, once it resolves, replaces the
  // Haversine estimate for display — same source create_order() itself
  // will use, so the number shown stops being an approximation.
  const effectiveDeliveryFeeEstimate = deliveryQuote?.feeFcfa ?? deliveryFeeEstimate;
  const deliveryFeeKnown = effectiveDeliveryFeeEstimate !== null;
  const deliveryFeeText = !hasDeliveryShops
    ? 'Gratuit'
    : deliveryFeeKnown
      ? `Livraison estimée : ${formatFCFA(effectiveDeliveryFeeEstimate)}`
      : `Livraison à partir de ${formatFCFA(DELIVERY_FEE_FLOOR)}`;
  const estimatedDeliveryFee = hasDeliveryShops ? (deliveryFeeKnown ? effectiveDeliveryFeeEstimate : DELIVERY_FEE_FLOOR) : 0;
  const estimatedGiftWrapFee = giftWrap ? GIFT_WRAP_FEE : 0;
  const promoDiscount = appliedPromo?.discountAmount ?? 0;
  const estimatedTotal = Math.max(0, cartSubtotal + estimatedDeliveryFee + estimatedGiftWrapFee - promoDiscount);

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || promoChecking) return;
    setPromoError('');
    setPromoChecking(true);
    const result = await validatePromoCode(promoInput, cartSubtotal);
    setPromoChecking(false);
    if (!result.valid) { setPromoError(result.message ?? 'Code promo invalide.'); setAppliedPromo(null); return; }
    setAppliedPromo({ code: result.code ?? promoInput.trim().toUpperCase(), discountAmount: result.discountAmount ?? 0 });
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError('');
  };

  const validateContactInfo = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Ce champ est obligatoire.';
    if (!form.lastName.trim()) e.lastName = 'Ce champ est obligatoire.';
    if (!form.phone.trim()) e.phone = 'Ce champ est obligatoire.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateDeliveryInfo = () => {
    const e: Record<string, string> = {};
    if (isGift) {
      if (!giftRecipientName.trim()) e.giftRecipientName = 'Ce champ est obligatoire.';
      if (!giftRecipientPhone.trim()) e.giftRecipientPhone = 'Ce champ est obligatoire.';
    }
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
    addressSearch.reset();
    setLocationMode('manual');
  };

  const applySearchResult = (result: GeocodeResult) => {
    setLocation({ lat: result.lat, lng: result.lng });
    setSelectedLabel(result.label);
    setManualAdjusted(false);
    addressSearch.clearResults();
    addressSearch.setQuery('');
  };

  const handleMapPick = (lat: number, lng: number) => {
    // The clicked/dragged point is always the real source of truth for
    // delivery, immediately — reverse geocoding below only fills in a
    // human-readable label for it, never changes the coordinates.
    setLocation({ lat, lng });
    setManualAdjusted(true);
    setSelectedLabel(null);
    setResolvingAddress(true);
    reverseGeocode(lat, lng).then((label) => {
      setResolvingAddress(false);
      setSelectedLabel(label);
    });
  };

  const mapToLocalOrder = (result: CreatedOrderResult): Order => {
    const fulfillments: ShopFulfillment[] = result.shops.map((s) => ({
      shopId: s.shop_id,
      orderShopId: s.id,
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
        // Snapshotted now, from the live catalog, so this line still shows
        // its real name later even if the product is archived by then.
        productName: catalogProducts.find((cp) => cp.id === it.product_id)?.name,
      })),
      subtotal: result.order.products_subtotal,
      discount: result.order.discount_amount ?? 0,
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
        customerId: customerUser?.id ?? null,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        neighborhood: form.quartier,
        // Cadeau : la destination réelle du colis est celle du destinataire,
        // jamais celle de l'acheteur — firstName/lastName/phone/email
        // au-dessus restent toujours ceux de l'acheteur.
        // No manual address field anymore — the map (search or pin drop) is
        // the single source of truth for where to deliver; selectedLabel is
        // its reverse-geocoded human-readable form, when one was resolved.
        deliveryAddress: selectedLabel?.trim() || undefined,
        deliveryNotes: isGift
          ? (giftRecipientLandmark.trim() ? `Point de repère : ${giftRecipientLandmark.trim()}` : undefined)
          : [form.landmark.trim() && `Point de repère : ${form.landmark.trim()}`, form.instructions.trim()].filter(Boolean).join('. ') || undefined,
        latitude: hasDeliveryShops ? location?.lat ?? null : null,
        longitude: hasDeliveryShops ? location?.lng ?? null : null,
        // The real Google Routes API distance for this exact delivery, when
        // it resolved — create_order() only ever uses it after sanity-
        // checking it against its own Haversine distance, and simply uses
        // that Haversine distance (unchanged behavior) whenever this is
        // absent (quote still loading, or the call failed).
        routeDistanceKm: hasDeliveryShops ? deliveryQuote?.distanceKm : undefined,
        preferredDeliveryDate: hasDeliveryShops && preference.type === 'preferred' ? preference.date ?? null : null,
        preferredDeliverySlot: hasDeliveryShops && preference.type === 'preferred' ? preference.window ?? null : null,
        paymentMethod: payment,
        isGift,
        giftRecipientName: isGift ? giftRecipientName.trim() : undefined,
        giftRecipientPhone: isGift ? giftRecipientPhone.trim() : undefined,
        giftShowBuyerName: isGift ? giftShowBuyerName : undefined,
        giftMessage: isGift ? (giftMessage.trim() || undefined) : undefined,
        giftWrap: isGift ? giftWrap : undefined,
        promoCode: appliedPromo?.code,
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
      // Best-effort: the order itself is already placed by this point, so a
      // failure here is never shown as a checkout error — it would just
      // mean cgv_accepted_at stays null for this order, visible to an admin
      // reviewing it later, not a reason to alarm the customer.
      if (outcome.result.order.id) void recordOrderCgvConsent(outcome.result.order.id);
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
    { id: 'delivery', label: 'Livraison' },
    { id: 'payment', label: 'Paiement' },
  ];

  // Pickup-only shops (to show pickup cards)
  const pickupShops = shopsInCart.filter((s) => getShopFulfillment(s.id) === 'pickup');

  // --- Présentation seulement : le récapitulatif est construit une fois et
  // réutilisé (colonne latérale sur ordinateur, bloc repliable sur mobile aux
  // étapes 1 et 2, bloc complet à l'étape 3 sur mobile). Mêmes données, mêmes
  // montants, mêmes libellés que précédemment.
  const summaryLines = cart.map((item, i) => {
    const p = catalogProducts.find((cp) => cp.id === item.productId);
    if (!p) return null;
    const price = item.unitPrice ?? p.price;
    const shop = getShop(item.shopId);
    const { oldPrice: unitOldPrice } = getVariantPrice(p, item.variants);
    return (
      <div key={i} className="flex gap-3">
        <SmartImage src={p.thumbnailUrl || p.images[0]} alt="" className="h-[72px] w-[58px] flex-shrink-0 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{p.name}</p>
          {Object.entries(item.variants).length > 0 && (
            <p className="mt-0.5 text-xs text-ink/55">{Object.entries(item.variants).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
          )}
          <p className="text-xs text-ink/55">Quantité : {p.saleMode ? `${formatFabricQuantity(item.quantity)} ${fabricSaleModeUnit[p.saleMode]}` : item.quantity}</p>
          {shop && <p className="mt-0.5 text-[11px] text-ink/40">Vendu par {shop.name}</p>}
        </div>
        <div className="flex-shrink-0 text-right"><PriceDisplay price={price * item.quantity} oldPrice={unitOldPrice ? unitOldPrice * item.quantity : undefined} size="sm" /></div>
      </div>
    );
  });

  const firstSummaryProduct = catalogProducts.find((cp) => cp.id === cart[0]?.productId);

  const summaryTotals = (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between"><span className="text-ink/60">Produits</span><span className="font-medium text-ink">{formatFCFA(cartSubtotal)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-ink/60">{hasDeliveryShops && deliveryFeeKnown ? 'Livraison Ezial (estimation)' : 'Livraison Ezial'}</span><span className="text-right font-medium text-ink">{!hasDeliveryShops ? 'Gratuit' : deliveryFeeKnown ? formatFCFA(effectiveDeliveryFeeEstimate) : `À partir de ${formatFCFA(DELIVERY_FEE_FLOOR)}`}</span></div>
      {isGift && giftWrap && <div className="flex justify-between"><span className="text-ink/60">Emballage cadeau</span><span className="font-medium text-ink">{formatFCFA(GIFT_WRAP_FEE)}</span></div>}
      {appliedPromo && <div className="flex justify-between text-green-700"><span>Code promo {appliedPromo.code}</span><span className="font-medium">-{formatFCFA(appliedPromo.discountAmount)}</span></div>}
      <div className="flex items-baseline justify-between rounded-lg bg-burgundy/[0.06] px-3 py-3">
        <span className="text-sm font-semibold text-ink">{hasDeliveryShops && !deliveryFeeKnown ? 'Total à partir de' : 'Total estimé'}</span>
        <span className="text-lg font-bold leading-none text-burgundy">{formatFCFA(estimatedTotal)}</span>
      </div>
      {hasDeliveryShops && <p className="text-[11px] leading-relaxed text-ink/45">Le montant exact de la livraison est calculé à la validation et confirmé sur votre reçu.</p>}
      {isGift && (
        <div className="flex items-start gap-1.5 border-t border-ink/10 pt-3 text-xs text-ink/60">
          <Gift size={13} className="mt-0.5 flex-shrink-0 text-burgundy" aria-hidden="true" />
          <span>Commande cadeau pour {giftRecipientName || 'le destinataire'} — livrée à son adresse.</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="container-pro max-w-5xl py-5 sm:py-8">
      <button
        type="button"
        onClick={() => (step === 0 ? navigate('/panier') : setStep(step - 1))}
        disabled={processing}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 transition-colors hover:text-ink disabled:opacity-50"
      >
        <ArrowLeft size={16} aria-hidden="true" /> {step === 0 ? 'Retour au panier' : 'Retour'}
      </button>
      <h1 className="mb-6 font-display text-[30px] font-medium leading-tight text-ink lg:text-4xl">Finaliser ma commande</h1>
      <div className="mx-auto mb-6 max-w-sm sm:mb-8 lg:mx-0 lg:max-w-md"><CheckoutSteps steps={steps} current={step} /></div>

      {/* Mobile, étapes 1 et 2 : le récapitulatif reste à portée, replié. */}
      {step !== 2 && (
        <details className="group mb-6 rounded-lg border border-ink/15 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-ink [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              {firstSummaryProduct && <SmartImage src={firstSummaryProduct.thumbnailUrl || firstSummaryProduct.images[0]} alt="" className="h-12 w-10 flex-shrink-0 rounded-md object-cover" />}
              <span className="min-w-0 normal-case tracking-normal"><span className="block text-sm font-semibold text-ink">Votre commande</span><span className="block text-xs font-normal text-ink/55">{cart.length} article{cart.length > 1 ? 's' : ''}</span></span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-2"><span className="text-sm font-bold text-burgundy">{formatFCFA(estimatedTotal)}</span><ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" /></span>
          </summary>
          <div className="space-y-4 border-t border-ink/10 px-4 py-4">
            <div className="space-y-4">{summaryLines}</div>
            {summaryTotals}
          </div>
        </details>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
          {/* Step 0: Customer info */}
          {step === 0 && (
            <div className="space-y-5 fade-in">
              <h2 className="font-display text-[26px] font-medium leading-tight text-ink">Vos coordonnées</h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="co-label">Prénom</label>
                  <input className="co-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  {errors.firstName && <p className="mt-1 text-xs text-burgundy">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="co-label">Nom</label>
                  <input className="co-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  {errors.lastName && <p className="mt-1 text-xs text-burgundy">{errors.lastName}</p>}
                </div>
              </div>
              <div>
                <label className="co-label">Téléphone</label>
                <div className="co-phone"><PhoneField className="co-input" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
                {errors.phone && <p className="mt-1 text-xs text-burgundy">{errors.phone}</p>}
              </div>
              <div>
                <label className="co-label">Email <span className="normal-case tracking-normal text-ink/40">(optionnel)</span></label>
                <input type="email" className="co-input" placeholder="vous@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="co-label">Quartier</label>
                <div className="relative">
                  <select className="co-input appearance-none pr-10" value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })}>
                    {Object.keys(quartierToZone).map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/45" aria-hidden="true" />
                </div>
              </div>

              <button onClick={() => { if (validateContactInfo()) setStep(1); }} className="btn-shop w-full">Continuer</button>
            </div>
          )}

          {/* Step 1: Delivery — fulfillment choice, address/map, gift details */}
          {step === 1 && (
            <div className="space-y-6 fade-in">
              <h2 className="font-display text-[28px] font-medium leading-tight text-ink">Livraison</h2>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 rounded-[2px] border-ink/30 text-burgundy focus:ring-burgundy/30" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink"><Gift size={15} className="text-ink/50" /> Cette commande est un cadeau</span>
                </label>

                {isGift && (
                  <div className="fade-in space-y-4 rounded-lg border border-ink/15 bg-cream/50 p-4">
                    <p className="text-xs leading-relaxed text-ink/55">Ces informations concernent le destinataire — elles remplacent les vôtres pour la livraison de cette commande.</p>
                    <div>
                      <label className="co-label">Nom du destinataire</label>
                      <input className="co-input" value={giftRecipientName} onChange={(e) => { setGiftRecipientName(e.target.value); setErrors((prev) => { const next = { ...prev }; delete next.giftRecipientName; return next; }); }} />
                      {errors.giftRecipientName && <p className="mt-1 text-xs text-burgundy">{errors.giftRecipientName}</p>}
                    </div>
                    <div>
                      <label className="co-label">Téléphone du destinataire</label>
                      <div className="co-phone"><PhoneField className="co-input" value={giftRecipientPhone} onChange={(v) => { setGiftRecipientPhone(v); setErrors((prev) => { const next = { ...prev }; delete next.giftRecipientPhone; return next; }); }} /></div>
                      {errors.giftRecipientPhone && <p className="mt-1 text-xs text-burgundy">{errors.giftRecipientPhone}</p>}
                    </div>
                    <div>
                      <label className="co-label">Point de repère <span className="normal-case tracking-normal text-ink/40">(optionnel)</span></label>
                      <input className="co-input" placeholder="Ex: près de la pharmacie, en face de..." value={giftRecipientLandmark} onChange={(e) => setGiftRecipientLandmark(e.target.value)} />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded-[2px] border-ink/30 text-burgundy focus:ring-burgundy/30" checked={giftShowBuyerName} onChange={(e) => setGiftShowBuyerName(e.target.checked)} />
                      <span className="text-sm text-ink">Afficher mon nom au destinataire</span>
                    </label>
                    <div>
                      <label className="co-label">Ajouter un petit mot <span className="normal-case tracking-normal text-ink/40">(optionnel)</span></label>
                      <textarea className="co-input" rows={2} placeholder="Votre message pour le destinataire..." value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded-[2px] border-ink/30 text-burgundy focus:ring-burgundy/30" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} />
                      <span className="text-sm text-ink">Emballage cadeau <span className="text-ink/45">(+{formatFCFA(GIFT_WRAP_FEE)})</span></span>
                    </label>
                  </div>
                )}
              </div>

              {anyShopOffersPickup && (
                <div className="border-t border-ink/10 pt-5">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Truck size={17} className="text-burgundy" aria-hidden="true" /> Mode de réception</h3>
                </div>
              )}

              {/* Per-shop delivery/pickup choice — skipped entirely when no
                  shop in the cart offers pickup at all (see
                  anyShopOffersPickup above). */}
              {anyShopOffersPickup && shopsInCart.map((shop) => {
                const current = getShopFulfillment(shop.id);
                const shopItems = cart.filter((i) => i.shopId === shop.id);
                return (
                  <div key={shop.id} className="space-y-3 rounded-lg border border-ink/15 p-4">
                    <div className="flex items-center gap-2.5">
                      <SmartImage src={shop.logo} alt="" className="h-8 w-8 rounded-full object-cover" />
                      <p className="text-sm font-semibold text-ink">{shop.name}</p>
                      <span className="ml-auto text-xs text-ink/45">{shopItems.length} article{shopItems.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      <button onClick={() => setShopFulfillments({ ...shopFulfillments, [shop.id]: 'delivery' })} className={`opt-row ${current === 'delivery' ? 'opt-row-active' : ''}`}>
                        <Truck size={17} className={`mt-px flex-shrink-0 ${current === 'delivery' ? 'text-burgundy' : 'text-ink/40'}`} />
                        <div><p className="text-sm font-medium text-ink">Livraison</p><p className="text-xs text-ink/55">Dakar sous 4–48 h</p></div>
                        <Radio active={current === 'delivery'} />
                      </button>
                      {shop.pickupEnabled && (
                        <button onClick={() => setShopFulfillments({ ...shopFulfillments, [shop.id]: 'pickup' })} className={`opt-row ${current === 'pickup' ? 'opt-row-active' : ''}`}>
                          <Store size={17} className={`mt-px flex-shrink-0 ${current === 'pickup' ? 'text-burgundy' : 'text-ink/40'}`} />
                          <div>
                            <p className="text-sm font-medium text-ink">Retrait en boutique</p>
                            {shop.address && <p className="text-xs text-ink/55">{shop.address}</p>}
                          </div>
                          <Radio active={current === 'pickup'} />
                        </button>
                      )}
                    </div>
                    {current === 'pickup' && (
                      <div className="fade-in rounded-lg bg-cream/60 p-3">
                        <p className="text-xs leading-relaxed text-ink/60">Vous pourrez récupérer votre commande dès qu'elle sera marquée prête.</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ONE consolidated Ezial delivery card */}
              {hasDeliveryShops && (
                <div className="rounded-lg border border-burgundy/25 bg-burgundy/[0.04] p-4">
                  <div className="flex items-center gap-3">
                    <Truck size={19} className="flex-shrink-0 text-burgundy" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Livraison Ezial</p>
                      <p className="text-xs text-ink/60">Dakar sous 4–48 h · {deliveryFeeText}</p>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-ink/50">Ezial regroupe vos articles des différentes boutiques en une seule livraison vers votre adresse. Le frais exact est calculé à la validation, selon la distance réelle.</p>
                </div>
              )}

              {/* Position de livraison — requise dès qu'une boutique livre */}
              {hasDeliveryShops && (
                <div className="space-y-3 rounded-lg border border-ink/15 p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MapPin size={16} className="text-burgundy" /> Position de livraison</h3>
                  <p className="text-xs leading-relaxed text-ink/65">
                    Cette position est utilisée pour calculer vos frais de livraison.
                  </p>

                  {location ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-green-700"><Check size={15} /> Position de livraison définie</p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700"><AlertTriangle size={15} /> Position de livraison non définie</p>
                  )}

                  {/* Mode toggle */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {/* One tap both selects GPS mode and asks for the position —
                        no second "Utiliser ma position actuelle" button below. */}
                    <button
                      type="button"
                      onClick={() => { setLocationMode('gps'); requestLocation(); }}
                      disabled={locationStatus === 'requesting'}
                      className={`${locationMode === 'gps' ? 'btn-shop' : 'btn-shop-line'} !px-3 !py-3 !text-[11px]`}
                    >
                      {locationStatus === 'requesting'
                        ? <><Loader2 size={14} className="animate-spin" /> Détection en cours...</>
                        : <><Navigation size={14} /> Ma position actuelle</>}
                    </button>
                    <button type="button" onClick={openManualLocationMode} className={`${locationMode === 'manual' ? 'btn-shop' : 'btn-shop-line'} !px-3 !py-3 !text-[11px]`}>
                      <Search size={14} /> Rechercher une adresse
                    </button>
                  </div>

                  {locationMode === 'gps' && (locationStatus === 'granted' || locationStatus === 'denied' || locationStatus === 'unsupported') && (
                    <div className="space-y-2 rounded-lg border border-ink/15 p-3.5">
                      {locationStatus === 'granted' && (
                        <button type="button" onClick={requestLocation} className="flex items-center gap-1.5 text-xs font-medium text-burgundy hover:underline">
                          <MapPin size={13} /> Actualiser ma position
                        </button>
                      )}
                      {locationStatus === 'denied' && (
                        <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Accès à la position refusé. Autorisez la géolocalisation dans les réglages de votre navigateur, ou choisissez le retrait en boutique si disponible.</p>
                      )}
                      {locationStatus === 'unsupported' && (
                        <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> Votre navigateur ne prend pas en charge la géolocalisation. Choisissez le retrait en boutique si disponible.</p>
                      )}
                    </div>
                  )}

                  {locationMode === 'manual' && (
                    <div className="space-y-3 rounded-lg border border-ink/15 p-3.5">
                      <div>
                        <label className="co-label">Rechercher une adresse ou un lieu</label>
                        <div className="relative">
                          <input
                            type="text"
                            className="co-input min-w-0 w-full pr-10"
                            placeholder="Ex. : Sacré-Cœur 3, Dakar"
                            value={addressSearch.query}
                            onChange={(e) => addressSearch.setQuery(e.target.value)}
                          />
                          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/30">
                            {addressSearch.searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                          </span>
                        </div>
                      </div>

                      {addressSearch.error && <p className="flex items-start gap-1.5 text-xs text-burgundy"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {addressSearch.error}</p>}

                      {addressSearch.results && addressSearch.results.length > 0 && (
                        <div className="space-y-2">
                          {addressSearch.notice && <p className="text-xs text-ink/50">{addressSearch.notice}</p>}
                          <div className="divide-y divide-ink/10 overflow-hidden rounded-lg border border-ink/15">
                            {addressSearch.results.map((r) => (
                              <button key={r.id} type="button" onClick={() => applySearchResult(r)} className="block w-full px-3 py-2.5 text-left text-sm text-ink/75 hover:bg-cream/60">
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selectedLabel || manualAdjusted || resolvingAddress) && (
                        <div className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 p-3">
                          <Check size={16} className="mt-0.5 flex-shrink-0 text-green-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-green-800">Adresse sélectionnée</p>
                            {resolvingAddress ? (
                              <p className="mt-0.5 text-xs text-ink/50">Récupération de l'adresse...</p>
                            ) : selectedLabel ? (
                              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink/75"><MapPin size={14} className="mt-0.5 flex-shrink-0 text-burgundy" /> {selectedLabel}</p>
                            ) : manualAdjusted ? (
                              <p className="mt-0.5 text-xs text-ink/60">Adresse précise non trouvée pour ce point — la position exacte reste enregistrée. Ajoutez un point de repère si besoin, juste en dessous.</p>
                            ) : null}
                          </div>
                        </div>
                      )}

                      <GoogleLocationPickerMap position={location} onChange={handleMapPick} />
                      <p className="text-xs leading-relaxed text-ink/45">Cliquez sur la carte ou faites glisser le repère pour préciser l'emplacement exact de livraison. Vous pouvez rechercher une autre adresse à tout moment.</p>
                    </div>
                  )}
                </div>
              )}

              {hasDeliveryShops && (
                <div className="space-y-4">
                  <div>
                    <label className="co-label">Point de repère <span className="normal-case tracking-normal text-ink/40">(optionnel)</span></label>
                    <input className="co-input" placeholder="Ex: près de la pharmacie, en face de..." value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
                  </div>
                  <div>
                    <label className="co-label">Instructions pour la livraison <span className="normal-case tracking-normal text-ink/40">(facultatif)</span></label>
                    <textarea className="co-input" rows={2} placeholder="Ex. Appelez-moi en arrivant, portail noir..." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
                  </div>
                </div>
              )}

              {/* Pickup shop info — only the pieces that actually have a
                  real value; pickupEta has no backing data yet (no stored
                  delay/hours per shop), so it's never rendered as a bare,
                  empty line. */}
              {pickupShops.map((shop) => (
                <div key={`pickup-${shop.id}`} className="rounded-lg bg-cream/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-ink/60"><Store size={12} /> {shop.name}{shop.address ? ` · ${shop.address}` : ''}</p>
                </div>
              ))}

              {/* Delivery preference (only if at least one delivery) */}
              {hasDeliveryShops && (
                <div className="space-y-3 border-t border-ink/10 pt-5">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Clock size={17} className="text-burgundy" aria-hidden="true" /> Avez-vous une préférence de livraison ?</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button onClick={() => setPreference({ type: 'none' })} className={`opt-row items-center ${preference.type === 'none' ? 'opt-row-active' : ''}`}>
                      <Clock size={16} className={preference.type === 'none' ? 'text-burgundy' : 'text-ink/40'} />
                      <span className="text-sm font-medium text-ink">Sans préférence</span>
                      <Radio active={preference.type === 'none'} />
                    </button>
                    <button onClick={() => setPreference({ type: 'preferred', date: tomorrowISO(), window: deliveryWindows[0] })} className={`opt-row items-center ${preference.type === 'preferred' ? 'opt-row-active' : ''}`}>
                      <Clock size={16} className={preference.type === 'preferred' ? 'text-burgundy' : 'text-ink/40'} />
                      <span className="text-sm font-medium text-ink">Avec préférence</span>
                      <Radio active={preference.type === 'preferred'} />
                    </button>
                  </div>
                  {preference.type === 'preferred' && (
                    <div className="fade-in space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="co-label">Date souhaitée</label>
                          <input type="date" className="co-input" min={tomorrowISO()} value={preference.date} onChange={(e) => setPreference({ ...preference, date: e.target.value })} />
                        </div>
                        <div>
                          <label className="co-label">Créneau préféré</label>
                          <div className="relative">
                            <select className="co-input appearance-none pr-10" value={preference.window} onChange={(e) => setPreference({ ...preference, window: e.target.value })}>
                              {deliveryWindows.map((w) => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/45" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink/45">
                        <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                        Nous ferons notre possible pour respecter votre préférence. Le créneau n'est pas garanti.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-[auto_1fr] gap-3 pt-1">
                <button onClick={() => setStep(0)} className="btn-shop-line">Retour</button>
                <button onClick={() => { if (validateDeliveryInfo()) setStep(2); }} disabled={hasDeliveryShops && !location} className="btn-shop">Continuer</button>
              </div>
            </div>
          )}

          {/* Step 2: Payment + Summary */}
          {step === 2 && (
            <div className="space-y-6 fade-in">
              <h2 className="font-display text-[28px] font-medium leading-tight text-ink">Paiement</h2>

              {/* Récapitulatif complet sur mobile ; sur ordinateur il se trouve
                  dans la colonne de droite. */}
              <div className="space-y-4 rounded-lg border border-ink/15 p-4 lg:hidden">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><FileText size={17} className="text-burgundy" aria-hidden="true" /> Récapitulatif</h3>
                <div className="space-y-4">{summaryLines}</div>
                <div className="border-t border-ink/10 pt-4">{summaryTotals}</div>
              </div>

              {/* Promo code — the discount shown is always confirmed by
                  validate_promo_code() server-side; create_order() itself
                  re-validates and recomputes it again authoritatively. */}
              <div className="space-y-2">
                <label className="co-label">Code promo</label>
                {appliedPromo ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-700"><Check size={15} /> {appliedPromo.code} appliqué — économie {formatFCFA(appliedPromo.discountAmount)}</span>
                    <button onClick={handleRemovePromo} className="flex-shrink-0 text-xs font-medium text-ink/55 hover:text-burgundy">Retirer</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input className="co-input flex-1 uppercase" placeholder="Ex : EZIAL10" value={promoInput} onChange={(e) => { setPromoInput(e.target.value); setPromoError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApplyPromo(); } }} />
                    <button onClick={() => void handleApplyPromo()} disabled={promoChecking || !promoInput.trim()} className="btn-shop-line flex-shrink-0 !px-5">
                      {promoChecking ? <Loader2 size={15} className="animate-spin" /> : 'Appliquer'}
                    </button>
                  </div>
                )}
                {promoError && <p className="text-xs text-burgundy">{promoError}</p>}
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Wallet size={17} className="text-burgundy" aria-hidden="true" /> Choisir un mode de paiement</h3>
                <p className="text-xs leading-relaxed text-ink/55">Choisissez votre mode de paiement. Simulation uniquement, aucun paiement réel.</p>
                <div className="space-y-2">
                  {paymentMethods.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button key={p.id} onClick={() => setPayment(p.id)} className={`opt-row items-center !p-4 ${payment === p.id ? 'opt-row-active' : ''}`}>
                        <Icon size={19} className={`flex-shrink-0 ${payment === p.id ? 'text-burgundy' : 'text-ink/40'}`} />
                        <div><p className="text-sm font-medium text-ink">{p.label}</p><p className="text-xs text-ink/50">{p.description}</p></div>
                        <Radio active={payment === p.id} />
                      </button>
                    );
                  })}
                </div>
              </div>


              {submitError && (
                <p className="flex items-start gap-1.5 rounded-lg border border-burgundy/20 bg-burgundy/[0.04] p-3 text-sm text-burgundy">
                  <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {submitError}
                </p>
              )}

              {/* Barre de validation : reste visible en bas de l'écran sur mobile. */}
              <div className="sticky bottom-0 z-20 -mx-4 border-t border-ink/10 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                <p className="mb-2.5 text-center text-xs leading-relaxed text-ink/55">
                  En cliquant sur « Payer », vous acceptez les{' '}
                  <button type="button" onClick={() => setCgvOpen(true)} className="font-medium text-burgundy underline underline-offset-2">conditions générales de vente</button>.
                </p>
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <button onClick={() => setStep(1)} className="btn-shop-line" disabled={processing}>Retour</button>
                  <button onClick={placeOrder} className="btn-shop" disabled={processing}>
                    {processing ? <><Loader2 size={17} className="animate-spin" /> Traitement...</> : <><Lock size={16} aria-hidden="true" /> {`Payer ${formatFCFA(estimatedTotal)} ${hasDeliveryShops && !deliveryFeeKnown ? '(à partir de)' : '(estimé)'}`}</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Récapitulatif — colonne de droite sur ordinateur */}
        <aside className="hidden lg:block lg:sticky lg:top-[90px] lg:self-start">
          <div className="space-y-5 rounded-lg border border-ink/15 bg-cream/40 p-6">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><FileText size={17} className="text-burgundy" aria-hidden="true" /> Récapitulatif</h3>
            <div className="max-h-72 space-y-4 overflow-y-auto pr-1">{summaryLines}</div>
            <div className="border-t border-ink/10 pt-5">{summaryTotals}</div>
          </div>
        </aside>
      </div>
      {cgvOpen && (
        <Suspense fallback={null}>
          <InfoSheet slug="conditions-generales" onClose={() => setCgvOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
