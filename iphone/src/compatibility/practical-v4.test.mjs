import assert from 'node:assert/strict';
import test from 'node:test';
import { applicableDimensions, comparePreferences, describeFit, dimensions, dimensionsForVersion } from './model.ts';
import { validatedPreferenceEvidence } from './preference-evidence.ts';
import traits from './personality-catalog.json' with { type:'json' };

const complete = items => Object.fromEntries(items.flatMap(q => [[q.id,'A'], [q.partnerId,'A']]));
function member(id, overrides={}) {
  return { id, gender:id === 'a'?'woman':'man', age:32, city:'الرياض', preferredMinAge:18, preferredMaxAge:110,
    surveyAnswers:complete(dimensions), assessmentVersion:'marriage-v4', ...overrides };
}
const a = member('a'), b = member('b');
const change = (p, answers) => ({...p,surveyAnswers:{...p.surveyAnswers,...answers}});

test('v4 keeps shared IDs and never translates the three retired arrangements', () => {
  const old = dimensionsForVersion('marriage-v3');
  const fresh = dimensions.filter(q=>!old.some(prior=>prior.id===q.id)).map(q=>q.id).sort();
  assert.deepEqual(fresh,['conflict_response','money_management','social_boundaries']);
  const legacy = member('b',{assessmentVersion:'marriage-v3',surveyAnswers:complete(old)});
  const mixed = describeFit(a,legacy).fit;
  assert.deepEqual([...mixed.missing].sort(),fresh);
  assert.equal(mixed.percentage,null);
  assert.deepEqual(describeFit(a,{...legacy,surveyAnswers:{...legacy.surveyAnswers,...complete(dimensions)}}).fit.missing,mixed.missing);
  assert.deepEqual(validatedPreferenceEvidence(mixed),mixed.preferenceEvidence);
  const historical = describeFit({...legacy,id:'a',gender:'woman'},legacy).fit;
  assert.equal(historical.version,'marriage-v3');
  assert.equal(historical.percentage,100);
  assert.deepEqual(validatedPreferenceEvidence(historical),historical.preferenceEvidence);
});

test('v4 one bilateral difference counts once, with equal topic weights and explicit boosts', () => {
  assert.equal(describeFit(a,b).fit.percentage,100);
  for (const topic of ['money_management','financial_provision','conflict_response','family_authority','children_plan','social_boundaries']) {
    const peer = change(b,{[topic]:'B',['partner_'+topic]:'B'});
    const ordinary = describeFit(a,peer).fit;
    assert.equal(ordinary.percentage,94,topic);
    assert.deepEqual(validatedPreferenceEvidence(ordinary),ordinary.preferenceEvidence);
    const category = dimensions.find(q=>q.id===topic).category;
    assert.ok(describeFit({...a,priorityCategories:[category]}, {...peer,priorityCategories:[category]}).fit.percentage < 94);
  }
  assert.equal(describeFit(a,change(b,{children_plan:'C',partner_children_plan:'C'})).fit.percentage,100);
  assert.equal(describeFit(a,change(b,{children_plan:'C',partner_children_plan:'C'})).fit.preferenceEvidence.topics[0].status,'conditional');
});

test('the household priority trade-off reproduces the sensitivity example in the match engine', () => {
  const asker = {...a, priorityCategories:['values']};
  function candidate(householdMatches, otherMatches) {
    const available = {household:householdMatches, other:otherMatches};
    const observed = {};
    for (const topic of dimensions) {
      const group = topic.category === 'values' ? 'household' : 'other';
      observed[topic.id] = available[group]-- > 0 ? 'A' : topic.id === 'marriage_timeline' ? 'C' : 'B';
    }
    return change({...b,city:'جدة'},observed);
  }
  // Both candidates meet every expectation in the reverse direction.
  for (const [person, expected] of [[candidate(6,3),15/22], [candidate(3,8),14/22]]) {
    const fit = comparePreferences(asker,person);
    assert.ok(Math.abs(fit.rankValue ** 2 - expected) < 1e-12);
  }
});

