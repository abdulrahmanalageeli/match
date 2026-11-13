import { InterviewError, createInterviewService, MAX_BODY } from './_lib/interview.mjs';

const serve = createInterviewService();
const nativeOrigins = new Set(['capacitor://localhost', 'http://localhost']);
const allowedHeaders = ['content-type', 'authorization', 'x-test-session'];
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  const native = typeof origin === 'string' && nativeOrigins.has(origin);
  if (native) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Test-Session');
  }
  if (req.method === 'OPTIONS') {
    const asked = req.headers['access-control-request-headers'];
    if (!native || req.headers['access-control-request-method'] !== 'POST'
      || (asked && (typeof asked !== 'string' || asked.split(',').some(name => !allowedHeaders.includes(name.trim().toLowerCase()))))) {
      return res.status(403).json({ error: 'Origin or preflight not allowed', code: 'cors' });
    }
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed', code: 'method' });
  }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return res.status(413).json({ error: 'الطلب أطول من المسموح.', code: 'too_large' });
  try { return res.status(200).json(await serve(req.body, req.headers)); }
  catch (error) {
    const known = error instanceof InterviewError;
    return res.status(known ? error.status : 503).json({ error: known ? error.message : 'تعذّر الاتصال الآن. حاول مجددًا.', code: known ? error.code : 'unavailable' });
  }
}
