import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/settings/MemberData.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));

// Run the actual component and effects with the same small hook harness used by
// private-media tests. No live authentication client, network or member data.
function mount({ response, demo = false, profile = null } = {}) {
  const hooks = [], effects = [], calls = [], copies = [];
  let index = 0;
  const react = {
    useRef(initial) { const at = index++; if (!(at in hooks)) hooks[at] = { current: initial }; return hooks[at]; },
    useState(initial) { const at = index++; if (!(at in hooks)) hooks[at] = initial; return [hooks[at], value => { hooks[at] = typeof value === 'function' ? value(hooks[at]) : value; }]; },
    useEffect(effect, deps) {
      const at = index++, old = hooks[at];
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.(); const item = { deps }; hooks[at] = item;
        effects.push(() => { item.cleanup = effect(); });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, AbortController, File, Blob, DOMException,
    navigator: { clipboard: { writeText: async value => { copies.push(value); } } },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (tag, props) => ({ tag, props }), jsxs: (tag, props) => ({ tag, props }), Fragment: 'fragment' };
      if (name === '../cloud') return { callRpc: async (...args) => { calls.push(args); return response; } };
      if (name === '../compatibility/model') return { interests: [] };
      return {};
    },
  });
  const props = { mode: 'export', owner: 'synthetic-owner', demo, profile, close() {} };
  function render() { index = 0; const tree = exports.MemberData(props); for (const effect of effects.splice(0)) effect(); return tree; }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  render();
  return { calls, copies, render, find: predicate => find(render(), predicate), unmount() { for (const hook of hooks) hook?.cleanup?.(); } };
}

test('member export accepts server version 2 and displays/copies the complete response unchanged', async () => {
  const response = { exportVersion: 2, exportedAt: '2026-11-07T10:00:00Z', profile: { displayName: 'عضو اصطناعي' },
    messages: [{ id: 'own-message', body: 'رسالة اصطناعية' }], consents: [{ version: '2026-11-07-privacy', purpose: 'sensitive_publication', granted: false }],
    manualVerification: { requests: [], claims: [], events: [] }, readiness: { shared: false }, futureSection: { nested: [0, null, false] } };
  const instance = mount({ response });
  try {
    await settle();
    assert.equal(instance.calls.length, 1);
    assert.equal(instance.calls[0][0], 'marriage_personal_data');
    assert.equal(instance.calls[0][2], 'synthetic-owner');
    assert(instance.calls[0][3] instanceof AbortSignal);
    assert.equal(instance.find(node => node.props?.role === 'alert'), null);
    const textarea = instance.find(node => node.tag === 'textarea');
    assert(textarea, 'successful version 2 export must be visible');
    assert.deepEqual(JSON.parse(textarea.props.value), response);
    const copy = instance.find(node => node.tag === 'button' && [node.props.children].flat().includes('نسخ النص'));
    await copy.props.onClick();
    assert.deepEqual(JSON.parse(instance.copies[0]), response);
  } finally { instance.unmount(); }
});

test('demo export still uses version 1 and preserves its profile without calling the member RPC', async () => {
  const profile = { displayName: 'ملف تجريبي', age: 30, bio: 'بيانات اصطناعية', city: 'الرياض', profession: 'مصمم' };
  const instance = mount({ demo: true, profile });
  try {
    await settle();
    assert.equal(instance.calls.length, 0);
    assert.equal(instance.find(node => node.props?.role === 'alert'), null);
    const data = JSON.parse(instance.find(node => node.tag === 'textarea').props.value);
    assert.equal(data.exportVersion, 1); assert.equal(data.demo, true);
    assert.deepEqual(data.profile, profile); assert(Number.isFinite(Date.parse(data.exportedAt)));
  } finally { instance.unmount(); }
});

test('unknown or malformed export versions show a recoverable error and never expose export content', async () => {
  for (const response of [{ exportVersion: 3 }, { exportVersion: '2' }, {}, null]) {
    const instance = mount({ response });
    try {
      await settle();
      assert.match(instance.find(node => node.props?.role === 'alert').props.children, /تعذّر فتح نسخة بياناتك/);
      assert.equal(instance.find(node => node.tag === 'textarea'), null);
      assert(instance.find(node => node.tag === 'button' && node.props.children === 'إعادة المحاولة'));
    } finally { instance.unmount(); }
  }
});
