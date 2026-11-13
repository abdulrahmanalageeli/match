import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../src/mobile/keyboardViewport.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ touch = true, visual = true } = {}) {
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) { this.listeners.set(name, fn); }, removeEventListener(name) { this.listeners.delete(name); }, emit(name) { this.listeners.get(name)?.(); } });
  const attributes = new Set(), values = {};
  const root = { setAttribute: key => attributes.add(key), hasAttribute: key => attributes.has(key), toggleAttribute: (key, on) => on ? attributes.add(key) : attributes.delete(key), removeAttribute: key => attributes.delete(key), style: { setProperty: (key, value) => values[key] = value, removeProperty: key => delete values[key] } };
  const body = {};
  class Element {
    top = 100; height = 48; parentElement = body; container = null; form = null; shell = null;
    matches() { return true; }
    closest(selector) { return selector === '.nf-intake, .nf-auth-frame' ? this.shell : selector === 'form' ? this.form : this.container?.kind === selector ? this.container : null; }
    getBoundingClientRect() { return { top: this.top, height: this.height, bottom: this.top + this.height }; }
  }
  const field = new Element(), viewport = { ...events(), height: 844, offsetTop: 0, scale: 1 };
  const document = { ...events(), documentElement: root, body, activeElement: null };
  const scrolls = [];
  const restores = [];
  const window = { ...events(), scrollY: 0, visualViewport: visual ? viewport : null, innerHeight: 844, matchMedia: () => ({ matches: touch }), getComputedStyle: element => ({ overflowY: element.overflow || 'visible' }), scrollBy: ({ top }) => scrolls.push(top), scrollTo: ({ top }) => { window.scrollY = top; restores.push(top); } };
  let pending = null;
  const exports = {};
  vm.runInNewContext(code, { exports, window, document, HTMLElement: Element, requestAnimationFrame: fn => { pending = fn; return 1; }, cancelAnimationFrame: () => { pending = null; } });
  const stop = exports.initializeKeyboardViewport();
  const flush = () => { const fn = pending; pending = null; fn?.(); };
  return { root, attributes, values, field, viewport, document, window, scrolls, restores, stop, flush,
    open(height = 440) { document.activeElement = field; viewport.height = height; if (!visual) window.innerHeight = height; viewport.emit('resize'); window.emit('resize'); flush(); },
  };
}

test('visible form fields stay still; a covered field gets only the required scroll', () => {
  const f = fixture(); f.open();
  assert.deepEqual(f.scrolls, []);
  assert.ok(f.attributes.has('data-nf-keyboard'));
  assert.equal(f.values['--nf-keyboard-inset'], '404px');
  f.field.top = 420; f.viewport.emit('resize'); f.flush();
  assert.deepEqual(f.scrolls, [40]);
  f.field.top -= 40; f.viewport.emit('scroll'); f.flush();
  assert.deepEqual(f.scrolls, [40]);
});

function registration(f) {
  const attributes = new Set(), scrolls = [];
  const shell = { isConnected: true, scrollTop: 0, scrollHeight: 1200, clientHeight: 440, overflow: 'auto',
    querySelector: () => null,
    setAttribute: key => attributes.add(key), removeAttribute: key => attributes.delete(key),
    getBoundingClientRect: () => ({ top: -200, bottom: 1000 }),
    scrollBy: ({ top }) => { shell.scrollTop += top; scrolls.push(top); }, parentElement: f.document.body };
  f.field.shell = shell; f.field.parentElement = shell; f.window.scrollY = 200;
  return { shell, attributes, scrolls };
}

test('registration contains keyboard scrolling and restores the reader position after closing', () => {
  const f = fixture(), r = registration(f);
  f.field.top = 400; f.open();
  assert.ok(f.attributes.has('data-nf-form-viewport'));
  assert.ok(r.attributes.has('data-nf-keyboard-form'));
  assert.equal(r.shell.scrollTop, 220);
  assert.deepEqual(r.scrolls, [20]);
  assert.deepEqual(f.scrolls, []);
  assert.equal(f.window.scrollY, 0);
  f.document.activeElement = null; f.document.emit('focusout'); f.flush();
  assert.ok(f.attributes.has('data-nf-form-viewport'), 'blur must not dismantle the shell during the closing animation');
  r.shell.scrollTop = 315;
  f.viewport.height = 844; f.viewport.emit('resize'); f.flush();
  assert.ok(!f.attributes.has('data-nf-form-viewport'));
  assert.ok(!r.attributes.has('data-nf-keyboard-form'));
  assert.equal(f.window.scrollY, 315);
});

