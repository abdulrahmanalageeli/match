import { publicationBuild } from '../publishing/appBuild';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { callRpc, cloudSessionId } from '../cloud';
import { notificationScope } from './scope';
import { testRequest } from '../testing/pair';
import { demoPeople, type CommunitySource } from '../community/data';
import { deviceActivityNotice, type DemoAlertPreferences, type DeviceActivityNotice } from './simulationDeviceAlerts';
const testerRequestId = '00000000-0000-4000-8000-000000000001';
const isTester = (owner: string) => owner.startsWith('tester:');
const currentOwner = async (owner: string) => isTester(owner) || (await cloudSessionId()) === owner;
const pushRpc = <T,>(owner: string, action: string, payload = {}) => isTester(owner)
  ? testRequest<T>('push_' + action, owner.slice(7), payload)
  : callRpc<T>('marriage_push_' + action, payload, owner);
import { disableWebPush, enableWebPush, registerWebPushDevice, monitorWebPush, registerPushWorker, webPushConfigured, webPushStatus, webPushSupported } from './webPush';

import { isUpdateEvent, type UpdateEvent } from '../../admin/server/updateEvents';

export type PushOpen = { requestId: string; kind: 'request' | 'mutual' | 'message' | 'reminder' | 'family' | 'analysis' | 'publication' | 'simulation' | 'update';event?:UpdateEvent;scope?: string;actionId?:string;action?:'reply'|'read';text?:string;messageId?:string;roomId?:string };
export type InAppUpdate = {id:string;event:UpdateEvent;target:string;createdAt:string;unread:boolean};

export async function notificationUpdates(owner:string,readId?:string):Promise<InAppUpdate[]> {
  const rows=await pushRpc<InAppUpdate[]>(owner,'updates',{read_id:readId??null});
  return rows.filter(row=>isUpdateEvent(row.event)&&/^[0-9a-f-]{36}$/i.test(row.target));
}
type Device = { token: string; installationId: string; environment: 'sandbox' | 'production' };
type Permission = { buildNumber?:string; permission: 'granted' | 'prompt' | 'denied'; installationId: string };
interface NativePush {
  status(): Promise<Permission>;
  clearDelivered(): Promise<void>;
  setOwner(options: {scope: string | null}): Promise<void>;
  setSimulationActivity(options: {scope:string} & Partial<DeviceActivityNotice>): Promise<void>;
  register(): Promise<Device>;
  unregister(): Promise<void>;
  openSettings(): Promise<void>;
  openStoreListing(options: { url: string }): Promise<void>;
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
export async function readNativeBuild() {
  const value = Number((await native.status()).buildNumber);
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999) throw new Error('تعذّر قراءة إصدار التطبيق.');
  return value;
}
export const openStoreListing = (url: string) => native.openStoreListing({ url });
export const pushStatus = () => nativePush ? native.status() : webPushStatus();
export const openPushSettings = () => native.openSettings();
export const getPushPreference = (owner: string) => pushRpc<{ enabled: boolean }>(owner, 'settings');
export type PushPreview='private'|'event'|'name'|'content';
export async function pushPrivacy(owner:string,preview_mode?:PushPreview) {
  const saved = await pushRpc<{preview:PushPreview;configured?:boolean}>(owner,'privacy',{preview_mode:preview_mode??null});
  if (nativePush && preview_mode) {
    window.dispatchEvent(new Event('wudayn:push-controls'));
    await native.clearDelivered();
  }
  return saved;
}
export async function pushThreadMute(owner:string,request_id:string,muted?:boolean) {
  return pushRpc<{muted:boolean}>(owner,'thread_mute',{request_id,muted:muted??null});
}
export async function setPushBadge(count:number,owner:string|null) {
  if (nativePush && owner) {
    const scope=await notificationScope(owner,(await native.status()).installationId);
    await native.badge({count:Math.max(0,Math.floor(count)),scope});
  }
}

