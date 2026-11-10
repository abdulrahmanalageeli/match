import { createHash } from 'node:crypto';
import * as webPush from 'web-push';
import { pushPayload, type DeliveryResult, type PushKind, type PushDetails } from './apns.js';

export type WebSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type WebPushJob = { id: string; leaseId: string; requestId: string; kind: PushKind; token: string; environment: 'web'; expiresAt: string; subscription: WebSubscription; details?: PushDetails };
export type WebPushConfig = { subject: string; publicKey: string; privateKey: string };

// Subscription addresses are supplied by clients. Never let this worker become
// an authenticated HTTP proxy to arbitrary hosts, ports or local services.
export function validWebSubscription(value: unknown): value is WebSubscription {
  if (!value || typeof value !== 'object') return false;
  const sub = value as WebSubscription;
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048 || !sub.keys) return false;
  try {
    const url = new URL(sub.endpoint);
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
      || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname === '/') return false;
    if (!/^[A-Za-z0-9_-]{87}$/.test(sub.keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(sub.keys.auth)) return false;
    return Buffer.from(sub.keys.p256dh, 'base64url').length === 65 && Buffer.from(sub.keys.auth, 'base64url').length === 16;
  } catch { return false; }
}

export function classifyWebPush(status: number): DeliveryResult {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'invalid';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

export function webPushPayload(job: Pick<WebPushJob, 'requestId' | 'kind' | 'details'>) {
  const payload = pushPayload({ ...job, details: job.details ? { ...job.details, preview: 'private' } : undefined });
  // No profile names, message previews, photographs, member IDs or auth tokens.
  return { title: payload.aps.alert.title, body: payload.aps.alert.body, requestId: payload.requestId, kind: payload.kind, ...(payload.messageId ? { messageId: payload.messageId } : {}), ...(payload.roomId ? { roomId: payload.roomId } : {}) };
}

export function openWebPush(config: WebPushConfig, send: typeof webPush.sendNotification = webPush.sendNotification) {
  return {
    async send(job: WebPushJob): Promise<DeliveryResult> {
      if (job.environment !== 'web' || !validWebSubscription(job.subscription)) return 'failed';
      const ttl = Math.min(900, Math.floor((Date.parse(job.expiresAt) - Date.now()) / 1000));
      if (!Number.isFinite(ttl) || ttl <= 0) return 'failed';
      try {
        const result = await send(job.subscription, JSON.stringify(webPushPayload(job)), {
          vapidDetails: config, TTL: ttl, timeout: 8000, contentEncoding: 'aes128gcm', urgency: job.kind === 'reminder' ? 'low' : 'high',
          topic: createHash('sha256').update(job.kind + ':' + job.requestId).digest('base64url').slice(0, 32),
        });
        return classifyWebPush(result.statusCode);
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        // Never log provider responses: they can contain private endpoint URLs.
        return typeof status === 'number' ? classifyWebPush(status) : 'retry';
      }
    },
  };
}
