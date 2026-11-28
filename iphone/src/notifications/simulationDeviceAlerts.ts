import type { PlannedDemoActivity } from '../community/simulation';
import type { CommunitySource } from '../community/data';
import type { PushControls, PushPreview } from './push';

export type DeviceActivityNotice = { eventId: string; dueAt: number; body: string; sound: boolean };
export type DemoAlertPreferences = { controls: PushControls; preview: PushPreview };

export async function resolveSimulationActivity(source: CommunitySource, id: string, current = () => true) {
  const controller=source.simulation;
  if (!controller) return null;
  // Private paired sessions refresh exclusivity and retire closed connections here.
  await source.inbox();
  if (!current()) return null;
  controller.reconcileActivity(id);
  const {log}=controller.snapshot();
  const event=log.find(row=>row.id===id);
  if (!event) return null;
  if (event.kind === 'profile_visit' || event.kind === 'interest') {
    const activity = (await source.notifications?.())?.find(row => row.id === id && row.kind === event.kind
      && row.person.isDemo && row.person.id === event.personId);
    return activity && current() ? {type:'activity' as const, activity} : null;
  }
  if (!['request','match','reply'].includes(event.kind)) return null;
  const requestOnly=event.kind==='request', connectionId=requestOnly ? event.id : event.connectionId;
  const row=(await source.inbox()).find(connection=>connection.id===connectionId && connection.person.isDemo && connection.person.id===event.personId);
  if (!row || row.status !== (requestOnly?'pending':'accepted') || !current()) return null;
  return {type:'connection' as const, connection:row, event, log};
}

export async function simulationActivityDestination(source: CommunitySource, id: string) {
  const result = await resolveSimulationActivity(source,id);
  if (!result) return null;
  if (result.type === 'activity') return result.activity.kind === 'profile_visit'
    ? {id:result.activity.id, requestOnly:true, foreground:'visit' as const}
    : {id:result.activity.person.id, requestOnly:true, interest:true};
  return {id:result.connection.id,requestOnly:result.event.kind==='request',messageId:result.event.kind==='reply'?id:undefined};
}

export function deviceActivityNotice(plan: PlannedDemoActivity | undefined, preferences: DemoAlertPreferences | null,
  alias: string | undefined, now = Date.now()): DeviceActivityNotice | null {
  if (!plan || !alias || !preferences || !Number.isFinite(plan.dueAt) || plan.dueAt <= now) return null;
  const { controls, preview } = preferences;
  const category = {reply:'message', profile_visit:'interest', interest:'interest', request:'connections', match:'connections'} as const;
  if (!controls[category[plan.kind]]) return null;
  let sound = controls.sound;
  if (sound && controls.quiet) {
    try {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: controls.zone }).format(plan.dueAt));
      const quiet = controls.start < controls.end ? hour >= controls.start && hour < controls.end : hour >= controls.start || hour < controls.end;
      sound = !quiet;
    } catch { sound = false; }
  }
  const event = {profile_visit:'زيارة جديدة لملفك', interest:'اهتمام جديد بملفك', request:'طلب تعارف جديد', reply:'رسالة جديدة', match:'تعارف متبادل جديد'}[plan.kind];
  const named = plan.kind==='match' ? 'تعارف متبادل مع ' + alias : event + ' من ' + alias;
  const body = preview === 'name' || preview === 'content' ? named : preview === 'event' ? event : 'إشعار جديد';
  return {eventId:plan.id, dueAt:plan.dueAt, sound, body};
}
