import * as shared from '../src/compatibility/sharedDecisions.ts';
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
    if (name === './sharedDecisions') return shared;
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

test('current residence is self-only, and manual choices never imply partner answers', () => {
  assert.equal(compatibility.dimensions.flatMap(q=>compatibility.practicalAnswerKeys(q)).length, 31);
  assert.equal(compatibility.dimensions.flatMap(q=>compatibility.practicalAnswerKeys(q,'marriage-v3')).length, 32);
  assert.ok(compatibility.dimensions.every(d => !d.partnerDefault));
});

test('required compatibility groups each prompt with its choices and prevents skipping or clearing', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', { ...emptyCompatibility, required: true, remainingOnly: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'compat-skip').length, 0); assert.equal(byClass(tree, 'compat-next')[0].props.disabled, true);
  const heading = nodes(tree).find(node => node.type === 'h3');
  assert.equal(byClass(tree, 'compat-answer-options')[0].props['aria-labelledby'], heading.props.id);
  byClass(tree, 'compat-choice')[0].props.onClick(); tree = ui.render();
  assert.equal(byClass(tree, 'compat-next')[0].props.disabled, false); assert.equal(byClass(tree, 'compat-skip').length, 0);
  byClass(tree, 'compat-next')[0].props.onClick(); tree = ui.render(); assert.equal(byClass(tree, 'compat-next')[0].props.disabled, true);
  assert.equal(Object.keys(ui.props.surveyAnswers).length, 2);
});

test('manual self answers leave partner choices open', () => {
  const same = mount(compatibilityCode, 'CompatibilityFields', { ...emptyCompatibility, required: true, remainingOnly: true });
  let tree = same.render(); button(tree,'أختار لنفسي ولشريكي بشكل مختلف').props.onClick(); tree=same.render(); byClass(tree, 'compat-choice')[0].props.onClick(); tree = same.render();
  assert.equal(same.props.surveyAnswers.children_plan, 'A');
  assert.equal(same.props.surveyAnswers.partner_children_plan, undefined);
  assert.equal(textOf(byClass(tree, 'compat-next')[0]), 'السؤال التالي');

  const residence = compatibility.dimensions.find(dimension => dimension.id === 'residence_plan');
  const complement = mount(compatibilityCode, 'CompatibilityFields', {
    ...emptyCompatibility, required: true, remainingOnly: true,
    surveyAnswers: { children_plan: 'A', partner_children_plan: 'A' },
  });
  tree = complement.render();
  assert.equal(byClass(tree, 'compat-perspective').length,0);
  byClass(tree, 'compat-choice')[0].props.onClick();
  tree = complement.render();
  byClass(tree, 'compat-next')[0].props.onClick();
  tree = complement.render();
  assert.notEqual(textOf(nodes(tree).find(node=>node.type==='h3')),residence.partnerPrompt);
  assert.equal(complement.props.surveyAnswers[residence.id], 'A');
  assert.equal(complement.props.surveyAnswers[residence.partnerId], undefined);
});

test('every current topic has a deliberate shared or individual treatment', () => {
  const joint=['children_plan','wife_work','marriage_timeline','family_authority','financial_provision','domestic_labor','housing_arrangement','faith_routine','money_management'];
  const individual=['residence_plan','social_rhythm','social_boundaries','conflict_response','repair_after_conflict','closeness_pace','parenting_approach'];
  assert.deepEqual(compatibility.dimensions.map(d=>d.id).sort(),[...joint,...individual].sort());
  for(const dim of compatibility.dimensions){
    const answers=Object.fromEntries(compatibility.dimensions.filter(d=>d.id!==dim.id).flatMap(d=>compatibility.practicalAnswerKeys(d).map(key=>[key,'A'])));
    const ui=mount(compatibilityCode,'CompatibilityFields',{...emptyCompatibility,required:true,remainingOnly:true,surveyAnswers:answers});
    byClass(ui.render(),'compat-choice')[1].props.onClick();
    assert.equal(ui.props.surveyAnswers[dim.id],'B');
    assert.equal(ui.props.surveyAnswers[dim.partnerId],joint.includes(dim.id)?'B':undefined,dim.id);
  }
});
test('changing the shared children decision updates both answers and skips the partner question', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', { ...emptyCompatibility, required: true, remainingOnly: true });
  byClass(ui.render(), 'compat-choice')[0].props.onClick();
  byClass(ui.render(), 'compat-choice')[1].props.onClick();
  assert.equal(ui.props.surveyAnswers.children_plan, 'B');
  assert.equal(ui.props.surveyAnswers.partner_children_plan, 'B');
  byClass(ui.render(), 'compat-next')[0].props.onClick();
  assert.doesNotMatch(textOf(byClass(ui.render(), 'compat-panel')[0]), /الإنجاب/);
});

