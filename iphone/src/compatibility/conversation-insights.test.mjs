import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFit, dimensions } from './model.ts';
import { conversationInsights } from './conversation-insights.ts';

const answers = Object.fromEntries(dimensions.flatMap(dimension => [[dimension.id, 'A'], [dimension.partnerId, 'A']]));
const first = { id: 'a', gender: 'woman', age: 29, city: 'الرياض', preferredMinAge: 18, preferredMaxAge: 70,
  assessmentVersion: 'marriage-v2', surveyAnswers: answers };
const second = { ...first, id: 'b', gender: 'man' };
const fitOf = (a = first, b = second) => describeFit(a, b).fit;
const change = (person, updates) => ({ ...person, surveyAnswers: { ...person.surveyAnswers, ...updates } });

test('each aligned catalogue topic has a tailored practical prompt with stable IDs', () => {
  const fit = fitOf(), before = structuredClone(fit), result = conversationInsights(fit);
  assert.equal(result.source, 'evidenced');
  assert.equal(result.prompts.length, dimensions.length);
  for (const dimension of dimensions) {
    const prompt = result.prompts.find(item => item.id === `aligned:${dimension.id}`);
    assert.equal(prompt.kind, 'aligned');
    assert.equal(prompt.title, dimension.title);
    assert.equal(prompt.context, dimension.reason);
    assert.notEqual(prompt.prompt, dimension.discussion, 'Alignment opens a different practical conversation');
    assert(prompt.prompt.length > 20 && prompt.prompt.length <= 1000);
    assert(prompt.prompt.endsWith('؟'));
  }
  assert.equal(new Set(result.prompts.map(item => item.prompt)).size, dimensions.length);
  assert.deepEqual(conversationInsights(fit), result);
  assert.deepEqual(fit, before, 'Reading prompts never mutates compatibility');
});

test('complementary answers use mutual alignment rather than requiring identical self answers', () => {
  const dimension = dimensions.find(item => item.id === 'conversation_initiative_preference');
  const a = change(first, { [dimension.id]: 'A', [dimension.partnerId]: 'C' });
  const b = change(second, { [dimension.id]: 'C', [dimension.partnerId]: 'A' });
  assert(conversationInsights(fitOf(a, b)).prompts.some(item => item.id === `aligned:${dimension.id}`));
  assert.deepEqual(conversationInsights(fitOf(a, b)), conversationInsights(fitOf(b, a)));
});

test('one-sided and bilateral differences yield neutral topic prompts interleaved after a strength', () => {
  const dimension = dimensions[0];
  const oneSided = conversationInsights(fitOf(first, change(second, { [dimension.id]: 'B' })));
  assert.equal(oneSided.prompts[0].kind, 'aligned');
  assert.equal(oneSided.prompts[1].id, `discussion:${dimension.id}`);
  assert.equal(oneSided.prompts[1].prompt, dimension.discussion);
  assert(oneSided.prompts[1].context.includes('اتجاه واحد'));
  const different = conversationInsights(fitOf(change(first, { [dimension.partnerId]: 'B' }), change(second, { [dimension.partnerId]: 'B' })));
  assert(different.prompts[1].context.includes('تختلف الاحتياجات'));
  assert(!different.prompts.some(item => item.id === `aligned:${dimension.id}`));
});

test('missing answers only yield neutral exploration and never fabricated alignment or conflict', () => {
  const dimension = dimensions[0];
  for (const missing of [undefined, '', 'INVALID']) {
    const result = conversationInsights(fitOf(first, change(second, { [dimension.id]: missing })));
    assert.equal(result.source, 'evidenced');
    const prompt = result.prompts.find(item => item.id.endsWith(`:${dimension.id}`));
    assert.equal(prompt.kind, 'explore');
    assert(prompt.context.includes('لم تكتمل الإجابات'));
  }
  const none = fitOf({ ...first, surveyAnswers: {} }, second);
  assert.equal(conversationInsights(none).source, 'general');
  assert.equal(conversationInsights(none).prompts.length, 2);
  assert(conversationInsights(none).prompts.every(item => item.kind === 'explore'));
});

test('malformed or unavailable evidence falls back to general prompts without trusting raw data', () => {
  const broken = fitOf(); broken.preferenceEvidence.topics[0].status = 'different';
  const unknown = fitOf(); unknown.preferenceEvidence.version = 'invented';
  for (const fit of [undefined, null, {}, [], 'bad', broken, unknown,
    { ...fitOf(), strengths: ['not-in-catalogue'] }, { ...fitOf(), discussion: null }]) {
    const result = conversationInsights(fit);
    assert.equal(result.source, 'general');
    assert.equal(result.prompts.length, 2);
    assert(result.prompts.every(item => item.kind === 'explore' && item.id.startsWith('general:')));
  }
});

test('legacy evidence retains broad outcomes without inventing directional details', () => {
  const dimension = dimensions[0];
  const fit = fitOf(first, change(second, { [dimension.id]: 'B' }));
  delete fit.preferenceEvidence;
  const result = conversationInsights(fit);
  assert.equal(result.source, 'legacy');
  const prompt = result.prompts.find(item => item.kind === 'discussion');
  assert(prompt.context.includes('دون تفاصيل كافية'));
  assert(!prompt.context.includes('اتجاه واحد'));
});

test('prompt output is independent of private answers and metadata, and never includes their values', () => {
  const fit = fitOf(), expected = conversationInsights(fit);
  const privateFields = { surveyAnswers: { children_plan: 'PRIVATE ANSWER' }, partnerCriteria: { religion: 'PRIVATE CRITERION' },
    priorityCategories: ['PRIVATE PRIORITY'], contact: 'PRIVATE CONTACT', alias: 'PRIVATE NAME', story: 'PRIVATE STORY' };
  assert.deepEqual(conversationInsights({ ...fit, ...privateFields }), expected);
  assert(!JSON.stringify(expected).includes('PRIVATE'));
  for (const prompt of expected.prompts) assert.deepEqual(Object.keys(prompt).sort(), ['context', 'id', 'kind', 'prompt', 'title']);
});
