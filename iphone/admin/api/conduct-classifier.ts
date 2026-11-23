import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function classifyEnvelope(input: unknown, stamp: unknown, signature: unknown, secret: string, approvedModel: string, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof stamp !== 'string' || !/^\d{10}$/.test(stamp)
    || Math.abs(now / 1000 - Number(stamp)) > 120 || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)
    || secret.length < 32 || !/^[A-Za-z0-9_.:-]{1,80}$/.test(approvedModel)) return null;
  const { command, ticket, model, decision = null } = input as Record<string,unknown>;
  if (Object.keys(input).some(k => !['command','ticket','model','decision'].includes(k)) || model !== approvedModel || typeof ticket !== 'string' || !uuid.test(ticket)
    || (command !== 'claim' && command !== 'finish') || (command === 'claim' ? decision !== null : decision !== 'review' && decision !== 'hold')) return null;
  const canonical = JSON.stringify(['conduct-v1',stamp,command,ticket,model,decision]);
  const digest = createHmac('sha256',secret).update(canonical).digest();
  if (!timingSafeEqual(digest,Buffer.from(signature,'hex'))) return null;
  return { command, ticket, model_version:approvedModel, decision };
}

export default async function handler(req: VercelRequest,res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const { WUDAYN_CONDUCT_SIGNING_SECRET:secret, WUDAYN_CONDUCT_APPROVED_MODEL:model, NISFAYN_SERVICE_ROLE_KEY:key, NISFAYN_SUPABASE_URL:url } = process.env;
  if (process.env.VERCEL_ENV!=='production' || process.env.WUDAYN_CONDUCT_CLASSIFIER_ENABLED!=='true' || !secret || secret.length<32 || !model || !key || url!=='https://wupkifqbwhhebwrgvwai.supabase.co') return res.status(503).end();
  const input=classifyEnvelope(req.body,req.headers['x-conduct-timestamp'],req.headers['x-conduct-signature'],secret,model);
  if (!input) return res.status(401).end();
  try {
    const result=await fetch(url+'/rest/v1/rpc/marriage_conduct_classifier',{method:'POST',
      headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},
      body:JSON.stringify(input),signal:AbortSignal.timeout(8000)});
    if (!result.ok) return res.status(result.status>=500?503:409).end();
    return res.status(200).json(await result.json());
  } catch { return res.status(503).end(); }
}
