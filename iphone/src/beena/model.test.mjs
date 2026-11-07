import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beenaScenarios, beenaVersion, validBeenaProfile, beenaProgress, compareBeena, beenaRankMultiplier } from './model.ts';
import { describeFit, comparePreferences, dimensions, rankPreferences } from '../compatibility/model.ts';

const complete = (self = 'A', partner = ['B']) => ({ version: beenaVersion,
  answers: Object.fromEntries(beenaScenarios.map(s => [s.id, { self, partner, importance: 1 }])) });
const first = complete('A', ['B']), second = complete('B', ['A']);

test('different but mutually welcomed approaches score fully and are symmetric', () => {
  const fit = compareBeena(first, second);
  assert.equal(fit.complete, true);
  assert.equal(fit.percentage, 100);
  assert.deepEqual(fit.aligned, beenaScenarios.map(s => s.id));
  assert.deepEqual(fit.discussion, []);
  assert.deepEqual(fit, compareBeena(second, first));
  assert.equal(beenaRankMultiplier(fit), 1.05);
  assert.equal(compareBeena(first, first).percentage, 0); // Being identical is not automatic compatibility.
});

test('one-sided acceptance remains a discussion and both directions get equal influence', () => {
  const unilateral = compareBeena(first, complete('B', ['C']));
  assert.equal(unilateral.percentage, 50);
  assert.deepEqual(unilateral.aligned, []);
  assert.equal(unilateral.discussion.length, 6);
  assert.equal(beenaRankMultiplier(unilateral), 1);
  assert(unilateral.prompts.every(p => p.kind === 'discussion' && p.prompt.length > 10));
});

test('multiple acceptable responses are inclusive and importance weights only its owner direction', () => {
  const a = complete('A', ['B', 'C']);
  const b = complete('C', ['A']);
  b.answers.finances.self = 'D';
  a.answers.finances.importance = 2;
  const fit = compareBeena(a, b);
  assert.equal(fit.percentage, Math.round(50 * (5 / 7 + 1)));
  assert.deepEqual(fit.discussion, ['finances']);
  assert.deepEqual(fit, compareBeena(b, a));
});

test('partial work shows coverage and useful prompts without a percentage or ranking nudge', () => {
  const partial = { version: beenaVersion, answers: { conflict: first.answers.conflict, support: { self: 'A' } } };
  assert(validBeenaProfile(partial));
  assert.deepEqual(beenaProgress(partial), { answered: 1, total: 6, complete: false });
  const fit = compareBeena(partial, second);
  assert.equal(fit.covered, 1);
  assert.equal(fit.complete, false);
  assert.equal(fit.percentage, null);
  assert.deepEqual(fit.aligned, ['conflict']);
  assert.equal(fit.prompts.length, 1);
  assert.equal(beenaRankMultiplier(fit), 1);
  assert.equal(compareBeena(undefined, second).percentage, null);
  assert.equal(compareBeena({ ...first, version: 'future-version' }, second).covered, 0);
});

test('strict catalog validation rejects tampering while preserving partial drafts', () => {
  for (const bad of [null, [], {}, { ...first, unknown: true }, { ...first, answers: [] },
    { ...first, answers: { unknown: { self: 'A' } } },
    { ...first, answers: { support: { self: 'E' } } },
    { ...first, answers: { support: { partner: ['A', 'A'] } } },
    { ...first, answers: { support: { partner: ['E'] } } },
    { ...first, answers: { support: { partner: 'A' } } },
    { ...first, answers: { support: { importance: 3 } } },
    { ...first, answers: { support: { importance: '2' } } },
    { ...first, answers: { support: { inventedScore: 100 } } },
    { ...first, story: { scenarioId: 'unknown', text: '', share: false } },
    { ...first, story: { scenarioId: 'support', text: '', share: 'true' } }]) assert.equal(validBeenaProfile(bad), false);
  assert(validBeenaProfile({ version: beenaVersion, answers: { support: { partner: [], importance: 2 }, finances: {} } }));
  assert.equal(beenaRankMultiplier({ version: beenaVersion, complete: true, covered: 6, total: 6, percentage: 1000 }), 1);
});

test('stories use a Unicode codepoint limit and cannot change matching or appear in its output', () => {
  const story = { scenarioId: 'family_boundaries', text: '🌿'.repeat(500), share: false };
  assert(validBeenaProfile({ ...first, story }));
  assert.equal(validBeenaProfile({ ...first, story: { ...story, text: story.text + 'a' } }), false);
  assert.deepEqual(compareBeena({ ...first, story }, second), compareBeena(first, second));
  assert.deepEqual(compareBeena({ ...first, story: { ...story, share: true } }, second), compareBeena(first, second));
  assert.equal(JSON.stringify(compareBeena({ ...first, story }, second)).includes('🌿'), false);
});

test('Beena nudges ordering only when complete without changing existing percentages or eligibility', () => {
  const surveyAnswers = Object.fromEntries(dimensions.flatMap(d => [[d.id, 'A'], [d.partnerId, 'A']]));
  const a = { id: 'a', gender: 'woman', age: 29, city: 'الرياض', preferredMinAge: 25, preferredMaxAge: 40,
    assessmentVersion: 'marriage-v2', surveyAnswers, beena: first };
  const b = { ...a, id: 'b', gender: 'man', beena: second };
  const legacy = describeFit({ ...a, beena: undefined }, { ...b, beena: undefined });
  const fit = describeFit(a, b);
  assert.equal(fit.fit.percentage, legacy.fit.percentage);
  assert.equal(fit.rankValue, legacy.rankValue * 1.05);
  assert.equal(describeFit({ ...a, beena: undefined }, b).rankValue, legacy.rankValue);
  const incompatible = { ...b, id: 'z', beena: complete('C', ['D']) };
  assert.deepEqual(rankPreferences(a, [incompatible, { ...b, beena: undefined, id: 'm' }, b]).map(x => x.person.id), ['b', 'm', 'z']);
  assert.equal(comparePreferences(a, { ...b, preferredMinAge: 30 }), null);
  assert.equal(comparePreferences(a, { ...b, gender: 'woman' }), null);
});
