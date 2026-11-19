import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {createInterviewService,initialInterviewDocument} from '../../api/_lib/interview.mjs';
import preferences from '../../src/compatibility/catalog.json' with {type:'json'};
import personality from '../../src/compatibility/personality-catalog.json' with {type:'json'};
let db;before(async()=>{db=await createDatabase();});after(async()=>{await db?.close();});
const q=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
const call=(u,command,payload={})=>asMember(db,u.id,u.sessionId,()=>q('public.marriage_interview($1,$2,null)',[command,payload]));
const attest=(u,s,event,reason='')=>asService(db,()=>q('public.marriage_interview_attest($1,null,$2,$3,$4)',[u.id,s.revision,event,reason]));
async function user(){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);return u;}
const start=u=>call(u,'start',{consentVersion:'wudayn-interview-v1',document:initialInterviewDocument(true)});
const save=(u,s,document)=>call(u,'save',{expectedRevision:s.revision,document});
const turn={id:randomUUID(),topic:'intent',question:'ما الذي يناسبك؟',answer:'هذه إجابة تجريبية صريحة محفوظة للتأكد من حماية الجلسة.',skipped:false};
const proposals=preferences.dimensions.flatMap(d=>['self','partner'].map(side=>({id:`preference:${d.id}:${side}`,kind:'preference',fieldId:d.id,side,values:[d.options[0].code]}))).concat(personality.map(p=>({id:`personality:${p.id}:self`,kind:'personality',fieldId:p.id,side:'self',values:['C']}))).map(p=>({...p,summary:'إجابة واضحة.',needsClarification:false,evidence:[{turnId:turn.id,quote:turn.answer}]}));
const review=()=>({...initialInterviewDocument(true),status:'review',currentQuestion:null,turns:[turn],proposals,lastMode:'luna'});
const profile=u=>({displayName:'عضوة تجريبية',birthDate:'1998-01-01',age:28,gender:'woman',city:'الرياض',profession:'مهندسة',bio:'نبذة للتجربة',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'من البداية',education:'بكالوريوس',marriageIntent:'تعارف جاد يهدف إلى الزواج',lookingFor:'شريك متفاهم',lifeTogether:'حياة متوازنة',valuesStatement:'التفاهم والاحترام',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v4',consentVersion:'2026-11-07-privacy',personalityVersion:'personality-v2',hardRequirements:[],priorityCategories:[],signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false},marriageBasics:{heightCm:165,weightKg:65,skinTone:'tone_4',spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',maritalStatus:'never_married',polygynyPreference:'not_open',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together'},partnerCriteria:Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(k=>[k,{mode:'any'}])),surveyAnswers:Object.fromEntries(preferences.dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]])),personalityAnswers:Object.fromEntries(personality.map(p=>[p.id,'C']))});
const apply=(u,p)=>asMember(db,u.id,u.sessionId,()=>q('public.marriage_apply($1)',[p]));

test('required coverage rejects omissions, missing consent and Beena; existing versions remain readable',async()=>{
 const u=await user(),p=profile(u);assert.equal(await q('marriage.required_onboarding_answers($1)',[p]),true);
 for(const path of ['surveyAnswers','personalityAnswers','marriageBasics','partnerCriteria']){const copy=structuredClone(p);delete copy[path][Object.keys(copy[path])[0]];assert.equal(await q('marriage.required_onboarding_answers($1)',[copy]),false,path);}
 for(const key of ['education','marriageIntent','lookingFor','lifeTogether','valuesStatement']){const copy={...p,[key]:''};assert.equal(await q('marriage.required_onboarding_answers($1)',[copy]),false,key);}
 await assert.rejects(apply(u,{...p,surveyAnswers:{}}),/جميع إجابات/);
 assert.equal(await q('marriage.interview_document_valid($1)',[{...review(),status:'confirmed',confirmed:proposals.slice(1)}]),false);
 assert.equal(await q('marriage.interview_document_valid($1)',[{...review(),status:'confirmed',confirmed:proposals}]),true);
});

test('a client-forged confirmed JSON cannot grant completion, fallback, or service attestation',async()=>{
 const u=await user();let s=await start(u);
 s=await save(u,s,{...review(),status:'confirmed',confirmed:proposals});
 assert.equal(s.fallbackAvailable,false);await assert.rejects(apply(u,profile(u)),/أكمل جلسة/);
 await assert.rejects(asMember(db,u.id,u.sessionId,()=>q("public.marriage_interview_attest($1,null,$2,'fallback','unavailable')",[u.id,s.revision])),/permission denied/);
 await assert.rejects(attest(u,s,'complete'),/Unverified/);
 await assert.rejects(attest(u,s,'fallback','unavailable'),/Invalid fallback/);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('set role '+role);try{await assert.rejects(db.query('select * from marriage.interview_receipts'),/permission denied/);}finally{await db.exec('reset role');}
 }
});

test('trusted full analysis and confirmation permit onboarding; changing analyzed data invalidates proof',async()=>{
 const u=await user();let s=await start(u);s=await save(u,s,review());
 await attest(u,s,'analyzed');s=await save(u,s,{...s.document,status:'confirmed',confirmed:proposals});await attest(u,s,'complete');
 // Member-controlled turns/proposals cannot substitute different analysis after attestation.
 s=await save(u,s,{...s.document,turns:[{...turn,answer:turn.answer+' نص معدل.'}]});
 await assert.rejects(apply(u,profile(u)),/أكمل جلسة/);
 await attest(u,s,'analyzed');await attest(u,s,'complete');
 const applied=await apply(u,profile(u));assert.equal(applied.profile.displayName,'عضوة تجريبية');
 assert.equal(applied.profile.personalityVersion,'personality-v2');
 assert.deepEqual(applied.profile.personalityAnswers,profile(u).personalityAnswers);
 // After registration, optional data withdrawal/editing remains possible.
 const p=profile(u);p.signupConsents.assessment=false;p.surveyAnswers={};p.personalityAnswers={};p.partnerCriteria={};
 await apply(u,p);
});

test('only a trusted pending provider failure permits complete manual onboarding and deletion revokes it',async()=>{
 const u=await user();let s=await start(u);s=await save(u,s,{...review(),pendingAnalysis:true});
 assert.equal((await call(u,'load')).fallbackAvailable,false);
 await assert.rejects(attest(u,{...s,revision:s.revision-1},'fallback','unavailable'),/Changed assessment/);
 await attest(u,s,'fallback','unavailable');assert.equal((await call(u,'load')).fallbackAvailable,true);
 await assert.rejects(apply(u,{...profile(u),personalityAnswers:{}}),/جميع إجابات/);
 await call(u,'delete',{expectedRevision:s.revision});assert.equal((await call(u,'load')).fallbackAvailable,false);
 await assert.rejects(apply(u,profile(u)),/أكمل جلسة/);
 s=await start(u);s=await save(u,s,{...review(),pendingAnalysis:true});await attest(u,s,'fallback','capacity');
 assert.equal((await apply(u,profile(u))).profile.displayName,'عضوة تجريبية');
});

test('draft reload preserves only explicit boolean interview consent without granting completion',async()=>{
 const u=await user();const draft={version:1,owner:u.id,baseline:'a'.repeat(64),step:'compatibility',returnToReview:false,answers:{},permissions:{version:'2026-11-07-privacy',sensitiveProfile:false,assessment:true,interview:true}};
 const draftCall=(command,payload={})=>asMember(db,u.id,u.sessionId,()=>q('public.marriage_onboarding_draft($1,$2)',[command,payload]));
 await draftCall('save',draft);assert.equal((await draftCall('load')).permissions.interview,true);
 assert.equal((await call(u,'load')).document,null);await assert.rejects(apply(u,profile(u)),/أكمل جلسة/);
 for(const bad of ['true',1,null])await assert.rejects(draftCall('save',{...draft,permissions:{...draft.permissions,interview:bad}}),/خصوصية/);
 await draftCall('save',{...draft,permissions:{...draft.permissions,interview:false}});assert.equal((await draftCall('load')).permissions.interview,false);
 const legacy=structuredClone(draft);delete legacy.permissions.interview;await draftCall('save',legacy);assert.equal((await draftCall('load')).permissions.interview,undefined);
});

test('direct card confirmation earns an ordinary completion receipt and stores the member’s exact scores',async()=>{
 const u=await user();
 const headers={authorization:'Bearer fixture.'+Buffer.from(JSON.stringify({sub:u.id})).toString('base64url')+'.fixture'};
 const service=createInterviewService({
   env:{SUPABASE_SERVICE_ROLE_KEY:'local-test'},
   fetcher:async(url,options)=>{
     const body=JSON.parse(options.body);
     if(url.endsWith('/marriage_interview_attest')){
       assert.equal(body.member_id,u.id);
       return Response.json(await attest(u,{revision:body.expected_revision},body.event));
     }
     assert(url.endsWith('/marriage_interview'));
     return Response.json(await call(u,body.command,body.payload));
   },
   clientFactory:()=>assert.fail('direct answers do not need model inference')
 });
 const initial=await service({action:'start',consentVersion:'wudayn-interview-v1'},headers);
 const choices=proposals.map(({id,values})=>({id,values}));
 const result=await service({action:'directConfirm',revision:initial.revision,choices,inferredPartnerIds:['preference:children_plan:partner']},headers);
 assert.equal(result.document.status,'confirmed');
 assert.equal(result.fallbackAvailable,false);
 assert.equal((await service({action:'load'},headers)).document.confirmed.length,47);
 const form=profile(u);
 for(const field of ['sensitiveProfile','sensitivePublication']){
   const missing=structuredClone(form);
   missing.signupConsents[field]=false;
   await assert.rejects(apply(u,missing),/معالجة التفاصيل الحساسة وعرضها/);
 }
 const noTone=structuredClone(form);
 delete noTone.marriageBasics.skinTone;
 await assert.rejects(apply(u,noTone),/درجة البشرة/);
 const saved=await apply(u,form);
 assert.deepEqual(saved.profile.surveyAnswers,form.surveyAnswers);
 assert.deepEqual(saved.profile.personalityAnswers,form.personalityAnswers);
 const evidence=async()=> (await q('marriage.deep_evidence($1)',[u.id])).entries;
 const savedEvidence=await evidence();
 assert.equal(savedEvidence.find(e=>e.key==='answer:partner_children_plan').provenance,'inferred');
 assert.equal(savedEvidence.find(e=>e.key==='answer:partner_residence_plan').provenance,'confirmed');
 assert.ok(savedEvidence.every(e=>!('evidence' in e) && !('quote' in e)));
 assert.equal(await q('marriage.sensitive_publication_allowed($1)',[u.id]),true);
 const publicCard=()=>q('marriage.member_card($1,$1)',[u.id]);
 assert.equal((await publicCard()).marriageBasics.skinTone,'tone_4');
 await db.query("delete from marriage.interview_sessions where member_id=$1",[u.id]);
 form.signupConsents.sensitivePublication=false;
 const withdrawn=await apply(u,form);
 assert.equal(withdrawn.profile.marriageBasics.skinTone,'tone_4');
 assert.deepEqual(withdrawn.profile.surveyAnswers,saved.profile.surveyAnswers);
 assert.equal((await publicCard()).marriageBasics.skinTone,undefined);
 assert.equal(await q('marriage.sensitive_publication_allowed($1)',[u.id]),false);
 assert.equal((await evidence()).find(e=>e.key==='answer:partner_children_plan').provenance,'inferred');
 form.surveyAnswers.partner_children_plan='B';
 await apply(u,form);
 assert.equal((await evidence()).find(e=>e.key==='answer:partner_children_plan').provenance,'unverified');
});

test('v5 shortened receipts and applications require all three child-free facts',async()=>{
 const confirmed=structuredClone(proposals).filter(p=>p.fieldId!=='parenting_approach');
 confirmed.find(p=>p.fieldId==='children_plan'&&p.side==='self').values=['B'];
 const count={fieldId:'marriageBasics.childrenCount',values:['0'],mode:null,exclude:false};
 const strict={fieldId:'partnerCriteria.children',values:['none'],mode:'require',exclude:false};
 const doc={...review(),confirmed,status:'confirmed',profileContext:[count,strict]};
 assert.equal(await q('marriage.interview_complete_v5($1)',[doc]),true);
 assert.equal(await q('marriage.interview_document_valid($1)',[doc]),true);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileContext:[]}]),false);
 for(const criterion of [[],[{...strict,mode:'prefer'}],[{...strict,mode:'any',values:[]}],[{...strict,values:['any']}]]) {
   assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileContext:[count,...criterion]}]),false);
 }
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileContext:[count],profileConfirmed:[strict]}]),true);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileConfirmed:[{...strict,needsClarification:true}]}]),false);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileContext:[],profileConfirmed:[{fieldId:'marriageBasics.childrenCount',values:['0'],needsClarification:true}]}]),false);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,profileConfirmed:[{fieldId:'marriageBasics.childrenCount',values:['1']}]}]),false);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...doc,confirmed:confirmed.slice(1)}]),false);
 const p=profile(await user());
 p.surveyAnswers.children_plan='B';
 delete p.surveyAnswers.parenting_approach;
 delete p.surveyAnswers.partner_parenting_approach;
 assert.equal(await q('marriage.required_onboarding_answers($1)',[p]),false);
 p.partnerCriteria.children={mode:'require',target:'none'};
 assert.equal(await q('marriage.required_onboarding_answers($1)',[p]),true);
 p.marriageBasics.childrenCount=1;
 assert.equal(await q('marriage.required_onboarding_answers($1)',[p]),false);
});
