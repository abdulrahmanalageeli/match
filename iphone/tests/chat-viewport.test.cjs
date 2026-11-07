const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/community/chatViewport.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ visualViewport = true, chromeHeight = 28 } = {}) {
  const style = () => ({
    values: {},
    setProperty(key, value) { this.values[key] = value; },
    removeProperty(key) { delete this.values[key]; },
  });
  const events = () => ({
    listeners: new Map(),
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    removeEventListener(name) { this.listeners.delete(name); },
    emit(name) { this.listeners.get(name)?.(); },
  });
  const attributes = new Set();
  const root = {
    style: style(),
    setAttribute: name => attributes.add(name),
    removeAttribute: name => attributes.delete(name),
    toggleAttribute: (name, value) => value ? attributes.add(name) : attributes.delete(name),
  };
  const input = { matches: () => true };
  const element = { ...events(), style: style(), contains: el => el === input };
  const viewport = { ...events(), height: 844, offsetTop: 0 };
  const chrome = { height: chromeHeight, open: false, getBoundingClientRect() { return { height: this.height }; } };
  const document = { documentElement: root, activeElement: null, querySelector: () => chrome };
  const window = {
    ...events(), visualViewport: visualViewport ? viewport : null, innerHeight: 844, scrollY: 170,
    scrollTo({ top }) { this.scrollY = top; },
  };
  let queued, observed, disconnected = false, callbacks = 0;
  const exports = {};
  vm.runInNewContext(code, {
    exports, window, document,
    requestAnimationFrame: fn => { queued = fn; return 1; },
    cancelAnimationFrame: () => { queued = null; },
    ResizeObserver: class {
      constructor(fn) { observed = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  const stop = exports.lockChatViewport(element, () => callbacks++);
  return {
    window, document, input, viewport, root, element, chrome, attributes, stop,
    flush() { const fn = queued; queued = null; fn?.(); },
    resizeChrome(height) { chrome.height = height; observed(); this.flush(); },
    get disconnected() { return disconnected; },
    get callbacks() { return callbacks; },
  };
}

test('Safari keyboard open, panning, and close keep the whole document inside the visible viewport', () => {
  const f = fixture();
  assert.equal(f.element.style.values['--chat-available-height'], '816px');
  f.document.activeElement = f.input;
  f.viewport.height = 480;
  f.viewport.offsetTop = 48;
  f.window.scrollY = 48;
  f.viewport.emit('resize'); f.viewport.emit('scroll'); f.flush();
  assert.equal(f.root.style.values['--chat-viewport-height'], '480px');
  assert.equal(f.element.style.values['--chat-available-height'], '480px');
  assert.equal(f.element.style.values['--chat-viewport-top'], '48px');
  assert.equal(f.window.scrollY, 0);
  assert.ok(f.attributes.has('data-nf-chat-keyboard'));
  // Repeated focus/pan events must never accumulate extra height.
  for (let i = 0; i < 4; i++) { f.element.emit('focusin'); f.viewport.emit('scroll'); f.flush(); }
  assert.equal(f.element.style.values['--chat-available-height'], '480px');
  f.document.activeElement = null;
  f.viewport.height = 844; f.viewport.offsetTop = 0;
  f.element.emit('focusout'); f.viewport.emit('resize'); f.flush();
  assert.equal(f.root.style.values['--chat-viewport-height'], '844px');
  assert.equal(f.element.style.values['--chat-available-height'], '816px');
  assert.ok(!f.attributes.has('data-nf-chat-keyboard'));
  f.stop();
  assert.equal(f.window.scrollY, 170);
  assert.equal(f.attributes.size, 0);
  assert.deepEqual(f.root.style.values, {});
  assert.deepEqual(f.element.style.values, {});
  assert.equal(f.viewport.listeners.size, 0);
  assert.equal(f.window.listeners.size, 0);
  assert.equal(f.element.listeners.size, 0);
  assert.ok(f.disconnected);
});

test('keyboard detection also works when innerHeight shrinks', () => {
  const f = fixture();
  f.document.activeElement = f.input;
  f.window.innerHeight = f.viewport.height = 460;
  f.window.emit('resize'); f.flush();
  assert.ok(f.attributes.has('data-nf-chat-keyboard'));
  assert.equal(f.element.style.values['--chat-available-height'], '460px');
  f.stop();
});

test('toolbar resizing updates the inset without feeding chat geometry back into height', () => {
  const f = fixture();
  f.resizeChrome(44);
  assert.equal(f.element.style.values['--chat-available-height'], '800px');
  assert.equal(f.element.style.values['--chat-viewport-top'], '44px');
  f.resizeChrome(28);
  assert.equal(f.element.style.values['--chat-available-height'], '816px');
  f.stop();
});

test('fallback viewport and cleanup cancel pending resize work', () => {
  const f = fixture({ visualViewport: false });
  f.document.activeElement = f.input;
  f.window.innerHeight = 420; f.window.emit('resize'); f.flush();
  assert.equal(f.root.style.values['--chat-viewport-height'], '420px');
  f.window.emit('resize');
  const previous = f.callbacks;
  f.stop(); f.flush();
  assert.equal(f.callbacks, previous);
});
