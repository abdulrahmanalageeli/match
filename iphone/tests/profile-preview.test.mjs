import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let loader, publicProfile;
before(async()=>{
 loader=await createServer({configFile:false,appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false}});
 ({publicProfile}=await loader.ssrLoadModule('/src/profile/publicProfile.ts'));
});
after(()=>loader?.close());
test('Self preview includes public profile fields and excludes private contact, requirements and raw answers',()=>{
 const input={displayName:'رهام',age:31,city:'الرياض',profession:'مصممة',bio:'نبذة عامة',gender:'woman',contact:'private-contact-secret',preferredMinAge:29,preferredMaxAge:42,
  familyPreference:'بعد التعارف الأول',interestIds:['reading'],lookingFor:'وصف الشريك',valuesStatement:'القيم',lifeTogether:'الحياة',education:'التعليم',marriageIntent:'الزواج',
  publicAvatar:{style:'niqab',skinTone:'tone_4'},marriageBasics:{heightCm:166,tribalBackground:'prefer_not_to_say',tribeName:'hidden-tribe',unexpectedPrivate:'private-secret'},
  surveyAnswers:{private:'survey-secret'},personalityAnswers:{private:'personality-secret'},partnerCriteria:{private:'criteria-secret'},hardRequirements:['requirement-secret']};
 input.beena={version:'beena-v1',answers:{support:{self:'A',partner:['B'],importance:2}},story:{scenarioId:'support',text:'private-beena-story',share:false}};
 const p=publicProfile(input,'self');
 assert.equal(p.alias,'رهام');assert.equal(p.age,31);assert.equal(p.lookingFor,input.lookingFor);assert.equal(p.marriageBasics.heightCm,166);assert(p.interests.length);
 assert.equal(p.fit,undefined,'Self preview must not invent compatibility with oneself');
 const json=JSON.stringify(p);
 for(const secret of ['private-contact-secret','hidden-tribe','private-secret','survey-secret','personality-secret','criteria-secret','requirement-secret','private-beena-story'])assert(!json.includes(secret),secret);
 assert.equal(p.beena,undefined);assert.equal(p.beenaStory,undefined);
 assert.equal(p.partnerCriteria,undefined);assert.equal(p.contact,undefined);assert.equal(p.preferredMinAge,undefined);
});

test('Self preview shares only an explicitly opted-in valid scenario story',()=>{
 const profile={displayName:'عضوة',age:28,city:'الرياض',profession:'مصممة',bio:'نبذة',familyPreference:'',
  beena:{version:'beena-v1',answers:{support:{self:'A',partner:['B'],importance:2}},story:{scenarioId:'support',text:'أفضل أن نسأل بعضنا كيف يمكن أن نساند بعضنا.',share:true}}};
 const projected=publicProfile(profile,'self');
 assert.deepEqual(projected.beenaStory,{scenarioId:'support',text:profile.beena.story.text});
 assert.equal(projected.beena,undefined);assert.equal(projected.beenaStory.share,undefined);
 assert.equal(projected.fit,undefined);
 assert.equal(publicProfile({...profile,beena:{...profile.beena,story:{...profile.beena.story,share:false}}},'self').beenaStory,undefined);
 assert.equal(publicProfile({...profile,beena:{...profile.beena,story:{...profile.beena.story,text:'   '}}},'self').beenaStory,undefined);
 assert.equal(publicProfile({...profile,beena:{...profile.beena,story:{...profile.beena.story,privateAnswer:'hidden'}}},'self').beenaStory,undefined);
});

test('Self preview includes explicitly selected marriage timing and meeting preference without inferring them from assessment answers',()=>{
 const profile={displayName:'عضوة',age:28,city:'الرياض',profession:'مصممة',bio:'نبذة',surveyAnswers:{marriage_timeline:'A'}};
 const unset=publicProfile(profile,'self');
 assert.equal(unset.marriageBasics?.marriageTimeline,undefined);
 assert.equal(unset.marriageBasics?.meetingPreference,undefined);
 const selected=publicProfile({...profile,marriageBasics:{marriageTimeline:'within_3_months',meetingPreference:'public_before_formal'}},'self');
 assert.equal(selected.marriageBasics.marriageTimeline,'within_3_months');
 assert.equal(selected.marriageBasics.meetingPreference,'public_before_formal');
 const cleared=publicProfile({...profile,marriageBasics:{}},'self');
 assert.equal(cleared.marriageBasics.marriageTimeline,undefined);
 assert.equal(cleared.marriageBasics.meetingPreference,undefined);
});

test('self preview mirrors separate sensitive publication choice without deleting own data',()=>{
 const profile={displayName:'عضوة',age:28,city:'الرياض',profession:'مصممة',bio:'نبذة',
  marriageBasics:{heightCm:164,skinTone:'tone_3',tribalBackground:'tribal',tribeName:'خاصة',religiousAffiliation:'sunni',prayerPractice:'regular'},
  publicAvatar:{style:'hijab',skinTone:'tone_3'},
  signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:false,assessment:true,photo:false}};
 const hidden=publicProfile(profile,'self');
 assert.equal(hidden.marriageBasics.tribeName,undefined);assert.equal(hidden.marriageBasics.skinTone,undefined);assert.equal(hidden.publicAvatar,null);
 const shown=publicProfile({...profile,signupConsents:{...profile.signupConsents,sensitivePublication:true}},'self');
 assert.equal(shown.marriageBasics.tribeName,'خاصة');assert.deepEqual(shown.publicAvatar,profile.publicAvatar);
 assert.equal(profile.marriageBasics.tribeName,'خاصة');
});
