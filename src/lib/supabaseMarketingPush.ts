import { supabase } from './supabaseClient';

// Marketing push consent — deliberately separate from the transactional
// push toggle (NotificationOptIn/push_subscriptions): a customer can be
// subscribed to push (order updates) without having opted into
// promotional sends, and vice versa. Both RPCs touch only the calling
// user's own row (auth.uid()), never parameterized by user id, so there
// is no spoofing surface — see the migration this feature ships with.

export async function getMarketingPushConsent(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_marketing_push_consent');
  if (error) return false;
  return Boolean(data);
}

export async function setMarketingPushConsent(consent: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('set_marketing_push_consent', { consent });
  return error ? { error: error.message } : {};
}
