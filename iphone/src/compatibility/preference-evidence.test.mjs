import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFit, dimensions } from './model.ts';
import { readPreferenceEvidence, validatedPreferenceEvidence } from './preference-evidence.ts';

const answers = Object.fromEntries(dimensions.flatMap(dimension => [[dimension.id, 'A'], [dimension.partnerId, 'A']]));
const first = { id: 'a', gender: 'woman', age: 29, city: 'الرياض', preferredMinAge: 18, preferredMaxAge: 70,
  assessmentVersion: 'marriage-v2', surveyAnswers: answers };
const second = { ...first, id: 'b', gender: 'man' };
const fitOf = (a = first, b = second) => describeFit(a, b).fit;
const withAnswers = (person, updates) => ({ ...person, surveyAnswers: { ...person.surveyAnswers, ...updates } });
const topic = (fit, id) => fit.preferenceEvidence.topics.find(item => item.id === id);

test('complete reciprocal comparisons produce a validated, answer-free explanation', () => {
  const fit = fitOf();
  assert.equal(fit.percentage, 100);
  assert.equal(readPreferenceEvidence(fit).source, 'evidenced');
  assert.deepEqual(validatedPreferenceEvidence(fit), fit.preferenceEvidence);
  assert.equal(fit.preferenceEvidence.topics.length, dimensions.length);
  assert(fit.preferenceEvidence.topics.every(item => item.status === 'aligned'));
  assert(fit.preferenceEvidence.categories.every(item => item.covered === item.total && item.aligned === item.total && item.discussion === 0));
  assert.deepEqual(fit.preferenceEvidence.criteria, { matched: 0, different: 0, missing: 0, total: 0 });
  assert.deepEqual(Object.keys(fit.preferenceEvidence).sort(), ['categories', 'criteria', 'method', 'topics', 'version']);
  assert(fit.preferenceEvidence.topics.every(item => Object.keys(item).sort().join() === 'id,status'));
});

test('complementary answers count as agreement only when both expectations fit', () => {
  const dimension = dimensions.find(item => item.id === 'conversation_initiative_preference');
  const a = withAnswers(first, { [dimension.id]: 'A', [dimension.partnerId]: 'C' });
  const b = withAnswers(second, { [dimension.id]: 'C', [dimension.partnerId]: 'A' });
  const fit = fitOf(a, b);
  assert.equal(topic(fit, dimension.id).status, 'aligned');
  assert.equal(fit.percentage, 100);
  assert.deepEqual(fit.preferenceEvidence, fitOf(b, a).preferenceEvidence);
});

test('one-sided and different outcomes are bilateral without revealing which person wanted what', () => {
  const dimension = dimensions[0];
  const oneSided = fitOf(first, withAnswers(second, { [dimension.id]: 'B' }));
  assert.equal(topic(oneSided, dimension.id).status, 'one_sided');
  assert(oneSided.discussion.includes(dimension.id));
  assert.deepEqual(oneSided.preferenceEvidence, fitOf(withAnswers(second, { [dimension.id]: 'B' }), first).preferenceEvidence);
  const a = withAnswers(first, { [dimension.partnerId]: 'B' });
  const b = withAnswers(second, { [dimension.partnerId]: 'B' });
  const different = fitOf(a, b);
  assert.equal(topic(different, dimension.id).status, 'different');
  assert(different.discussion.includes(dimension.id));
  assert.equal(readPreferenceEvidence(different).source, 'evidenced');
});

test('any missing or invalid self/partner answer prevents an agreement or disagreement claim', () => {
  const dimension = dimensions[0];
  for (const personIndex of [0, 1]) for (const key of [dimension.id, dimension.partnerId]) for (const value of [undefined, '', 'unexpected']) {
    const pair = [first, second];
    pair[personIndex] = withAnswers(pair[personIndex], { [key]: value });
    const fit = fitOf(...pair);
    assert.equal(topic(fit, dimension.id).status, 'missing');
    assert.equal(fit.covered, dimensions.length - 1);
    assert(!fit.discussion.includes(dimension.id));
    assert(!fit.strengths.includes(dimension.id));
    assert.equal(fit.percentage, null);
    assert.equal(readPreferenceEvidence(fit).source, 'evidenced');
  }
});

