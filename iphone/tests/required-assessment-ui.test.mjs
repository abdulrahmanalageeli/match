import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as compatibility from '../src/compatibility/model.ts';
import * as personality from '../src/compatibility/personality.ts';
import { hasPreferenceAnswer } from '../src/onboarding/remainingAssessments.ts';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const compatibilityCode = compile(await readFile(new URL('../src/compatibility/CompatibilityFields.tsx', import.meta.url), 'utf8'));
const personalityCode = compile(await readFile(new URL('../src/onboarding/MarriageFields.tsx', import.meta.url), 'utf8'));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node?.props?.children ?? '');
const button = (tree, name) => nodes(tree).find(node => node.type === 'button' && textOf(node) === name);
const byClass = (tree, name) => nodes(tree).filter(node => node.props?.className === name);

function mount(code, component, initial) {
  const hooks = [], effects = []; let cursor = 0, changed = false, props;
  props = { ...initial, onChange(value) { props = { ...props, ...(component === 'PersonalityFields' ? { answers: value.personalityAnswers } : value) }; } };
  const react = {
    useId: () => `test-${cursor++}`,
    useRef(value) { return hooks[cursor++] ??= { current: value }; },
    useState(value) { const at = cursor++; if (!(at in hooks)) hooks[at] = typeof value === 'function' ? value() : value; return [hooks[at], next => { const updated = typeof next === 'function' ? next(hooks[at]) : next; if (updated !== hooks[at]) { hooks[at] = updated; changed = true; } }]; },
    useLayoutEffect(fn, deps) { const at = cursor++, old = hooks[at]; if (!old || deps.some((value, i) => value !== old[i])) { hooks[at] = deps; effects.push(fn); } },
  };
  const placeholders = new Proxy({}, { get: (_, key) => key });
  const exports = {}, require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
    if (name === './model' || name === '../compatibility/model') return compatibility;
    if (name === '../compatibility/personality') return personality;
    if (name === '../onboarding/remainingAssessments') return { hasPreferenceAnswer };
    if (name === './draft') return { arabicNumber: value => String(value), latinDigits: value => value };
    if (name === '../profile/profileOptions') return { numericOptions: () => [] };
    return placeholders;
  };
  vm.runInNewContext(code, { exports, require });
  return { render() { let tree, passes = 0; do { changed = false; cursor = 0; tree = exports[component](props); for (const effect of effects.splice(0)) effect(); assert(++passes < 20); } while (changed); return tree; }, get props() { return props; } };
}
const emptyCompatibility = { interestIds: [], surveyAnswers: {}, hardRequirements: [], priorityCategories: [], registration: true };

test('required compatibility groups each prompt with its choices and prevents skipping or clearing', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', { ...emptyCompatibility, required: true, remainingOnly: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'compat-skip').length, 0); assert.equal(byClass(tree, 'compat-next')[0].props.disabled, true);
  const heading = nodes(tree).find(node => node.type === 'h3');
  assert.equal(byClass(tree, 'compat-answer-options')[0].props['aria-labelledby'], heading.props.id);
  byClass(tree, 'compat-choice')[0].props.onClick(); tree = ui.render();
  assert.equal(byClass(tree, 'compat-next')[0].props.disabled, false); assert.equal(byClass(tree, 'compat-skip').length, 0);
  byClass(tree, 'compat-next')[0].props.onClick(); tree = ui.render(); assert.equal(byClass(tree, 'compat-next')[0].props.disabled, true);
  assert.equal(Object.keys(ui.props.surveyAnswers).length, 1);
});

test('optional profile editing retains the ability to clear compatibility answers', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', emptyCompatibility);
  let tree = ui.render(); byClass(tree, 'compat-choice')[0].props.onClick(); tree = ui.render();
  button(tree, 'إزالة اختياري').props.onClick(); ui.render(); assert.equal(Object.keys(ui.props.surveyAnswers).length, 0);
});

test('required personality waits for a valid answer and offers no later or clear shortcut', () => {
  const ui = mount(personalityCode, 'PersonalityFields', { answers: {}, registration: true, remainingOnly: true, required: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-later').length, 0); assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, true);
  const choices = byClass(tree, 'nf-personality-options')[0]; nodes(choices).find(node => node.type === 'button').props.onClick(); tree = ui.render();
  assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, false); assert.equal(byClass(tree, 'nf-personality-later').length, 0);
  byClass(tree, 'nf-personality-next')[0].props.onClick(); tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, true);
});

test('optional personality editing still allows clearing an answer', () => {
  const ui = mount(personalityCode, 'PersonalityFields', { answers: {} });
  let tree = ui.render(); nodes(byClass(tree, 'nf-personality-options')[0]).find(node => node.type === 'button').props.onClick(); tree = ui.render();
  button(tree, 'إزالة الاختيار').props.onClick(); ui.render(); assert.equal(Object.keys(ui.props.answers).length, 0);
});

test('invalid saved values do not count as required answers or produce completion', () => {
  const answers = Object.fromEntries(personality.personalityQuestions.map(question => [question.id, question.options[0].code]));
  answers[personality.personalityQuestions[0].id] = 'invalid';
  const ui = mount(personalityCode, 'PersonalityFields', { answers, registration: true, remainingOnly: true, required: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-complete').length, 0); assert.match(textOf(tree), /اختر إجابتك الأخيرة/);
  nodes(byClass(tree, 'nf-personality-options')[0]).find(node => node.type === 'button').props.onClick(); tree = ui.render();
  assert.equal(byClass(tree, 'nf-personality-complete').length, 1);
});
