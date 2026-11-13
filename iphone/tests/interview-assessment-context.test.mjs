import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import catalog from '../src/compatibility/catalog.json' with { type: 'json' };
import personality from '../src/compatibility/personality-catalog.json' with { type: 'json' };
const source = await readFile(new URL('../src/interview/assessmentContext.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, require: id => id.endsWith('/model') ? { dimensions: catalog.dimensions } : { personalityQuestions: personality.map(p => ({...p, options: ['A','B','C','D','E'].map(code=>({code}))})) } });
test('existing explicit answers keep self and partner independent and exclude unknown values', () => {
  const result = exports.assessmentContextFromAnswers({ surveyAnswers: { marriage_timeline: 'A', partner_wife_work: 'B', children_plan: 'invalid', arbitrary: 'A' }, personalityAnswers: { initiative: 'D', depth: 'unknown' } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)).sort((a,b)=>a.id.localeCompare(b.id)), [
    {id:'personality:initiative:self',values:['D']}, {id:'preference:marriage_timeline:self',values:['A']}, {id:'preference:wife_work:partner',values:['B']},
  ]);
});
