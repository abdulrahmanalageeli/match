import assert from 'node:assert/strict';
import test from 'node:test';
import { applicableDimensions, comparePreferences, describeFit, dimensions, dimensionsForVersion } from './model.ts';
import { validatedPreferenceEvidence } from './preference-evidence.ts';

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

test('v4 one bilateral difference counts once, with the specified topic weights and 1.35× priority boosts', () => {
  assert.equal(describeFit(a,b).fit.percentage,100);
  for (const topic of ['money_management','financial_provision','conflict_response','family_authority','children_plan','social_boundaries']) {
    const peer = change(b,{[topic]:'B',['partner_'+topic]:'B'});
    const ordinary = describeFit(a,peer).fit;
    const dimension = dimensions.find(q=>q.id===topic);
    assert.equal(ordinary.percentage,100-dimension.weight,topic);
    assert.deepEqual(validatedPreferenceEvidence(ordinary),ordinary.preferenceEvidence);
    const category = dimension.category;
    const mass = dimensions.filter(q=>q.category===category).reduce((sum,q)=>sum+q.weight,0);
    const boosted = describeFit({...a,priorityCategories:[category]}, {...peer,priorityCategories:[category]}).fit.percentage;
    assert.equal(boosted,Math.round(100 - 100 * 1.35 * dimension.weight / (100 + 0.35 * mass)));
  }
  assert.equal(describeFit(a,change(b,{children_plan:'C',partner_children_plan:'C'})).fit.percentage,100);
  assert.equal(describeFit(a,change(b,{children_plan:'C',partner_children_plan:'C'})).fit.preferenceEvidence.topics[0].status,'conditional');
});

test('coverage uses base-weight mass and moves incomplete rankings toward neutral', () => {
  assert.equal(dimensions.reduce((sum,topic)=>sum+topic.weight,0),100);
  // A 10-point topic is known in both directions. No other topics contribute weight.
  const answers={children_plan:'A',partner_children_plan:'A'};
  const incomplete=describeFit({...a,surveyAnswers:answers},{...b,surveyAnswers:answers});
  assert.ok(Math.abs(incomplete.rankValue - (0.5+Math.sqrt(0.10)*0.5)) < 1e-12);
  assert.equal(incomplete.fit.percentage,null);
  const noEvidence=describeFit({...a,surveyAnswers:{}},{...b,surveyAnswers:{}});
  assert.equal(noEvidence.rankValue,0.5);
});

test('known soft criteria share at most 12 points and satisfied strict criteria add none', () => {
  const basics={heightCm:170,weightKg:65,nationality:'سعودي',maritalStatus:'never_married',
    childrenCount:0,smoking:'never',spokenLanguages:['العربية']};
  const peer={...b,marriageBasics:basics,education:'بكالوريوس'};
  const rules={height:{mode:'prefer',min:190},weight:{mode:'prefer',min:90},nationality:{mode:'prefer',values:['مصري']},
    maritalStatus:{mode:'prefer',values:['divorced']},children:{mode:'prefer',target:'none'},smoking:{mode:'prefer',target:'never'},
    education:{mode:'prefer',values:['بكالوريوس']}};
  const score=comparePreferences({...a,partnerCriteria:rules},peer);
  assert.equal(score.fit.criteria.covered,7);
  assert.ok(Math.abs(score.rankValue ** 2 - (100+12*3/7)/112) < 1e-12);
  const strictOnly=comparePreferences({...a,partnerCriteria:{children:{mode:'require',target:'none'}}},peer);
  assert.equal(strictOnly.fit.criteria.covered,0);
  assert.equal(strictOnly.rankValue,1);
});

test('hard gates are reciprocal; unanswered structured requirements exclude while survey uncertainty remains pending and personality does not affect ranking', () => {
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
  assert.equal(comparePreferences(senior,old),null);
  assert.equal(comparePreferences(old,senior),null);
  assert.equal(comparePreferences({...senior,preferredMinAge:55},old),null);
  assert.equal(describeFit(a,b).fit.personality,undefined);
  assert.equal(comparePreferences({...a, partnerCriteria:{height:{mode:'require',min:190}}},{...b,marriageBasics:{heightCm:175}}),null);
  assert.equal(comparePreferences({...a,partnerCriteria:{height:{mode:'require',min:190}}}, b),null);
  assert.ok(comparePreferences({...a,partnerCriteria:{height:{mode:'prefer',min:190}}}, b));
  assert.equal(comparePreferences(a,b).rankValue,comparePreferences(a,{...b,personalityVersion:'personality-v2',personalityAnswers:{}}).rankValue);
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
