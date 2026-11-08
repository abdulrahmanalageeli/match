import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/community/MessageReactions.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports, Intl, require: name => name === 'react/jsx-runtime'
  ? { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
  : { MotionReveal: 'reveal', MotionPressButton: 'button' } });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];

test('picker exposes six labeled choices, marks mine, toggles it off and respects pending state', () => {
  const chosen = []; const props = { reactions: [{ emoji: '❤️', count: 1, mine: true }], pending: false, choose: emoji => chosen.push(emoji) };
  let buttons = nodes(exports.ReactionPicker(props)).filter(node => node.type === 'button');
  assert.equal(buttons.length, 6); assert.equal(buttons.filter(node => node.props['aria-pressed']).length, 1);
  assert.equal(buttons[0].props['aria-label'], 'إزالة تفاعل قلب'); buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.deepEqual(chosen, [null, '😂']);
  buttons = nodes(exports.ReactionPicker({ ...props, pending: true })).filter(node => node.type === 'button');
  assert(buttons.every(node => node.props.disabled));
});

test('compact reaction chips identify both participants without displaying extra profile information', () => {
  let opened = 0;
  const props = { reactions: [{ emoji: '❤️', count: 2, mine: true }], self: true, name: 'رهام', pending: false, disabled: false, open: () => opened++ };
  const tree = exports.MessageReactions(props), button = nodes(tree).find(node => node.type === 'button');
  assert.equal(tree.props['data-self'], true); assert.match(button.props['aria-label'], /أنت ورهام/);
  button.props.onClick(); assert.equal(opened, 1);
  assert.equal(exports.MessageReactions({ ...props, reactions: [] }), null);
});
