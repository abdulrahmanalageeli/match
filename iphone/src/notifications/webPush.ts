import { callRpc, cloudSessionId } from '../cloud';
import type { PushOpen } from './push';

const installationKey = 'nisfayn.web-push.installation';
const ownerKey = 'nisfayn.web-push.owner';
const pendingKey = 'nisfayn.web-push.open';
const publicKey = import.meta.env.VITE_MARRIAGE_WEB_PUSH_PUBLIC_KEY || '';
export const webPushConfigured = import.meta.env.VITE_MARRIAGE_WEB_PUSH_ENABLED === 'true' && /^[A-Za-z0-9_-]{87}$/.test(publicKey);
export const needsHomeScreen = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ? !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone : false;
export const webPushSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !needsHomeScreen();

let worker: Promise<ServiceWorkerRegistration> | undefined;
export function registerPushWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.reject(new Error('الإشعارات غير متاحة في هذا المتصفح.'));
  worker ??= navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready).catch(error => { worker = undefined; throw error; });
  return worker;
}

function installationId() {
  let id = localStorage.getItem(installationKey);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem(installationKey, id); }
  return id;
}

export async function webPushStatus() {
  const subscription = webPushSupported() ? await (await registerPushWorker()).pushManager.getSubscription() : null;
  return { permission: 'Notification' in window ? Notification.permission === 'default' ? 'prompt' : Notification.permission : 'prompt', installationId: installationId(), subscribed: Boolean(subscription) };
}

function applicationServerKey() {
  const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function subscribe(owner: string) {
  if ((await cloudSessionId()) !== owner) throw new Error('سجّل الدخول مجددًا لتفعيل الإشعارات.');
  const registration = await registerPushWorker();
  let subscription = await registration.pushManager.getSubscription();
  const previousOwner = localStorage.getItem(ownerKey);
  const existingKey = subscription?.options.applicationServerKey;
  const expectedKey = applicationServerKey();
  const keyChanged = existingKey && (new Uint8Array(existingKey).length !== expectedKey.length || new Uint8Array(existingKey).some((v, i) => v !== expectedKey[i]));
  if (subscription && ((previousOwner && previousOwner !== owner) || keyChanged)) {
    await subscription.unsubscribe(); subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expectedKey });
  if ((await cloudSessionId()) !== owner) { await subscription.unsubscribe(); throw new Error('سجّل الدخول مجددًا لتفعيل الإشعارات.'); }
  try {
    await callRpc('marriage_web_push_register', { subscription: subscription.toJSON(), installation: installationId() }, owner);
    localStorage.setItem(ownerKey, owner);
  } catch (error) { await subscription.unsubscribe().catch(() => false); throw error; }
}

export async function enableWebPush(owner: string) {
  if (!webPushConfigured || !webPushSupported()) throw new Error(needsHomeScreen() ? 'أضف نصفين إلى الشاشة الرئيسية وافتحه منها، ثم فعّل الإشعارات.' : 'استخدم متصفحًا حديثًا يدعم الإشعارات.');
  // Request directly in the button handler, before any async work loses the
  // browser's user gesture (required by Safari/iOS).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يتم السماح بالإشعارات. يمكنك تغيير الإذن من إعدادات المتصفح.');
  await subscribe(owner);
  return callRpc<{ enabled: boolean }>('marriage_push_enable', { enabled: true }, owner);
}

export async function disableWebPush(owner: string) {
  const next = await callRpc<{ enabled: boolean }>('marriage_push_enable', { enabled: false }, owner);
  await callRpc('marriage_push_unregister', { installation: installationId() }, owner);
  await detachWebPush();
  return next;
}

// Can be called before/after sign-out. Server session binding independently
// prevents future deliveries, and this removes the browser's subscription too.
export async function detachWebPush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
  const notifications = await registration?.getNotifications();
  notifications?.forEach(notification => notification.close());
  localStorage.removeItem(ownerKey);
  try { sessionStorage.removeItem(pendingKey); } catch { /* Restricted storage. */ }
}

function routeIds(value: {messageId?:unknown;roomId?:unknown}) {
  return Object.fromEntries(['messageId', 'roomId'].flatMap(key => {
    const id = value[key as keyof typeof value];
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? [[key,id]] : [];
  }));
}

function validOpen(value: unknown): value is PushOpen {
  const event = value as PushOpen | undefined;
  return Boolean(event && /^[0-9a-f-]{36}$/i.test(event.requestId) && ['request', 'mutual', 'message', 'reminder', 'family'].includes(event.kind));
}

// A click can arrive while Auth is restoring the session or at the sign-in
// screen. Keep only its opaque routing intent until the signed-in hook mounts.
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
  if (event.data?.type !== 'nisfayn-push-open' || !validOpen(event.data.notification)) return;
  try { sessionStorage.setItem(pendingKey, JSON.stringify({ requestId: event.data.notification.requestId, kind: event.data.notification.kind, ...routeIds(event.data.notification) })); } catch { /* Active listener still handles it. */ }
});

export function monitorWebPush(owner: string, onOpen: (value: PushOpen) => void) {
  let active = true, refreshing = false;
  const open = async (value: unknown) => {
    if (active && validOpen(value) && (await cloudSessionId()) === owner) {
      try { sessionStorage.removeItem(pendingKey); } catch { /* Restricted storage. */ }
      onOpen(value);
    }
  };
  const message = (event: MessageEvent) => { if (event.data?.type === 'nisfayn-push-open') void open(event.data.notification).catch(() => {}); };
  const refresh = async () => {
    if (!active || refreshing || document.hidden) return;
    refreshing = true;
    try {
      if (localStorage.getItem(ownerKey) && localStorage.getItem(ownerKey) !== owner) await detachWebPush();
      const url = new URL(location.href);
      const pending = { requestId: url.searchParams.get('pushRequest'), kind: url.searchParams.get('pushKind'), ...routeIds({messageId:url.searchParams.get('messageId'),roomId:url.searchParams.get('roomId')}) };
      if (validOpen(pending)) {
        url.searchParams.delete('pushRequest'); url.searchParams.delete('pushKind'); url.searchParams.delete('messageId'); url.searchParams.delete('roomId');
        history.replaceState(history.state, '', url);
        await open(pending);
      } else {
        try { await open(JSON.parse(sessionStorage.getItem(pendingKey) || 'null')); } catch { /* Missing or invalid routing intent. */ }
      }
      const preference = await callRpc<{ enabled: boolean }>('marriage_push_settings', {}, owner);
      if (active && preference.enabled && Notification.permission === 'granted') await subscribe(owner);
    } catch { /* Notification recovery must never interrupt chat. */ }
    finally { refreshing = false; }
  };
  navigator.serviceWorker.addEventListener('message', message);
  document.addEventListener('visibilitychange', refresh);
  void refresh();
  return () => { active = false; navigator.serviceWorker.removeEventListener('message', message); document.removeEventListener('visibilitychange', refresh); };
}
