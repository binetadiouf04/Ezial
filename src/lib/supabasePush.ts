import { checkVapidPublicKey, cleanVapidKey, VAPID_PUBLIC_KEY_LENGTH } from './vapidKey';
import { supabase } from './supabaseClient';
import { isRpcMissing } from './supabaseFeatureDetect';

// Web Push (norme W3C + VAPID) — jamais d'interrogation régulière maison.
// Chaque appareil abonné est une ligne de public.push_subscriptions liée au
// compte Supabase (auth.uid()) : un même compte peut avoir plusieurs appareils.
// L'envoi est fait côté serveur (fonction Supabase send-push, appelée par
// public.push_notify) avec la clé VAPID privée, qui ne quitte jamais Supabase.
// Seule la clé PUBLIQUE est dans le site (VITE_VAPID_PUBLIC_KEY).
//
// iPhone / iPad : Safari n'autorise les notifications qu'à une application
// ajoutée à l'écran d'accueil (iOS 16.4 et plus) et ouverte depuis son icône.
// Dans un onglet Safari, l'état est 'ios-install-required' : on l'explique, on
// ne force rien.

const VAPID_PUBLIC_KEY = cleanVapidKey(import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSupportStatus = 'unsupported' | 'ios-install-required' | 'default' | 'granted' | 'denied';

function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Vrai quand Ezial est ouvert comme application installée (icône d'écran d'accueil). */
export function isStandaloneApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Vrai quand la clé publique de notification est présente dans la version publiée du site. */
export function isPushKeyConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY);
}

export function getPushSupportStatus(): PushSupportStatus {
  if (!VAPID_PUBLIC_KEY) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandaloneApp() ? 'ios-install-required' : 'unsupported';
  }
  return Notification.permission as PushSupportStatus;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Cet appareil reçoit-il les notifications de CE compte ? (autorisation du
 * navigateur accordée ET abonnement enregistré pour l'utilisateur connecté).
 * Sur un appareil partagé, l'autorisation donnée par un autre compte ne suffit pas.
 */
export async function isDeviceRegisteredForUser(): Promise<boolean> {
  try {
    const sub = await currentSubscription();
    if (!sub) return false;
    // RLS : on ne voit que ses propres abonnements.
    const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

// Compte qui a lui-même cliqué « Activer » sur cet appareil. Après une
// déconnexion puis reconnexion de CE compte, l'appareil est réabonné sans
// redemander ; un autre compte sur le même appareil doit cliquer lui-même.
const DEVICE_OWNER_KEY = 'ezial-push-device-owner';
function readDeviceOwner(): string | null {
  try { return localStorage.getItem(DEVICE_OWNER_KEY); } catch { return null; }
}
function writeDeviceOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(DEVICE_OWNER_KEY, userId);
    else localStorage.removeItem(DEVICE_OWNER_KEY);
  } catch { /* facultatif */ }
}

async function saveSubscription(userId: string, subscription: PushSubscription): Promise<{ error?: string }> {
  const json = subscription.toJSON();
  // Fonction serveur (docs/sql/push-appareils.sql) : rattache l'appareil au
  // compte connecté, même s'il était lié à un autre compte auparavant.
  const rpc = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (!rpc.error) { writeDeviceOwner(userId); return {}; }
  if (!isRpcMissing(rpc.error)) return { error: 'Impossible d’enregistrer cet appareil. Réessayez.' };
  // Fonction pas encore installée : enregistrement direct (comportement actuel).
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  }, { onConflict: 'endpoint' });
  if (error) return { error: 'Impossible d’enregistrer cet appareil. Réessayez.' };
  writeDeviceOwner(userId);
  return {};
}

/**
 * Au retour d'un compte qui avait lui-même activé les notifications sur cet
 * appareil (puis s'était déconnecté) : réabonnement silencieux, sans nouvelle
 * demande d'autorisation. Ne fait rien pour un autre compte.
 */
