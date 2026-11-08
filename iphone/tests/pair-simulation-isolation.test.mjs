import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/testing/pair.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(actor) {
  let options;
  const ai = [], remote = [], localCalls = [];
  const state = { actor, profiles: {}, profileRevision: '1', messages: [], read: {}, matched: true, exclusive: false };
  const local = { simulation: { snapshot: () => ({}) }, inbox: async () => [],
    agreement: async id => { localCalls.push(['agreement', id]); return { status: 'proposed' }; },
    agree: async (id, action, payload) => { localCalls.push(['agree', id, action, payload]); return { status: 'accepted' }; },
    send: async (...args) => { localCalls.push(['send', ...args]); return args[2]; },
  };
  const modules = {
    '../community/data': { demoCommunity: (_viewer, _seed, opts) => { options = opts; return local; }, demoProfile: {}, sanitizeMessage: value => value },
    '../deployment': { marriageProjectUrl: 'https://nisfayn.invalid', marriagePublishableKey: 'public' },
    '../compatibility/model': { dimensions: [], interests: [] }, '../beena/model': { compareBeena: () => ({}) },
    '../ai/client': { requestSimulationReply: (...args) => { ai.push(args); return Promise.resolve('هلا'); } },
    '../verification/client': { manualVerificationSource: () => ({}) },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, AbortSignal, Date,
    fetch: async (_url, init) => { remote.push(JSON.parse(init.body)); return { ok: true, json: async () => state }; },
  });
  const pair = exports.pairSource({ actor, session: 'a'.repeat(64), profileRevision: '1', profile: {} }, () => ({ gender: actor === 'reham' ? 'woman' : 'man' }));
  return { pair, options, ai, remote, localCalls, state, local };
}

test('only Abdulrahman exposes and can run the simulator after verified pair state', async () => {
  for (const actor of ['abdulrahman', 'reham']) {
    const h = harness(actor);
    assert.equal(h.options.canAct(), false);
    await h.pair.source.agreement('tester-pair');
    assert.equal(Boolean(h.pair.source.simulation), actor === 'abdulrahman');
    assert.equal(h.options.canAct(), actor === 'abdulrahman');
    assert.equal(h.options.interactiveJourney, actor === 'abdulrahman');
    assert.equal(typeof h.options.aiReply, actor === 'abdulrahman' ? 'function' : 'undefined');
    h.state.exclusive = true;
    assert.equal(h.options.canAct(), false);
  }
});

test('fictional replies use only their supplied transcript while real pair sending never calls AI', async () => {
  const h = harness('abdulrahman');
  await h.options.aiReply({ person: { id: 'wp03' }, messages: [{ senderIsMe: true, body: 'أحب القراءة' }] });
  assert.equal(h.ai[0][0], 'wp03');
  assert.equal(h.ai[0][1][0].body, 'أحب القراءة');
  await h.pair.source.send('tester-pair', 'رسالة خاصة بيننا', 'client-id');
  assert.equal(h.ai.length, 1);
  assert.equal(h.remote.at(-1).action, 'send');
  assert.equal(h.remote.at(-1).payload.body, 'رسالة خاصة بيننا');
  assert.equal(h.localCalls.length, 0);
});

test('fictional agreement actions stay local and exclusive real pairing blocks them', async () => {
  const h = harness('abdulrahman');
  assert.equal((await h.pair.source.agreement('fictional-connection')).status, 'proposed');
  await h.pair.source.agree('fictional-connection', 'accept', { signed: true });
  assert.equal(h.localCalls[1][0], 'agree');
  assert(h.remote.every(request => request.action === 'state'));
  h.state.exclusive = true;
  await assert.rejects(h.pair.source.agree('fictional-connection', 'accept', { signed: true }), /حصري/);
});
