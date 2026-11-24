import type { ActivityNotification, CommunitySource } from '../community/data';

export const captureTitle = (alias: string) => `أبلغ جهاز ${alias} عن لقطة شاشة`;
export const captureDetail = 'لقطة شاشة في محادثتكما على تطبيق الآيفون.';
const latest = new WeakMap<CommunitySource, Map<string, ActivityNotification>>();
const subscribers = new Set<() => void>();

// Reuse the activity feed's authorized snapshot, including previously read alerts.
export function publishChatScreenshots(source: CommunitySource, rows: ActivityNotification[]) {
  const next = new Map<string, ActivityNotification>();
  for (const row of rows) {
    if (row.kind !== 'screenshot' || !row.requestId) continue;
    const previous = next.get(row.requestId);
    if (!previous || row.createdAt > previous.createdAt) next.set(row.requestId, row);
  }
  const old = latest.get(source);
  if (next.size === (old?.size ?? 0) && [...next].every(([id, row]) => old?.get(id)?.id === row.id)) return;
  latest.set(source, next);
  subscribers.forEach(update => update());
}
export function latestChatScreenshot(source: CommunitySource, id: string) {
  return latest.get(source)?.get(id);
}
export function watchChatScreenshots(update: () => void) {
  subscribers.add(update);
  return () => { subscribers.delete(update); };
}
