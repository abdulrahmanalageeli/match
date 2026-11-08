import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { canRetryRead, readRetryDelays, retryReadsEvent } from '../src/community/readRecovery.ts';
import { readBrowseMemory, saveBrowseMemory } from '../src/community/discoveryMemory.ts';

const code = ts.transpileModule(await readFile(new URL('../src/community/useReadRecovery.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function recovery({ online = true, failed = true } = {}) {
  const timers = new Map(), events = new Map(), pageEvents = new Map();
  let id = 0, reads = 0, cleanup;
  const navigator = { onLine: online };
  const document = { hidden: false, addEventListener: (name, fn) => pageEvents.set(name, fn), removeEventListener: name => pageEvents.delete(name) };
  const exports = {};
  vm.runInNewContext(code, { exports, navigator, document,
    require: name => name === 'react' ? { useRef: current => ({ current }), useEffect: fn => { cleanup = fn(); } } : { readRetryDelays, retryReadsEvent },
    window: { setTimeout: (fn, delay) => { const key = ++id; timers.set(key, { fn, delay }); return key; }, clearTimeout: key => timers.delete(key),
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  });
  exports.useReadRecovery(failed, async () => { reads++; throw Error('offline'); }, {});
  return { timers, get reads() { return reads; },
    next() { const [key, timer] = timers.entries().next().value; timers.delete(key); timer.fn(); return timer.delay; },
    online(value) { navigator.onLine = value; events.get(value ? 'online' : 'offline')?.(); },
    hidden(value) { document.hidden = value; pageEvents.get('visibilitychange')?.(); },
    manual() { events.get(retryReadsEvent)?.(); },
    close() { cleanup(); },
  };
}

test('read recovery stops after three backoff attempts and manual recovery starts a new bounded cycle', async () => {
  const r = recovery();
  for (const delay of [1500, 4000, 10000]) { assert.equal(r.next(), delay); await settle(); }
  assert.equal(r.reads, 3); assert.equal(r.timers.size, 0);
  r.manual(); await settle(); assert.equal(r.reads, 4); assert.equal(r.timers.size, 1);
  r.close(); assert.equal(r.timers.size, 0);
});

test('offline and hidden pages do not consume recovery reads', async () => {
  const r = recovery({ online: false });
  assert.equal(r.timers.size, 0); assert.equal(r.reads, 0);
  r.online(true); await settle(); assert.equal(r.reads, 1);
  r.hidden(true); assert.equal(r.timers.size, 0);
  r.manual(); await settle(); assert.equal(r.reads, 1);
  r.hidden(false); await settle(); assert.equal(r.reads, 2);
  r.close(); r.online(true); await settle(); assert.equal(r.reads, 2);
});

test('healthy screens do not poll automatically and invalid or unauthorized requests do not qualify for automatic retries', () => {
  const r = recovery({ failed: false }); assert.equal(r.timers.size, 0); r.close();
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(canRetryRead({ status }), false);
  for (const status of [0, 408, 429, 500, 503]) assert.equal(canRetryRead({ status }), true);
  assert.equal(canRetryRead(new TypeError('fetch failed')), true);
});

test('browsing position and filters are scoped to source identity and not another signed-in account', () => {
  const first = {}, second = {};
  const saved = { filters: { city: 'الرياض' }, order: 'all', query: '', scroll: 1200, pages: 2, anchor: { id: 'card-30', top: 100 } };
  saveBrowseMemory(first, saved);
  assert.deepEqual(readBrowseMemory(first), saved);
  assert.deepEqual(readBrowseMemory(second), { filters: {}, order: 'recommended', query: '', scroll: 0, pages: 1 });
  assert.equal('people' in readBrowseMemory(first), false);
});
