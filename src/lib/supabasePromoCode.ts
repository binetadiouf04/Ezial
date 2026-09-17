import { supabase } from './supabaseClient';

// Validates a promo code against the real Supabase-side rules (existence,
// active, dates, minimum order amount) and returns the ALREADY-computed
// discount — the frontend never decides this amount itself, it only
// displays whatever validate_promo_code() (security definer) returns. This
// is a preview/display-only check: the authoritative charge still only
// ever comes from create_order() itself.
export interface PromoCodeValidation {
  valid: boolean;
  code?: string;
  discountAmount?: number;
  message?: string;
}

export async function validatePromoCode(code: string, subtotal: number): Promise<PromoCodeValidation> {
  const { data, error } = await supabase.rpc('validate_promo_code', { p_code: code.trim(), p_subtotal: subtotal });
  if (error || !data) return { valid: false, message: 'Impossible de vérifier ce code pour le moment.' };
  return {
    valid: Boolean(data.valid),
    code: data.code,
    discountAmount: data.discount_amount,
    message: data.message,
  };
}
