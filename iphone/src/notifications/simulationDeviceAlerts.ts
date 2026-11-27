import type { PlannedDemoActivity } from '../community/simulation';
import type { CommunitySource } from '../community/data';
import type { PushControls, PushPreview } from './push';

export type DeviceActivityNotice = { eventId: string; dueAt: number; body: string; sound: boolean };
export type DemoAlertPreferences = { controls: PushControls; preview: PushPreview };

export async function simulationActivityDestination(source: CommunitySource, id: string) {
  const controller=source.simulation;
  if (!controller) return null;
  // Private paired sessions refresh exclusivity and retire closed connections here.
  await source.inbox();
  controller.reconcileActivity(id);
  const event=controller.snapshot().log.find(row=>row.id===id);
  if (!event || !['request','match','reply'].includes(event.kind)) return null;
  const requestOnly=event.kind==='request', connectionId=requestOnly ? event.id : event.connectionId;
  const row=(await source.inbox()).find(connection=>connection.id===connectionId && connection.person.isDemo && connection.person.id===event.personId);
  if (!row || row.status !== (requestOnly?'pending':'accepted')) return null;
  return {id:row.id,requestOnly,messageId:event.kind==='reply'?id:undefined};
}

export function deviceActivityNotice(plan: PlannedDemoActivity | undefined, preferences: DemoAlertPreferences | null,
  alias: string | undefined, now = Date.now()): DeviceActivityNotice | null {
  if (!plan || !alias || !preferences || !Number.isFinite(plan.dueAt) || plan.dueAt <= now) return null;
  const { controls, preview } = preferences;
  if (!(plan.kind === 'reply' ? controls.message : controls.connections)) return null;
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
