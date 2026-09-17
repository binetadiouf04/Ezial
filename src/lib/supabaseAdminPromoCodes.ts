import { supabase } from './supabaseClient';

// Admin CRUD for public.promo_codes (see the migration this feature ships
// with) — gated by RLS to admins only. The actual discount CALCULATION at
// checkout never trusts this table read directly by the frontend; it goes
// through the validate_promo_code() RPC instead (supabasePromoCode.ts),
// which is the one place a discount amount is ever computed.

export type PromoDiscountType = 'percent' | 'fixed';

export interface AdminPromoCode {
  id: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PromoCodeRow {
  id: string;
  code: string;
  discount_type: PromoDiscountType;
  discount_value: number;
  min_order_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

function mapRow(row: PromoCodeRow): AdminPromoCode {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    minOrderAmount: row.min_order_amount,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function fetchPromoCodes(): Promise<AdminPromoCode[]> {
  const { data, error } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as PromoCodeRow[]).map(mapRow);
}

export interface PromoCodeInput {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  minOrderAmount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

export async function createPromoCode(input: PromoCodeInput): Promise<{ error?: string }> {
  const { error } = await supabase.from('promo_codes').insert({
    code: input.code.trim().toUpperCase(),
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    is_active: input.isActive,
  });
  if (error) return { error: error.message.includes('duplicate') ? 'Ce code existe déjà.' : error.message };
  return {};
}

export async function updatePromoCode(id: string, input: PromoCodeInput): Promise<{ error?: string }> {
  const { error } = await supabase.from('promo_codes').update({
    code: input.code.trim().toUpperCase(),
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    is_active: input.isActive,
  }).eq('id', id);
  if (error) return { error: error.message.includes('duplicate') ? 'Ce code existe déjà.' : error.message };
  return {};
}

export async function deletePromoCode(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
