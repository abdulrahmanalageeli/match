import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePreferences, describeFit, dimensionsForVersion, rankPreferences } from "./model.ts";
const dimensions = dimensionsForVersion("marriage-v3");
import { validPartnerCriteria, validPartnerCriteriaDraft } from './marriage.ts';

const a = {
  id: "a", gender: "woman", city: "الرياض", age: 29,
  preferredMinAge: 29, preferredMaxAge: 38,
  interestIds: ["travel", "reading"],
  surveyAnswers: {
    social_rhythm: "C",
    partner_social_rhythm: "A",
    match_disagreement_style: "B",
    partner_match_disagreement_style: "B",
  },
};
const b = {
  id: "b", gender: "man", city: "الرياض", age: 35,
  preferredMinAge: 27, preferredMaxAge: 33,
  interestIds: ["reading"],
  surveyAnswers: {
    social_rhythm: "A",
    partner_social_rhythm: "C",
    match_disagreement_style: "B",
    partner_match_disagreement_style: "B",
  },
};

test("age and city preferences preserve adult pairs while basic eligibility is enforced", () => {
  assert.equal(comparePreferences(a, { ...b, preferredMinAge: 30 }) !== null, true);
  assert.equal(comparePreferences(a, { ...b, age: 28 }) !== null, true);
  assert.equal(comparePreferences(a, { ...b, city: "جدة" }) !== null, true);
  assert.equal(comparePreferences(a, { ...b, gender: "woman" }), null);
  assert.equal(comparePreferences(a, { ...b, id: "a" }), null);
  assert.equal(comparePreferences({ ...a, age: 17 }, { ...b, preferredMinAge: 16 }), null);
});

test('city spelling differences never exclude an adult pair', () => {
  assert(comparePreferences(a, { ...b, city: 'Riyadh' }));
  assert(comparePreferences({ ...a, city: 'مكة' }, { ...b, city: 'مكة المكرمة' }));
  assert(comparePreferences({ ...a, city: 'الخبر' }, { ...b, city: 'رياض الخبراء' }));
});

test('other-city buckets preserve candidates for discussion', () => {
  for (const city of ['مدينة أخرى داخل السعودية', 'مدينة أخرى خارج السعودية']) {
    assert(comparePreferences({ ...a, city }, { ...b, city }));
    assert(comparePreferences({ ...a, city, surveyAnswers: { residence_plan: 'A' } }, { ...b, city, surveyAnswers: { residence_plan: 'A' } }));
    assert(comparePreferences({ ...a, city, surveyAnswers: { residence_plan: 'B' } }, { ...b, city, surveyAnswers: { residence_plan: 'A' } }));
  }
});

test('residence compatibility compares the shared city outcome instead of only answer letters', () => {
  const all = Object.fromEntries(dimensions.flatMap(dim => [[dim.id, 'A'], [dim.partnerId, 'A']]));
  const mine = { ...a, assessmentVersion: 'marriage-v3', hardRequirements: ['residence_plan'],
    surveyAnswers: { ...all, residence_plan: 'A', partner_residence_plan: 'B' } };
  const peer = { ...b, city: 'Riyadh', assessmentVersion: 'marriage-v3', hardRequirements: ['residence_plan'],
    surveyAnswers: { ...all, residence_plan: 'A', partner_residence_plan: 'B' } };
  const shared = comparePreferences(mine, peer);
  assert(shared, 'Two people staying in Riyadh meet the same residence goal');
  assert.equal(shared.fit.percentage, 100);
  assert(shared.fit.strengths.includes('residence_plan'));
  assert.equal(shared.fit.preferenceEvidence.topics.find(topic => topic.id === 'residence_plan').status, 'aligned');
  assert.deepEqual(comparePreferences(peer, mine).fit, shared.fit);
  assert(comparePreferences(mine, { ...peer, city: 'جدة' }).fit.percentage < 100);
  for (const city of ['', 'مدينة أخرى داخل السعودية', 'مدينة أخرى خارج السعودية']) {
    assert.equal(comparePreferences({ ...mine, city }, { ...peer, city }).fit.percentage, null);
    assert.equal(describeFit({ ...mine, city }, { ...peer, city }).fit.preferenceEvidence.topics.find(topic => topic.id === 'residence_plan').status, 'different');
  }
  const missing = { ...peer, surveyAnswers: { ...peer.surveyAnswers, residence_plan: undefined } };
  assert(comparePreferences(mine, missing));
  assert.equal(describeFit(mine, missing).fit.preferenceEvidence.topics.find(topic => topic.id === 'residence_plan').status, 'missing');
  assert.equal(describeFit(mine, missing).fit.percentage, null);
});

