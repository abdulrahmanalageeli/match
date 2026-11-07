import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, validMarriageBasics, validMarriageBasicsDraft, validPartnerCriteria, comparePreferences, skinTones;
before(async () => {
  loader = await createServer({configFile:false,appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
  ({validMarriageBasics,validMarriageBasicsDraft,validPartnerCriteria}=await loader.ssrLoadModule('/src/compatibility/marriage.ts'));
  ({comparePreferences}=await loader.ssrLoadModule('/src/compatibility/model.ts'));
  ({skinTones}=await loader.ssrLoadModule('/src/compatibility/appearance.ts'));
});
after(()=>loader?.close());

test('current marriage requires an explicit current wife count, distinct from future stance',()=>{
  assert.equal(validMarriageBasics({maritalStatus:'married'}),false);
  assert.equal(validMarriageBasicsDraft({maritalStatus:'married'}),true);
  assert.equal(validMarriageBasics({maritalStatus:'married',currentWives:2,polygynyPreference:'not_open'}),true);
  for(const currentWives of [0,5,1.5,'2'])assert.equal(validMarriageBasics({maritalStatus:'married',currentWives}),false);
  assert.equal(validMarriageBasics({maritalStatus:'divorced',currentWives:1}),false);
});
test('optional religious declarations validate only declared values',()=>{
  assert.equal(validMarriageBasics({}),true);
  assert.equal(validMarriageBasics({religiousAffiliation:'sunni',prayerPractice:'regular'}),true);
  assert.equal(validMarriageBasics({religiousAffiliation:'prefer_not_to_say',prayerPractice:'prefer_not_to_say'}),true);
  assert.equal(validMarriageBasics({religiousAffiliation:'guessed'}),false);
  assert.equal(validMarriageBasics({prayerPractice:'ranked_good'}),false);
});
test('existing marital-status requirement can explicitly exclude currently married candidates',()=>{
  assert.equal(validPartnerCriteria({maritalStatus:{mode:'require',values:['never_married','divorced','widowed']}}),true);
  assert.equal(validPartnerCriteria({maritalStatus:{mode:'prefer',values:['married']}}),true);
  const a={id:'a',gender:'woman',age:30,city:'الرياض',preferredMinAge:25,preferredMaxAge:40,partnerCriteria:{maritalStatus:{mode:'require',values:['never_married','divorced','widowed']}}};
  const b={id:'b',gender:'man',age:33,city:'الرياض',preferredMinAge:25,preferredMaxAge:40,marriageBasics:{maritalStatus:'married',currentWives:1}};
  assert.equal(comparePreferences(a,b),null);
});
test('religious identity and prayer practice do not become inferred compatibility scores',()=>{
  const a={id:'a',gender:'woman',age:30,city:'الرياض',preferredMinAge:25,preferredMaxAge:40};
  const b={id:'b',gender:'man',age:33,city:'الرياض',preferredMinAge:25,preferredMaxAge:40};
  assert.deepEqual(comparePreferences({...a,marriageBasics:{religiousAffiliation:'sunni',prayerPractice:'regular'}},{...b,marriageBasics:{religiousAffiliation:'shia',prayerPractice:'working_on_consistency'}}),comparePreferences(a,b));
});
test('skin shades retain stable IDs and have descriptive names',()=>{
  assert.deepEqual(skinTones.map(t=>t.value),Array.from({length:8},(_,i)=>`tone_${i+1}`));
  assert(skinTones.every(t=>t.label&&!t.label.startsWith('درجة')));
});
