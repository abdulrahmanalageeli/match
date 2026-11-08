import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/community/ChatMedia.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];

function mount() {
  const hooks = [], effects = [], events = new Map(), intervals = new Map(), activity = []; let cursor = 0, now = 0, stopped = 0, starts = 0, sends = 0, grant;
  const addEventListener = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const removeEventListener = (name, fn) => events.get(name)?.delete(fn);
  const doc = { hidden: false, addEventListener, removeEventListener };
  const media = { getTracks: () => [{ stop: () => stopped++ }] };
  const react = {
    useRef: value => hooks[cursor++] ??= { current: value },
    useState: value => { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { hooks[at] = typeof next === 'function' ? next(hooks[at]) : next; }]; },
    useEffect: (fn, deps) => { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old.deps[i])) { old?.cleanup?.(); const item = hooks[at] = { deps }; effects.push(() => { item.cleanup = fn(); }); } },
  };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4'; }
    start() { this.state = 'recording'; starts++; }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['voice']) }); this.onstop?.(); }); }
  }
  const exports = {}, props = { source: { sendMedia: async () => sends++, mediaUrl: async () => '' }, requestId: 'room', disabled: false, callActive: false, onRecording: value => activity.push(value), sent() {} };
  const noop = () => {};
  vm.runInNewContext(compiled, { exports, document: doc, navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) } },
    window: { addEventListener, removeEventListener, setInterval: fn => { intervals.set(1, fn); return 1; } }, clearInterval: id => intervals.delete(id), MediaRecorder: Recorder,
    Date: { now: () => now }, Blob, crypto: { randomUUID: () => 'draft-id' }, URL: { createObjectURL: () => 'blob:draft', revokeObjectURL: noop },
    require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      : name === '../feedback/haptics' ? { feedback: noop } : name === '../motion/Reanimated' ? { MotionPressButton: 'button', MotionReveal: 'motion' } : {},
  });
  function render() { cursor = 0; const tree = exports.ChatMediaComposer(props); effects.splice(0).forEach(fn => fn()); return tree; }
  const find = label => nodes(render()).find(node => node.props?.['aria-label'] === label);
  const emit = (name, extra = {}) => { for (const fn of events.get(name) ?? []) fn({ pointerId: 1, clientX: 50, clientY: 100, ...extra }); };
  render();
  return { props, render, find, activity, get starts() { return starts; }, get stopped() { return stopped; }, get sends() { return sends; }, get timers() { return intervals.size; },
    preview: () => nodes(render()).find(node => node.type?.name === 'VoicePlayer'),
    press() { find('رسالة صوتية').props.onPointerDown({ pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 100 }); },
    keyboard() { find('رسالة صوتية').props.onClick({ detail: 0 }); },
    advance(ms) { now += ms; }, up: () => emit('pointerup'), move: (x, y) => emit('pointermove', { clientX: x, clientY: y }),
    cancel: () => emit('pointercancel'), grant: async () => { grant(media); await settle(); },
    hide() { doc.hidden = true; emit('visibilitychange'); },
    close() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

test('holding records, releasing creates a preview and never sends automatically', async () => {
  const f = mount(); f.press(); await f.grant(); assert.equal(f.starts, 1);
  f.advance(1500); f.up(); await settle();
  assert(f.preview()); assert.equal(f.preview().props.duration, 1.5); assert.equal(f.sends, 0); assert.equal(f.timers, 0);
  assert.equal(f.activity.at(-1), false); f.close();
});

test('rightward cancel discards while upward lock keeps recording until explicit preview', async () => {
  const cancelled = mount(); cancelled.press(); await cancelled.grant(); cancelled.advance(1000); cancelled.move(130, 100); await settle();
  assert.equal(cancelled.preview(), undefined); assert(cancelled.stopped > 0); assert.equal(cancelled.timers, 0); cancelled.close();
  const locked = mount(); locked.press(); await locked.grant(); locked.advance(1000); locked.move(50, 30); locked.up(); await settle();
  assert.equal(locked.preview(), undefined); assert.equal(locked.timers, 1);
  locked.find('إنهاء التسجيل ومعاينته').props.onClick(); await settle(); assert(locked.preview()); assert.equal(locked.sends, 0); locked.close();
});

test('release, cancellation, hiding and revoked availability cannot start a delayed microphone capture', async () => {
  for (const exit of [f => { f.advance(500); f.up(); }, f => f.cancel(), f => f.hide(), f => { f.props.callActive = true; f.render(); }, f => { f.props.disabled = true; f.render(); }, f => f.close()]) {
    const f = mount(); f.press(); exit(f); await f.grant(); assert.equal(f.starts, 0); assert(f.stopped > 0); assert.equal(f.timers, 0); assert.equal(f.sends, 0); f.close();
  }
});

test('quick taps and keyboard clicks support hands-free recording with explicit stop', async () => {
  for (const begin of [f => { f.press(); f.advance(100); f.up(); }, f => f.keyboard()]) {
    const f = mount(); begin(f); await f.grant(); f.advance(800); assert.equal(f.starts, 1); assert.equal(f.preview(), undefined);
    f.find('إنهاء التسجيل ومعاينته').props.onClick(); await settle(); assert(f.preview()); assert.equal(f.sends, 0); f.close();
  }
});

test('a failed voice upload retains the preview and retries the same client identity only once', async () => {
  const f = mount(); f.keyboard(); await f.grant(); f.advance(1200);
  f.find('إنهاء التسجيل ومعاينته').props.onClick(); await settle();
  const attempts = []; let reject;
  f.props.source.sendMedia = (...args) => { attempts.push(args); return new Promise((_resolve, no) => { reject = no; }); };
  const send = f.find('إرسال المرفق').props.onClick;
  send(); send(); assert.equal(attempts.length, 1, 'rapid taps never duplicate the upload');
  assert(nodes(f.render()).some(node => node.type === 'progress' && node.props.value === undefined), 'progress is honest and indeterminate');
  reject(Error('network')); await settle(); assert(f.preview()); assert(f.find('إعادة إرسال المرفق'));
  f.props.source.sendMedia = async (...args) => { attempts.push(args); return 'saved'; };
  f.find('إعادة إرسال المرفق').props.onClick(); await settle();
  assert.equal(attempts.length, 2); assert.equal(attempts[0][3], attempts[1][3], 'retry preserves the idempotency key');
  assert.equal(f.preview(), undefined); f.close();
});
