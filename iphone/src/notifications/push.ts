import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { callRpc, cloudSessionId } from '../cloud';
import { testRequest } from '../testing/pair';
const testerRequestId = '00000000-0000-4000-8000-000000000001';
const isTester = (owner: string) => owner.startsWith('tester:');
const currentOwner = async (owner: string) => isTester(owner) || (await cloudSessionId()) === owner;
const pushRpc = <T,>(owner: string, action: string, payload = {}) => isTester(owner)
  ? testRequest<T>('push_' + action, owner.slice(7), payload)
  : callRpc<T>('marriage_push_' + action, payload, owner);
import { disableWebPush, enableWebPush, monitorWebPush, registerPushWorker, webPushConfigured, webPushStatus, webPushSupported } from './webPush';

export type PushOpen = { requestId: string; kind: 'request' | 'mutual' | 'message' };
type Device = { token: string; installationId: string; environment: 'sandbox' | 'production' };
type Permission = { permission: 'granted' | 'prompt' | 'denied'; installationId: string };
interface NativePush {
  status(): Promise<Permission>;
  register(): Promise<Device>;
  unregister(): Promise<void>;
  openSettings(): Promise<void>;
  consumeOpen(): Promise<{ notification: PushOpen | null }>;
  addListener(event: 'registration', listener: (device: Device) => void): Promise<PluginListenerHandle>;
  addListener(event: 'opened', listener: (event: PushOpen) => void): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativePush>('NisfaynPush');
export const nativePush = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
// Native registration is always available in the signed iPhone app. Delivery is
// controlled on the server; a missing build-time flag must not disable consent.
export const pushConfigured = nativePush || webPushConfigured;
export const pushSupported = () => nativePush || webPushSupported();
export const pushStatus = () => nativePush ? native.status() : webPushStatus();
export const openPushSettings = () => native.openSettings();
export const getPushPreference = (owner: string) => pushRpc<{ enabled: boolean }>(owner, 'settings');

async function bind(owner: string, device: Device) {
  if (!await currentOwner(owner)) return;
  await pushRpc(owner, 'register', { device_token: device.token, device_environment: device.environment, installation: device.installationId });
}
export async function enablePush(owner: string) {
  if (!nativePush) return enableWebPush(owner);
  if (!nativePush || !pushConfigured) throw new Error('لم تُفعّل خدمة الإشعارات بعد.');
  const device = await native.register();
  await bind(owner, device);
  return pushRpc<{ enabled: boolean }>(owner, 'enable', { enabled: true });
}
export async function disablePush(owner: string) {
  if (!nativePush) return disableWebPush(owner);
  const next = await pushRpc<{ enabled: boolean }>(owner, 'enable', { enabled: false });
  const state = await native.status();
  await pushRpc(owner, 'unregister', { installation: state.installationId });
  if (await currentOwner(owner)) await native.unregister();
  return next;
}

// No permission prompt on launch. Only rebind already authorized, opted-in devices.
export function usePushNotifications(owner: string | null, onOpen: (requestId: string, kind: PushOpen['kind']) => void) {
  const callback = useRef(onOpen);
  callback.current = onOpen;
  useEffect(() => {
    if (!owner || !pushConfigured || (isTester(owner) && !nativePush)) return;
    if (!nativePush) {
      if (!webPushSupported()) return;
      return monitorWebPush(owner, event => callback.current(event.requestId, event.kind));
    }
    let active = true, refreshing = false;
    const listeners: PluginListenerHandle[] = [];
    const open = async () => {
      const { notification } = await native.consumeOpen();
      if (!active || !notification || !await currentOwner(owner)) return;
      if (/^[0-9a-f-]{36}$/i.test(notification.requestId) && ['request','mutual','message'].includes(notification.kind)) {
        if (isTester(owner) !== (notification.requestId === testerRequestId)) return;
        callback.current(isTester(owner) ? 'tester-pair' : notification.requestId, notification.kind);
      }
    };
    const refresh = async () => {
      if (!active || refreshing || document.hidden) return;
      refreshing = true;
      try {
        const preference = await getPushPreference(owner);
        const permission = await native.status();
        if (active && preference.enabled && permission.permission === 'granted') await bind(owner, await native.register());
        if (active) await open();
      } catch { /* Keep chat available when notification delivery is unavailable. */ }
      finally { refreshing = false; }
    };
    void native.addListener('registration', device => { if (active) void bind(owner, device).catch(() => {}); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    void native.addListener('opened', () => { void open().catch(() => {}); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    document.addEventListener('visibilitychange', refresh);
    void refresh();
    return () => { active = false; listeners.forEach(handle => { void handle.remove(); }); document.removeEventListener('visibilitychange', refresh); };
  }, [owner]);
}

// Installation does not request permission and never caches member data.
if (!nativePush && webPushConfigured) void registerPushWorker().catch(() => {});
