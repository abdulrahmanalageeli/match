import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { accessError, guardianNetworkAddress, hashGuardianValue, parseGuardianAccess, performGuardianAccess } from '../_shared/guardian-access.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Referrer-Policy': 'no-referrer' };
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    if (new URL(url).hostname !== 'wupkifqbwhhebwrgvwai.supabase.co') throw accessError('الخدمة غير متاحة في هذه البيئة.', 503);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw accessError('الطلب غير صالح.', 415);
    const reader = request.body?.getReader(); if (!reader) throw accessError('الطلب غير صالح.');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4096) { await reader.cancel(); throw accessError('الطلب أكبر من الحد المسموح.', 413); } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = parseGuardianAccess(JSON.parse(new TextDecoder().decode(bytes)));
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // A secret-scoped digest avoids storing raw IP addresses. SQL also applies a global cap.
    const networkHash = await hashGuardianValue(key + ':family:' + guardianNetworkAddress(request.headers));
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await performGuardianAccess(input, networkHash, {
      rpc: (name, args) => client.rpc(name, args),
      createUser: attributes => client.auth.admin.createUser(attributes),
      deleteUser: async id => { const { error } = await client.auth.admin.deleteUser(id); if (error && error.status !== 404) throw error; },
      updatePassword: (id, password) => client.auth.admin.updateUserById(id, { password }),
      checkPassword: async (email, password) => {
        const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await auth.auth.signInWithPassword({ email, password });
        if (error || !data.user || data.user.app_metadata.guardian_account !== true) throw accessError('اسم المستخدم أو كلمة المرور غير صحيح.', 403);
        const id = data.user.id; await auth.auth.signOut({ scope: 'local' }); return id;
      },
    });
    return Response.json(result, { headers });
  } catch (cause) {
    const error = cause as { status?: number; message?: string };
    return Response.json({ error: error.message && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر إتمام الطلب. حاول مجددًا.' }, { status: error.status ?? 500, headers });
  }
});
