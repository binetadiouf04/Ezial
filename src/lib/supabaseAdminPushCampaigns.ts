import { supabase } from './supabaseClient';

// Admin-only marketing push campaigns (public.push_campaigns) — RLS
// scopes the whole table to admins already, no extra filtering needed
// here. Sending itself (immediate or scheduled dispatch) happens in the
// send-push-campaign Edge Function, never from the frontend directly —
// this file only ever reads/writes the campaign row and asks the
// function to act on it.

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  clickUrl: string | null;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  successCount: number;
  errorCount: number;
  errorMessage: string | null;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): PushCampaign {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    clickUrl: (row.click_url as string | null) ?? null,
    status: row.status as CampaignStatus,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    recipientCount: (row.recipient_count as number) ?? 0,
    successCount: (row.success_count as number) ?? 0,
    errorCount: (row.error_count as number) ?? 0,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

export async function fetchPushCampaigns(): Promise<PushCampaign[]> {
  const { data, error } = await supabase.from('push_campaigns').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function countMarketingPushRecipients(): Promise<number> {
  const { data, error } = await supabase.rpc('count_marketing_push_recipients');
  if (error) return 0;
  return (data as number) ?? 0;
}

export interface CreateCampaignInput {
  title: string;
  body: string;
  clickUrl: string;
  scheduledAt: string | null; // ISO, or null to leave as draft / send now
}

export async function createPushCampaign(input: CreateCampaignInput): Promise<{ id?: string; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('push_campaigns').insert({
    title: input.title.trim(),
    body: input.body.trim(),
    click_url: input.clickUrl.trim() || null,
    status: input.scheduledAt ? 'scheduled' : 'draft',
    scheduled_at: input.scheduledAt,
    created_by: userData.user?.id ?? null,
  }).select('id').single();
  if (error || !data) return { error: error?.message ?? "Impossible de créer la campagne." };
  return { id: data.id as string };
}

export async function deletePushCampaign(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('push_campaigns').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

// Invokes send-push-campaign directly with the admin's own session —
// "Envoyer maintenant", works regardless of scheduled_at.
export async function sendPushCampaignNow(id: string): Promise<{ error?: string }> {
  const { data, error } = await supabase.functions.invoke('send-push-campaign', { body: { campaignId: id } });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error as string };
  return {};
}
