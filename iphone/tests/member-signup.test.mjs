import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { readSignupReturn, signupRedirectUrl } from '../src/auth/signupReturn.ts';

test('signup links never inherit private account, family, or credential routing', () => {
  assert.equal(signupRedirectUrl('https://app.example/?test=1&family=1#invite=secret'), 'https://app.example/?auth=signup');
  assert.equal(signupRedirectUrl('http://localhost:5173/?test=1'), 'http://localhost:5173/?auth=signup');
  assert.equal(signupRedirectUrl('capacitor://localhost/'), null);
  assert.equal(signupRedirectUrl('capacitor://localhost/', 'https://app.example/'), 'https://app.example/?auth=signup');
  assert.equal(signupRedirectUrl('http://app.example/'), null);
  assert.equal(signupRedirectUrl('https://user:secret@app.example/'), null);
  assert.equal(readSignupReturn('https://app.example/?test=1'), null);
  assert.equal(readSignupReturn('https://app.example/#type=recovery&access_token=a'), null);
});

async function fixture() {
  const calls = [], result = { data: { session: null }, error: null };
  const createResult = { data: { ok: true }, error: null };
  const client = { functions: { invoke: async (name, args) => { calls.push(['function', name, args]); return createResult; } }, auth: {
    signUp: async input => { calls.push(['signup', input]); return result; },
    signInWithPassword: async input => { calls.push(['login', input]); return result; },
    resend: async input => { calls.push(['resend', input]); return { error: null }; },
    getSession: async () => ({ data: { session: result.data.session }, error: null }),
  }, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: { user: { applicationStatus: 'draft' }, membership: { active: false } }, error: null }; } };
  const modules = {
    '@supabase/supabase-js': { createClient: () => client },
    './session': { authStorage: {} },
    './deployment': { resolveDeployment: () => ({ ready: true, selected: true, url: 'https://project.supabase.co', key: 'public' }) },
    './auth/signupReturn': { signupRedirectUrl },
  };
  const context = vm.createContext({ URL, Response, window: { location: new URL('https://app.example/?test=1') } });
  const source = await readFile(new URL('../src/cloud.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new vm.SourceTextModule(compiled, { context, initializeImportMeta(meta) { meta.env = {}; } });
  await mod.link(name => {
    const exports = modules[name]; assert(exports, name);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate();
  return { api: mod.namespace, calls, result, createResult };
}

test('ordinary member signup creates through the protected endpoint then uses normal password login without email confirmation', async () => {
  const f = await fixture();
  f.result.data.session = { user: { id: 'member-123' } };
  const consent = { version: '2026-11-07-privacy', adult: true, terms: true, privacy: true };
  const result = await f.api.cloudRequest('/register', 'POST', undefined, { email: 'person@example.com', password: 'example-long-password', consent });
  assert.equal(result.token, 'member-123');
  assert.equal(result.state.user.applicationStatus, 'draft');
  assert.equal(result.state.membership.active, false);
  assert.deepEqual(f.calls.map(call=>call[0]), ['function', 'login', 'rpc']);
  assert.equal(f.calls[0][1], 'member-signup');
  assert.equal(f.calls[0][2].body.consent, consent);
  assert.equal(f.calls[0][2].body.email, 'person@example.com');
});

test('signup rejection never falls back to raw signup, existing-account confirmation, or signin', async () => {
  const f=await fixture();
  f.createResult.error={context: new Response(JSON.stringify({error:'تعذّر إنشاء الحساب بهذه البيانات.'}),{status:409})};
  await assert.rejects(f.api.cloudRequest('/register','POST',undefined,{email:'reserved@example.com',password:'example-long-password'}),/تعذّر إنشاء الحساب/);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][0],'function');
});

test('real login loads the server account and leaves approval and membership unchanged', async () => {
  const f = await fixture();
  f.result.data.session = { user: { id: 'member-123' } };
  const result = await f.api.cloudRequest('/login', 'POST', undefined, { email: 'person@example.com', password: 'example-long-password' });
  assert.equal(result.token, 'member-123');
  assert.equal(result.state.user.applicationStatus, 'draft');
  assert.equal(result.state.membership.active, false);
  assert.equal(f.calls[0][0], 'login');
  assert.equal(f.calls[1][1], 'marriage_state');
  assert.equal(f.calls.length, 2);
});

test('resending confirms existing signup only and returns to the same member flow', async () => {
  const f = await fixture();
  await f.api.resendSignupConfirmation(' person@example.com ');
  assert.equal(f.calls[0][0], 'resend');
  assert.equal(f.calls[0][1].type, 'signup');
  assert.equal(f.calls[0][1].email, 'person@example.com');
  assert.equal(f.calls[0][1].options.emailRedirectTo, 'https://app.example/?auth=signup');
  assert.equal(f.calls.length, 1);
});