test('education and profession only affect ranking when explicitly preferred', () => {
  const all = Object.fromEntries(dimensions.flatMap(dim => [[dim.id, 'A'], [dim.partnerId, 'A']]));
  const mine = { ...a, assessmentVersion: 'marriage-v3', surveyAnswers: all };
  const peer = { ...b, assessmentVersion: 'marriage-v3', surveyAnswers: all, education: 'بكالوريوس', profession: 'الهندسة والعمارة' };
  const other = { ...peer, education: 'ماجستير', profession: 'الطب والرعاية الصحية' };
  assert.equal(comparePreferences(mine, peer).fit.percentage, comparePreferences(mine, other).fit.percentage);
  const wants = { ...mine, partnerCriteria: {
    education: { mode: 'prefer', values: ['بكالوريوس'] },
    profession: { mode: 'prefer', values: ['الهندسة والعمارة'] },
  } };
  const match = comparePreferences(wants, peer);
  const different = comparePreferences(wants, other);
  assert(match.fit.percentage > different.fit.percentage);
  assert(match.rankValue > different.rankValue);
  assert.deepEqual(match.fit.criteria, { covered: 2, total: 2 });
  assert.deepEqual(match.fit.personality, different.fit.personality);
  assert.equal(comparePreferences(wants, { ...peer, education: 'بكالوريوس هندسة', profession: 'مهندس' }).fit.percentage, match.fit.percentage);
  const unknown = comparePreferences(wants, { ...peer, education: 'إجابة قديمة غير محددة', profession: undefined });
  assert.equal(unknown.fit.percentage, null);
  assert.deepEqual(unknown.fit.criteria, { covered: 0, total: 2 });
  const indifferent = comparePreferences({ ...mine, partnerCriteria: { education: { mode: 'any' }, profession: { mode: 'any' } } }, other);
  assert.equal(indifferent.fit.percentage, comparePreferences(mine, peer).fit.percentage);
});

test('required education and profession keep the match and distinguish missing facts', () => {
  const mine = { ...a, education: 'بكالوريوس', profession: 'الهندسة والعمارة', partnerCriteria: {
    education: { mode: 'require', values: ['ماجستير', 'دكتوراه'] },
    profession: { mode: 'require', values: ['الطب والرعاية الصحية'] },
  } };
  const peer = { ...b, education: 'ماجستير', profession: 'طبيب' };
  assert(comparePreferences(mine, peer));
  for (const patch of [{ education: 'بكالوريوس' }, { education: undefined }, { education: 'تفصيل قديم' }, { profession: 'التعليم والتدريب' }, { profession: undefined }]) {
    assert(comparePreferences(mine, { ...peer, ...patch }));
  }
  assert(comparePreferences(mine, { ...peer, partnerCriteria: { education: { mode: 'require', values: ['دكتوراه'] } } }).fit.practicalConcerns.includes('required_criterion'));
});

test('new criteria reject unknown choices, duplicates, empty active rules and unsupported shape', () => {
  assert(validPartnerCriteria({ education: { mode: 'prefer', values: ['بكالوريوس', 'ماجستير'] }, profession: { mode: 'require', values: ['الهندسة والعمارة'] } }));
  assert(validPartnerCriteria({ education: { mode: 'any' }, profession: { mode: 'any' } }));
  assert(validPartnerCriteriaDraft({ education: { mode: 'prefer', values: [] } }));
  for (const criterion of [{ mode: 'prefer', values: [] }, { mode: 'require', values: ['جامعي'] }, { mode: 'prefer', values: ['بكالوريوس', 'بكالوريوس'] }, { mode: 'prefer', values: ['بكالوريوس'], exclude: true }]) {
    assert.equal(validPartnerCriteria({ education: criterion }), false);
  }
});

test("directional preferences recognize complementary initiative and common disagreement style", () => {
  const ab = comparePreferences(a, b);
  assert.deepEqual(ab, comparePreferences(b, a));
  assert.equal(ab.reciprocalSignals, 2);
  assert.deepEqual(ab.sharedInterests.map(x => x.id), ["reading"]);
  assert.equal(ab.reasons.length, 3);
  const unilateral = comparePreferences(a, {
    ...b,
    surveyAnswers: { ...b.surveyAnswers, partner_social_rhythm: "B" },
  });
  assert.equal(unilateral.reciprocalSignals, 1);
  assert(!unilateral.reasons.some(reason => reason.includes("بدء الحديث")));
});

