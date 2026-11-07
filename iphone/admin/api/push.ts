import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openApns, type ApnsConfig, type PushJob } from '../server/apns.js';

function authorized(value: unknown, secret: string) {
  return typeof value === 'string' && timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update('Bearer ' + secret).digest());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'method_not_allowed' });
  const env = process.env;
  if (!env.CRON_SECRET || !authorized(req.headers.authorization, env.CRON_SECRET)) return res.status(401).json({ error: 'unauthorized' });
  const names = ['NISFAYN_SUPABASE_URL', 'NISFAYN_SERVICE_ROLE_KEY', 'APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_PRIVATE_KEY_BASE64', 'APNS_ENVIRONMENT', 'APNS_TOPIC'] as const;
  if (env.NISFAYN_PUSH_ENABLED !== 'true' || env.VERCEL_ENV !== 'production' || names.some(name => !env[name]) ||
      !['sandbox', 'production'].includes(env.APNS_ENVIRONMENT!) || env.APNS_TOPIC !== 'com.blindmatch.marriage') {
    return res.status(503).json({ error: 'push_not_configured' });
  }
  if (env.NISFAYN_SUPABASE_URL !== 'https://wupkifqbwhhebwrgvwai.supabase.co') {
    return res.status(503).json({ error: 'invalid_push_project' });
  }
  const url = new URL(env.NISFAYN_SUPABASE_URL);
  const rpc = async <T,>(name: string, payload: object): Promise<T> => {
    const response = await fetch(new URL('/rest/v1/rpc/' + name, url), {
      method: 'POST', headers: { apikey: env.NISFAYN_SERVICE_ROLE_KEY!, ...(env.NISFAYN_SERVICE_ROLE_KEY!.startsWith('eyJ') ? { Authorization: 'Bearer ' + env.NISFAYN_SERVICE_ROLE_KEY! } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('push_rpc_failed');
    return response.json() as Promise<T>;
  };
  let transport: ReturnType<typeof openApns> | undefined;
  const count = { claimed: 0, sent: 0, retry: 0, invalid: 0, failed: 0, revoked: 0 };
  try {
    const config: ApnsConfig = { teamId: env.APNS_TEAM_ID!, keyId: env.APNS_KEY_ID!, privateKey: env.APNS_PRIVATE_KEY_BASE64!, topic: env.APNS_TOPIC!, environment: env.APNS_ENVIRONMENT as ApnsConfig['environment'] };
    const jobs = await rpc<PushJob[]>('marriage_push_claim', { delivery_environment: config.environment, batch_size: 20 });
    count.claimed = jobs.length;
    if (jobs.length) transport = openApns(config);
    for (let start = 0; start < jobs.length; start += 5) {
      const batch = await Promise.allSettled(jobs.slice(start, start + 5).map(async job => {
        const live = await rpc<boolean>('marriage_push_validate', { job_id: job.id, lease: job.leaseId });
        const result = !live ? 'revoked' : job.environment !== config.environment ? 'retry' : await transport!.send(job);
        await rpc('marriage_push_finish', { job_id: job.id, lease: job.leaseId, result, device_token: job.token });
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
