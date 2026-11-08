import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { boundedFamilyPayload, createDemoFamily, familyInviteUrl, validFamilyToken, validFamilyCode, unwrapFamilyResult, familyLinkReady, familyLinkStatus } from '../src/family/model.ts';

const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const model = JSON.stringify(new URL('../src/family/model.ts', import.meta.url).href);
const rewrite = source => source.replaceAll("'../family/model'", model).replaceAll("'./model'", model).replaceAll("'../readiness/model'", JSON.stringify(new URL('../src/readiness/model.ts', import.meta.url).href));
const dataUrl = url(rewrite(await compile('../src/community/data.ts'))
 .replace("'../profile/profileOptions'",JSON.stringify(new URL('../src/profile/profileOptions.ts',import.meta.url).href))
 .replace("'./simulation'",JSON.stringify(new URL('../src/community/simulation.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
  .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/cloud["'];?/g, '')
  .replace(/import\s*\{[^}]+\}\s*from ["']\.\/updates["'];?/, '')
  .replace('"../compatibility/model"', JSON.stringify(new URL('../src/compatibility/model.ts', import.meta.url).href))
  .replace('"../beena/model"', JSON.stringify(new URL('../src/beena/model.ts', import.meta.url).href))
  .replace('"../compatibility/personality"', JSON.stringify(new URL('../src/compatibility/personality.ts', import.meta.url).href))
  + '\nconst cloud={}; const callRpc=(...args)=>globalThis.__familyRpc(...args); class CloudError extends Error{} const privateUpdates=()=>()=>()=>{};');
const { cloudCommunity, demoCommunity, demoProfile } = await import(dataUrl);
const { pairSource, testProfile } = await import(url(rewrite(await compile('../src/testing/pair.ts'))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
  .replace("'../community/data'", JSON.stringify(dataUrl))
  .replace("'../compatibility/model'", JSON.stringify(new URL('../src/compatibility/model.ts', import.meta.url).href))
  .replace("'../beena/model'", JSON.stringify(new URL('../src/beena/model.ts', import.meta.url).href))
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/, "const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';")));

test('family invitation uses fragment only and rejects malformed tokens', () => {
  const token = 'ab'.repeat(32), link = new URL(familyInviteUrl(token, 'https://nisfayn-preview.vercel.app'));
  assert.equal(link.search, '?family=1'); assert.equal(link.hash, '#invite=' + token);
  assert.equal(link.pathname, '/'); assert.equal(link.search.includes(token), false);
  for (const invalid of ['123', 'g'.repeat(64), '<script>', token + 'x']) assert.equal(validFamilyToken(invalid), false);
  assert.throws(() => familyInviteUrl('short', 'https://example.test'));
});
test('native and local invitation origins safely fall back to the short code', () => {
  const token = 'ab'.repeat(32);
  for (const base of ['', 'null', 'capacitor://localhost', 'http://localhost:5173', 'https://localhost', 'https://127.0.0.1', 'https://192.168.1.2', 'https://user:secret@example.test', 'javascript:alert(1)', 'https://example.test/?token=secret', 'https://example.test/#secret']) {
    assert.equal(familyInviteUrl(token, base), null, base);
  }
  assert.equal(familyInviteUrl(token, 'https://family.example.test'), 'https://family.example.test/?family=1#invite=' + token);
});
test('guardian registration requires explicit consent and adult declaration without accepting roles or identity claims', () => {
  const input = { displayName: '  اسم توضيحي  ', adult: true, consentVersion: 'family-v1', role: 'admin', nationalId: 'private' };
  assert.deepEqual(boundedFamilyPayload('register', input), { displayName: 'اسم توضيحي', adult: true, consentVersion: 'family-v1' });
  for (const change of [{ adult: false }, { consentVersion: null }, { displayName: 'ا' }, { displayName: 'أ'.repeat(61) }]) assert.throws(() => boundedFamilyPayload('register', { ...input, ...change }));
  assert.throws(() => boundedFamilyPayload('send', { body: ' '.repeat(20) }));
  assert.throws(() => boundedFamilyPayload('send', { body: 'x'.repeat(1001) }));
  assert.deepEqual(boundedFamilyPayload('send', { roomId: 'room', body: ' أهلا ', clientId: 'one', senderId: 'forged' }), { roomId: 'room', body: 'أهلا', clientId: 'one' });
});
test('local demo never invents a guardian identity, live invitation, or peer consent', async () => {
  let active = true;
  const request = createDemoFamily(id => active && id === 'accepted' ? { id: 'peer', name: 'عضو تجريبي' } : null, () => 'عضو', () => {});
  assert.deepEqual((await request('state')).links, []);
  const state = await request('consent', { connectionId: 'accepted', agree: true });
  assert.equal(state.bridge.mine, true); assert.equal(state.bridge.peer, false); assert.equal(state.bridge.enabled, false);
  await assert.rejects(request('invite_link', { relationship: 'father' }), /معاينة محلية/);
  await assert.rejects(request('create_room', { connectionId: 'accepted', participantIds: ['x', 'y'] }));
  active = false; assert.equal((await request('state', { connectionId: 'accepted' })).bridge, null);
  active = true; assert.equal((await request('state', { connectionId: 'accepted' })).bridge.mine, false);
});
test('member family RPC stays user-bound; family data never becomes a discovery profile', async t => {
  const calls = []; globalThis.window = { setTimeout, clearTimeout }; globalThis.__familyRpc = async (...args) => { calls.push(args); return {}; };
  t.after(() => { delete globalThis.window; delete globalThis.__familyRpc; });
  await cloudCommunity('owner').family('state', { connectionId: 'match' });
  assert.equal(calls[0][0], 'marriage_family'); assert.deepEqual(calls[0][1], { action: 'state', payload: { connectionId: 'match' } }); assert.equal(calls[0][2], 'owner');
  const demo = demoCommunity(() => demoProfile); const people = await demo.discover({ mode: 'all' });
  assert(people.every(person => !('familyLinks' in person) && !('familyRooms' in person) && !('guardian' in person)));
});
test('paired family RPC overrides injected action and carries the private session', async t => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (_url, init) => { calls.push(JSON.parse(init.body)); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); };
  t.after(() => { globalThis.fetch = original; });
  const profile = testProfile('reham'), source = pairSource({ actor: 'reham', session: 'private-session', profile, profileRevision: 'test' }, () => profile).source;
  assert.equal(source.familyEligibleConnection('tester-pair'), true); assert.equal(source.familyEligibleConnection('fictional'), false);
  await source.family('state', { action: 'delete_family' });
  assert.deepEqual(calls, [{ action: 'family', session: 'private-session', payload: { action: 'state' } }]);
});
test('guardian uses isolated managed password auth, never permits mutable metadata to establish its role, and binds RPCs to the current user', async t => {
  const calls = []; let sessionUser = 'guardian';
  let guardian = true;
  const fake = { auth: { getSession: async () => ({ data: { session: { user: { id: sessionUser } } } }), signInWithPassword: async value => { calls.push({ login: value }); return { data: { session: { user: { id: 'guardian' } }, user: { app_metadata: { guardian_account: guardian }, user_metadata: { guardian_account: true } } }, error: null }; }, signOut: async () => { calls.push({ logout: true }); return { error: null }; } }, rpc: (name, args) => ({ abortSignal: async () => { calls.push({ name, args }); return { data: {}, error: null }; } }) };
  globalThis.__familyCreateClient = (host, key, options) => { calls.push({ host, key, options }); return fake; };
  globalThis.__familyEnv = {}; globalThis.window = { location: { origin: 'https://nisfayn-preview.vercel.app' } };
  t.after(() => { delete globalThis.__familyCreateClient; delete globalThis.__familyEnv; delete globalThis.window; });
  const compiled = rewrite(await compile('../src/family/client.ts'))
    .replace(/import\s*\{[^}]+\}\s*from ['"]@supabase\/supabase-js['"];?/, 'const createClient=(...args)=>globalThis.__familyCreateClient(...args);')
    .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/session['"];?/, 'const authStorage={};')
    .replace("'../deployment'", JSON.stringify(new URL('../src/deployment.ts', import.meta.url).href))
    .replaceAll('import.meta.env', 'globalThis.__familyEnv');
  const client = await import(url(compiled));
  await client.signInGuardian(' Family_Name ', 'a-long-password');
  assert.equal(calls[0].options.auth.storageKey, 'nisfayn-family-sb-wupkifqbwhhebwrgvwai.supabase.co');
  assert.equal(calls[0].options.auth.detectSessionInUrl, false);
  assert.equal(calls[1].login.email, await client.guardianLoginEmail('family_name')); assert.match(calls[1].login.email, /^[a-f0-9]{64}@guardian\.nisfayn\.invalid$/); assert.equal(calls[1].login.password, 'a-long-password');
  await client.guardianFamilyRequest('guardian')('state');
  assert.equal(calls[2].name, 'marriage_family');
  sessionUser = 'someone-else'; await assert.rejects(client.guardianFamilyRequest('guardian')('state'), /انتهت جلسة/); assert.equal(calls.length, 3);
  guardian = false; await assert.rejects(client.signInGuardian('family_name', 'a-long-password'), /غير مخصص/); assert.equal(calls.at(-1).logout, true);
});
test('human connection codes normalize safely and failed claims never look successful', () => {
  assert.equal(validFamilyCode('abcd-efgh-2345'), true);
  assert.deepEqual(boundedFamilyPayload('claim_link', { code: 'abcd-efgh-2345', actor: 'spoof' }), { code: 'ABCDEFGH2345' });
  assert.equal(validFamilyCode('ABCD-EFGH-0000'), false);
  assert.throws(() => unwrapFamilyResult({ error: 'تعذّر الربط', code: 'invalid_invite' }), /تعذّر الربط/);
});
test('family link readiness requires independent member consent and administration approval', () => {
  for (const status of ['pending', 'active']) for (const adminReview of ['pending', 'approved', 'rejected', undefined]) {
    assert.equal(familyLinkReady({ status, adminReview }), status === 'active' && adminReview === 'approved');
  }
  assert.equal(familyLinkStatus({ status: 'active', adminReview: 'pending' }), 'بانتظار مراجعة الإدارة');
  assert.equal(familyLinkStatus({ status: 'pending', adminReview: 'approved' }), 'بانتظار موافقة العضو');
  assert.equal(familyLinkStatus({ status: 'active', adminReview: 'rejected' }), 'لم تعتمد الإدارة الربط');
});
