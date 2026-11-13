import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../src/legal/consent.ts',import.meta.url),'utf8');
const notice=await readFile(new URL('../src/legal/LegalNotice.tsx',import.meta.url),'utf8');
const version=notice.match(/export const LEGAL_NOTICE_VERSION\s*=\s*'([^']+)'/)[1];
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 .replace(/import\s*\{\s*LEGAL_NOTICE_VERSION\s*\}\s*from\s*['"]\.\/LegalNotice['"];?/,`const LEGAL_NOTICE_VERSION=${JSON.stringify(version)};`);
const{recordedAccountAgreements,emptyConsents,withoutSensitive,withoutAssessment,applyConsentChoices,publicSensitiveFields}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function sample(){return{displayName:'مثال',age:29,gender:'woman',city:'الرياض',profession:'مهندسة',bio:'نبذة عامة',contact:'private@example.test',
 preferredMinAge:25,preferredMaxAge:40,familyPreference:'بعد الاتفاق',portrait:{id:'existing',path:'private/path.jpg',blur:60},
 marriageBasics:{heightCm:164,nationality:'سعودية',skinTone:'tone_3',tribalBackground:'tribal',tribeName:'اختبار',religiousAffiliation:'sunni',prayerPractice:'regular',dressStyle:'hijab'},
 publicAvatar:{style:'hijab',skinTone:'tone_3'},partnerCriteria:{height:{mode:'prefer',min:170},skinTone:{mode:'prefer',values:['tone_3']},tribalBackground:{mode:'prefer',target:'same_tribe'}},
 surveyAnswers:{children_plan:'A'},personalityAnswers:{conflict:'B'},hardRequirements:['children_plan'],priorityCategories:['values'],interestIds:['reading']};}

test('signup defaults contain no implied agreements and have independent state',()=>{
 const a=emptyConsents(),b=emptyConsents();assert.equal(a.version,version);
 for(const [key,value] of Object.entries(a))if(key!=='version')assert.equal(value,false,key);
 a.photo=true;assert.equal(b.photo,false);
});

test('sensitive consent withdrawal removes public and private sensitive disclosures without mutating the draft',()=>{
 const original=sample(),snapshot=structuredClone(original),safe=withoutSensitive(original);
 for(const key of ['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'])assert.equal(safe.marriageBasics[key],undefined);
 assert.equal(safe.partnerCriteria.skinTone,undefined);assert.equal(safe.partnerCriteria.tribalBackground,undefined);assert.equal(safe.publicAvatar,null);
 assert.equal(safe.marriageBasics.heightCm,164);assert.equal(safe.marriageBasics.nationality,'سعودية');assert.equal(safe.marriageBasics.dressStyle,'hijab');
 assert.deepEqual(safe.partnerCriteria.height,original.partnerCriteria.height);assert.deepEqual(original,snapshot);
});

test('assessment withdrawal clears answers, preferences and scoring priorities without deleting basic profile fields',()=>{
 const original={...sample(),beena:{version:'beena-v1',answers:{family_boundaries:{self:'A',partner:['B']}},story:{scenarioId:'family_boundaries',text:'قصة خاصة',share:true}}},snapshot=structuredClone(original),safe=withoutAssessment(original);
 assert.equal(safe.beena,null);
 for(const key of ['surveyAnswers','personalityAnswers','partnerCriteria'])assert.deepEqual(safe[key],{});
 assert.deepEqual(safe.hardRequirements,[]);assert.deepEqual(safe.priorityCategories,[]);
 assert.equal(safe.displayName,original.displayName);assert.deepEqual(safe.marriageBasics,original.marriageBasics);assert.deepEqual(original,snapshot);
});

test('combined choices sanitize the submitted profile and snapshot the exact explicit choices',()=>{
 const original=sample(),choices={...emptyConsents(),adult:true,terms:true,privacy:true};
 const safe=applyConsentChoices(original,choices);assert.equal(safe.publicAvatar,null);assert.equal(safe.marriageBasics.skinTone,undefined);assert.deepEqual(safe.partnerCriteria,{});
 assert.deepEqual(safe.signupConsents,choices);choices.photo=true;assert.equal(safe.signupConsents.photo,false);
 const allowed=applyConsentChoices(original,{...choices,sensitiveProfile:true,assessment:true});
 assert.deepEqual(allowed.marriageBasics,original.marriageBasics);assert.deepEqual(allowed.surveyAnswers,original.surveyAnswers);
});

test('publication defaults closed while private sensitive data remains available for matching and editing',()=>{
 const original=sample();
 for(const signupConsents of [undefined,{...emptyConsents(),sensitiveProfile:true},{...emptyConsents(),version:'2026-11-06-onboarding',sensitiveProfile:true,sensitivePublication:true}]){
  const visible=publicSensitiveFields({...original,signupConsents});
  assert.equal(visible.marriageBasics.skinTone,undefined);assert.equal(visible.marriageBasics.tribeName,undefined);assert.equal(visible.publicAvatar,null);
 }
 const choices={...emptyConsents(),sensitiveProfile:true,sensitivePublication:false,assessment:true};
 const saved=applyConsentChoices(original,choices);
 assert.deepEqual(saved.marriageBasics,original.marriageBasics);assert.deepEqual(saved.partnerCriteria,original.partnerCriteria);
 assert.deepEqual(publicSensitiveFields({...saved,signupConsents:{...choices,sensitivePublication:true}}),{marriageBasics:original.marriageBasics,publicAvatar:original.publicAvatar});
 assert.equal(applyConsentChoices(original,{...choices,sensitiveProfile:false,sensitivePublication:true}).signupConsents.sensitivePublication,false);
});


test('only a current account receipt restores prior agreements',()=>{
  for(const receipt of [null,undefined,{}, {version:'old',adult:true,terms:true,privacy:true}]) assert.deepEqual(recordedAccountAgreements(receipt),{adult:false,terms:false,privacy:false});
  assert.deepEqual(recordedAccountAgreements({version,adult:true,terms:true,privacy:true}),{adult:true,terms:true,privacy:true});
  assert.deepEqual(recordedAccountAgreements({version,adult:true,terms:'yes',privacy:false}),{adult:true,terms:false,privacy:false});
  assert.equal(emptyConsents().assessment,false);
});
