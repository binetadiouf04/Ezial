import { supabase } from './supabaseClient';
import { validatePromoCode } from './supabasePromoCode';
import type { PromotionTarget, PublicPromotion } from './promotionEligibility';

// Campagnes promotionnelles côté site (voir docs/promotions/contrat-phase1.md).
//   * promotions_preview : APERÇU calculé par le serveur (réduction, livraison offerte) ;
//     create_order recalcule toujours tout, le site n'impose jamais un montant ;
//   * public_active_promotions : campagnes AUTOMATIQUES en cours (jamais un code), pour
//     afficher « Livraison offerte » sur les fiches concernées.
// Tant que la migration n'est pas exécutée (fonction absente), on retombe sur l'ancien
// contrôle des codes (validate_promo_code) et aucune campagne automatique n'est annoncée.

export interface PromotionPreviewInput {
  items: { productId: string; variantId: string | null; quantity: number; selectedOptions: Record<string, string> }[];
  shopFulfillments: Record<string, { type: 'delivery' | 'pickup' }>;
  neighborhood: string;
  promoCode?: string;
  deliveryFeeEstimate: number;
  /** Sous-total produits du panier : sert uniquement au repli sur l'ancien contrôle des codes. */
  cartSubtotal: number;
}

export interface AppliedPromotion {
  promotionId: string | null;
  code: string | null;
  name: string;
  kind: 'fixed' | 'percent' | 'free_delivery';
  productDiscount: number;
  deliveryDiscount: number;
  automatic: boolean;
}

export interface PromotionPreview {
  valid: boolean;
  message: string | null;
  applied: AppliedPromotion | null;
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? ''));
}

const toInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export async function previewPromotion(input: PromotionPreviewInput): Promise<PromotionPreview> {
  const { cartSubtotal, ...payload } = input;
  const { data, error } = await supabase.rpc('promotions_preview', { payload });
  if (isMissingFunction(error)) {
    // Base pas encore à jour : ancien contrôle, codes de réduction seulement.
    if (!input.promoCode) return { valid: true, message: null, applied: null };
    const old = await validatePromoCode(input.promoCode, cartSubtotal);
    if (!old.valid) return { valid: false, message: old.message ?? 'Code promo invalide.', applied: null };
    return {
      valid: true,
      message: null,
      applied: { promotionId: null, code: old.code ?? input.promoCode.trim().toUpperCase(), name: old.code ?? input.promoCode, kind: 'fixed', productDiscount: old.discountAmount ?? 0, deliveryDiscount: 0, automatic: false },
    };
  }
  if (error || !data) return { valid: false, message: 'Impossible de vérifier ce code pour le moment.', applied: null };
  const a = data.applied as Record<string, unknown> | null | undefined;
  return {
    valid: Boolean(data.valid),
    message: typeof data.message === 'string' ? data.message : null,
    applied: a ? {
      promotionId: typeof a.promotionId === 'string' ? a.promotionId : null,
      code: typeof a.code === 'string' && a.code ? a.code : null,
      name: typeof a.name === 'string' ? a.name : '',
      kind: (a.kind === 'percent' || a.kind === 'free_delivery') ? a.kind : 'fixed',
      productDiscount: toInt(a.productDiscount),
      deliveryDiscount: toInt(a.deliveryDiscount),
      automatic: Boolean(a.automatic),
    } : null,
  };
}

let activeCache: { at: number; list: PublicPromotion[] } | null = null;
const ACTIVE_TTL_MS = 5 * 60 * 1000;

/** Campagnes automatiques en cours (mises en cache 5 minutes). Liste vide si indisponible. */
export async function fetchActivePromotions(): Promise<PublicPromotion[]> {
  if (activeCache && Date.now() - activeCache.at < ACTIVE_TTL_MS) return activeCache.list;
  const { data, error } = await supabase.rpc('public_active_promotions');
  if (error || !Array.isArray(data)) return activeCache?.list ?? [];
  const list: PublicPromotion[] = data.map((r: Record<string, unknown>) => ({
    id: String(r.promotion_id ?? ''),
    name: String(r.name ?? ''),
    kind: (r.kind === 'percent' || r.kind === 'free_delivery') ? r.kind : 'fixed',
    minAmount: toInt(r.min_amount),
    deliveryCap: r.delivery_cap == null ? null : toInt(r.delivery_cap),
    endsAt: String(r.ends_at ?? ''),
    targets: Array.isArray(r.targets) ? (r.targets as Record<string, unknown>[])
      .map((t) => ({ type: (t.type ?? t.target_type) as PromotionTarget['type'], ref: String(t.ref ?? t.target_ref ?? '') }))
      .filter((t) => ['product', 'shop', 'category', 'subcategory'].includes(t.type) && t.ref) : [],
    neighborhoods: Array.isArray(r.neighborhoods) ? (r.neighborhoods as unknown[]).map(String) : [],
  }));
  activeCache = { at: Date.now(), list };
  return list;
}
