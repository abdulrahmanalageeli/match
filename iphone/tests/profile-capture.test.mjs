import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import catalog from '../src/interview/profile-catalog.json' with {type:'json'};
import * as marriage from '../src/compatibility/marriage.ts';
const source=await readFile(new URL('../src/interview/profileCapture.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const exports={};vm.runInNewContext(code,{exports,require:id=>id==='./profile-catalog.json'?catalog:id==='../compatibility/marriage'?marriage:null});
const {validProfileProposalValues,validProfileProposal,applyProfileProposals,profileContextFromAnswers,profileProposalValue}=exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const proposal=(fieldId,values,extra={})=>({id:'profile:'+fieldId,fieldId,values,mode:fieldId.startsWith('partnerCriteria.')?'prefer':null,exclude:false,summary:'معلومة صرّح بها العضو',evidence:[{turnId:'turn-1',quote:'نص العضو'}],needsClarification:false,...extra});

test('an explicit not-divorced preference keeps the actual exclusion without claiming never-married only',()=>{
 const p=proposal('partnerCriteria.maritalStatus',['divorced'],{mode:'require',exclude:true});
 const patch=applyProfileProposals({},[p]);
 assert.deepEqual(plain(patch),{partnerCriteria:{maritalStatus:{mode:'require',values:['never_married','widowed','married']}}});
 assert.match(profileProposalValue(p),/باستثناء.*مطلق.*شرط أساسي/);
});
test('reviewed profile and partner facts merge without changing unrelated fields or the source object',()=>{
 const original={bio:'نبذة محفوظة',city:'جدة',marriageBasics:{heightCm:180,smoking:'never'},partnerCriteria:{education:{mode:'any'}}};
 const before=JSON.stringify(original);
 const patch=applyProfileProposals(original,[proposal('partnerCriteria.dressStyle',['niqab']),proposal('marriageBasics.meetingPreference',['family_before_formal']),proposal('familyPreference',['من البداية']),proposal('lookingFor',['أبحث عن شريكة تقدّر أهلها وجادة في الزواج.'])]);
 assert.equal(JSON.stringify(original),before);assert.equal(patch.bio,undefined);assert.equal(patch.city,undefined);
 assert.deepEqual(plain(patch.marriageBasics),{heightCm:180,smoking:'never',meetingPreference:'family_before_formal'});
 assert.deepEqual(plain(patch.partnerCriteria),{education:{mode:'any'},dressStyle:{mode:'prefer',values:['niqab']}});
 assert.equal(patch.lookingFor,'أبحث عن شريكة تقدّر أهلها وجادة في الزواج.');assert.equal(patch.familyPreference,'من البداية');
});
test('uncertain proposals, unknown fields and forged consent or verification writes never apply',()=>{
 for(const fieldId of ['signupConsents.assessment','portrait.verified','__proto__.admin','gender','birthDate','contact','compatibilityScore'])assert.equal(validProfileProposal(proposal(fieldId,['true'])),false);
 assert.deepEqual(plain(applyProfileProposals({},[proposal('bio',['معلومة غير واضحة'],{needsClarification:true})])),{});
 assert.equal(validProfileProposal(proposal('bio',['أهلًا'],{id:'profile:contact'})),false);
});
test('sensitive disclosures need consent for applying and sharing draft context',()=>{
 const p=proposal('marriageBasics.religiousAffiliation',['sunni']);
 assert.deepEqual(plain(applyProfileProposals({},[p])),{});
 assert.deepEqual(plain(applyProfileProposals({},[p],true)),{marriageBasics:{religiousAffiliation:'sunni'}});
 const current={marriageBasics:{religiousAffiliation:'sunni',nationality:'سعودي'},contact:'secret@example.com',signupConsents:{assessment:true}};
 assert.deepEqual(plain(profileContextFromAnswers(current)),[{fieldId:'marriageBasics.nationality',values:['سعودي'],mode:null,exclude:false}]);
 assert.equal(profileContextFromAnswers(current,true).length,2);
});
test('numbers, range bounds and any/prefer/require are validated without inventing a stricter rule',()=>{
 assert.equal(validProfileProposalValues(proposal('marriageBasics.heightCm',['231'])),false);
 assert.equal(validProfileProposalValues(proposal('marriageBasics.heightCm',['180.5'])),false);
 assert.equal(validProfileProposalValues(proposal('partnerCriteria.height',['190','170'])),false);
 assert.equal(validProfileProposalValues(proposal('partnerCriteria.height',['','180'])),true);
 assert.deepEqual(plain(applyProfileProposals({},[proposal('partnerCriteria.height',['','180'])])),{partnerCriteria:{height:{mode:'prefer',max:180}}});
 assert.equal(validProfileProposalValues(proposal('partnerCriteria.dressStyle',['niqab'],{mode:'any'})),false);
 assert.deepEqual(plain(applyProfileProposals({},[proposal('partnerCriteria.dressStyle',[],{mode:'any'})])),{partnerCriteria:{dressStyle:{mode:'any'}}});
 assert.equal(validProfileProposalValues(proposal('partnerCriteria.maritalStatus',['never_married','divorced','widowed','married'],{exclude:true})),false);
});
test('context includes existing answers to prevent repeats but excludes unsupported and empty values',()=>{
 const current={displayName:'عبدالرحمن',profession:'التقنية والبرمجة',marriageBasics:{spokenLanguages:['العربية','الإنجليزية'],preferredLanguage:'العربية',smoking:'never'},partnerCriteria:{sharedLanguage:{mode:'require'},height:{mode:'prefer',min:160},nationality:{mode:'prefer',values:['سعودي'],exclude:true}},preferredMinAge:'22',preferredMaxAge:'30'};
 const context=plain(profileContextFromAnswers(current));
 assert.equal(context.length,10);
 assert.deepEqual(context.find(p=>p.fieldId==='partnerCriteria.height'),{fieldId:'partnerCriteria.height',values:['160',''],mode:'prefer',exclude:false});
 assert.deepEqual(context.find(p=>p.fieldId==='marriageBasics.spokenLanguages').values,['العربية','الإنجليزية']);
 assert.equal(context.find(p=>p.fieldId==='partnerCriteria.nationality').exclude,true);
 assert.ok(context.every(validProfileProposalValues));
});
test('age edits preserve draft strings and reject inverted ranges',()=>{
 assert.deepEqual(plain(applyProfileProposals({preferredMinAge:'18',preferredMaxAge:'40'},[proposal('preferredMinAge',['25'])])),{preferredMinAge:'25'});
 assert.deepEqual(plain(applyProfileProposals({preferredMinAge:18,preferredMaxAge:40},[proposal('preferredMinAge',['25'])])),{preferredMinAge:25});
 assert.deepEqual(plain(applyProfileProposals({preferredMinAge:'18',preferredMaxAge:'30'},[proposal('preferredMinAge',['35'])])),{});
});
test('review corrections replace the addressed value, leaving language and other criteria intact',()=>{
 const current={marriageBasics:{spokenLanguages:['العربية'],maritalStatus:'married',currentWives:1},partnerCriteria:{dressStyle:{mode:'require',values:['niqab']},smoking:{mode:'require',target:'never'}}};
 const patch=applyProfileProposals(current,[proposal('partnerCriteria.dressStyle',[],{mode:'any'}),proposal('marriageBasics.maritalStatus',['divorced'])]);
 assert.equal(patch.marriageBasics.currentWives,undefined);assert.deepEqual(plain(patch.marriageBasics.spokenLanguages),['العربية']);
 assert.deepEqual(plain(patch.partnerCriteria),{dressStyle:{mode:'any'},smoking:{mode:'require',target:'never'}});
});
