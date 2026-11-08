import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { describeFit, dimensions } from '../src/compatibility/model.ts';
import { conversationInsights } from '../src/compatibility/conversation-insights.ts';
import { readBrowseMemory, saveBrowseMemory } from '../src/community/discoveryMemory.ts';

const communityCode = compile(await readFile(new URL('../src/community/Community.tsx', import.meta.url), 'utf8') + '\nexport { Discovery, Requests };');
const insightsCode = compile(await readFile(new URL('../src/community/ChatInsights.tsx', import.meta.url), 'utf8'));
function compile(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const settle = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : []; }
const named = (tree, name) => nodes(tree).find(node => node.type?.name === name);
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');

// Execute the actual components with hook state and effect cleanup, without native animation runtimes.
function mount(code, component, initialProps) {
  const hooks = [], effects = [], modules = new Map(); let cursor = 0, changed = false, props = initialProps;
  const memo = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) hooks[at] = { deps, value: fn() }; return hooks[at].value; };
  const effect = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } };
  const react = {
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useEffect: effect, useLayoutEffect: effect,
    useRef: value => { const at = cursor++; return hooks[at] ??= { current: value }; },
    useId: () => { const at = cursor++; return `test-${at}`; },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changed = true; } }]; },
  };
  const timer = () => 0;
  const doc = { hidden: false, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
  const exports = {};
  const require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'fragment' };
    if (name === 'react-dom') return { flushSync: fn => fn() };
    if (name === '../compatibility/conversation-insights') return { conversationInsights };
    if (name === './discoveryMemory') return { readBrowseMemory, saveBrowseMemory };
    if (name === './useWeeklyCardTransition') return { useWeeklyCardTransition: () => (_origin, apply) => apply() };
    if (name === './chatOutbox') return { discardClosedDrafts: noop, denied: error => [401, 403].includes(error?.status) };
    if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= key === 'numericOptions' ? () => [] : key === 'preferencePercentage' ? fit => fit?.preference : Object.defineProperty(() => null, 'name', { value: key }) }));
    return modules.get(name);
  };
  vm.runInNewContext(code, { exports, require, document: doc, window: { setTimeout: timer, setInterval: timer, addEventListener: noop, removeEventListener: noop, scrollTo: noop, scrollY: 0 }, clearTimeout: noop, clearInterval: noop });
  return {
    render(next) { if (next) props = next; let tree, passes = 0; do { changed = false; cursor = 0; tree = exports[component](props); for (const fn of effects.splice(0)) fn(); if (++passes > 20) throw Error('unstable render'); } while (changed); return tree; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}
function sourceWith(people = []) {
  const watchers = new Set();
  return { people, connections: [], watch: fn => { watchers.add(fn); return () => watchers.delete(fn); },
    discover: async function () { return structuredClone(this.people); }, inbox: async function () { return structuredClone(this.connections); },
    notify: () => { for (const fn of watchers) fn(); } };
}
const person = (score, id = 'partner') => ({ id, alias: 'رهام', fit: { preference: score }, age: 29, city: 'الرياض' });
const baseProps = source => ({ source, onInbox: noop, onAccount: noop, onChatChange: noop, onMutual: noop, onConversationOpened: noop, onBrowse: noop });

test('an unchanged message does not freeze the active chat fit; queued updates finish with the newest score', async () => {
  const source = sourceWith();
  source.connections = [{ id: 'room', status: 'accepted', person: person(90), lastMessage: 'same message', unread: 0 }];
  const m = mount(communityCode, 'Requests', { ...baseProps(source), openConversation: 'room' });
  m.render(); await settle(); let chat = m.render();
  assert.equal(chat.type.name, 'Chat'); assert.equal(chat.props.connection.person.fit.preference, 90);
  const firstKey = chat.key, read = deferred(); let calls = 0;
  source.inbox = async () => ++calls === 1 ? read.promise : [{ ...source.connections[0], person: person(61) }];
  source.notify(); source.notify(); read.resolve([{ ...source.connections[0], person: person(75) }]);
  await settle(); chat = m.render();
  assert.equal(calls, 2); assert.equal(chat.props.connection.person.fit.preference, 61);
  assert.equal(chat.key, firstKey, 'refresh retains the chat component and its draft state'); m.close();
});

test('an open recommended profile refreshes after moving out of the top five, then closes if no longer eligible', async () => {
  const source = sourceWith([person(90)]), m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); await settle(); let tree = m.render();
  named(tree, 'PersonCard').props.open({ querySelector: () => ({}), getBoundingClientRect: () => ({ top: 0 }), matches: () => true });
  tree = m.render(); assert.equal(tree.props.person.fit.preference, 90);
  source.discover = async filters => filters.mode === 'all' ? [person(61)] : [person(95, 'new-top-match')];
  source.notify(); await settle(); tree = m.render();
  assert.equal(tree.type.name, 'MemberProfile'); assert.equal(tree.props.person.fit.preference, 61);
  source.discover = async () => [person(95, 'new-top-match')];
  source.notify(); await settle(); tree = m.render();
  assert.notEqual(tree.type?.name, 'MemberProfile'); m.close();
});

