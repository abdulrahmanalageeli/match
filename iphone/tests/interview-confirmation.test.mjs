import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import compatibility from '../src/compatibility/catalog.json' with { type: 'json' };
import scenarios from '../src/beena/catalog.json' with { type: 'json' };

async function loadModel() {
  const source = await readFile(new URL('../src/interview/model.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(compiled, { context });
  await module.link(name => {
    const value = name.includes('compatibility') ? compatibility : scenarios;
    return new vm.SyntheticModule(['default'], function () { this.setExport('default', value); }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
const model = await loadModel();
const plain = value => JSON.parse(JSON.stringify(value));
const proposal = (changes = {}) => ({ id: 'p1', kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'], summary: 'إجابتي', evidence: [{ turnId: 't1', quote: 'أرغب بالأطفال' }], needsClarification: false, ...changes });

test('confirmation merges only explicit self and desired-partner answers without touching other profile fields', () => {
  const current = { surveyAnswers: { children_plan: 'C', partner_children_plan: 'C', weekly_planning: 'B' }, hardRequirements: ['residence_plan'], personalityAnswers: { p1: 'A' } };
  const updated = plain(model.applyInterviewAnswers(current, [proposal(), proposal({ id: 'p2', side: 'partner', values: ['B'] })]));
  assert.deepEqual(updated, { surveyAnswers: { children_plan: 'A', partner_children_plan: 'B', weekly_planning: 'B' } });
  assert.equal(current.surveyAnswers.children_plan, 'C');
  assert.equal('hardRequirements' in updated, false);
  assert.equal('personalityAnswers' in updated, false);
});

test('invalid fields, incompatible sides, and multi-valued single answers never enter a score', () => {
  const updated = model.applyInterviewAnswers({}, [
    proposal({ fieldId: 'religion', values: ['inferred'] }),
    proposal({ values: ['X'] }),
    proposal({ side: 'importance', values: ['2'] }),
    proposal({ values: ['A', 'B'] }),
    proposal({ kind: 'beena', fieldId: 'conflict', side: 'importance', values: ['9'] }),
  ]);
  assert.deepEqual(plain(updated), {});
});

test('Beena accepts multiple desired approaches and explicit importance while keeping private story and untouched scenarios', () => {
  const current = { beena: { version: 'beena-v1', answers: { finances: { self: 'A', partner: ['B'], importance: 1 } }, story: { scenarioId: 'finances', text: 'هذه قصتي الخاصة', share: false } } };
  const updated = plain(model.applyInterviewAnswers(current, [
    proposal({ kind: 'beena', fieldId: 'conflict', side: 'self', values: ['B'] }),
    proposal({ id: 'p2', kind: 'beena', fieldId: 'conflict', side: 'partner', values: ['A', 'B'] }),
    proposal({ id: 'p3', kind: 'beena', fieldId: 'conflict', side: 'importance', values: ['2'] }),
  ]));
  assert.deepEqual(updated.beena.answers.conflict, { self: 'B', partner: ['A', 'B'], importance: 2 });
  assert.deepEqual(updated.beena.answers.finances, current.beena.answers.finances);
  assert.deepEqual(updated.beena.story, current.beena.story);
  assert.equal(updated.beena.story.share, false);
  assert.equal(current.beena.answers.conflict, undefined);
});

test('choosing no interpretation makes no assessment changes', () => {
  assert.deepEqual(plain(model.applyInterviewAnswers({ surveyAnswers: { children_plan: 'A' } }, [])), {});
});

test('review options describe each existing catalog choice faithfully', () => {
  for (const dimension of compatibility.dimensions) {
    assert.deepEqual(plain(model.proposalOptions(proposal({ fieldId: dimension.id, side: 'partner' }))), dimension.options.map(option => ({ value: option.code, label: option.partner })));
  }
});
