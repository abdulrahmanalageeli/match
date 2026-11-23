import { publicationBuild } from '../publishing/appBuild';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { callRpc, cloudSessionId } from '../cloud';
import { notificationScope } from './scope';
import { testRequest } from '../testing/pair';
const testerRequestId = '00000000-0000-4000-8000-000000000001';
const isTester = (owner: string) => owner.startsWith('tester:');
const currentOwner = async (owner: string) => isTester(owner) || (await cloudSessionId()) === owner;
const pushRpc = <T,>(owner: string, action: string, payload = {}) => isTester(owner)
  ? testRequest<T>('push_' + action, owner.slice(7), payload)
  : callRpc<T>('marriage_push_' + action, payload, owner);
import { disableWebPush, enableWebPush, monitorWebPush, registerPushWorker, webPushConfigured, webPushStatus, webPushSupported } from './webPush';

export type PushOpen = { requestId: string; kind: 'request' | 'mutual' | 'message' | 'reminder' | 'family' | 'analysis' | 'publication';scope?: string;actionId?:string;action?:'reply'|'read';text?:string;messageId?:string;roomId?:string };
type Device = { token: string; installationId: string; environment: 'sandbox' | 'production' };
type Permission = { buildNumber?:string; permission: 'granted' | 'prompt' | 'denied'; installationId: string };
interface NativePush {
  status(): Promise<Permission>;
  clearDelivered(): Promise<void>;
  setOwner(options: {scope: string | null}): Promise<void>;
  register(): Promise<Device>;
  unregister(): Promise<void>;
  openSettings(): Promise<void>;
  consumeOpen(): Promise<{ notification: PushOpen | null }>;
  acknowledgeOpen(options:{actionId:string}):Promise<void>;
  badge(options:{count:number;scope:string}):Promise<void>;
  addListener(event: 'registration', listener: (device: Device) => void): Promise<PluginListenerHandle>;
  addListener(event: 'opened', listener: (event: PushOpen) => void): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativePush>('NisfaynPush');
export const nativePush = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export const pushConfigured = nativePush ? import.meta.env.VITE_MARRIAGE_PUSH_ENABLED === 'true' : webPushConfigured;
export const pushSupported = () => nativePush || webPushSupported();
export const readNativeBuild=async()=>publicationBuild((await native.status()).buildNumber);
export const pushStatus = () => nativePush ? native.status() : webPushStatus();
export const openPushSettings = () => native.openSettings();
export const getPushPreference = (owner: string) => pushRpc<{ enabled: boolean }>(owner, 'settings');
export type PushPreview='private'|'event'|'name'|'content';
export async function pushPrivacy(owner:string,preview_mode?:PushPreview) {
  const saved = await pushRpc<{preview:PushPreview}>(owner,'privacy',{preview_mode:preview_mode??null});
  if (nativePush && preview_mode) await native.clearDelivered();
  return saved;
}
export async function setPushBadge(count:number,owner:string|null) {
  if (nativePush && owner) {
    const scope=await notificationScope(owner,(await native.status()).installationId);
    await native.badge({count:Math.max(0,Math.floor(count)),scope});
  }
}

export const defaultPushControls = {
  message:true, connections:true, family:true, reminder:true, analysis:false, sound:true,
  quiet:false, start:22, end:7, zone:'Asia/Riyadh',
};
export type PushControls = typeof defaultPushControls;
export async function pushControls(owner:string, patch:Partial<PushControls> = {}) {
  const updated = {...defaultPushControls, ...await pushRpc<Partial<PushControls>>(owner,'controls',{patch})};
  if (Object.keys(patch).length) window.dispatchEvent(new Event('wudayn:push-controls'));
  return updated;
}

let ownerRevision = 0;
let bindingOwner:string|null=null;
let pendingOwnerSync:Promise<string|null>|null = null;
export function syncNativePushOwner(owner: string | null):Promise<string|null> {
  if (!nativePush) return Promise.resolve(null);
  if (bindingOwner===owner && pendingOwnerSync) return pendingOwnerSync;
  bindingOwner=owner;
  const revision = ++ownerRevision;
  pendingOwnerSync=(async()=>{
    const scope = owner ? await notificationScope(owner,(await native.status()).installationId) : null;
    if (revision !== ownerRevision) return null;
    await native.setOwner({scope});
    return revision === ownerRevision ? scope : null;
  })().finally(()=>{if(revision===ownerRevision) pendingOwnerSync=null;});
  return pendingOwnerSync;
}

export async function detachNotifications(owner?: string | null) {
  if (!nativePush) return (await import('./webPush')).detachWebPush();
  await syncNativePushOwner(null);
  if (owner) {
    const {installationId} = await native.status();
    await pushRpc(owner,'unregister',{installation:installationId}).catch(()=>{});
  }
}

async function bind(owner: string, device: Device) {
  if (!await currentOwner(owner) || bindingOwner!==owner) return;
  await pushRpc(owner, 'register', { device_token: device.token, device_environment: device.environment, installation: device.installationId });
  if(!isTester(owner)) await callRpc('wudayn_news_preference',{installation:device.installationId,build:publicationBuild((await native.status()).buildNumber)},owner).catch(()=>{});
}
export async function enablePush(owner: string) {
  if (!nativePush) return enableWebPush(owner);
  if (!nativePush || !pushConfigured) throw new Error('لم تُفعّل خدمة الإشعارات بعد.');
  const scope = await syncNativePushOwner(owner);
  if (!scope) throw new Error('سجّل الدخول مجددًا لتفعيل الإشعارات.');
  const device = await native.register();
  if (bindingOwner!==owner) throw new Error('تغيّر الحساب.');
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
export function usePushNotifications(owner: string | null, onOpen: (requestId: string, kind: PushOpen['kind'],event?:PushOpen) => void|Promise<void>) {
  const callback = useRef({owner,onOpen});
  callback.current = {owner,onOpen};
  useEffect(() => {
    if (!owner || !pushConfigured || (isTester(owner) && !nativePush)) return;
    if (!nativePush) {
      if (!webPushSupported()) return;
      return monitorWebPush(owner, event => { if (callback.current.owner === owner) void callback.current.onOpen(event.requestId, event.kind,event); });
    }
    const binding = syncNativePushOwner(owner).catch(() => null);
    let active = true, refreshing = false, opening=false, reopen=false, failures=0;
    let retry:ReturnType<typeof setTimeout>|undefined;
    const listeners: PluginListenerHandle[] = [];
    const open = async () => {
      if(!active)return;
      if(opening){reopen=true;return;}
      opening=true;let acknowledged=false;
      try {
      const scope = await binding;
      if (!active || !scope) return;
      const { notification } = await native.consumeOpen();
      if (!notification || !await currentOwner(owner) || !active || callback.current.owner !== owner) return;
      if (/^[0-9a-f-]{36}$/i.test(notification.requestId) && ['request','mutual','message','reminder','family','analysis','publication'].includes(notification.kind)) {
        if (scope !== notification.scope || isTester(owner) !== (notification.requestId === testerRequestId)) {
          if(notification.actionId){await native.acknowledgeOpen({actionId:notification.actionId});acknowledged=true;}return;
        }
        await callback.current.onOpen(isTester(owner) ? 'tester-pair' : notification.requestId, notification.kind,notification);
        if(notification.actionId){await native.acknowledgeOpen({actionId:notification.actionId});acknowledged=true;}
        failures=0;
      }
      }catch{
        // Keep the native action until sending succeeds. The stable actionId
        // makes a retry safe even when a response was lost after delivery.
        if(active&&failures<3){clearTimeout(retry);retry=setTimeout(()=>{void open();},1000*2**failures++);}
      }finally{
        opening=false;
        if((acknowledged||reopen)&&active){reopen=false;queueMicrotask(()=>{void open();});}
      }
    };
    const refresh = async () => {
      if (!active || refreshing || document.hidden) return;
      // Reply/navigation must not wait on APNs registration or preference fetches.
      failures=0;void open();
      refreshing = true;
      try {
        const preference = await getPushPreference(owner);
        const permission = await native.status();
        if (active && bindingOwner===owner && preference.enabled && permission.permission === 'granted' && await binding) {
          const device = await native.register();
          if (active) await bind(owner,device);
        }
        if (active) await open();
      } catch { /* Keep chat available when notification delivery is unavailable. */ }
      finally { refreshing = false; }
    };
    void native.addListener('registration', device => { if (active) void bind(owner, device).catch(() => {}); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    void native.addListener('opened', () => { void open().catch(() => {}); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    void refresh();
    return () => { active = false; clearTimeout(retry); listeners.forEach(handle => { void handle.remove(); }); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [owner]);
}

// Installation does not request permission and never caches member data.
if (!nativePush && webPushConfigured) void registerPushWorker().catch(() => {});
