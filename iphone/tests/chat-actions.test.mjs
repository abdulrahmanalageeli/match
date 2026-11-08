import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/community/Community.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const noop = () => {};
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const named = (tree, name) => nodes(tree).filter(node => node.type?.name === name);
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');
const sheet = (tree, title = 'خيارات الرسالة') => named(tree, 'Sheet').find(node => node.props.title === title);
const button = (tree, text) => nodes(tree).find(node => (node.type === 'button' || node.type?.name === 'MotionPressButton') && textOf(node) === text);
const msg = (id, extra = {}) => ({ id, body: `Message ${id}`, createdAt: new Date(Date.now() - 1000).toISOString(), senderIsMe: false, ...extra });

// Run the actual Chat component, retaining hook state while stubbing browser-only children.
function mount(rows, draft = '') {
  const hooks = [], effects = [], modules = new Map(); let cursor = 0, changed = false, reply, deleted = 0;
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((v, i) => v !== old.deps[i])) hooks[at] = { deps, value: fn() }; return hooks[at].value; };
  const effect = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((v, i) => v !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } };
  const react = { useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useEffect: effect, useLayoutEffect: effect,
    useRef: value => hooks[cursor++] ??= { current: value }, useId: () => `id-${cursor++}`,
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
  };
  const thread = { rows, ready: true, get draft() { return draft; }, refresh: noop, older: noop,
    outbox: { read: () => ({ draft, reply }), replyTo: value => { reply = value; }, write: value => { draft = value; }, clear: noop },
  };
  const doc = { hidden: false, addEventListener: noop, removeEventListener: noop };
  const source = { deleteMessage: async () => { deleted++; } };
  const props = { source, connection: { id: 'connection', person: { id: 'peer', alias: 'رهام' } }, back: noop, close: noop, backLabel: 'عودة' };
  const exports = {};
  const require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (name === 'react-dom') return { flushSync: fn => fn() };
    if (name === './useThread') return { useThread: () => thread };
    if (name === '../voice/VoiceCalls') return { useVoiceCalls: () => null };
    if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= Object.defineProperty(() => null, 'name', { value: key }) }));
    return modules.get(name);
  };
  vm.runInNewContext(code, { exports, require, document: doc, window: { setTimeout: () => 0, matchMedia: () => ({ matches: false }) }, clearTimeout: noop, requestAnimationFrame: fn => fn() });
  return { thread, props, doc, get draft() { return draft; }, get reply() { return reply; }, get deleted() { return deleted; },
    render() { let tree, passes = 0; do { changed = false; cursor = 0; tree = exports.Chat(props); for (const fn of effects.splice(0)) fn(); if (++passes > 20) throw Error('unstable render'); } while (changed); return tree; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('bubble metadata stays clean; held received message offers reply and preserves an existing draft', () => {
  const f = mount([msg('received')], 'My unfinished draft'); let tree = f.render();
  const meta = nodes(tree).find(node => node.props?.className === 'cm-message-meta');
  assert.equal(nodes(meta).some(node => node.type === 'button'), false);
  assert.equal(sheet(tree), undefined);
  named(tree, 'SwipeReply')[0].props.onHold(); tree = f.render();
  const actions = sheet(tree); assert(actions);
  assert(button(actions, 'الرد على الرسالة'));
  assert.equal(button(actions, 'حذف لدى الجميع'), undefined);
  button(actions, 'الرد على الرسالة').props.onClick(); tree = f.render();
  assert.equal(sheet(tree), undefined); assert.equal(f.draft, 'My unfinished draft');
  assert.equal(f.reply.id, 'received'); assert.equal(f.reply.body, 'Message received');
  assert.equal(f.deleted, 0); f.close();
});

test('held own-message deletion opens a separate confirmation and never deletes merely from opening the menu', async () => {
  const f = mount([msg('own', { senderIsMe: true })]); let tree = f.render();
  named(tree, 'SwipeReply')[0].props.onHold(); tree = f.render();
  button(sheet(tree), 'حذف لدى الجميع').props.onClick(); tree = f.render();
  assert.equal(sheet(tree), undefined); assert(sheet(tree, 'حذف الرسالة للجميع'));
  assert.equal(f.deleted, 0);
  button(sheet(tree, 'حذف الرسالة للجميع'), 'الاحتفاظ بالرسالة').props.onClick();
  assert.equal(sheet(f.render(), 'حذف الرسالة للجميع'), undefined); assert.equal(f.deleted, 0); f.close();
});

test('expiry, tombstones, pending sends and revoked capability preserve action permissions', () => {
  for (const [extra, expectedReply] of [
    [{ createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString() }, true],
    [{ deletedAt: new Date().toISOString() }, false], [{ status: 'failed' }, false], [{ status: 'sending' }, false],
  ]) {
    const f = mount([msg('own', { senderIsMe: true, ...extra })]); let tree = f.render();
    const held = named(tree, 'SwipeReply')[0]; assert.equal(held.props.actionsDisabled, !expectedReply);
    held.props.onHold(); tree = f.render();
    assert.equal(Boolean(sheet(tree)), expectedReply);
    assert.equal(button(sheet(tree), 'حذف لدى الجميع'), undefined); assert.equal(f.deleted, 0); f.close();
  }
  const f = mount([msg('own', { senderIsMe: true })]); let tree = f.render();
  named(tree, 'SwipeReply')[0].props.onHold(); tree = f.render(); assert(sheet(tree));
  f.props.source.deleteMessage = undefined;
  assert.equal(button(sheet(f.render()), 'حذف لدى الجميع'), undefined, 'A removed deletion capability is respected in the open menu');
  f.thread.rows = [msg('own', { senderIsMe: true, deletedAt: new Date().toISOString() })];
  assert.equal(sheet(f.render()), undefined, 'A remote deletion closes stale message actions'); f.close();
});
