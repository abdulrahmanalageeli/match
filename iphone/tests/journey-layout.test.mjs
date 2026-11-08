import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/community/Community.tsx', import.meta.url), 'utf8') + '\nexport { ConversationGuide };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : text(value?.props?.children ?? '');
const button = (tree, label) => nodes(tree).find(node => (node.type === 'button' || node.type?.name === 'MotionPressButton') && text(node) === label);
function mount(initialProgress = {}) {
  const hooks = [], effects = [], modules = new Map(), calls = []; let cursor = 0, dirty = false;
  let progress = { stage: 0, exclusive: false, mine: false, peer: false, consentMine: false, consentPeer: false, ...initialProgress };
  const react = {
    useState: value => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof value === 'function' ? value() : value; return [hooks[i], next => { const result = typeof next === 'function' ? next(hooks[i]) : next; if (result !== hooks[i]) { hooks[i] = result; dirty = true; } }]; },
    useEffect: (fn, deps) => { const i = cursor++, old = hooks[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) { old?.cleanup?.(); const item = hooks[i] = { deps }; effects.push(() => { item.cleanup = fn(); }); } },
  };
  const source = { progress: async () => progress, inbox: async () => [{ id: 'other', status: 'accepted', person: { alias: 'اسم آخر' } }], watch: () => () => {},
    nextStep: async (...args) => { calls.push(['next', ...args]); progress = { ...progress, consentMine: true }; return progress; },
    rewindStep: async (...args) => { calls.push(['rewind', ...args]); return { ...progress, rewindMine: true }; },
    act: async (...args) => calls.push(['act', ...args]),
  };
  const exports = {};
  vm.runInNewContext(code, { exports, document: { hidden: false }, require: name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === '../notifications/ActivityAlerts') return { journeyStages: ['التعارف الأول', 'نقاش جاد حول الزواج', 'الخطوة الرسمية أو العائلية'] };
    if (!modules.has(name)) modules.set(name, new Proxy({}, { get: (cache, key) => cache[key] ??= Object.defineProperty(() => null, 'name', { value: key }) }));
    return modules.get(name);
  } });
  return {
    calls, render() { let tree, passes = 0; do { dirty = false; cursor = 0; tree = exports.ConversationGuide({ source, connection: { id: 'match' }, close() {}, closed() {}, choose() {}, hasDraft: false, openInsights() {}, openFamily() {}, onCompletion() {} }); for (const fn of effects.splice(0)) fn(); if (++passes > 20) throw Error('unstable render'); } while (dirty); return tree; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test('exclusivity is reviewed intentionally and cannot be approved before its explicit checkbox', async () => {
  const m = mount(); m.render(); await settle(); let tree = m.render();
  assert(!text(tree).includes('تُغلق جميع طلبات التعارف'));
  assert(button(tree, 'مراجعة الالتزام الحصري'));
  assert.equal(nodes(tree).filter(node => node.type === 'details' && node.props.className === 'nf-journey-option').length, 1);
  button(tree, 'مراجعة الالتزام الحصري').props.onClick(); tree = m.render();
  assert(text(tree).includes('تُغلق جميع طلبات التعارف والمحادثات الأخرى لكليكما'));
  assert(text(tree).includes('المحادثات المغلقة لا تُفتح تلقائيًا'));
  assert.equal(button(tree, 'اقتراح الالتزام الحصري').props.disabled, true);
  assert.equal(m.calls.length, 0);
  nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  tree = m.render(); assert.equal(button(tree, 'اقتراح الالتزام الحصري').props.disabled, false);
  button(tree, 'اقتراح الالتزام الحصري').props.onClick(); await settle();
  assert.deepEqual(m.calls[0], ['next', 'match', 1, true, true]); m.close();
});

test('an incoming commitment request is visible immediately but still requires explicit consent', async () => {
  const m = mount({ consentPeer: true }); m.render(); await settle(); const tree = m.render();
  assert(text(tree).includes('لديك طلب التزام حصري'));
  assert(text(tree).includes('تُغلق جميع طلبات التعارف'));
  assert.equal(button(tree, 'أوافق وأفعّل الالتزام الحصري').props.disabled, true);
  assert.equal(m.calls.length, 0); m.close();
});

test('rewind consequences precede a proposal and ending stays visible behind a separate confirmation', async () => {
  const m = mount({ stage: 1, exclusive: true }); m.render(); await settle(); let tree = m.render();
  assert(button(tree, 'إنهاء التعارف'));
  assert(!text(tree).includes('وتُرفع علامة الحصرية'));
  button(tree, 'اقتراح خطوة إلى الوراء').props.onClick(); tree = m.render();
  assert(text(tree).includes('وتُرفع علامة الحصرية ويصبح استكشاف الآخرين متاحًا'));
  assert.equal(m.calls.length, 0);
  button(tree, 'إرسال اقتراح العودة إلى: التعارف الأول').props.onClick(); await settle();
  assert.deepEqual(m.calls[0], ['rewind', 'match', 1, true]);
  tree = m.render(); button(tree, 'إنهاء التعارف').props.onClick(); tree = m.render();
  assert(button(tree, 'تأكيد إنهاء التعارف'));
  assert(nodes(tree).some(node => node.type?.name === 'RematchChoice'));
  assert(!m.calls.some(call => call[0] === 'act')); m.close();
});