export async function restoreDeviceForReturningUser(userId: string): Promise<void> {
  try {
    if (!userId || readDeviceOwner() !== userId || getPushSupportStatus() !== 'granted') return;
    const subscription = await currentSubscription();
    if (!subscription) return;
    if (await isDeviceRegisteredForUser()) return;
    await saveSubscription(userId, subscription);
  } catch { /* sans effet sur la page */ }
}

class StepTimeout extends Error {
  constructor(public step: string) { super(step); }
}

/** Une étape qui ne répond pas ne doit jamais laisser un bouton tourner sans fin. */
function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new StepTimeout(step)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

/** Le service worker de notifications, enregistré au besoin puis activé. */
async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  let registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  if (registration.active) return registration;
  return navigator.serviceWorker.ready;
}

/** Abonnement : uniquement après un clic explicite (« Activer »). */
export async function subscribeToPush(userId: string): Promise<{ error?: string }> {
  const status = getPushSupportStatus();
  if (status === 'ios-install-required') return { error: 'Sur iPhone, ajoutez d’abord Ezial à l’écran d’accueil, puis ouvrez-le depuis son icône.' };
  if (status === 'unsupported') return { error: 'Les notifications ne sont pas prises en charge sur cet appareil/navigateur.' };

  // Clé publique recopiée de travers dans Cloudflare : on le dit clairement,
  // avant de déranger la personne avec la demande d'autorisation.
  const keyCheck = checkVapidPublicKey(VAPID_PUBLIC_KEY);
  if (!keyCheck.ok) {
    return { error: `La clé de notifications publiée sur le site est ${keyCheck.reason} (${keyCheck.length} caractères, ${VAPID_PUBLIC_KEY_LENGTH} attendus). Corrigez VITE_VAPID_PUBLIC_KEY dans Cloudflare, puis relancez le déploiement.` };
  }

  try {
    // Étape 1 : la demande d'autorisation du téléphone (appelée directement au clic).
    // Pas de limite de temps : la personne peut mettre du temps à répondre.
    const permission = status === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return { error: 'Autorisation refusée.' };

    // Étape 2 : le service de notifications de l'application.
    const registration = await withTimeout(readyServiceWorker(), 10_000, 'service');
    // Étape 3 : l'abonnement auprès du service de notifications du téléphone.
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await withTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
    }), 20_000, 'abonnement');
    // Étape 4 : l'enregistrement de cet appareil pour le compte.
    return await withTimeout(saveSubscription(userId, subscription), 15_000, 'enregistrement');
  } catch (e) {
    if (e instanceof StepTimeout) {
      const where = e.step === 'service'
        ? 'Le service de notifications de l’application ne répond pas. Fermez complètement Ezial, rouvrez-le depuis son icône, puis réessayez.'
        : e.step === 'abonnement'
          ? 'Le téléphone n’a pas répondu à la demande d’abonnement. Vérifiez votre connexion, puis réessayez.'
          : 'L’enregistrement de cet appareil a pris trop de temps. Réessayez.';
      return { error: where };
    }
    const detail = e instanceof Error && e.name ? ` (${e.name})` : '';
    return { error: `Impossible d’activer les notifications sur cet appareil${detail}. Réessayez.` };
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  writeDeviceOwner(null); // désactivation volontaire : pas de réabonnement automatique
  const subscription = await currentSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  } else {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  }
}

/**
 * À la déconnexion : cet appareil ne reçoit plus les notifications du compte
 * qui se déconnecte (appareil partagé). L'autorisation du navigateur reste :
 * le prochain compte devra cliquer « Activer » pour recevoir les siennes.
 * Ne bloque jamais la déconnexion (1,5 s au plus, erreurs ignorées).
 */
export async function forgetThisDeviceOnSignOut(): Promise<void> {
  const work = (async () => {
    const subscription = await currentSubscription();
    if (subscription) await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  })().catch(() => {});
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 1500))]);
}

/** Même chose, pour le compte de la session en cours (appelé à l'ouverture des cloches de notification). */
export async function restoreDeviceForCurrentSession(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (userId) await restoreDeviceForReturningUser(userId);
  } catch { /* sans effet sur la page */ }
}
