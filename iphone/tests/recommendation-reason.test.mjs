import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationReason } from '../src/community/recommendationReason.ts';
import { describeFit, dimensions } from '../src/compatibility/model.ts';

const answers = Object.fromEntries(dimensions.flatMap(d => [[d.id, 'A'], [d.partnerId, 'A']]));
const first = {id:'a',gender:'woman',age:29,city:'الرياض',preferredMinAge:18,preferredMaxAge:70,assessmentVersion:'marriage-v2',surveyAnswers:answers};

test('recommendation reason names only validated shared topics without exposing answers',()=>{
  const fit = describeFit(first,{...first,id:'b',gender:'man'}).fit;
  const reason = recommendationReason(fit);
  assert.equal(reason,`من نقاط اتفاقكما: ${dimensions[0].title} و${dimensions[1].title}.`);
  const corrupted = {...fit,preferenceEvidence:{...fit.preferenceEvidence,topics:[]}};
  assert(!recommendationReason(corrupted).includes('من نقاط اتفاقكما'));
  assert(!recommendationReason(corrupted).includes('أعلى'), 'a score alone cannot establish a rank among candidates');
});

test('incomplete assessments do not invent an agreement or a compatibility claim',()=>{
  assert.match(recommendationReason(),/عند اكتمال التقييمين/);
  const fit = describeFit({...first,surveyAnswers:{}},{...first,id:'b',gender:'man'}).fit;
  assert.match(recommendationReason(fit),/عند اكتمال التقييمين/);
});
