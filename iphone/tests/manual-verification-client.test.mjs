import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/verification/client.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace(/import[^\n]+from '\.\.\/cloud';/, "const cloud={auth:{getSession:()=>globalThis.__verificationSession()}};const cloudConnection={url:'https://member.invalid',key:'member-key'};")
  .replace(/import[^\n]+from '\.\.\/deployment';/, "const marriageProjectUrl='https://tester.invalid',marriagePublishableKey='tester-key';")
  .replace("'./model'", JSON.stringify(new URL('../src/verification/model.ts', import.meta.url).href));
const { manualVerificationSource } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const state = { requests: [], claims: [], isTest: true };
const input = () => ({ kind: 'marital_status', consent: true, consentVersion: 'manual-verification-v1',
  file: new File(['synthetic evidence'], 'test.pdf', { type: 'application/pdf' }) });
function fakeFetch(t, handler) {
  const before = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = before; delete globalThis.__verificationSession; });
}

test('all document submissions stop before authentication or network, including tester mode', async t => {
  fakeFetch(t, () => assert.fail('restricted evidence must never leave the browser'));
  for (const token of [undefined, 'test-token']) {
    const source = manualVerificationSource(token);
    await assert.rejects(source.submitVerification(input()), /متوقف مؤقتًا/);
  }
});

test('real member uses active JWT and configured deployment; unavailable auth fails before network', async t => {
  const calls = [];
  fakeFetch(t, async (url, init) => { calls.push({ url, ...init }); return Response.json({ ...state, isTest: false }); });
  globalThis.__verificationSession = async () => ({ data: { session: { access_token: 'active-jwt' } } });
  await manualVerificationSource().verification('state');
  assert.equal(calls[0].url, 'https://member.invalid/functions/v1/manual-verification');
  assert.equal(calls[0].headers.Authorization, 'Bearer active-jwt');
  assert.deepEqual(JSON.parse(calls[0].body), { action: 'list', payload: {} });
  globalThis.__verificationSession = async () => ({ data: { session: null } });
  await assert.rejects(manualVerificationSource().verification('state'));
  assert.equal(calls.length, 1);
});

test('invalid file fails before creating a private request', async t => {
  fakeFetch(t, () => assert.fail('network must not be called'));
  await assert.rejects(manualVerificationSource('test-token').submitVerification({ ...input(), file: new File(['<svg/>'], 'test.svg', { type: 'image/svg+xml' }) }));
});