export const defaultPushControls = {
  message:true, connections:true, family:true, reminder:true, analysis:false, agreement:true, account:true, membership:true, interest:true, screenshot:false, sound:true,
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
let registeredOwner: string | null = null;
let registration: { owner: string; ready: Promise<string> } | undefined;
export const pushDeviceRegistered = (owner: string) => registeredOwner === owner;
function setRegisteredOwner(next: string | null) {
  if (registeredOwner === next) return;
  registeredOwner = next;
  window.dispatchEvent(new Event('wudayn:push-registration'));
}
let pendingOwnerSync:Promise<string|null>|null = null;
export function syncNativePushOwner(owner: string | null):Promise<string|null> {
  if (!nativePush) return Promise.resolve(null);
  if (bindingOwner===owner && pendingOwnerSync) return pendingOwnerSync;
  if (bindingOwner !== owner) setRegisteredOwner(null);
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
  if (!await currentOwner(owner) || bindingOwner !== owner) throw new Error('تغيّر الحساب.');
  await pushRpc(owner, 'register', { device_token: device.token, device_environment: device.environment, installation: device.installationId });
  if (bindingOwner !== owner) throw new Error('تغيّر الحساب.');
  setRegisteredOwner(owner);
  if(!isTester(owner)) await callRpc('wudayn_news_preference',{installation:device.installationId,build:publicationBuild((await native.status()).buildNumber)},owner).catch(()=>{});
}
export async function registerPushDevice(owner: string) {
  if (!nativePush) return registerWebPushDevice(owner);
  if (!pushConfigured) throw new Error('لم تُفعّل خدمة الإشعارات بعد.');
  if (registration?.owner === owner && bindingOwner === owner) return registration.ready;
  const ready = (async () => {
    const scope = await syncNativePushOwner(owner);
    if (!scope) throw new Error('سجّل الدخول مجددًا لتفعيل الإشعارات.');
    const device = await native.register();
    await bind(owner, device);
    return device.installationId;
  })();
  registration = {owner, ready};
  try { return await ready; }
  finally { if (registration?.ready === ready) registration = undefined; }
}
export async function enablePush(owner: string) {
  if (!nativePush) return enableWebPush(owner);
  await registerPushDevice(owner);
  const next = await pushRpc<{ enabled: boolean }>(owner, 'enable', { enabled: true });
  window.dispatchEvent(new Event('wudayn:push-registration'));
  window.dispatchEvent(new Event('wudayn:push-controls'));
  return next;
}
export async function disablePush(owner: string) {
  if (!nativePush) return disableWebPush(owner);
  const next = await pushRpc<{ enabled: boolean }>(owner, 'enable', { enabled: false });
  window.dispatchEvent(new Event('wudayn:push-controls'));
  const state = await native.status();
  await pushRpc(owner, 'unregister', { installation: state.installationId });
  if (bindingOwner === owner && await currentOwner(owner)) { await native.unregister(); setRegisteredOwner(null); }
  return next;
}

// No permission prompt on launch. Only rebind already authorized, opted-in devices.
export function usePushNotifications(owner: string | null, onOpen: (requestId: string, kind: PushOpen['kind'],event?:PushOpen) => void|Promise<void>, simulation?: CommunitySource | null) {
  const callback = useRef({owner,onOpen});
  callback.current = {owner,onOpen};
  useEffect(() => {
    if (!owner || !pushConfigured || (isTester(owner) && !nativePush)) return;
    if (!nativePush) {
      if (!webPushSupported()) return;
      return monitorWebPush(owner, event => { if (callback.current.owner === owner) void callback.current.onOpen(event.requestId, event.kind,event); });
    }
    const notificationOwner = owner;
    let binding: Promise<string | null> | undefined;
    const getBinding = () => binding ??= syncNativePushOwner(owner).catch(error => { binding = undefined; throw error; });
    let active = true, refreshing = false, opening=false, reopen=false, failures=0;
    let preferences:DemoAlertPreferences|null=null, preferenceRevision=0, simulatedScope:string|null=null, lastNotice:string|undefined;
    function syncSimulation() {
      if (!active || !simulatedScope || bindingOwner !== owner) return;
      const plan = simulation?.simulation?.nextActivity();
      const notice = deviceActivityNotice(plan, preferences, plan && demoPeople.find(person=>person.id===plan.personId)?.alias);
      const signature = JSON.stringify(notice);
      if (lastNotice === signature) return;
      lastNotice = signature;
      void native.setSimulationActivity({scope:simulatedScope,...notice}).catch(()=>{
        if (lastNotice===signature) lastNotice=undefined;
      });
    }
    const readDeliverySettings = () => Promise.all([getPushPreference(notificationOwner),native.status()]);
    async function refreshSimulationPreferences(settings?: ReturnType<typeof readDeliverySettings>) {
      if (simulation === undefined || document.hidden) return;
      const revision = ++preferenceRevision;
      const scope = await getBinding().catch(() => null);
      if (!active || !scope || revision!==preferenceRevision || bindingOwner!==owner) return;
      simulatedScope = scope;
      preferences = null;
      syncSimulation();
      if (!simulation) return;
      try {
        const [setting, permission] = await (settings ?? readDeliverySettings());
        if (!active || revision!==preferenceRevision || !setting.enabled || permission.permission !== 'granted') return;
        const [controls,privacy] = await Promise.all([pushControls(notificationOwner),pushPrivacy(notificationOwner)]);
        if (!active || revision!==preferenceRevision) return;
        preferences = {controls, preview:privacy.preview};
        syncSimulation();
      } catch { /* An unconfirmed preference leaves the device schedule empty. */ }
    }
    const settingsChanged = () => { void refreshSimulationPreferences(); };
    const stopSimulation = simulation?.watch(syncSimulation);
    let retry:ReturnType<typeof setTimeout>|undefined;
    let registrationRetry: ReturnType<typeof setTimeout> | undefined;
    let registrationFailures = 0;
    const listeners: PluginListenerHandle[] = [];
    const open = async () => {
      if(!active)return;
      if(opening){reopen=true;return;}
      opening=true;let acknowledged=false;
      try {
      const scope = await getBinding();
      if (!active || !scope) return;
      const { notification } = await native.consumeOpen();
      if (!notification || !await currentOwner(owner) || !active || callback.current.owner !== owner) return;
      if (notification.kind === 'simulation') {
        // Account state may still be restoring. Retry when the verified source arrives.
        if (simulation === undefined) return;
        if (scope === notification.scope && simulation && !notification.action) await callback.current.onOpen(notification.requestId, 'simulation', notification);
        if (notification.actionId) { await native.acknowledgeOpen({actionId:notification.actionId}); acknowledged=true; }
        return;
      }
      if (/^[0-9a-f-]{36}$/i.test(notification.requestId) && ['request','mutual','message','reminder','family','analysis','publication','update'].includes(notification.kind) && (notification.kind !== 'update' || isUpdateEvent(notification.event))) {
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
        const settings = readDeliverySettings();
        if (simulation !== undefined) void refreshSimulationPreferences(settings);
        const [preference, permission] = await settings;
        if (active && callback.current.owner === owner && preference.enabled && permission.permission === 'granted') {
          await registerPushDevice(owner);
        }
        registrationFailures = 0;
        clearTimeout(registrationRetry);
        if (active) await open();
      } catch {
        if (active && registrationFailures < 4) {
          clearTimeout(registrationRetry);
          registrationRetry = setTimeout(refresh, 1500 * 2 ** registrationFailures++);
        }
      }
      finally { refreshing = false; }
    };
    void native.addListener('registration', device => { if (active && registration?.owner !== owner) void bind(owner, device).catch(() => { void refresh(); }); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    void native.addListener('opened', () => { void open().catch(() => {}); }).then(handle => { if (active) listeners.push(handle); else void handle.remove(); }).catch(() => {});
    const resume = () => { registrationFailures = 0; void refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    if (simulation !== undefined) {
      window.addEventListener('wudayn:push-controls', settingsChanged);
    }
    void refresh();
    return () => {
      active=false; stopSimulation?.(); clearTimeout(retry); clearTimeout(registrationRetry); listeners.forEach(handle=>{ void handle.remove(); });
      document.removeEventListener('visibilitychange', resume); window.removeEventListener('online',resume);
      window.removeEventListener('wudayn:push-controls',settingsChanged);
      if (simulatedScope) void native.setSimulationActivity({scope:simulatedScope}).catch(()=>{});
    };
  }, [owner,simulation]);
}

// Installation does not request permission and never caches member data.
if (!nativePush && webPushConfigured) void registerPushWorker().catch(() => {});
