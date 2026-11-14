const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/community/SwipeReply.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture({ disabled = false, interactive = false, link = false, photo = false, photoButton = false, oncePhoto = false, actions = false, actionsDisabled = false, bubble = true } = {}) {
  const exports = {};
  let now = 0, timerId = 0;
  const timers = new Map(), events = new Map(), cleanups = [];
  const addEventListener = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const removeEventListener = (name, fn) => events.get(name)?.delete(fn);
  const doc = { hidden: false, addEventListener, removeEventListener };
  vm.runInNewContext(code, {
    exports, document: doc, window: { innerWidth: 390, addEventListener, removeEventListener,
      setTimeout: (fn, duration) => { const id = ++timerId; timers.set(id, { fn, at: now + duration }); return id; }, clearTimeout: id => timers.delete(id) },
    require(name) {
      if (name === 'react') return { useRef: value => ({ current: value }), useState: value => [value, () => {}], useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '../BrandIcons') return { Reply: () => null };
      if (name.endsWith('.css')) return {};
      throw Error('Unexpected import: ' + name);
    },
  });
  let replies = 0, holds = 0, captures = 0, prevented = 0;
  const node = exports.SwipeReply({ disabled, onReply: () => replies++, onHold: actions ? () => holds++ : undefined, actionsDisabled, children: null });
  const target = { closest: selector => selector === '.cm-bubble' ? bubble : selector === 'a:not(.cm-message-photo)' ? link && !photo
    : selector === 'button.cm-message-photo, button.cm-once-photo' ? photoButton || oncePhoto : interactive || photoButton || oncePhoto };
  const currentTarget = { hasPointerCapture: () => captures > 0, setPointerCapture: () => captures++, releasePointerCapture: () => captures-- };
  const event = (x, y, pointerType = 'touch') => ({ pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, pointerType, target, currentTarget, preventDefault: () => prevented++ });
  return {
    start: (x = 150, y = 100, type) => node.props.onPointerDown(event(x, y, type)),
    move: (x, y = 100) => node.props.onPointerMove(event(x, y)),
    finish: (cancel = false) => node.props[cancel ? 'onPointerCancel' : 'onPointerUp'](event(220, 100)),
    advance(ms = 450) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    context: () => node.props.onContextMenu(event(150, 100, 'mouse')),
    key(key, { shiftKey = false, nested = false, repeat = false } = {}) { node.props.onKeyDown({ key, shiftKey, repeat, target: nested ? target : currentTarget, currentTarget, preventDefault: () => prevented++ }); },
    leave: () => node.props.onPointerLeave(),
    emit(name, value) { for (const fn of events.get(name) ?? []) fn(value); },
    hide() { doc.hidden = true; for (const fn of events.get('visibilitychange') ?? []) fn(); },
    unmount() { for (const cleanup of cleanups) cleanup(); },
    click() { let blocked = false; node.props.onClickCapture({ preventDefault: () => { blocked = true; }, stopPropagation() {} }); return blocked; },
    get replies() { return replies; }, get holds() { return holds; }, get captures() { return captures; }, get prevented() { return prevented; }, get timers() { return timers.size; }, get tabIndex() { return node.props.tabIndex; },
  };
}

test('photo-message swipes reply without opening the full-size image, while a tap still opens it', () => {
  const swipe = fixture({ link: true, photo: true });
  swipe.start(); swipe.move(220); swipe.finish();
  assert.equal(swipe.replies, 1);
  assert.equal(swipe.captures, 0);
  assert.equal(swipe.click(), true);
  assert.equal(swipe.click(), false);
  const tap = fixture({ link: true, photo: true });
  tap.start(); tap.finish();
  assert.equal(tap.replies, 0);
  assert.equal(tap.click(), false);
});

test('short or cancelled horizontal swipes neither reply nor activate their underlying message link', () => {
  for (const cancelled of [false, true]) {
    const f = fixture({ link: true, photo: true });
    f.start(); f.move(cancelled ? 220 : 180); f.finish(cancelled);
    assert.equal(f.replies, 0);
    assert.equal(f.click(), true);
    assert.equal(f.captures, 0);
  }
});

test('vertical scrolling, interactive controls, ordinary links, browser edges and mouse drags do not reply', () => {
  const vertical = fixture(); vertical.start(); vertical.move(160, 180); vertical.finish();
  assert.equal(vertical.replies, 0); assert.equal(vertical.prevented, 0);
  for (const options of [{ disabled: true }, { interactive: true }, { link: true }]) {
    const f = fixture(options); f.start(); f.move(220); f.finish(); assert.equal(f.replies, 0);
  }
  for (const x of [10, 380]) {
    const f = fixture(); f.start(x); f.move(220); f.finish(); assert.equal(f.replies, 0);
  }
  const mouse = fixture(); mouse.start(150, 100, 'mouse'); mouse.move(220); mouse.finish(); assert.equal(mouse.replies, 0);
});

