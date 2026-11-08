import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compile = async name => ts.transpileModule(await readFile(new URL(`../src/community/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const readingCode = await compile('useChatReading'), typingCode = await compile('useTyping');
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function mount(code, name, args) {
  const hooks = [], layouts = [], effects = [], timers = new Map(), docEvents = new Map(), winEvents = new Map();
  let cursor = 0, changed = false, now = 10000, nextTimer = 0, result;
  const effect = queue => (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); const item = hooks[at] = { deps }; queue.push(() => { item.cleanup = fn(); }); } };
  const react = { useRef: value => hooks[cursor++] ??= { current: value }, useEffect: effect(effects), useLayoutEffect: effect(layouts),
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const value = typeof next === 'function' ? next(hooks[at]) : next; if (value !== hooks[at]) { hooks[at] = value; changed = true; } }]; },
  };
  const timer = (fn, delay, interval = false) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay, delay, interval }); return id; };
  const doc = { hidden: false, addEventListener: (event, fn) => docEvents.set(event, fn), removeEventListener: event => docEvents.delete(event) };
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => react, Date: { now: () => now }, document: doc,
    window: { setTimeout: (fn, delay) => timer(fn, delay), clearTimeout: id => timers.delete(id), setInterval: (fn, delay) => timer(fn, delay, true), clearInterval: id => timers.delete(id),
      addEventListener: (event, fn) => winEvents.set(event, fn), removeEventListener: event => winEvents.delete(event) },
  });
  return { args, doc, get result() { return result; },
    render() { let pass = 0; do { cursor = 0; changed = false; result = exports[name](...args); layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); if (++pass > 20) throw Error('unstable'); } while (changed); return result; },
    advance(ms) { const end = now + ms; while (true) { const pending = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!pending) break; const [id, task] = pending; now = task.at; if (task.interval) task.at += task.delay; else timers.delete(id); task.fn(); } now = end; },
    hide() { doc.hidden = true; docEvents.get('visibilitychange')?.(); }, blur() { winEvents.get('blur')?.(); },
    close() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}
function logWith(entries) {
  let top = 0;
  const log = { entries, scrollHeight: 1000, clientHeight: 300,
    getBoundingClientRect: () => ({ top: 100, bottom: 400 }),
    querySelectorAll: () => log.entries.map(([id, y]) => ({ dataset: { serverId: id }, getBoundingClientRect: () => ({ top: 100 + y - top, bottom: 140 + y - top }) })),
    get scrollTop() { return top; }, set scrollTop(value) { top = Math.max(0, Math.min(700, value)); },
  };
  return log;
}

test('reading waits for the first unread message in older history before positioning or enabling receipts', async () => {
  const page = deferred(); let requests = 0;
  const source = { readState: async () => ({ firstUnreadId: 'unread', unreadCount: 60 }) }, log = logWith([['latest', 900]]), bottom = { current: true };
  const thread = { rows: [{ id: 'latest' }], ready: true, hasOlder: true, loadingOlder: false, error: '', older: async () => { requests++; thread.loadingOlder = true; await page.promise; } };
  const f = mount(readingCode, 'useChatReading', [source, 'chat', { current: log }, bottom, thread, true]);
  assert.equal(f.render().positioned, false); await settle(); assert.equal(f.render().positioned, false); assert.equal(requests, 1);
  f.render(); assert.equal(requests, 1, 'No duplicate history fetch while paging');
  log.entries.unshift(['unread', 300]); thread.rows = [{ id: 'unread' }, { id: 'latest' }]; thread.loadingOlder = false; page.resolve(); await settle();
  assert.equal(f.render().positioned, true); assert.equal(log.scrollTop, 282); assert.equal(bottom.current, false); f.close();
});

test('returning from a profile restores the exact reading anchor and offset', async () => {
  const source = { readState: async () => ({ firstUnreadId: null, unreadCount: 0 }) }, log = logWith([['first', 0], ['middle', 300], ['last', 900]]), bottom = { current: true };
  const thread = { rows: [{ id: 'first' }, { id: 'middle' }, { id: 'last' }], ready: true, hasOlder: false, loadingOlder: false, error: '', older: async () => {} };
  const f = mount(readingCode, 'useChatReading', [source, 'chat', { current: log }, bottom, thread, true]);
  f.render(); await settle(); f.render(); log.scrollTop = 275; bottom.current = false; f.result.remember();
  f.args[5] = false; f.render(); log.scrollTop = 0; f.args[5] = true;
  assert.equal(f.render().positioned, true); assert.equal(log.scrollTop, 275); f.close();
});

test('typing sends only booleans, throttles continuous input and clears on blur/unmount', async () => {
  const calls = [], source = { setTyping: async (...args) => calls.push(args), typingState: async () => false, watch: () => () => {} };
  const f = mount(typingCode, 'useTyping', [source, 'chat', true]); f.render();
  f.result.touch(); await settle(); f.advance(1000); f.result.touch(); await settle(); assert.deepEqual(calls, [['chat', true]]);
  f.advance(1600); f.result.touch(); await settle(); assert.equal(calls.filter(call => call[1]).length, 2);
  f.blur(); await settle(); assert.deepEqual(calls.at(-1), ['chat', false]);
  f.result.touch(); await settle(); f.close(); await settle(); assert.deepEqual(calls.at(-1), ['chat', false]);
});

test('late peer status cannot reappear after hiding, and failed writes stay throttled', async () => {
  const peer = deferred(); let writes = 0;
  const source = { setTyping: async () => { writes++; throw Error('offline'); }, typingState: async () => peer.promise, watch: () => () => {} };
  const f = mount(typingCode, 'useTyping', [source, 'chat', true]); f.render(); f.result.touch(); await settle();
  f.advance(100); f.result.touch(); await settle(); assert.equal(writes, 1);
  f.hide(); peer.resolve(true); await settle(); assert.equal(f.render().peerTyping, false); f.close();
});
