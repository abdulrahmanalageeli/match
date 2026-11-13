import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers.origin && req.headers.origin !== 'https://nisfayn-admin.vercel.app') return res.status(403).end();
  const token = req.headers.authorization, photo = req.body?.photo;
  if (!token || !/^Bearer [^\s]+$/.test(token) || typeof photo !== 'string' || !/^[0-9a-f-]{36}$/i.test(photo)) return res.status(401).end();
  const url = process.env.NISFAYN_SUPABASE_URL, key = process.env.NISFAYN_SERVICE_ROLE_KEY;
  if (url !== 'https://wupkifqbwhhebwrgvwai.supabase.co' || !key) return res.status(503).end();
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } };
  try {
    const member = createClient(url, key, { ...options, global: { ...options.global, headers: { Authorization: token } } });
    // This RPC enforces active staff membership, MFA, queue status and audits access.
    const target = await member.rpc('marriage_admin_portrait_media', { photo });
    if (target.error || !target.data) return res.status(403).end();
    const admin = createClient(url, key, options);
    const file = await admin.storage.from(target.data.bucket).download(target.data.path);
    if (file.error || !file.data || file.data.size > 3145728) return res.status(404).end();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(Buffer.from(await file.data.arrayBuffer()));
  } catch { return res.status(503).end(); }
}
