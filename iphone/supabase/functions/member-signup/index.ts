import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { accessError, guardianNetworkAddress, hashGuardianValue } from '../_shared/guardian-access.ts';
import { memberSignupOrigin, parseMemberSignup, performMemberSignup } from '../_shared/member-signup.ts';

Deno.serve(async request => {
  const origin = memberSignupOrigin(request.headers.get('origin'), Deno.env.get('MEMBER_SIGNUP_ALLOWED_ORIGINS'));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (!origin) return Response.json({ error: 'مصدر الطلب غير مسموح.' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '', key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (new URL(url).hostname !== 'wupkifqbwhhebwrgvwai.supabase.co' || !key) throw accessError('الخدمة غير متاحة في هذه البيئة.', 503);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw accessError('الطلب غير صالح.', 415);
    const reader = request.body?.getReader(); if (!reader) throw accessError('الطلب غير صالح.');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4096) { await reader.cancel(); throw accessError('الطلب أكبر من الحد المسموح.', 413); } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = parseMemberSignup(JSON.parse(new TextDecoder().decode(bytes)));
    const networkHash = await hashGuardianValue(key + ':member-network:' + guardianNetworkAddress(request.headers));
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await performMemberSignup(input, networkHash, key, {
      rpc: (name, args) => client.rpc(name, args),
      createUser: attributes => client.auth.admin.createUser(attributes),
    });
    return Response.json(result, { headers });
  } catch (cause) {
    // Never log request bodies, passwords, provider responses, or contact addresses.
    const error = cause as { status?: number; message?: string };
    const status = error.status && [400,403,409,413,415,429,503].includes(error.status) ? error.status : 500;
    return Response.json({ error: error.message && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. حاول مجددًا.' }, { status, headers });
  }
});