test('Safari viewport panning updates the registration shell without recentering its field', () => {
  const f = fixture(), r = registration(f); f.open();
  r.shell.scrollTop = 320; f.viewport.offsetTop = 36; f.window.scrollY = 36;
  f.viewport.emit('scroll'); f.flush();
  assert.equal(f.values['--nf-visual-top'], '36px');
  assert.equal(f.window.scrollY, 0);
  assert.equal(r.shell.scrollTop, 320);
  assert.deepEqual(r.scrolls, []);
});

test('leaving registration releases the document without restoring the old route scroll', () => {
  const f = fixture(), r = registration(f); f.open();
  r.shell.isConnected = false; f.document.activeElement = null;
  f.document.emit('focusout'); f.flush();
  assert.ok(!f.attributes.has('data-nf-form-viewport'));
  assert.equal(f.window.scrollY, 0);
});

test('support dialog scrolls its own content, not the underlying page', () => {
  const f = fixture(), scrolls = [];
  const dialog = { kind: 'dialog', overflow: 'auto', scrollHeight: 900, clientHeight: 416, parentElement: f.document.body, getBoundingClientRect: () => ({ top: 12, bottom: 428 }), scrollBy: ({ top }) => scrolls.push(top) };
  f.field.container = dialog; f.field.parentElement = dialog; f.field.top = 390; f.open();
  assert.deepEqual(scrolls, [22]);
  assert.deepEqual(f.scrolls, []);
});

test('manual viewport panning does not pull the reader back to the focused field', () => {
  const f = fixture(); f.open(); f.field.top = 700;
  f.viewport.offsetTop = 20; f.viewport.emit('scroll'); f.flush();
  assert.deepEqual(f.scrolls, []);
  assert.equal(f.values['--nf-visual-top'], '20px');
});

test('sticky onboarding actions reserve their visible space above the keyboard', () => {
  const f = fixture();
  f.field.form = { querySelector: () => ({ getBoundingClientRect: () => ({ top: 330 }) }) };
  f.field.top = 300; f.open();
  assert.deepEqual(f.scrolls, [30]);
});

test('direct chat and fitted family composers retain their own scrolling', () => {
  const f = fixture(); f.field.top = 700; f.attributes.add('data-nf-chat-viewport'); f.open();
  assert.deepEqual(f.scrolls, []);
  f.attributes.delete('data-nf-chat-viewport'); f.field.container = { kind: '.fb-composer' }; f.viewport.emit('resize'); f.flush();
  assert.deepEqual(f.scrolls, []);
});

test('pinch zoom and desktop window resizing do not act as keyboard opens', () => {
  const f = fixture(); f.viewport.scale = 1.5; f.open();
  assert.ok(!f.attributes.has('data-nf-keyboard')); assert.deepEqual(f.scrolls, []);
  const desktop = fixture({ touch: false }); desktop.open();
  assert.ok(!desktop.attributes.has('data-nf-keyboard'));
});

test('resized native viewport works without VisualViewport; blur and cleanup reset state', () => {
  const f = fixture({ visual: false }); f.open();
  assert.ok(f.attributes.has('data-nf-keyboard'));
  assert.equal(f.values['--nf-visual-height'], '440px');
  f.document.activeElement = null; f.document.emit('focusout'); f.flush();
  assert.ok(!f.attributes.has('data-nf-keyboard'));
  assert.equal(f.values['--nf-keyboard-inset'], '0px');
  f.document.emit('focusin'); f.stop(); f.flush();
  assert.deepEqual(f.values, {}); assert.equal(f.document.listeners.size, 0); assert.equal(f.window.listeners.size, 0);
});