test("sparse profiles remain eligible without speculative positive reasons", () => {
  const sparse = comparePreferences({ ...a, surveyAnswers: undefined, interestIds: [] },
    { ...b, surveyAnswers: {}, interestIds: undefined });
  assert.equal(sparse.reciprocalSignals, 0);
  assert.deepEqual(sparse.sharedInterests, []);
  assert.deepEqual(sparse.reasons, ["يمكنكما مناقشة التفضيلات الظاهرة في تفاصيل المقارنة."]);
});

test("bilateral signals precede shared hobbies, stable ties ignore input and display order", () => {
  const sharedOnly = { ...b, id: "c", interestIds: ["reading","travel"], surveyAnswers: {} };
  const tied = { ...sharedOnly, id: "d" };
  const excluded = { ...b, id: "e", preferredMinAge: 32 };
  const candidates = [excluded, tied, b, sharedOnly];
  assert.deepEqual(rankPreferences(a, candidates).map(x => x.person.id), ["b", "e", "c", "d"]);
  assert.deepEqual(rankPreferences(a, candidates.reverse()).map(x => x.person.id), ["b", "e", "c", "d"]);
});

test("a hard preference requires an explicit counterpart answer; a shared city can include a partner who stays", () => {
  const first = { ...a, hardRequirements: ["children_plan"],
    surveyAnswers: { partner_children_plan: "A", residence_plan: "C" } };
  const peer = { ...b, city: "جدة", surveyAnswers: { children_plan: "A", residence_plan: "B" } };
  assert(comparePreferences(first, peer));
  for (const changed of [{ children_plan: "B", residence_plan: "B" }, { residence_plan: "B" },
    { children_plan: "A" }, { children_plan: "A", residence_plan: "?" }]) {
    assert(comparePreferences(first, { ...peer, surveyAnswers: changed }));
  }
  assert(comparePreferences(first, { ...peer, hardRequirements: ["marriage_timeline"] }));
  assert(comparePreferences({ ...first, hardRequirements: [] }, { ...peer, surveyAnswers: { residence_plan: "B" } }));
  const stays = { ...peer, interestIds: [], surveyAnswers: { children_plan: "A", residence_plan: "A" } };
  const canMove = { ...first, interestIds: [] };
  const reason = "يمكنكما مناقشة التفضيلات الظاهرة في تفاصيل المقارنة.";
  assert.deepEqual(comparePreferences(canMove, stays).reasons, [reason]);
  assert.deepEqual(comparePreferences(stays, canMove).reasons, [reason]);
  assert(comparePreferences({...canMove, surveyAnswers:{...canMove.surveyAnswers, residence_plan:"A"}}, stays).fit.practicalConcerns.includes("relocation"));
});

test("fit bands require evidence across categories, and priorities change ranking without inventing a strength", () => {
  const all = Object.fromEntries(dimensions.flatMap(dim => [[dim.id, "A"], [dim.partnerId, "A"]]));
  const mine = { ...a, surveyAnswers: all };
  const peer = { ...b, surveyAnswers: { ...all, financial_provision: "B", domestic_labor: "B", family_authority: "B" } };
  const ordinary = comparePreferences(mine, peer);
  const withPriority = comparePreferences({ ...mine, priorityCategories: ["values"] }, peer);
  assert.equal(ordinary.fit.total, dimensions.length);
  assert.equal(ordinary.fit.covered, dimensions.length);
  assert.equal(ordinary.fit.provisional, false);
  assert.equal(ordinary.fit.band, "mixed");
  assert.deepEqual(ordinary.fit.discussion, ["family_authority", "financial_provision", "domestic_labor"]);
  assert(withPriority.rankValue < ordinary.rankValue);
  assert.deepEqual(Object.keys(ordinary.fit).sort(), ["assessmentComplete","band","beena","covered","criteria","discussion","missing","percentage","personality","practicalConcerns","preferenceEvidence","provisional","strengths","total","version"]);
  assert.equal(ordinary.fit.percentage, null); // No current assessment version was declared.
  assert.equal(ordinary.fit.personality.percentage, null);
  assert.deepEqual(ordinary.fit.criteria, { covered: 0, total: 0 });
  assert.deepEqual(comparePreferences(peer, mine).fit, ordinary.fit);
  const four = Object.fromEntries(dimensions.slice(0, 4).flatMap(dim => [[dim.id, "A"], [dim.partnerId, "A"]]));
  const partial = comparePreferences({ ...a, surveyAnswers: four }, { ...b, surveyAnswers: four });
  assert.equal(partial.fit.covered, 4);
  assert.equal(partial.fit.missing.length, dimensions.length - 4);
  assert.equal(partial.fit.band, "insufficient");
});
