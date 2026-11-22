import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentProgress } from '../src/interview/openingResults.ts';

const fields = ['self','partner','trait','other','empty'].map(id => ({id,options:[{code:'A'},{code:'B'}]}));
const proposal = (id,turnId='opening') => ({id,values:['A'],needsClarification:false,evidence:[{turnId,quote:'fixture'}]});

test('first-message counts use distinct applicable field IDs and the quoted turn, independently of later proposals and automatic defaults', () => {
  const proposals = [proposal('trait'),proposal('self'),proposal('self'),proposal('other','later'),proposal('inapplicable')];
  const effective = {self:['A'],partner:['A'],trait:['A'],other:['A']};
  const result = assessmentProgress(fields,effective,{},proposals,'opening');
  assert.equal(result.openingPending,2);
  assert.equal(result.openingMatched,0);
  assert.deepEqual(result.opening.map(p => p.id),['trait','self']);
  assert.equal(result.remaining,1);
  assert.equal(result.savedCount,0);
});

test('saved matches and manual corrections no longer count as new shortcuts, including after reopening the draft', () => {
  const proposals = [proposal('self'),proposal('partner'),proposal('trait')];
  const saved = {self:['A'],trait:['B']};
  const effective = {partner:['A'],...saved};
  const result = assessmentProgress(fields,effective,saved,proposals,'opening');
  assert.equal(result.openingPending,1);
  assert.equal(result.openingMatched,1);
  assert.deepEqual([...result.pending],['partner']);
  assert.deepEqual(result.opening.map(p=>p.id),['self','partner']);
  assert.equal(result.savedCount,2);
  assert.equal(result.remaining,2);
});

test('zero is explicit when context, ambiguous, unsupported values or suggested partner defaults are the only evidence', () => {
  const proposals = [proposal('self','context:self'),{...proposal('partner'),source:'self_default'},
    {...proposal('trait'),needsClarification:true},{...proposal('other'),values:['unknown']}];
  const result = assessmentProgress(fields,{self:['A'],partner:['A'],trait:['A'],other:['unknown']},{},proposals,'opening');
  assert.equal(result.openingPending,0);
  assert.equal(result.openingMatched,0);
  assert.equal(result.remaining,2);
  assert.deepEqual(result.opening,[]);
});