test('swipe reply works in either direction', () => {
  for (const x of [80, 220]) {
    const f = fixture(); f.start(); f.move(x); f.finish(); assert.equal(f.replies, 1);
  }
});

test('holding a bubble opens actions once, suppresses the release tap, and never replies', () => {
  for (const type of ['touch', 'mouse']) {
    const f = fixture({ actions: true, link: true, photo: true });
    f.start(150, 100, type); f.advance(449); assert.equal(f.holds, 0);
    f.advance(1); assert.equal(f.holds, 1); f.context(); assert.equal(f.holds, 1);
    f.move(220); f.finish(); assert.equal(f.replies, 0); assert.equal(f.click(), true); assert.equal(f.click(), false);
    assert.equal(f.timers, 0);
  }
  const tap = fixture({ actions: true, link: true, photo: true });
  tap.start(); tap.finish(); tap.advance(); assert.equal(tap.holds, 0); assert.equal(tap.click(), false);
});

test('scrolling, pinching, cancellation, visibility changes and unmount cancel pending holds', () => {
  const stops = [f => f.move(150, 112), f => f.emit('pointerdown', { isPrimary: false }), f => f.finish(true),
    f => f.leave(), f => f.hide(), f => f.emit('blur'), f => f.unmount()];
  for (const stop of stops) {
    const f = fixture({ actions: true }); f.start(); stop(f); f.advance();
    assert.equal(f.holds, 0); assert.equal(f.timers, 0);
  }
  const swipe = fixture({ actions: true }); swipe.start(); swipe.move(220); swipe.advance(); swipe.finish();
  assert.equal(swipe.holds, 0); assert.equal(swipe.replies, 1);
});

test('actions support context menu and keyboard without hijacking controls or empty row space', () => {
  const mouse = fixture({ actions: true }); mouse.context(); assert.equal(mouse.holds, 1); assert.equal(mouse.prevented, 1);
  for (const [key, shiftKey] of [['Enter', false], [' ', false], ['ContextMenu', false], ['F10', true]]) {
    const keyboard = fixture({ actions: true }); keyboard.key(key, { shiftKey }); assert.equal(keyboard.holds, 1);
  }
  const untouched = fixture({ actions: true }); untouched.key('F10'); untouched.key('Enter', { nested: true }); untouched.key(' ', { repeat: true });
  assert.equal(untouched.holds, 0); assert.equal(untouched.prevented, 0);
  for (const options of [{ interactive: true }, { link: true }, { bubble: false }, { actionsDisabled: true }]) {
    const f = fixture({ actions: true, ...options }); f.start(); f.advance(); f.context();
    assert.equal(f.holds, 0); assert.equal(f.prevented, 0);
  }
});

test('action availability is independent of swipe reply permission', () => {
  const f = fixture({ actions: true, disabled: true }); f.start(); f.advance(); assert.equal(f.holds, 1); assert.equal(f.tabIndex, 0);
  const disabled = fixture({ actions: true, actionsDisabled: true }); assert.equal(disabled.tabIndex, undefined);
  const legacy = fixture(); assert.equal(legacy.tabIndex, undefined); legacy.context(); assert.equal(legacy.holds, 0);
});

test('regular and view-once photo buttons open actions on hold or right-click without activating the photo', () => {
  for (const options of [{ photoButton: true }, { oncePhoto: true }]) {
    const held = fixture({ actions: true, ...options }); held.start(); held.advance(); held.finish();
    assert.equal(held.holds, 1); assert.equal(held.click(), true, 'Held photo is not opened or consumed'); assert.equal(held.replies, 0);
    const context = fixture({ actions: true, ...options }); context.context();
    assert.equal(context.holds, 1); assert.equal(context.prevented, 1);
    const tap = fixture({ actions: true, ...options }); tap.start(); tap.finish(); tap.advance();
    assert.equal(tap.holds, 0); assert.equal(tap.click(), false, 'Normal tap keeps photo behavior');
    const swipe = fixture({ actions: true, ...options }); swipe.start(); swipe.move(220); swipe.finish();
    assert.equal(swipe.replies, 1); assert.equal(swipe.click(), true, 'Swiping does not consume a view-once photo');
  }
});
