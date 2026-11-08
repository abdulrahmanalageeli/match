import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { describeFit } from '../src/compatibility/model.ts';
import { compatibilitySnapshot, compareCompatibility } from '../src/compatibility/changes.ts';
import { pairAssessmentFixture } from '../src/testing/pairAssessmentFixture.ts';

const code = ts.transpileModule(await readFile(new URL('../src/notifications/ActivityAlerts.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const named = (tree, name) => nodes(tree).find(node => node.type?.name === name);
const base = { city: 'الرياض', age: 29, preferredMinAge: 22, preferredMaxAge: 40 };
const first = { ...base, id: 'abdulrahman', gender: 'man', ...pairAssessmentFixture.abdulrahman };
const second = { ...base, id: 'reham', gender: 'woman', ...pairAssessmentFixture.reham };
const fit = updates => describeFit(first, { ...second, surveyAnswers: { ...second.surveyAnswers, ...updates } }).fit;
const original = fit(), changed = fit({ children_plan: 'B', partner_children_plan: 'B' });
const changedAgain = fit({ children_plan: 'B', partner_children_plan: 'B', wife_work: 'B', partner_wife_work: 'B' });
const connection = current => ({ id: 'pair', status: 'accepted', person: { id: 'reham', alias: 'رهام', fit: current }, unreadCount: 0 });
function sourceWith(current = original) {
  const watchers = new Set();
  return { connections: [connection(current)], inbox: async function () { return structuredClone(this.connections); },
    watch: fn => { watchers.add(fn); return () => watchers.delete(fn); }, notify: () => { for (const fn of watchers) fn(); } };
}

// Run the real alert lifecycle and its async source without a DOM or animation renderer.
function mount(source) {
  const hooks = [], effects = [], modules = new Map(), observers = new Set(), events = new Map(), timers = new Map();
  let cursor = 0, changedState = false, props = { source, onOpen: noop, onNotifications: noop }, sounds = 0, timerId = 0;
  const env = { voice: { occupied: false }, dialog: false, mutate: () => { for (const fn of observers) fn(); } };
  const effect = (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } };
  const react = {
    useEffect: effect, useRef: value => { const at = cursor++; return hooks[at] ??= { current: value }; },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value;
      return [hooks[at], next => { const result = typeof next === 'function' ? next(hooks[at]) : next; if (result !== hooks[at]) { hooks[at] = result; changedState = true; } }]; },
  };
  const doc = { hidden: false, body: {}, activeElement: null, querySelector: selector => selector === 'dialog[open]' && env.dialog ? {} : null,
    addEventListener: (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeEventListener: (name, fn) => events.get(name)?.delete(fn) };
  const exports = {}, require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (name === '../compatibility/changes') return { compatibilitySnapshot, compareCompatibility };
    if (name === '../voice/VoiceCalls') return { useVoiceCalls: () => env.voice };
    if (name === '../community/matchSound') return { playActivitySound: () => sounds++ };
    if (name === '../community/milestones') return { confirmedMilestone: () => null };
    if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= Object.defineProperty(() => null, 'name', { value: key }) }));
    return modules.get(name);
  };
  class Observer { constructor(fn) { this.fn = fn; } observe() { observers.add(this.fn); } disconnect() { observers.delete(this.fn); } }
  const setTimer = fn => { timers.set(++timerId, fn); return timerId; };
  vm.runInNewContext(code, { exports, require, MutationObserver: Observer, document: doc,
    window: { setTimeout: setTimer, setInterval: setTimer, clearInterval: id => timers.delete(id) }, clearTimeout: id => timers.delete(id) });
  return { env, doc,
    render(update) { props = { ...props, ...update }; let tree, passes = 0; do { changedState = false; cursor = 0; tree = exports.ActivityAlerts(props); for (const fn of effects.splice(0)) fn(); if (++passes > 20) throw Error('unstable render'); } while (changedState); return tree; },
    soundCount: () => sounds, close: () => { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('first load stays quiet; a changed assessment shows one silent notice and dismissal is not replayed', async () => {
  const source = sourceWith(), m = mount(source); m.render(); await settle();
  assert.equal(named(m.render(), 'CompatibilityNotice'), undefined);
  source.connections = [connection(changed)]; source.notify(); await settle();
  let notice = named(m.render(), 'CompatibilityNotice'); assert(notice);
  assert.equal(notice.props.name, 'رهام'); assert.equal(notice.props.change.scoreChanges[0].before, 78); assert.equal(notice.props.change.scoreChanges[0].after, 70);
  assert.equal(m.soundCount(), 0, 'Compatibility changes never play the activity sound');
  source.notify(); await settle(); assert.equal(named(m.render(), 'CompatibilityNotice').key, notice.key);
  notice.props.onDismiss(); m.render(); source.notify(); await settle();
  assert.equal(named(m.render(), 'CompatibilityNotice'), undefined); m.close();
});

test('changes wait behind a dialog or call, coalesce to the newest result and cancel if reverted', async () => {
  const source = sourceWith(), m = mount(source); m.render(); await settle(); m.render();
  m.env.dialog = true; source.connections = [connection(changed)]; source.notify(); await settle();
  assert.equal(named(m.render(), 'CompatibilityNotice'), undefined);
  source.connections = [connection(changedAgain)]; source.notify(); await settle(); m.render();
  m.env.dialog = false; m.env.mutate();
  let notice = named(m.render(), 'CompatibilityNotice'); assert(notice);
  assert.equal(notice.props.change.scoreChanges[0].before, original.percentage);
  assert.equal(notice.props.change.scoreChanges[0].after, changedAgain.percentage);
  m.env.voice.occupied = true; assert.equal(named(m.render(), 'CompatibilityNotice'), undefined);
  m.env.voice.occupied = false; notice = named(m.render(), 'CompatibilityNotice'); assert(notice);
  source.connections = [connection(original)]; source.notify(); await settle();
  assert.equal(named(m.render(), 'CompatibilityNotice'), undefined); m.close();
});

test('queued changes survive overlapping reads and the opened explanation always receives the latest fit', async () => {
  const source = sourceWith(), m = mount(source); m.render(); await settle(); m.render();
  const pending = deferred(); let calls = 0;
  source.inbox = async () => ++calls === 1 ? pending.promise : [connection(changedAgain)];
  source.notify(); source.notify(); pending.resolve([connection(changed)]); await settle();
  const notice = named(m.render(), 'CompatibilityNotice'); assert.equal(calls, 2); assert(notice);
  assert.equal(notice.props.change.scoreChanges[0].after, changedAgain.percentage);
  notice.props.onOpen(); const sheet = named(m.render(), 'CompatibilityChangeSheet'); assert(sheet);
  assert.equal(sheet.props.fit.percentage, changedAgain.percentage);
  m.env.voice.occupied = true; assert.equal(named(m.render(), 'CompatibilityChangeSheet'), undefined, 'A call dismisses the sheet without discarding the update');
  m.env.voice.occupied = false; assert(named(m.render(), 'CompatibilityNotice')); m.close();
});

test('unavailable or withdrawn fits clear open details; restored authorized data can notify without leaking stale results', async () => {
  const source = sourceWith(), m = mount(source); m.render(); await settle(); m.render();
  source.connections = [connection(changed)]; source.notify(); await settle();
  named(m.render(), 'CompatibilityNotice').props.onOpen(); assert(named(m.render(), 'CompatibilityChangeSheet'));
  source.connections = [connection(undefined)]; source.notify(); await settle();
  assert.equal(named(m.render(), 'CompatibilityChangeSheet'), undefined); assert.equal(named(m.render(), 'CompatibilityNotice'), undefined);
  source.connections = [connection(changedAgain)]; source.notify(); await settle(); assert(named(m.render(), 'CompatibilityNotice'));
  source.connections = []; source.notify(); await settle(); assert.equal(named(m.render(), 'CompatibilityNotice'), undefined);
  source.connections = [connection(changedAgain)]; source.notify(); await settle(); assert.equal(named(m.render(), 'CompatibilityNotice'), undefined, 'A new accepted connection establishes a fresh baseline');
  source.connections = [connection(original)]; source.notify(); await settle(); assert(named(m.render(), 'CompatibilityNotice'));
  const nextSource = sourceWith(original); m.render({ source: nextSource }); await settle(); assert.equal(named(m.render(), 'CompatibilityNotice'), undefined); m.close();
});
