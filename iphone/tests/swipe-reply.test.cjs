const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/community/SwipeReply.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture({ disabled = false, interactive = false, link = false, photo = false } = {}) {
  const exports = {};
  vm.runInNewContext(code, {
    exports, window: { innerWidth: 390 },
    require(name) {
      if (name === 'react') return { useRef: value => ({ current: value }), useState: value => [value, () => {}] };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'lucide-react') return { Reply: () => null };
      if (name.endsWith('.css')) return {};
      throw Error('Unexpected import: ' + name);
    },
  });
  let replies = 0, captures = 0, prevented = 0;
  const node = exports.SwipeReply({ disabled, onReply: () => replies++, children: null });
  const target = { closest: selector => selector === 'a:not(.cm-message-photo)' ? link && !photo : interactive };
  const currentTarget = { hasPointerCapture: () => captures > 0, setPointerCapture: () => captures++, releasePointerCapture: () => captures-- };
  const event = (x, y, pointerType = 'touch') => ({ pointerId: 1, isPrimary: true, clientX: x, clientY: y, pointerType, target, currentTarget, preventDefault: () => prevented++ });
  return {
    start: (x = 150, y = 100, type) => node.props.onPointerDown(event(x, y, type)),
    move: (x, y = 100) => node.props.onPointerMove(event(x, y)),
    finish: (cancel = false) => node.props[cancel ? 'onPointerCancel' : 'onPointerUp'](event(220, 100)),
    click() { let blocked = false; node.props.onClickCapture({ preventDefault: () => { blocked = true; }, stopPropagation() {} }); return blocked; },
    get replies() { return replies; }, get captures() { return captures; }, get prevented() { return prevented; },
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
