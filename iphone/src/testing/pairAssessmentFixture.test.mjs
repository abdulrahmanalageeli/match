import test from 'node:test';
import assert from 'node:assert/strict';
import { pairAssessmentFixture } from './pairAssessmentFixture.ts';
import { describeFit, dimensions } from '../compatibility/model.ts';
import personalityCatalog from '../compatibility/personality-catalog.json' with { type: 'json' };
import { beenaProgress, validBeenaProfile } from '../beena/model.ts';
import { conversationInsights } from '../compatibility/conversation-insights.ts';

test('paired tester fixtures complete every assessment with known choices and no identity or consent writes', () => {
  for (const fixture of Object.values(pairAssessmentFixture)) {
    assert.deepEqual(Object.keys(fixture).sort(), ['assessmentVersion', 'beena', 'personalityAnswers', 'personalityVersion', 'priorityCategories', 'surveyAnswers'].sort());
    assert.equal(fixture.assessmentVersion, 'marriage-v2');
    assert.equal(Object.keys(fixture.surveyAnswers).length, dimensions.length * 2);
    for (const dimension of dimensions) for (const key of [dimension.id, dimension.partnerId]) {
      assert(dimension.options.some(option => option.code === fixture.surveyAnswers[key]), key);
    }
    assert.equal(fixture.personalityVersion, 'personality-v1');
    assert.equal(Object.keys(fixture.personalityAnswers).length, personalityCatalog.length);
    for (const question of personalityCatalog) assert.match(fixture.personalityAnswers[question.id], /^[A-E]$/);
    assert(validBeenaProfile(fixture.beena));
    assert.equal(beenaProgress(fixture.beena).complete, true);
    assert.equal(fixture.beena.story, undefined, 'No invented shared story or publishing consent');
  }
});

test('paired testers exercise mutual strengths, one-sided needs and differences with complete scores and personalized starters', () => {
  const base = { city: 'الرياض', age: 29, preferredMinAge: 22, preferredMaxAge: 40 };
  const first = { ...base, id: 'abdulrahman', gender: 'man', ...pairAssessmentFixture.abdulrahman };
  const second = { ...base, id: 'reham', gender: 'woman', ...pairAssessmentFixture.reham };
  const { fit } = describeFit(first, second);
  assert.equal(fit.covered, 16);
  assert.deepEqual(fit.missing, []);
  assert.equal(fit.percentage, 78);
  assert.equal(fit.personality.percentage, 69);
  assert.equal(fit.beena.percentage, 74);
  assert.equal(fit.strengths.length, 11);
  assert.equal(fit.discussion.length, 5);
  const statuses = fit.preferenceEvidence.topics.map(item => item.status);
  assert.equal(statuses.filter(status => status === 'one_sided').length, 4);
  assert.equal(statuses.filter(status => status === 'different').length, 1);
  assert(fit.strengths.includes('conversation_initiative_preference'), 'Complementary initiative counts as mutual alignment');
  const insights = conversationInsights(fit);
  assert.equal(insights.source, 'evidenced');
  assert.equal(insights.prompts[0].kind, 'aligned');
  assert.equal(insights.prompts[1].kind, 'discussion');
  assert.equal(insights.prompts.some(item => item.kind === 'explore'), false);
  assert.equal(describeFit(second, first).fit.percentage, fit.percentage);
});