test('an open compatibility sheet refreshes in place and changes arriving during a read are not lost', async () => {
  const source = sourceWith([person(90)]), m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); await settle(); let tree = m.render();
  nodes(tree).find(node => node.type === 'button' && textOf(node).includes('استكشف الجميع')).props.onClick();
  m.render(); await settle(); tree = m.render(); named(tree, 'DirectoryRow').props.explain();
  tree = m.render(); assert.equal(named(tree, 'FitDetails').props.fit.preference, 90);
  const read = deferred(); let calls = 0;
  source.discover = async () => ++calls === 1 ? read.promise : [person(56)];
  source.notify(); source.notify(); read.resolve([person(72)]); await settle(); tree = m.render();
  assert.equal(calls, 2); assert.equal(named(tree, 'FitDetails').props.fit.preference, 56);
  assert.equal(named(tree, 'CommunitySkeleton'), undefined, 'background updates never replace content with a skeleton'); m.close();
});

test('an assessment change during the initial discovery load is caught up immediately afterward', async () => {
  const source = sourceWith(), read = deferred(); let calls = 0;
  source.discover = async () => ++calls === 1 ? read.promise : [person(56)];
  const m = mount(communityCode, 'Discovery', baseProps(source));
  m.render(); source.notify(); read.resolve([person(90)]); await settle(); m.render(); await settle();
  assert.equal(named(m.render(), 'PersonCard').props.person.fit.preference, 56);
  assert.equal(calls, 2); m.close();
});

test('the visible conversation topic stays selected as answers reclassify it, with fresh explanations and safe fallbacks', () => {
  const answers = Object.fromEntries(dimensions.flatMap(item => [[item.id, 'A'], [item.partnerId, 'A']]));
  const a = { id: 'a', gender: 'woman', age: 29, city: 'الرياض', preferredMinAge: 18, preferredMaxAge: 70, assessmentVersion: 'marriage-v2', surveyAnswers: answers };
  const b = { ...a, id: 'b', gender: 'man' }; const topic = dimensions[3];
  let chosen; const props = { fit: describeFit(a, b).fit, name: 'رهام', disabled: false, hasDraft: false, choose: value => { chosen = value; } };
  const m = mount(insightsCode, 'ChatInsights', props); let tree = m.render();
  for (let i = 0; i < 3; i++) { nodes(tree).find(node => node.props?.['aria-label'] === 'الاقتراح التالي').props.onClick(); tree = m.render(); }
  assert.equal(named(tree, 'MotionReveal').props['data-kind'], 'aligned');
  assert(textOf(tree).includes(topic.title));
  const changed = { ...b, surveyAnswers: { ...answers, [topic.id]: 'B' } };
  tree = m.render({ ...props, fit: describeFit(a, changed).fit });
  const card = named(tree, 'MotionReveal'); assert.equal(card.props['data-kind'], 'discussion');
  assert.equal(nodes(card).find(node => node.type === 'h4').props.children, topic.title);
  assert(textOf(card).includes('اتجاه واحد')); named(tree, 'MotionPressButton').props.onClick(); assert.equal(chosen, topic.discussion);
  tree = m.render({ ...props, fit: undefined, hasDraft: true });
  assert.equal(named(tree, 'MotionReveal').props['data-kind'], 'explore');
  assert.equal(named(tree, 'MotionPressButton').props.disabled, true);
  assert(!textOf(tree).includes('اتجاه واحد')); m.close();
});
