import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openApns, type ApnsConfig, type PushJob, type PushDetails } from '../server/apns.js';
import { openWebPush, type WebPushJob } from '../server/webPush.js';

function authorized(value: unknown, secret: string) {
  return typeof value === 'string' && timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update('Bearer ' + secret).digest());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'method_not_allowed' });
  const env = process.env;
  if (!env.CRON_SECRET || !authorized(req.headers.authorization, env.CRON_SECRET)) return res.status(401).json({ error: 'unauthorized' });
  const nativeEnabled = env.NISFAYN_PUSH_ENABLED === 'true';
  const webEnabled = env.NISFAYN_WEB_PUSH_ENABLED === 'true';
  const nativeReady = ['APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_PRIVATE_KEY_BASE64'].every(name => Boolean(env[name]))
    && ['sandbox', 'production'].includes(env.APNS_ENVIRONMENT!) && env.APNS_TOPIC === 'com.blindmatch.marriage';
  const webReady = ['WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT'].every(name => Boolean(env[name]));
  if ((!nativeEnabled && !webEnabled) || env.VERCEL_ENV !== 'production' || !env.NISFAYN_SUPABASE_URL || !env.NISFAYN_SERVICE_ROLE_KEY ||
      (nativeEnabled && !nativeReady) || (webEnabled && !webReady)) {
    return res.status(503).json({ error: 'push_not_configured' });
  }
  if (env.NISFAYN_SUPABASE_URL !== 'https://wupkifqbwhhebwrgvwai.supabase.co') {
    return res.status(503).json({ error: 'invalid_push_project' });
  }
  const url = new URL(env.NISFAYN_SUPABASE_URL);
  const rpc = async <T,>(name: string, payload: object): Promise<T> => {
    const response = await fetch(new URL('/rest/v1/rpc/' + name, url), {
      method: 'POST', headers: { apikey: env.NISFAYN_SERVICE_ROLE_KEY!, ...(env.NISFAYN_SERVICE_ROLE_KEY!.startsWith('eyJ') ? { Authorization: 'Bearer ' + env.NISFAYN_SERVICE_ROLE_KEY! } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('push_rpc_failed');
    return response.json() as Promise<T>;
  };
  let transport: ReturnType<typeof openApns> | undefined;
  const webTransport = webEnabled ? openWebPush({ subject: env.WEB_PUSH_VAPID_SUBJECT!, publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY!, privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY! }) : undefined;
  const count = { claimed: 0, sent: 0, retry: 0, invalid: 0, failed: 0, revoked: 0 };
  try {
    await rpc('nisfayn_enqueue_deadline_reminders',{});
    const deadline = Date.now() + 40000;
    const jobs: ((PushJob | WebPushJob) & { tester?: boolean })[] = [];
    if (nativeEnabled) {
      const config: ApnsConfig = { teamId: env.APNS_TEAM_ID!, keyId: env.APNS_KEY_ID!, privateKey: env.APNS_PRIVATE_KEY_BASE64!, topic: env.APNS_TOPIC!, environment: env.APNS_ENVIRONMENT as ApnsConfig['environment'] };
      jobs.push(...await rpc<PushJob[]>('marriage_push_claim', { delivery_environment: config.environment, batch_size: webEnabled ? 10 : 20 }));
      const testerJobs = await rpc<PushJob[]>('nisfayn_test_push_claim', { delivery_environment: config.environment, batch_size: 10 });
      jobs.push(...testerJobs.map(job => ({ ...job, tester: true })));
      if (jobs.length) transport = openApns(config);
    }
    if (webEnabled) jobs.push(...await rpc<WebPushJob[]>('marriage_push_claim', { delivery_environment: 'web', batch_size: nativeEnabled ? 10 : 20 }));
    count.claimed = jobs.length;
    for (let start = 0; start < jobs.length; start += 5) {
      // Unstarted leases expire normally; do not begin work beyond the host's
      // execution budget and risk acknowledging an incomplete delivery.
      if (Date.now() >= deadline) break;
      const batch = await Promise.allSettled(jobs.slice(start, start + 5).map(async job => {
        const details = await rpc<PushDetails|null>('nisfayn_push_content',{job_id:job.id,lease:job.leaseId,tester:!!job.tester});
        const live = details !== null;
        if(details)job.details=details;
        const result = !live ? 'revoked' : job.environment === 'web' ? await webTransport!.send(job) : await transport!.send(job);
        await rpc(job.tester ? 'nisfayn_test_push_finish' : 'marriage_push_finish', { job_id: job.id, lease: job.leaseId, result, device_token: job.token });
        count[result]++;
      }));
      if (batch.some(result => result.status === 'rejected')) throw new Error('push_batch_incomplete');
    }
    console.info(JSON.stringify({ event: 'push_batch', ...count }));
    return res.status(200).json(count);
  } catch {
    console.error(JSON.stringify({ event: 'push_batch_failed', claimed: count.claimed, sent: count.sent }));
    return res.status(503).json({ error: 'push_delivery_unavailable' });
  } finally { transport?.close(); }
}
