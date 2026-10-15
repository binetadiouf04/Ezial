// Supabase Edge Function — sends an admin-authored marketing push
// campaign (public.push_campaigns) to every consenting customer. Two
// invocation modes:
//   - { campaignId } with the caller's own JWT in Authorization — "Envoyer
//     maintenant" from the admin UI, sends that one campaign right away
//     regardless of scheduled_at.
//   - no body, with x-webhook-secret — periodic dispatch of due
//     'scheduled' campaigns, called every few minutes by pg_cron (see the
//     migration this feature ships with). Never relies on an open browser
//     tab to fire a scheduled send.
//
// Deploy: supabase functions deploy send-push-campaign --no-verify-jwt
// Reuses the same secrets as send-push (VAPID_*, PUSH_WEBHOOK_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) plus SUPABASE_ANON_KEY, which
// every Edge Function already has, to resolve the admin's own JWT.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@ezial.sn';
const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Never re-notify the same customer within this window, even across
// different campaigns — the spam guard the brief asks for, enforced
// server-side rather than trusted to the admin UI alone.
const RATE_LIMIT_HOURS = 24;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface Campaign {
  id: string;
  title: string;
  body: string;
  click_url: string | null;
}

interface SubRow { user_id: string; endpoint: string; p256dh: string; auth: string }

async function sendCampaign(campaign: Campaign): Promise<void> {
  await admin.from('push_campaigns').update({ status: 'sending' }).eq('id', campaign.id);

  try {
    const cutoff = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();

    // Two plain queries instead of a PostgREST embed — profiles and
    // push_subscriptions aren't linked by a declared foreign key (both
    // independently reference auth.users), so embedding can't be relied on.
    const { data: eligibleProfiles, error: profilesError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'customer')
      .eq('marketing_push_consent', true)
      .or(`last_marketing_push_at.is.null,last_marketing_push_at.lt.${cutoff}`);
    if (profilesError) throw new Error(profilesError.message);

    const eligibleIds = (eligibleProfiles ?? []).map((p) => p.id as string);
    const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();

    if (eligibleIds.length > 0) {
      const { data: subsRows, error: subsError } = await admin
        .from('push_subscriptions')
        .select('user_id, endpoint, p256dh, auth')
        .in('user_id', eligibleIds);
      if (subsError) throw new Error(subsError.message);
      for (const row of (subsRows ?? []) as SubRow[]) {
        const list = subsByUser.get(row.user_id) ?? [];
        list.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
        subsByUser.set(row.user_id, list);
      }
    }

    const payload = JSON.stringify({ title: campaign.title, body: campaign.body, url: campaign.click_url || '/' });
    let recipientCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const notifiedUserIds: string[] = [];

    for (const userId of eligibleIds) {
      const subs = subsByUser.get(userId) ?? [];
      if (subs.length === 0) continue; // opted in, but no active subscription right now
      recipientCount++;
      let anySuccess = false;
      await Promise.all(subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          anySuccess = true;
        } catch (err) {
          errorCount++;
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
      }));
      if (anySuccess) { successCount++; notifiedUserIds.push(userId); }
    }

    if (notifiedUserIds.length > 0) {
      await admin.from('profiles').update({ last_marketing_push_at: new Date().toISOString() }).in('id', notifiedUserIds);
    }

    await admin.from('push_campaigns').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      recipient_count: recipientCount,
      success_count: successCount,
      error_count: errorCount,
    }).eq('id', campaign.id);
  } catch (err) {
    await admin.from('push_campaigns').update({ status: 'failed', error_message: (err as Error).message }).eq('id', campaign.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { campaignId?: string } = {};
  try { body = await req.json(); } catch { /* dispatch mode sends no body */ }

  if (body.campaignId) {
    // "Envoyer maintenant" — resolves the caller from THEIR OWN token,
    // then requires real admin membership, same pattern as create-driver.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Non authentifié.' }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await asUser.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Non authentifié.' }, 401);

    const [{ data: adminRow }, { data: profileRow }] = await Promise.all([
      admin.from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle(),
      admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle(),
    ]);
    if (!adminRow && profileRow?.role !== 'admin') return json({ error: 'Accès refusé.' }, 403);

    const { data: campaign, error: campaignError } = await admin.from('push_campaigns').select('*').eq('id', body.campaignId).maybeSingle();
    if (campaignError || !campaign) return json({ error: 'Campagne introuvable.' }, 404);
    if (campaign.status === 'sending' || campaign.status === 'sent') return json({ error: 'Campagne déjà envoyée.' }, 409);

    await sendCampaign(campaign as Campaign);
    return json({ ok: true });
  }

  // Dispatch mode — called by pg_cron every few minutes.
  if (req.headers.get('x-webhook-secret') !== PUSH_WEBHOOK_SECRET) return json({ error: 'Unauthorized' }, 401);

  const { data: due } = await admin
    .from('push_campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString());

  for (const campaign of (due ?? []) as Campaign[]) {
    await sendCampaign(campaign);
  }

  return json({ ok: true, dispatched: (due ?? []).length });
});
