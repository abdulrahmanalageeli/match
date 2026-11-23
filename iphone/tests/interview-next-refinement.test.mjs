import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRefinement } from '../src/interview/nextRefinement.mjs';
import prompts from '../src/interview/refinement-prompts.json' with { type: 'json' };

const note = (topic, quote, subject = 'partner') => ({topic, quote, subject, turnId:'intro'});
const height = note('height','أفضل شخصًا طويلًا');
const age = note('age','أفضل عمر قريب من عمري');
const time = note('timeline','ودي نتزوج قريب','intent');
const context = (fieldId, values) => ({fieldId,values,mode:null,exclude:false});
const session = (...statements) => ({
  status:'review', pendingAnalysis:false, confirmed:[], statements,
  turns:[{id:'intro',question:'عرفنا عنك',answer:statements.map(s => s.quote).join('، '),skipped:false}],
});

test('offers one material clarification and lets stated importance take priority', () => {
  const doc = session(time, age, height);
  assert.equal(nextRefinement(doc),height);
  const essential = note('age','أهم شيء يكون العمر قريب من عمري');
  assert.equal(nextRefinement(session(height,essential)),essential);
});
test('uses known profile choices, treats the full default age slider as unset', () => {
  const doc = session(height,age);
  assert.equal(nextRefinement(doc,[context('partnerCriteria.height',['160','178']),context('preferredMaxAge',['110'])]),age);
  assert.equal(nextRefinement(doc,[context('partnerCriteria.height',['160','178']),context('preferredMaxAge',['30'])]),undefined);
});
test('precise decisions and keeping an approximation both survive resume; another refinement requires a deliberate request', () => {
  const doc = session(age,height,time);
  doc.turns.push({id:'refined',question:prompts.height,answer:'أكتفي بالوصف',skipped:false});
  assert.equal(nextRefinement(doc),undefined);
  assert.equal(nextRefinement(doc,[],{},true),age);
});
test('ignores self height, unrelated evidence, flexible preferences and resolved timing', () => {
  const doc = session(note('height','طولي ١٧٥','self'),note('age','العمر ما يفرق معي'),time);
  doc.statements.push(note('height','طويل'));
  assert.equal(nextRefinement(doc,[context('marriageBasics.marriageTimeline',['when_ready'])]),undefined);
});