test('hard gates are reciprocal; unanswered structured requirements exclude while survey uncertainty remains pending', () => {
  const conflict = change(b,{financial_provision:'B'});
  assert.ok(comparePreferences(a,conflict));
  const hard = {...a,hardRequirements:['financial_provision']};
  assert.equal(comparePreferences(hard,conflict),null);
  assert.equal(comparePreferences(conflict,hard),null);
  assert.ok(comparePreferences(hard, change(conflict,{financial_provision:undefined})));
  assert.equal(comparePreferences(a,{...b,preferredMaxAge:31}),null);
  assert.equal(comparePreferences({...a,preferredMinAge:33},b),null);
  const senior={...a,age:68};
  const old={...b,assessmentVersion:'marriage-v3',preferredMaxAge:65};
  assert.ok(comparePreferences(senior,old));
  assert.ok(comparePreferences(old,senior));
  assert.equal(comparePreferences({...senior,preferredMinAge:55},old),null);
  assert.equal(describeFit(a,b).fit.personality,undefined);
  assert.equal(comparePreferences({...a, partnerCriteria:{height:{mode:'require',min:190}}},{...b,marriageBasics:{heightCm:175}}),null);
  assert.equal(comparePreferences({...a,partnerCriteria:{height:{mode:'require',min:190}}}, b),null);
  assert.ok(comparePreferences({...a,partnerCriteria:{height:{mode:'prefer',min:190}}}, b));
  assert.equal(comparePreferences(a,b).rankValue,comparePreferences(a,{...b,personalityVersion:'personality-v2',personalityAnswers:{}}).rankValue);
});

test('a candidate can be first or last depending on reciprocal partner ranges', () => {
  const profile = (p, high, social) => ({
    ...p, personalityVersion:'personality-v2', personalityAnswers:{
      ...Object.fromEntries(traits.map(q => [q.id, high !== q.reverse ? 'E' : 'A'])),
      ...(social ? {partner_social_energy:social} : {}),
    },
  });
  const outgoing = profile(b,true,'E'), quiet = profile(b,false,'E');
  const base = comparePreferences(a,b);
  for (const [preference,preferred,other] of [['A',quiet,outgoing],['E',outgoing,quiet]]) {
    const seeker = profile(a,true,preference);
    const match = comparePreferences(seeker,preferred), mismatch = comparePreferences(seeker,other);
    assert.equal(match.fit.partnerPersonalityFit,100);
    assert.equal(mismatch.fit.partnerPersonalityFit,0);
    assert.equal(match.rankValue,base.rankValue*1.02);
    assert.equal(mismatch.rankValue,base.rankValue*0.98);
    assert.deepEqual(comparePreferences(preferred,seeker).fit.partnerPersonalityFit,100);
    const {partnerPersonalityFit,...practical} = match.fit;
    assert.deepEqual(practical,base.fit);
  }
  for (const other of [profile(b,true),{...quiet,personalityVersion:'personality-v1'}, {...quiet,personalityAnswers:{partner_social_energy:'A'}}]) {
    assert.deepEqual(comparePreferences(profile(a,true,'A'),other).fit,base.fit);
    assert.equal(comparePreferences(profile(a,true,'A'),other).rankValue,base.rankValue);
  }
  assert.equal(comparePreferences(profile(a,true,'E'),{...outgoing,preferredMaxAge:31}),null);
});

test('parenting skips only for an explicitly child-free household on all three facts', () => {
  const rule={mode:'require',target:'none'};
  const peer={...b,marriageBasics:{childrenCount:0}};
  const cf=change({...a,marriageBasics:{childrenCount:0},partnerCriteria:{children:rule}},{children_plan:'B',parenting_approach:undefined,partner_parenting_approach:undefined});
  const fit=describeFit(cf,peer).fit;
  assert.equal(fit.total,15);
  assert.equal(fit.covered,15);
  assert.ok(fit.assessmentComplete);
  assert.deepEqual(validatedPreferenceEvidence(fit),fit.preferenceEvidence);
  for (const count of [2,undefined]) {
    assert.equal(applicableDimensions('marriage-v4',cf.surveyAnswers,count,rule).length,16);
    assert.equal(describeFit({...cf,marriageBasics:{childrenCount:count}},b).fit.percentage,null);
  }
  for (const children of [undefined, {mode:'any'}, {mode:'prefer',target:'none'}, {mode:'require',target:'any'}]) {
    assert.equal(comparePreferences({...cf,partnerCriteria:{children}},peer).fit.total,16);
  }
  for (const children_plan of ['A','C',undefined]) {
    assert.equal(applicableDimensions('marriage-v4',{children_plan},0,rule).length,16);
  }
  assert.equal(applicableDimensions('marriage-v3',cf.surveyAnswers,0,rule).length,16);
  const stale=change(cf,{parenting_approach:'B',partner_parenting_approach:'B'});
  assert.deepEqual(comparePreferences(stale,peer).fit,fit);
  assert.equal(comparePreferences(stale,{...peer,marriageBasics:{childrenCount:1}}),null);
});
