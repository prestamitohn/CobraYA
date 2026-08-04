import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

/** true si ya hay una suscripción push activa en este navegador. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}

export interface SubscribeResult {
  ok: boolean;
  reason?: 'unsupported' | 'permission_denied' | 'error';
}

/** Pide permiso (requiere gesto del usuario — llamar desde un onClick), se suscribe y guarda la suscripción en Supabase. */
export async function subscribeToPush(tenantId: string, usuarioId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };

  try {
    const registration = await registerServiceWorker();
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      tenant_id: tenantId,
      usuario_id: usuarioId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent,
    }, { onConflict: 'endpoint' });

    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

export async function sendTestPush(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('probar-notificacion-push', { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
