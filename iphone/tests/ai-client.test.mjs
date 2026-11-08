import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let source = ts.transpileModule(await readFile(new URL('../src/ai/client.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
source = source.replace(/import \{ cloud \} from ['"]\.\.\/cloud['"];?/, "const cloud={auth:{getSession:async()=>({data:{session:{access_token:'member-token'}}})}};")
  .replace(/import \{ Capacitor \} from ['"]@capacitor\/core['"];?/, 'const Capacitor={isNativePlatform:()=>false};');
const { requestAi, requestSimulationReply } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function browser(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { protocol: 'https:' } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
}

test('starter sends only the fixed generic mode and keeps result as a draft suggestion', async t => {
  browser(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ text: 'أهلًا، ما الذي يجعل يومك أجمل؟' });
  });
  assert.equal(await requestAi({ mode: 'opener' }), 'أهلًا، ما الذي يجعل يومك أجمل؟');
  assert.equal(calls[0].url, '/api/ai');
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: 'opener' });
});

test('legacy personal text is rejected by the client without transmission', async t => {
  browser(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not send'); });
  for (const input of [
    { mode: 'opener', profile: { bio: 'PRIVATE BIO', interests: [] } },
    { mode: 'demo_reply', personaId: 'p01', messages: [{ role: 'user', content: 'PRIVATE CHAT' }] },
  ]) await assert.rejects(requestAi(input), /لا يقبل بيانات شخصية/);
  assert.equal(network.mock.callCount(), 0);
});

test('provider outage uses a useful local generic starter without another request', async t => {
  browser(t);
  const network = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'غير متاح' }, { status: 503 }));
  const result = await requestAi({ mode: 'opener' });
  assert.match(result, /أهلًا|يسعدني/);
  assert.doesNotMatch(result, /OpenAI|ذكاء اصطناعي/);
  assert.equal(network.mock.callCount(), 1);
});

test('fictional simulation uses only the explicit test token and bounded transcript', async t => {
  browser(t); const calls = [], token = 'a'.repeat(64);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options }); return Response.json({ text: 'إيه أذكر قلت تحب المشي بعد الدوام' });
  });
  const messages = [{ senderIsMe: true, body: 'أحب المشي بعد الدوام' }];
  assert.match(await requestSimulationReply('wp03', messages, token), /المشي/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: 'simulation_reply', personaId: 'wp03', messages });
  assert.equal(calls[0].options.headers['x-test-session'], token);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  for (const person of ['reham', 'abdulrahman', 'tester-pair', 'p99']) await assert.rejects(requestSimulationReply(person, messages, token));
  await assert.rejects(requestSimulationReply('wp03', messages, ''));
  await assert.rejects(requestSimulationReply('wp03', [{ ...messages[0], photo: 'private' }], token));
  assert.equal(calls.length, 1);
});

test('simulation errors remain errors for the scheduler without fake generic replies', async t => {
  browser(t);
  const calls = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'limited' }, { status: 429 }));
  await assert.rejects(requestSimulationReply('wp03', [], 'a'.repeat(64)), /تعذّر الرد/);
  assert.equal(calls.mock.callCount(), 1);
});
