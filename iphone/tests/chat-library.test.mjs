import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/community/ChatLibrary.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const noop = () => {}, settle = () => new Promise(resolve => setImmediate(resolve));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const named = (tree, name) => nodes(tree).filter(node => node.type?.name === name);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children ?? '');
const row = (id, extra = {}) => ({ id, createdAt: '2026-11-08T10:00:00Z', senderIsMe: false, body: id, ...extra });
function mount(searchMessages) {
  const hooks = [], effects = [], timers = new Map(), watchers = new Set(), listeners = new Map(); let cursor = 0, changed = false, nextTimer = 0;
  const react = {
    useId: () => `id-${cursor++}`, useRef: value => hooks[cursor++] ??= { current: value },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
    useEffect: (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, index) => value !== old.deps[index])) { old?.cleanup?.(); const entry = hooks[at] = { deps }; effects.push(() => { entry.cleanup = fn(); }); } },
  };
  const modules = new Map(), exports = {};
  const doc = { activeElement: null, hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const source = { searchMessages, watch: fn => { watchers.add(fn); return () => watchers.delete(fn); } };
  let jumped;
  const props = { source, requestId: 'chat', name: 'رهام', onClose: noop, onJump: id => { jumped = id; } };
  vm.runInNewContext(code, { exports, Intl, HTMLElement: class {}, document: doc,
    window: { setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) },
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= Object.defineProperty(() => null, 'name', { value: key }) }));
      return modules.get(name);
    },
  });
  return { source, props, doc, get jumped() { return jumped; },
    render() { let tree, pass = 0; do { changed = false; cursor = 0; tree = exports.ChatLibrary(props); for (const effect of effects.splice(0)) effect(); if (++pass > 20) throw Error('unstable'); } while (changed); return tree; },
    timers() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
    notify() { watchers.forEach(fn => fn()); }, hide() { doc.hidden = true; listeners.get('visibilitychange')?.(); },
    close() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

test('library excludes deleted/view-once content, preserves reusable media and jumps to its original message', async () => {
  const f = mount(async () => [row('deleted', { deletedAt: 'today' }), row('once', { attachment: { id: 'once', kind: 'photo', viewOnce: true } }), row('photo', { attachment: { id: 'p', kind: 'photo' } }), row('text')]);
  f.render(); await settle(); let tree = f.render();
  assert.equal(named(tree, 'MessageMedia').length, 1);
  assert.equal(named(tree, 'MessageMedia')[0].props.attachment.id, 'p');
  assert(!text(tree).includes('deleted')); assert(!text(tree).includes('once'));
  nodes(tree).find(node => node.props?.className === 'cm-library-text').props.onClick(); assert.equal(f.jumped, 'text');
  f.hide(); tree = f.render(); assert.equal(named(tree, 'MessageMedia').length, 0); f.close();
});

test('a delayed old query cannot replace the new search results', async () => {
  let resolveOld; const old = new Promise(resolve => { resolveOld = resolve; }); const queries = [];
  const f = mount(async (_id, query) => { queries.push(query); return query ? [row('new result')] : old; });
  let tree = f.render(); nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: 'new' } });
  f.render(); f.timers(); f.render(); await settle(); tree = f.render();
  assert(text(tree).includes('new result')); resolveOld([row('old private result')]); await settle(); tree = f.render();
  assert(!text(tree).includes('old private result')); assert.deepEqual(queries, ['', 'new']); f.close();
});

test('watch refresh removes remotely deleted results and failed authorization clears visible media', async () => {
  let values = [row('photo', { attachment: { id: 'p', kind: 'photo' } })], fail = false;
  const f = mount(async () => { if (fail) throw Error('closed'); return values; });
  f.render(); await settle(); assert.equal(named(f.render(), 'MessageMedia').length, 1);
  values = []; f.notify(); f.timers(); await settle(); assert.equal(named(f.render(), 'MessageMedia').length, 0);
  values = [row('photo', { attachment: { id: 'p', kind: 'photo' } })]; f.notify(); f.timers(); await settle(); f.render();
  fail = true; f.notify(); f.timers(); await settle(); const tree = f.render();
  assert.equal(named(tree, 'MessageMedia').length, 0); assert(nodes(tree).some(node => node.props?.role === 'alert')); f.close();
});
