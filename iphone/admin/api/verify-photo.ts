import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { compareAuthenticaFaces } from '../server/authenticaFace.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin === 'https://nisfayn-preview.vercel.app' || origin === 'capacitor://localhost') {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  } else if (origin) return res.status(403).json({ error: 'not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers.authorization;
  if (!token || !/^Bearer [^\s]+$/.test(token)) return res.status(401).json({ error: 'sign_in' });
  const { photoId, kind, selfie, consent, staged } = req.body ?? {};
  if (typeof photoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(photoId) || !['portrait', 'gallery'].includes(kind)
    || consent !== 'face-photo-v1' || typeof selfie !== 'string' || selfie.length > 1400000
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(selfie) || selfie.length % 4 !== 0) return res.status(400).json({ error: 'invalid_capture' });
  const env = process.env, url = env.NISFAYN_SUPABASE_URL, key = env.NISFAYN_SERVICE_ROLE_KEY;
  if (url !== 'https://wupkifqbwhhebwrgvwai.supabase.co' || !key || !env.AUTHENTICA_KEY?.trim()) return res.status(503).json({ error: 'unavailable' });
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } };
  const admin = createClient(url, key, options);
  try {
    const { data, error } = await admin.auth.getUser(token.slice(7));
    if (error || !data.user) return res.status(401).json({ error: 'sign_in' });
    const member = createClient(url, key, { ...options, global: { ...options.global, headers: { Authorization: token } } });
    // Checks the member's current session and server-owned gender, not user metadata.
    const required = staged === true && kind === 'portrait'
      ? await member.rpc('marriage_portrait_stage_action', { photo: photoId, action: 'status' })
      : await member.rpc('marriage_photo_face_required');
    if (required.error || (staged === true ? required.data?.requiresFace !== true : required.data !== true)) return res.status(403).json({ error: 'not_allowed' });
    const start = await admin.rpc('marriage_photo_face_begin', { member: data.user.id, photo: photoId, photo_kind: kind, consent });
    if (start.error) return res.status(start.error.message.includes('rate_limited') ? 429 : 403).json({ error: start.error.message.includes('rate_limited') ? 'rate_limited' : 'photo_unavailable' });
    const target = start.data as { attempt: string; bucket: string; path: string };
    const download = await admin.storage.from(target.bucket).download(target.path);
    if (download.error || !download.data || download.data.size > 3145728) return res.status(409).json({ error: 'photo_unavailable' });
    const reference = Buffer.from(await download.data.arrayBuffer());
    const result = await compareAuthenticaFaces({ memberId: data.user.id, referenceJpeg: reference, cameraJpeg: Buffer.from(selfie, 'base64') });
    if (!result.matched) return res.status(422).json({ error: 'no_match' });
    const finish = await admin.rpc('marriage_photo_face_finish', { attempt: target.attempt, member: data.user.id, image_hash: createHash('sha256').update(reference).digest('hex') });
    if (finish.error || finish.data !== true) return res.status(409).json({ error: 'photo_unavailable' });
    return res.status(200).json({ matched: true });
  } catch { return res.status(503).json({ error: 'unavailable' }); }
}