test('criteria evidence aggregates both directions, keeps unknowns separate and omits non-scoring requirements', () => {
  const a = { ...first, marriageBasics: { heightCm: 160, nationality: 'سعودي' }, partnerCriteria: {
    education: { mode: 'prefer', values: ['بكالوريوس'] },
    profession: { mode: 'prefer', values: ['الهندسة والعمارة'] },
    height: { mode: 'any' }, children: { mode: 'prefer', target: 'any' },
    nationality: { mode: 'require', values: ['سعودي'] },
  } };
  const b = { ...second, education: 'بكالوريوس', marriageBasics: { nationality: 'سعودي' }, partnerCriteria: {
    height: { mode: 'prefer', min: 170 }, nationality: { mode: 'prefer', values: ['سعودي'] },
  } };
  const fit = fitOf(a, b);
  assert.deepEqual(fit.preferenceEvidence.criteria, { matched: 2, different: 1, missing: 1, total: 4 });
  assert.deepEqual(fit.criteria, { covered: 3, total: 4 });
  assert.equal(fit.percentage, 95); // sqrt((80% + 20%) * (80% + 10%))
  assert.equal(readPreferenceEvidence(fit).source, 'evidenced');
  assert.deepEqual(fit.preferenceEvidence, fitOf(b, a).preferenceEvidence);
  assert(!JSON.stringify(fit.preferenceEvidence).includes('بكالوريوس'));
  assert(!JSON.stringify(fit.preferenceEvidence).includes('170'));
});

test('topic counts stay separate from category/priority-weighted percentages', () => {
  const valueChanges = Object.fromEntries(dimensions.filter(item => item.category === 'values').map(item => [item.id, 'B']));
  const peer = withAnswers(second, valueChanges);
  const ordinary = fitOf(first, peer);
  const prioritized = fitOf({ ...first, priorityCategories: ['values'] }, peer);
  assert.equal(ordinary.percentage, 87); // sqrt(75% * 100%)
  assert.equal(prioritized.percentage, 77); // doubled 25-point category: sqrt(60% * 100%)
  assert.deepEqual(ordinary.preferenceEvidence, prioritized.preferenceEvidence);
  assert.notEqual(Math.round(100 * ordinary.strengths.length / ordinary.total), ordinary.percentage);
  assert(ordinary.preferenceEvidence.categories.every(category => !Object.hasOwn(category, 'percentage')));
});

test('inconsistent or unsupported evidence fails closed instead of falling back to verified legacy claims', () => {
  const mutations = [
    fit => { fit.preferenceEvidence.version = 'unknown'; },
    fit => { fit.preferenceEvidence.method = 'unknown'; },
    fit => { fit.preferenceEvidence.topics[0].status = 'one_sided'; },
    fit => { fit.preferenceEvidence.topics[0].status = 'invented'; },
    fit => { fit.preferenceEvidence.topics[0].id = 'unknown_topic'; },
    fit => { fit.preferenceEvidence.topics[0] = fit.preferenceEvidence.topics[1]; },
    fit => { fit.preferenceEvidence.topics[0].selfAnswer = 'A'; },
    fit => { fit.preferenceEvidence.categories[0].covered--; },
    fit => { fit.preferenceEvidence.categories[0] = fit.preferenceEvidence.categories[1]; },
    fit => { fit.preferenceEvidence.criteria.total = 1; },
    fit => { fit.preferenceEvidence.criteria = { matched: 0, different: 0, missing: 1, total: 1 }; },
    fit => { fit.criteria.covered = -1; },
    fit => { fit.strengths[0] = fit.strengths[1]; },
    fit => { fit.covered--; },
    fit => { fit.preferenceEvidence = null; },
  ];
  for (const mutate of mutations) {
    const fit = structuredClone(fitOf());
    mutate(fit);
    assert.equal(validatedPreferenceEvidence(fit), null);
    assert.deepEqual(readPreferenceEvidence(fit), { source: 'unavailable', topics: [], categories: [], criteria: null });
  }
});

test('legacy fits retain only trustworthy broad outcomes, with no invented reciprocal details', () => {
  const dimension = dimensions[0];
  const legacy = fitOf(first, withAnswers(second, { [dimension.id]: 'B' }));
  delete legacy.preferenceEvidence;
  const readout = readPreferenceEvidence(legacy);
  assert.equal(readout.source, 'legacy');
  assert.equal(readout.topics.find(item => item.id === dimension.id).status, 'discussion');
  assert.equal(readout.criteria, null);
  const oldCatalog = { ...legacy, version: 'marriage-v1', total: 1, covered: 1, strengths: [], discussion: [dimension.id], missing: [] };
  assert.equal(readPreferenceEvidence(oldCatalog).source, 'legacy');
  assert.equal(readPreferenceEvidence({ ...oldCatalog, covered: 0 }).source, 'unavailable');
  assert.equal(readPreferenceEvidence({ ...oldCatalog, discussion: ['unknown_topic'] }).source, 'unavailable');
});
