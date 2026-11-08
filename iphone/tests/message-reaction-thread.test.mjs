import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const code = transpile(await readFile(new URL('../src/community/useThread.ts', import.meta.url), 'utf8'));
const timeline = {};
vm.runInNewContext(transpile(await readFile(new URL('../src/community/timeline.ts', import.meta.url), 'utf8')), { exports: timeline });
const noop = () => {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const reaction = (mine = true, count = 1) => [{ emoji: '❤️', count, mine }];
const message = (extra = {}) => ({ id: 'message', senderIsMe: false, body: 'Hello', createdAt: '2026-11-08T10:00:00Z', ...extra });

function mount(initial = [message()], online = true) {
  const hooks = [], effects = [], timers = new Map(), events = new Map(), network = { onLine: online };
  let cursor = 0, dirty = false, wake = noop, snapshot = initial, threadImpl, writes = 0, reads = 0, timerId = 0;
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((v, i) => v !== old.deps[i])) hooks[at] = { deps, value: fn() }; return hooks[at].value; };
  const react = {
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(fn, deps) { const at = cursor++, old = hooks[at]; if (!old || deps.some((v, i) => v !== old.deps[i])) { old?.cleanup?.(); const slot = hooks[at] = { deps }; effects.push(() => { slot.cleanup = fn(); }); } },
    useRef: value => hooks[cursor++] ??= { current: value },
    useState(value) { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const value = typeof next === 'function' ? next(hooks[at]) : next; if (value !== hooks[at]) { hooks[at] = value; dirty = true; } }]; },
    useSyncExternalStore(_subscribe, read) { cursor++; return read(); },
  };
  const local = { outgoing: [], draft: 'Unfinished draft', reply: { id: 'earlier', body: 'Reply target' } };
  const outbox = { subscribe: noop, read: () => local, reconcile: noop, clear: () => { local.draft = ''; local.outgoing = []; } };
  const result = deferred();
  const source = {
    thread: () => { reads++; return threadImpl ? threadImpl() : Promise.resolve(snapshot); },
    watch: callback => { wake = callback; return noop; },
    reactToMessage: () => { writes++; return result.promise; },
  };
  const exports = {};
  const modules = {
    react, './timeline': timeline,
    './chatOutbox': { outboxFor: () => outbox, chatError: error => error.message, denied: error => error.status === 403 },
    './messageRefresh': { refreshHistoricalMessages: async () => [] },
    // Aggregate math is covered separately; this stub isolates pending/write lifecycle.
    './data': { messagePageSize: 50, withOwnReaction: (rows = [], emoji) => {
      const next = rows.map(row => ({ ...row, count: row.count - Number(row.mine), mine: false })).filter(row => row.count > 0);
      if (emoji) { const row = next.find(row => row.emoji === emoji); if (row) { row.count++; row.mine = true; } else next.push({ emoji, count: 1, mine: true }); }
      return next;
    } },
  };
  vm.runInNewContext(code, { exports, require: name => modules[name], document: { hidden: false, addEventListener: noop, removeEventListener: noop }, navigator: network,
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
  });
  return {
    source, result, local, get writes() { return writes; }, get reads() { return reads; }, get timers() { return timers; },
    online(value) { network.onLine = value; events.get(value ? 'online' : 'offline')?.(); },
    runRetry() { const [id, timer] = timers.entries().next().value ?? []; if (timer) { timers.delete(id); timer.fn(); return timer.delay; } },
    set snapshot(value) { snapshot = value; }, set threadImpl(value) { threadImpl = value; },
    wake: () => wake(),
    render() { let value, passes = 0; do { dirty = false; cursor = 0; value = exports.useThread(source, 'connection'); for (const effect of effects.splice(0)) effect(); if (++passes > 20) throw Error('Unstable hook'); } while (dirty); return value; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('reaction appears immediately, prevents duplicate writes, preserves draft/reply, then settles', async () => {
  const f = mount([message({ reactions: reaction(false) })]); f.render(); await tick();
  let thread = f.render(); const pending = thread.reactToMessage('message', '❤️');
  thread = f.render();
  assert.equal(thread.rows[0].reactions[0].count, 2);
  assert.equal(thread.rows[0].reactions[0].mine, true);
  assert.equal(thread.pendingReactionIds.has('message'), true);
  await thread.reactToMessage('message', '😂'); assert.equal(f.writes, 1);
  assert.equal(thread.draft, 'Unfinished draft'); assert.equal(thread.outbox.read().reply.id, 'earlier');
  f.snapshot = [message({ reactions: reaction(true, 2) })]; f.result.resolve(reaction(true, 2)); await pending; await tick();
  thread = f.render(); assert.equal(thread.pendingReactionIds.size, 0); assert.equal(thread.rows[0].reactions[0].count, 2); f.close();
});

test('network retries back off, preserve the draft and stop after three attempts until manual recovery', async () => {
  const f = mount(); f.render(); await tick(); f.render();
  f.threadImpl = async () => { throw Error('network timeout'); };
  f.wake(); await tick();
  assert.equal(f.render().connectionState, 'reconnecting');
  assert.equal(f.render().draft, 'Unfinished draft');
  const initialReads = f.reads;
  f.wake(); await tick(); assert.equal(f.reads, initialReads, 'broadcasts respect backoff');
  for (const delay of [2000, 5000, 10000]) { assert.equal(f.runRetry(), delay); await tick(); f.render(); }
  assert.equal(f.render().connectionState, 'unavailable'); assert.equal(f.timers.size, 0);
  f.wake(); await tick(); assert.equal(f.reads, initialReads + 3);
  f.threadImpl = undefined; f.render().refresh(); await tick();
  assert.equal(f.render().connectionState, 'online'); assert.equal(f.render().error, '');
  assert.equal(f.render().draft, 'Unfinished draft'); f.close();
});

test('offline startup waits for the online event and cleanup cancels scheduled work', async () => {
  const f = mount([message()], false); f.render(); await tick();
  assert.equal(f.reads, 0); assert.equal(f.render().connectionState, 'offline');
  f.online(true); await tick(); assert.equal(f.render().connectionState, 'online'); assert.equal(f.reads, 1);
  f.threadImpl = async () => { throw Error('timeout'); }; f.wake(); await tick();
  assert.equal(f.timers.size, 1); f.close(); assert.equal(f.timers.size, 0);
});

test('failed removal rolls back only the optimistic reaction and keeps the composer', async () => {
  const f = mount([message({ reactions: reaction() })]); f.render(); await tick();
  const pending = f.render().reactToMessage('message', null);
  assert.equal(f.render().rows[0].reactions.length, 0);
  f.result.reject(new Error('offline')); await assert.rejects(pending, /offline/); await tick();
  const thread = f.render(); assert.equal(thread.rows[0].reactions[0].mine, true); assert.equal(thread.pendingReactionIds.size, 0); assert.equal(thread.draft, 'Unfinished draft'); f.close();
});

test('a stale poll cannot undo an acknowledged reaction while the fresh poll is pending', async () => {
  const f = mount(); f.render(); await tick(); let thread = f.render();
  const stale = deferred(), fresh = deferred(); let polls = 0;
  f.threadImpl = () => ++polls === 1 ? stale.promise : fresh.promise;
  f.wake(); const pending = thread.reactToMessage('message', '❤️'); f.render();
  f.result.resolve(reaction()); await pending; thread = f.render(); assert.equal(thread.rows[0].reactions[0].mine, true);
  stale.resolve([message()]); await tick(); thread = f.render(); assert.equal(thread.rows[0].reactions[0].mine, true);
  fresh.resolve([message({ reactions: reaction() })]); await tick(); assert.equal(f.render().rows[0].reactions[0].mine, true); f.close();
});

test('remote deletion or revoked conversation never restores a pending reaction', async () => {
  for (const revoked of [false, true]) {
    const f = mount(); f.render(); await tick(); const pending = f.render().reactToMessage('message', '❤️'); f.render();
    if (revoked) f.threadImpl = async () => { throw Object.assign(new Error('closed'), { status: 403 }); };
    else f.snapshot = [message({ deletedAt: '2026-11-08T11:00:00Z', reactions: [] })];
    f.wake(); await tick(); let thread = f.render();
    if (revoked) { assert.equal(thread.rows.length, 0); assert.equal(thread.ready, false); }
    else { assert.equal(thread.rows[0].reactions.length, 0); assert(thread.rows[0].deletedAt); }
    f.result.resolve(reaction()); await pending; await tick(); thread = f.render();
    assert.equal(thread.pendingReactionIds.size, 0);
    if (revoked) assert.equal(thread.rows.length, 0); else assert.equal(thread.rows[0].reactions.length, 0);
    f.close();
  }
});
