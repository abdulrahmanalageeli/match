import type { ActivityNotification, Connection } from '../community/data';
import type { MemberNotice } from './MemberNoticeBanner';
import type { PushControls } from './push';

type Kind = MemberNotice['kind'];
type Candidate = MemberNotice & { at?: string };
export function incomingNotices(rows: Connection[], now: number): Candidate[] {
  return rows.filter(row => row.status === 'pending' && row.direction === 'incoming' &&
    (!row.expiresAt || Date.parse(row.expiresAt) > now)).map(row => ({
    kind: 'request', key: 'request:' + row.id, requestId: row.id, person: row.person, at: row.createdAt,
  }));
}
export function visitNotices(rows: ActivityNotification[]): Candidate[] {
  return rows.filter(row => row.kind === 'profile_visit' && !row.readAt).map(row => ({
    kind: 'visit', key: 'visit:' + row.id, person: row.person, at: row.createdAt,
  }));
}

export function allowsMemberNotice(kind: Kind, controls: PushControls | null, now: number) {
  if (!controls || !(kind === 'request' ? controls.connections : controls.interest)) return false;
  if (!controls.quiet) return true;
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', {hour: '2-digit', hourCycle: 'h23', timeZone: controls.zone}).format(now));
    const {start, end} = controls;
    return !(start < end ? hour >= start && hour < end : hour >= start || hour < end);
  } catch { return false; }
}

// Each authorized stream establishes its own baseline. A late response cannot cross a background
// transition. Dismissing a notice consumes its presentation only, leaving its feed record intact.
export class MemberNoticeObservation {
  epoch = 0;
  private baseline: Partial<Record<Kind, number>> = {};
  private seen = {request: new Set<string>(), visit: new Set<string>()};
  private queue: Candidate[] = [];
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  first = (): MemberNotice | null => this.queue[0] ?? null;
  private replace(next: Candidate[]) {
    const previous = this.first();
    this.queue = next;
    if (previous !== this.first()) this.listeners.forEach(fn => fn());
  }
  reset() {
    this.epoch++;
    this.baseline = {};
    this.replace([]);
  }
  dismiss(key: string) { this.replace(this.queue.filter(item => item.key !== key)); }
  observe(kind: Kind, rows: Candidate[], epoch: number, allowed: boolean) {
    if (epoch !== this.epoch) return;
    const seen = this.seen[kind], floor = this.baseline[kind], present = new Map(rows.map(row => [row.key, row]));
    const next = this.queue.flatMap(item => item.kind !== kind ? [item] : allowed && present.has(item.key) ? [present.get(item.key)!] : []);
    if (allowed && floor !== undefined) {
      const additions = Array.from(present.values()).filter(item => {
        const stamp = Date.parse(item.at ?? '');
        return !seen.has(item.key) && (!Number.isFinite(stamp) || stamp >= floor);
      }).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
      next.push(...additions);
    }
    if (floor === undefined) {
      // A bounded feed may surface an older row later. Compare timestamps from the same
      // server snapshot; a member's phone clock and network delay never decide freshness.
      this.baseline[kind] = rows.reduce((latest, item) => Math.max(latest, Date.parse(item.at ?? '') || -Infinity), -Infinity);
    }
    present.forEach((_, key) => seen.add(key));
    this.replace(next);
  }
}
