import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../app/lib/event3-social-votes.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { greenRedDependsPrompts, unwrittenRulesPrompts, getSocialVotePrompts, summarizeSocialVotes } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('both activities offer exactly 30 complete, unique prompts', () => {
  for (const bank of [greenRedDependsPrompts, unwrittenRulesPrompts]) {
    assert.equal(bank.length, 30);
    assert.equal(new Set(bank.map(prompt => prompt[0])).size, 30);
    assert.equal(new Set(bank.map(prompt => prompt[1])).size, 30);
    assert.ok(bank.every(prompt => prompt.length === 3 && prompt.every(value => value.trim().length > 0)));
  }
});

test('successive event rounds open on fresh prompts without losing any content', () => {
  for (const activityId of ['green-red-depends', 'unwritten-rules']) {
    const rounds = [1, 2, 3].map(round => getSocialVotePrompts(activityId, round));
    assert.equal(new Set(rounds.map(bank => bank[0][0])).size, 3);
    for (const bank of rounds) assert.deepEqual(bank.map(prompt => prompt[0]).sort(), rounds[0].map(prompt => prompt[0]).sort());
    assert.deepEqual(getSocialVotePrompts(activityId, 4), rounds[0]);
  }
});

test('revealed vote counts include each choice and exclude skipped participants', () => {
  assert.deepEqual(summarizeSocialVotes(['أخضر', null, 'يعتمد', 'أخضر'], ['أخضر', 'أحمر', 'يعتمد']), [
    { choice: 'أخضر', count: 2 }, { choice: 'أحمر', count: 0 }, { choice: 'يعتمد', count: 1 },
  ]);
  assert.deepEqual(summarizeSocialVotes([null, null], ['أتفق', 'أختلف']), [{ choice: 'أتفق', count: 0 }, { choice: 'أختلف', count: 0 }]);
});
