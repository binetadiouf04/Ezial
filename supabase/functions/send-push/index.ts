// Supabase Edge Function — sends a Web Push notification to every
// push_subscriptions row for a given user_id. Invoked by a Postgres
// trigger (see the migration this feature ships with) via net.http_post,
// never called directly by the frontend.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Secrets required (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   — from this feature's report
//   VAPID_SUBJECT                          — e.g. mailto:contact@ezial.sn
//   PUSH_WEBHOOK_SECRET                    — shared secret checked below;
//                                             must match the value baked
//                                             into the trigger SQL
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — to read push_subscriptions
//                                             (already available to every
//                                             Edge Function automatically)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@ezial.sn';
const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== PUSH_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { userId, title, body, url } = await req.json();
  if (!userId || !title) return new Response('Missing userId/title', { status: 400 });

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) return new Response(error.message, { status: 500 });

  const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/' });

  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err) {
      // A 404/410 means the subscription is gone (uninstalled, permission
      // revoked...) — clean it up so future sends don't keep retrying it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }));

  return new Response('ok', { status: 200 });
});
