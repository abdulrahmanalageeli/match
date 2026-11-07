import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { assertVerificationActionAllowed, readVerificationBody, validVerificationPath, validateVerificationFile, verificationBucket, verificationError, verificationLimit } from '../_shared/verification-media.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,apikey,authorization,x-test-session,x-request-id', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    if (url !== 'https://wupkifqbwhhebwrgvwai.supabase.co') throw verificationError('الخدمة غير متاحة.', 503);
    const upload = new URL(request.url).searchParams.get('action') === 'upload';
    // Refuse binary bodies before reading or forwarding any document bytes.
    if (upload) assertVerificationActionAllowed('upload');
    let input: { action?: string; payload?: Record<string, unknown>; testSession?: string } = {};
    if (!upload) {
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw verificationError('طلب غير صالح.', 415);
      input = JSON.parse(new TextDecoder().decode(await readVerificationBody(request, 8192)));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw verificationError('طلب غير صالح.');
      assertVerificationActionAllowed(input.action);
    }
    const testToken = upload ? request.headers.get('x-test-session') ?? '' : input.testSession ?? '';
    if (typeof testToken !== 'string' || (testToken && !/^[0-9a-f]{64}$/.test(testToken))) throw verificationError('انتهت جلسة الاختبار.', 401);
    const authorization = request.headers.get('authorization');
    if (!testToken && (!authorization?.startsWith('Bearer ') || authorization.length > 8192)) throw verificationError('سجّل الدخول للمتابعة.', 401);
    const mapped = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
    const anonKey = (mapped ? JSON.parse(mapped).default : null) || Deno.env.get('SUPABASE_ANON_KEY');
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    // PostgREST validates the JWT; SQL also checks the live auth.sessions record.
    // Tester mode never inherits a staff JWT even if a caller sends both credentials.
    const caller = createClient(url, anonKey!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: !testToken && authorization ? { Authorization: authorization } : {} } });
    const rpc = async (action: string, payload: Record<string, unknown>) => {
      const { data, error } = await caller.rpc('marriage_manual_verification', { action, payload, test_token: testToken });
      if (error) throw verificationError(error.message, error.code === '42501' ? 403 : error.code === '40001' ? 409 : 400);
      return data;
    };
    const cleanup = async () => {
      const { data, error } = await service.rpc('marriage_verification_cleanup_batch');
      if (error || !Array.isArray(data) || data.length > 100 || data.some(path => !validVerificationPath(path))) return;
      if (data.length) {
        const { error: removeError } = await service.storage.from(verificationBucket).remove(data);
        if (!removeError) await service.rpc('marriage_verification_cleanup_done', { paths: data });
      }
    };
    if (upload) {
      const requestId = request.headers.get('x-request-id') ?? '';
      if (!uuid.test(requestId)) throw verificationError('طلب غير صالح.');
      const reservation = await rpc('upload', { requestId });
      if (!validVerificationPath(reservation?.path)) throw verificationError('المستند غير متاح.', 403);
      const mime = request.headers.get('content-type')?.split(';')[0] ?? '';
      if (mime !== reservation.mimeType) throw verificationError('نوع المستند غير مطابق.');
      const bytes = await readVerificationBody(request, verificationLimit);
      validateVerificationFile(bytes, mime, reservation.sizeBytes);
      const { error } = await service.storage.from(verificationBucket).upload(reservation.path, bytes, { contentType: mime, upsert: false, cacheControl: '0' });
      if (error) throw verificationError('تعذّر رفع المستند. أعد المحاولة بطلب جديد.', 409);
      // Recheck after storage I/O, so a concurrent withdrawal cannot leave an accessible upload.
      try { await rpc('upload', { requestId }); } catch (error) { await service.storage.from(verificationBucket).remove([reservation.path]); throw error; }
      return Response.json({ uploaded: true }, { headers });
    }
    const action = input.action === 'list' || input.action === 'get' ? 'state' : input.action;
    if (!action || !['state', 'prepare', 'submit', 'withdraw', 'evidence'].includes(action)) throw verificationError('إجراء غير متاح.');
    const payload = input.payload ?? {};
    const result = await rpc(action, payload);
    if (action === 'evidence') {
      if (!validVerificationPath(result?.path)) throw verificationError('المستند غير متاح.', 403);
      const { data, error } = await service.storage.from(verificationBucket).download(result.path);
      if (error || !data || data.size > verificationLimit) throw verificationError('المستند غير متاح.', 404);
      await rpc('evidence', payload);
      return new Response(data, { headers: { ...headers, 'Content-Type': result.mimeType, 'Content-Length': String(data.size), 'Content-Disposition': 'attachment; filename="verification.' + result.path.split('.').pop() + '"', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    // A failed Storage delete never restores access; the scheduled worker retries.
    if (action === 'withdraw' || action === 'prepare') { try { await cleanup(); } catch { /* durable retention queue */ } }
    return Response.json(result, { headers });
  } catch (cause) {
    const error = cause as { status?: number; message?: string; code?: string };
    return Response.json({ error: error.message && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. حاول مجددًا.', ...(error.code === 'verification_submission_restricted' ? { code: error.code } : {}) }, { status: error.status ?? 500, headers });
  }
});
