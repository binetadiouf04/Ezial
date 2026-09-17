import { supabase } from './supabaseClient';

// Web Push opt-in — real browser Push API, never a home-made polling
// system. Subscriptions are stored per Supabase Auth user (customer or
// seller — same auth.users id space) in public.push_subscriptions (see the
// migration this feature ships with), so the sending side (an Edge
// Function, invoked by a database trigger — see supabase/functions/
// send-push/index.ts) can look up "who to notify" for a given order/shop
// without ever touching the frontend again.
//
// iOS/Safari note: Web Push notifications only work once Ezial has been
// added to the Home Screen (installed as a PWA) AND the user explicitly
// grants permission from within that installed app — Safari in a regular
// browser tab cannot show push notifications on iOS. This is an Apple
// platform limitation, not a bug here.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSupportStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function getPushSupportStatus(): PushSupportStatus {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return 'unsupported';
  return Notification.permission as PushSupportStatus;
}

export async function subscribeToPush(userId: string): Promise<{ error?: string }> {
  if (getPushSupportStatus() === 'unsupported') return { error: 'Les notifications ne sont pas prises en charge sur cet appareil/navigateur.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { error: 'Autorisation refusée.' };

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
  });

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  }, { onConflict: 'endpoint' });

  return error ? { error: error.message } : {};
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  } else {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  }
}
