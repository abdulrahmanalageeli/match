import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/help/support.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createSupportSource } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function fixture() {
  const calls = [];
  let owner = 'member-a', sessionError = null, reply = { data: { items: [], nextCursor: null }, error: null };
  let resolveRpc;
  const client = {
    auth: { getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null }, error: sessionError }) },
    rpc(name, args) { return { abortSignal: async signal => { calls.push({ name, args, signal }); return resolveRpc ? resolveRpc() : reply; } }; },
  };
  return { calls, client, owner: value => owner = value, sessionError: value => sessionError = value, reply: value => reply = value, rpc: value => resolveRpc = value };
}
const input = { category: 'safety', subject: 'طلب خاص', body: 'تفاصيل اخترت إرسالها', clientId: '11111111-1111-4111-8111-111111111111' };

test('support rejects absent, changed, and failed sessions before any RPC', async () => {
  const f = fixture(), source = createSupportSource(f.client, 'member-a');
  f.owner(null); await assert.rejects(source.list(), /سجّل الدخول/);
  f.owner('guardian-b'); await assert.rejects(source.create(input), /سجّل الدخول/);
  f.owner('member-a'); f.sessionError(new Error('unavailable')); await assert.rejects(source.list(), /سجّل الدخول/);
  assert.equal(f.calls.length, 0);
});

test('support suppresses a response after an in-flight account change', async () => {
  const f = fixture(), source = createSupportSource(f.client, 'member-a');
  let finish;
  f.rpc(() => new Promise(resolve => { finish = resolve; }));
  const pending = source.list();
  await new Promise(resolve => setImmediate(resolve));
  f.owner('guardian-b'); finish({ data: { items: [{ id: 'private-a' }] }, error: null });
  await assert.rejects(pending, /تغيّرت جلسة الحساب/);
});

test('separate member and guardian sources keep their expected owner and bounded RPC shape', async () => {
  const member = fixture(), guardian = fixture(); guardian.owner('guardian-b');
  const a = createSupportSource(member.client, 'member-a'), b = createSupportSource(guardian.client, 'guardian-b');
  await a.list('cursor-a'); await b.create(input);
  assert.equal(member.calls[0].name, 'marriage_support');
  assert.deepEqual(member.calls[0].args, { action: 'list', payload: { before: 'cursor-a' } });
  assert.deepEqual(guardian.calls[0].args, { action: 'create', payload: input });
  assert(member.calls[0].signal instanceof AbortSignal); assert(guardian.calls[0].signal instanceof AbortSignal);
  guardian.owner('member-a'); await assert.rejects(b.list(), /سجّل الدخول/);
  assert.equal(guardian.calls.length, 1);
});

test('a failed support create can retry the identical client id and return the server receipt', async () => {
  const f = fixture(), source = createSupportSource(f.client, 'member-a');
  f.reply({ data: null, error: { code: 'XX000', message: 'private backend implementation detail' } });
  await assert.rejects(source.create(input), error => /إعادة المحاولة لا تنشئ طلبًا مكررًا/.test(error.message) && !/implementation/.test(error.message));
  const ticket = { id: 'receipt', status: 'open', subject: input.subject, body: input.body };
  f.reply({ data: ticket, error: null });
  assert.deepEqual(await source.create(input), ticket);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0].args, f.calls[1].args);
});

test('support shows bounded server validation while transport failure does not invent success', async () => {
  const f = fixture(), source = createSupportSource(f.client, 'member-a');
  f.reply({ data: null, error: { code: '22023', message: 'أكمل تفاصيل الطلب.' } });
  await assert.rejects(source.create(input), /أكمل تفاصيل الطلب/);
  f.rpc(() => { throw new Error('Network request failed'); });
  await assert.rejects(source.create(input));
  assert.equal(f.calls.length, 2);
});
