import test from 'node:test';
import assert from 'node:assert/strict';
import { describeFit } from './model.ts';
import { compatibilitySnapshot, compareCompatibility } from './changes.ts';
import { pairAssessmentFixture } from '../testing/pairAssessmentFixture.ts';

const base = { city: 'الرياض', age: 29, preferredMinAge: 22, preferredMaxAge: 40 };
const first = { ...base, id: 'abdulrahman', gender: 'man', ...pairAssessmentFixture.abdulrahman };
const second = { ...base, id: 'reham', gender: 'woman', ...pairAssessmentFixture.reham };
const fitOf = (a = first, b = second) => describeFit(a, b).fit;
const changeAnswers = (person, updates) => ({ ...person, surveyAnswers: { ...person.surveyAnswers, ...updates } });
const compareFits = (before, after) => compareCompatibility(compatibilitySnapshot(before), compatibilitySnapshot(after));

test('a saved child preference change describes the 78 to 70 result without revealing answers or blaming an editor', () => {
  const before = fitOf(), after = fitOf(first, changeAnswers(second, { children_plan: 'B', partner_children_plan: 'B' }));
  const result = compareFits(before, after);
  assert.deepEqual(result.scoreChanges, [{ key: 'preferences', label: 'توافق التفضيلات', before: 78, after: 70 }]);
  assert.deepEqual(result.reasons, ['الأطفال: أظهرت الإجابات احتياجات مختلفة.']);
  assert.deepEqual(compareFits(before, fitOf(changeAnswers(second, { children_plan: 'B', partner_children_plan: 'B' }), first)), result);
  assert(!JSON.stringify(result).includes('surveyAnswers'));
  assert(!result.reasons.join(' ').includes('رهام'));
  const restored = compareFits(after, before);
  assert.equal(restored.scoreChanges[0].after, 78);
  assert.deepEqual(restored.reasons, ['الأطفال: أصبح التوافق متبادلًا.']);
});

test('changed explanations are meaningful even when the overall rounded percentage remains the same', () => {
  const before = fitOf();
  const after = fitOf(first, changeAnswers(second, {
    marriage_timeline: 'B', partner_marriage_timeline: 'B',
    match_disagreement_style: 'A', partner_match_disagreement_style: 'A',
  }));
  assert.equal(after.percentage, before.percentage);
  const result = compareFits(before, after);
  assert.deepEqual(result.scoreChanges, []);
  assert(result.reasons.length > 0);
  assert(result.reasons.some(reason => reason.includes('موعد الخطوة الرسمية')));
});

test('the compact summary explains its displayed score when another section changes only its explanations', () => {
  const nextFirst = structuredClone(first); nextFirst.personalityAnswers.directness = 'A';
  const nextSecond = changeAnswers(second, {
    marriage_timeline: 'B', partner_marriage_timeline: 'B',
    match_disagreement_style: 'A', partner_match_disagreement_style: 'A',
  });
  const result = compareFits(fitOf(), fitOf(nextFirst, nextSecond));
  assert.deepEqual(result.scoreChanges.map(score => score.key), ['personality']);
  assert(result.reasons[0].startsWith('موعد الخطوة الرسمية:'));
  assert(result.summary.startsWith('وضوح الاحتياج:'));
  assert(result.reasons.includes(result.summary));
});

test('preference, personality and Beena changes are summarized independently', () => {
  const next = structuredClone(first);
  next.surveyAnswers.children_plan = 'B'; next.surveyAnswers.partner_children_plan = 'B';
  next.personalityAnswers.directness = 'A';
  next.beena.answers.family_boundaries = { self: 'D', partner: ['D'], importance: 2 };
  const result = compareFits(fitOf(), fitOf(next, second));
  assert.deepEqual(result.scoreChanges.map(score => score.key), ['preferences', 'personality', 'beena']);
  assert(result.reasons.some(reason => reason.startsWith('وضوح الاحتياج:')));
  assert(result.reasons.some(reason => reason.startsWith('نحن والأهل:')));
});

test('personality domain explanations refresh when changes balance out in the overall percentage', () => {
  const next = structuredClone(first);
  next.personalityAnswers.openness = 'C'; next.personalityAnswers.quiet_comfort = 'E';
  const before = fitOf(), after = fitOf(next, second);
  assert.equal(before.personality.percentage, after.personality.percentage);
  assert.deepEqual(before.personality.similarities, after.personality.similarities);
  const result = compareFits(before, after);
  assert.deepEqual(result.scoreChanges, []);
  assert.deepEqual(result.reasons, ['تغيّر تقارب الإجابات في القرب والطمأنينة، الضغط ومساحة الهدوء.']);
});

test('snapshots ignore transport timestamps, object order and outcome array ordering', () => {
  const original = fitOf(), copy = structuredClone(original);
  copy.updatedAt = '2099-01-01'; copy.personality.updatedAt = '2099-01-02';
  copy.strengths.reverse(); copy.discussion.reverse(); copy.preferenceEvidence.topics.reverse(); copy.preferenceEvidence.categories.reverse();
  copy.personality.similarities.reverse(); copy.personality.differences.reverse(); copy.beena.aligned.reverse(); copy.beena.discussion.reverse();
  const reversedKeys = Object.fromEntries(Object.entries(copy).reverse());
  assert.deepEqual(compatibilitySnapshot(original), compatibilitySnapshot(reversedKeys));
  assert.equal(compareFits(original, reversedKeys), null);
  assert.deepEqual(compatibilitySnapshot(original), compatibilitySnapshot(original), 'Reading a snapshot is deterministic');
});

test('initial, unavailable, incomplete or newly completed assessments do not create false change notices', () => {
  const original = fitOf(), snapshot = compatibilitySnapshot(original);
  assert.equal(compatibilitySnapshot(null), null);
  assert.equal(compareCompatibility(null, snapshot), null);
  assert.equal(compareCompatibility(snapshot, null), null);
  const incomplete = structuredClone(original);
  incomplete.assessmentComplete = false; incomplete.personality.complete = false; incomplete.beena.complete = false;
  assert.equal(compatibilitySnapshot(incomplete), null);
  assert.equal(compareFits(original, incomplete), null);
  assert.equal(compareFits(incomplete, original), null);
  const withoutBeena = structuredClone(original); delete withoutBeena.beena;
  assert.equal(compareFits(withoutBeena, original), null, 'First complete Beena is a baseline, not a changed score');
  const invalid = structuredClone(original); invalid.preferenceEvidence.topics.pop(); invalid.personality.distribution.same = 500;
  invalid.beena.aligned.push('unknown');
  assert.equal(compatibilitySnapshot(invalid), null, 'Inconsistent evidence never enters notices');
});
