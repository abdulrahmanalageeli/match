import type { ActivityNotification, Connection } from '../community/data';
import type { MemberNotice } from './MemberNoticeBanner';
import type { PushControls } from './push';
import type { NoticeCategory } from './memberPushNotice';

type SnapshotStream = 'request' | 'visit' | 'sim-interest' | 'sim-match' | 'sim-message';
type Candidate = MemberNotice & { at?: string; stream?: SnapshotStream };
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

export function allowsMemberNotice(kind: NoticeCategory | 'request' | 'visit', controls: PushControls | null, now: number) {
  const category = kind === 'request' ? 'connections' : kind === 'visit' ? 'interest' : kind;
  if (!controls || (category !== 'publication' && !controls[category])) return false;
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
  private baseline: Partial<Record<SnapshotStream, number>> = {};
  private seen = new Map<SnapshotStream, Set<string>>();
  private offered = new Set<string>();
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
  private remember(key: string) {
    this.offered.add(key);
    if (this.offered.size > 512) this.offered.delete(this.offered.values().next().value!);
  }
  deliver(item: MemberNotice, epoch: number) {
    if (epoch !== this.epoch || this.offered.has(item.key)) return false;
    this.remember(item.key);
    this.replace([...this.queue,item]);
    return true;
  }
  observe(kind: SnapshotStream, rows: Candidate[], epoch: number, allowed: boolean) {
    if (epoch !== this.epoch) return;
    const seen = this.seen.get(kind) ?? new Set<string>();
    this.seen.set(kind, seen);
    const floor = this.baseline[kind], present = new Map(rows.map(row => [row.key,{...row,stream:kind}]));
    const next = this.queue.flatMap(item => {
      if (item.stream === kind) return allowed && present.has(item.key) ? [present.get(item.key)!] : [];
      // A signed push and a snapshot can arrive in either order. Enrich the same
      // on-screen request with its authorized sender, keeping the original timer.
      return allowed && present.has(item.key) ? [present.get(item.key)!] : [item];
    });
    if (allowed && floor !== undefined) {
      const additions = Array.from(present.values()).filter(item => {
        const stamp = Date.parse(item.at ?? '');
        return !seen.has(item.key) && !this.offered.has(item.key) && (!Number.isFinite(stamp) || stamp >= floor);
      }).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
      for (const item of additions) this.remember(item.key);
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
