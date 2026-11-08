import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { callRpc, cloudSessionId } from '../cloud';
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
export const pushConfigured = nativePush ? import.meta.env.VITE_MARRIAGE_PUSH_ENABLED === 'true' : webPushConfigured;
export const pushSupported = () => nativePush || webPushSupported();
export const pushStatus = () => nativePush ? native.status() : webPushStatus();
export const openPushSettings = () => native.openSettings();
export const getPushPreference = (owner: string) => callRpc<{ enabled: boolean }>('marriage_push_settings', {}, owner);

async function bind(owner: string, device: Device) {
  if ((await cloudSessionId()) !== owner) return;
  await callRpc('marriage_push_register', { device_token: device.token, device_environment: device.environment, installation: device.installationId }, owner);
}
export async function enablePush(owner: string) {
  if (!nativePush) return enableWebPush(owner);
  if (!nativePush || !pushConfigured) throw new Error('لم تُفعّل خدمة الإشعارات بعد.');
  const device = await native.register();
  await bind(owner, device);
  return callRpc<{ enabled: boolean }>('marriage_push_enable', { enabled: true }, owner);
}
export async function disablePush(owner: string) {
  if (!nativePush) return disableWebPush(owner);
  const next = await callRpc<{ enabled: boolean }>('marriage_push_enable', { enabled: false }, owner);
  const state = await native.status();
  await callRpc('marriage_push_unregister', { installation: state.installationId }, owner);
  if ((await cloudSessionId()) === owner) await native.unregister();
  return next;
}

// No permission prompt on launch. Only rebind already authorized, opted-in devices.
export function usePushNotifications(owner: string | null, onOpen: (requestId: string, kind: PushOpen['kind']) => void) {
  const callback = useRef(onOpen);
  callback.current = onOpen;
  useEffect(() => {
    if (!owner || !pushConfigured) return;
    if (!nativePush) {
      if (!webPushSupported()) return;
      return monitorWebPush(owner, event => callback.current(event.requestId, event.kind));
    }
    let active = true, refreshing = false;
    const listeners: PluginListenerHandle[] = [];
    const open = async () => {
      const { notification } = await native.consumeOpen();
      if (!active || !notification || (await cloudSessionId()) !== owner) return;
      if (/^[0-9a-f-]{36}$/i.test(notification.requestId) && ['request','mutual','message'].includes(notification.kind)) {
        callback.current(notification.requestId, notification.kind);
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