test('an existing children answer can be endorsed for both or given a different partner answer',()=>{
  for(const split of [false,true]){
    const ui=mount(compatibilityCode,'CompatibilityFields',{...emptyCompatibility,required:true,remainingOnly:true,surveyAnswers:{children_plan:'B'}});
    let tree=ui.render();
    assert.equal(ui.props.surveyAnswers.partner_children_plan,undefined);
    if(split){button(tree,'أختار لنفسي ولشريكي بشكل مختلف').props.onClick();tree=ui.render();byClass(tree,'compat-choice')[0].props.onClick();}
    else button(tree,'أعتمد هذا الترتيب لنا').props.onClick();
    assert.equal(ui.props.surveyAnswers.children_plan,'B');assert.equal(ui.props.surveyAnswers.partner_children_plan,split?'A':'B');
  }
});

test('manual partner choices survive later self edits', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', emptyCompatibility);
  let tree = ui.render(); byClass(tree, 'compat-choice')[0].props.onClick(); tree = ui.render();
  const perspectives = nodes(byClass(tree, 'compat-perspective')[0]).filter(node => node.type === 'button');
  perspectives[1].props.onClick(); tree = ui.render();
  assert.match(textOf(byClass(tree, 'compat-hint')[0]), /اختر ما تتمنى/);
  byClass(tree, 'compat-choice')[1].props.onClick(); tree = ui.render();
  nodes(byClass(tree, 'compat-perspective')[0]).filter(node => node.type === 'button')[0].props.onClick(); tree = ui.render();
  byClass(tree, 'compat-choice')[2].props.onClick(); ui.render();
  assert.equal(ui.props.surveyAnswers.children_plan, 'C');
  assert.equal(ui.props.surveyAnswers.partner_children_plan, 'B');
});

test('optional profile editing retains the ability to clear compatibility answers', () => {
  const ui = mount(compatibilityCode, 'CompatibilityFields', emptyCompatibility);
  let tree = ui.render(); byClass(tree, 'compat-choice')[0].props.onClick(); tree = ui.render();
  button(tree, 'إزالة اختياري').props.onClick(); ui.render(); assert.equal(Object.keys(ui.props.surveyAnswers).length, 0);
});

test('required personality waits for a valid answer and offers no later or clear shortcut', () => {
  const ui = mount(personalityCode, 'PersonalityFields', { answers: {}, registration: true, remainingOnly: true, required: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-later').length, 0); assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, true);
  nodes(tree).find(node => node.type === 'AnswerScale').props.onChange('A'); tree = ui.render();
  assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, false); assert.equal(byClass(tree, 'nf-personality-later').length, 0);
  byClass(tree, 'nf-personality-next')[0].props.onClick(); tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-next')[0].props.disabled, true);
});

test('optional personality editing still allows clearing an answer', () => {
  const ui = mount(personalityCode, 'PersonalityFields', { answers: {} });
  let tree = ui.render(); nodes(tree).find(node => node.type === 'AnswerScale').props.onChange('A'); tree = ui.render();
  button(tree, 'إزالة الاختيار').props.onClick(); ui.render(); assert.equal(Object.keys(ui.props.answers).length, 0);
});

test('invalid saved values do not count as required answers or produce completion', () => {
  const answers = Object.fromEntries(personality.personalityQuestions.map(question => [question.id, question.options[0].code]));
  answers[personality.personalityQuestions[0].id] = 'invalid';
  const ui = mount(personalityCode, 'PersonalityFields', { answers, registration: true, remainingOnly: true, required: true });
  let tree = ui.render(); assert.equal(byClass(tree, 'nf-personality-complete').length, 0); assert.match(textOf(tree), /اختر إجابتك الأخيرة/);
  nodes(tree).find(node => node.type === 'AnswerScale').props.onChange('A'); tree = ui.render();
  assert.equal(byClass(tree, 'nf-personality-complete').length, 1);
});
