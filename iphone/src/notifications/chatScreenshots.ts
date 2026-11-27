import type { ActivityNotification, CommunitySource } from '../community/data';

export const captureTitle = (alias: string) => `لقطة شاشة من ${alias}`;
export const captureDetail = 'تم التقاطها داخل المحادثة.';
const latest = new WeakMap<CommunitySource, Map<string, ActivityNotification>>();
type OwnCapture = { id: string; createdAt: string; own: true };
const ownCaptures = new WeakMap<CommunitySource, Map<string, OwnCapture>>();
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
export function latestPeerChatScreenshot(source: CommunitySource, id: string) {
  return latest.get(source)?.get(id);
}
export function latestChatScreenshot(source: CommunitySource, id: string) {
  const peer = latestPeerChatScreenshot(source, id);
  const own = ownCaptures.get(source)?.get(id);
  return own && (!peer || Date.parse(own.createdAt) >= Date.parse(peer.createdAt)) ? own : peer;
}
export function recordOwnChatScreenshot(source: CommunitySource, requestId: string, eventId: string) {
  const events = ownCaptures.get(source) ?? new Map<string, OwnCapture>();
  if (events.get(requestId)?.id === eventId) return;
  const now = Date.now();
  for (const [id, event] of events) {
    if (now - Date.parse(event.createdAt) > 60_000) events.delete(id);
  }
  events.set(requestId, { id: eventId, createdAt: new Date(now).toISOString(), own: true });
  ownCaptures.set(source, events);
  subscribers.forEach(update => update());
}
export function watchChatScreenshots(update: () => void) {
  subscribers.add(update);
  return () => { subscribers.delete(update); };
}
