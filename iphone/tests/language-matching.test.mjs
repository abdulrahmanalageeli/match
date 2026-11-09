import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePreferences, describeFit } from '../src/compatibility/model.ts';
import { validPartnerCriteria } from '../src/compatibility/marriage.ts';

const person = (id, gender, languages, mode='any') => ({id,gender,age:30,preferredMinAge:18,preferredMaxAge:60,city:'الرياض',assessmentVersion:"marriage-v2",interestIds:[],surveyAnswers:{},hardRequirements:[],priorityCategories:[],marriageBasics:{spokenLanguages:languages},partnerCriteria:{sharedLanguage:{mode}}});
test('shared language must is reciprocal and rejects unknown or non-shared languages',()=>{
 const a=person('a','man',['العربية'],'require');
 const b=person('b','woman',['العربية','الإنجليزية']);
 assert.ok(comparePreferences(a,b));
 for(const languages of [[],['الإنجليزية']]) {
  const other=person('b','woman',languages);
  assert.equal(comparePreferences(a,other),null);
  assert.equal(comparePreferences(other,a),null);
 }
});
test('preferred languages count as positive or negative evidence without exclusion',()=>{
 const a=person('a','man',['العربية'],'prefer');
 const match=person('b','woman',['العربية']);
 const different=person('b','woman',['الإنجليزية']);
 assert.ok(comparePreferences(a,different));
 assert.equal(describeFit(a,match).fit.preferenceEvidence.criteria.matched,1);
 assert.equal(describeFit(a,different).fit.preferenceEvidence.criteria.different,1);
 assert.equal(describeFit(a,person('b','woman',[])).fit.preferenceEvidence.criteria.missing,1);
});
test('language preference requires own spoken languages and a valid mode',()=>{
 assert.equal(validPartnerCriteria({sharedLanguage:{mode:'require'}},{}),false);
 assert.equal(validPartnerCriteria({sharedLanguage:{mode:'prefer'}},{spokenLanguages:['العربية']}),true);
 assert.equal(validPartnerCriteria({sharedLanguage:{mode:'any'}}),true);
 assert.equal(validPartnerCriteria({sharedLanguage:{mode:'invalid'}}),false);
});



