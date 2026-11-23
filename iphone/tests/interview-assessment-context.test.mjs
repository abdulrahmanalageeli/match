import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentContextFromAnswers, answersFromAssessmentContext } from '../src/interview/assessmentContext.ts';
test('existing explicit answers keep self and partner independent and exclude unknown values', () => {
  const result = assessmentContextFromAnswers({ surveyAnswers: { marriage_timeline: 'A', partner_wife_work: 'B', children_plan: 'invalid', arbitrary: 'A' }, personalityAnswers: { start_conversation: 'D', depth: 'unknown' } });
  assert.deepEqual(JSON.parse(JSON.stringify(result)).sort((a,b)=>a.id.localeCompare(b.id)), [
    {id:'personality:start_conversation:self',values:['D']}, {id:'preference:marriage_timeline:self',values:['A']}, {id:'preference:wife_work:partner',values:['B']},
  ]);
});

test('older local catalogs round trip their own questions and option codes without expanding the interview payload', () => {
  for (const assessmentVersion of ['legacy-v0','marriage-v1','marriage-v2']) {
    const draft = {assessmentVersion, personalityVersion:'personality-v2', surveyAnswers:{
      shared_budget:'A', partner_shared_budget:'B', marriage_timeline:'E', partner_residence_plan:'A',
    }, personalityAnswers:{group_energy:'D',social_energy:'A'}};
    const local = assessmentContextFromAnswers(draft,'manual');
    assert.ok(local.some(item => item.id === 'preference:shared_budget:partner'));
    assert.ok(!assessmentContextFromAnswers(draft).some(item => item.id.includes('shared_budget')));
    const patch = answersFromAssessmentContext(Object.fromEntries(local.map(({id,values})=>[id,values])), draft, 'manual');
    assert.deepEqual(patch.personalityAnswers,{group_energy:'D'});
    assert.equal(patch.surveyAnswers.partner_shared_budget,'B');
    assert.equal(patch.surveyAnswers.partner_residence_plan,'A');
    assert.equal(patch.surveyAnswers.marriage_timeline,assessmentVersion === 'marriage-v2' ? 'E' : undefined);
  }
});
