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
const profile=u=>({_applicationIntegrity:'wudayn-application-integrity-v1',firstName:'اسم خاص',lastName:'عائلة خاصة',displayName:'عضوة تجريبية',birthDate:'1998-01-01',age:28,gender:'woman',city:'الرياض',profession:'مهندسة',bio:'نبذة للتجربة',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'من البداية',education:'بكالوريوس',marriageIntent:'تعارف جاد يهدف إلى الزواج',lookingFor:'شريك متفاهم',lifeTogether:'حياة متوازنة',valuesStatement:'التفاهم والاحترام',appearanceVersion:'appearance-v1',assessmentVersion:'marriage-v4',consentVersion:'2026-11-07-privacy',personalityVersion:'personality-v2',hardRequirements:[],priorityCategories:[],signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false},marriageBasics:{heightCm:165,weightKg:65,skinTone:'tone_4',spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',maritalStatus:'never_married',polygynyPreference:'not_open',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together'},partnerCriteria:Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(k=>[k,{mode:'any'}])),surveyAnswers:Object.fromEntries(preferences.dimensions.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]])),personalityAnswers:Object.fromEntries(personality.map(p=>[p.id,'C']))});
const apply=(u,p)=>asMember(db,u.id,u.sessionId,()=>q('public.marriage_apply($1)',[p]));

async function validApplication(u, phone) {
  let session = await start(u);
  session = await save(u,session,{...review(),pendingAnalysis:true});
  await attest(u,session,'fallback','capacity');
  if (phone) await db.query('update auth.users set phone=$2,phone_confirmed_at=now() where id=$1',[u.id,phone]);
  return {...profile(u),_membershipReadiness:{family:'early',nextStep:'soon',agreement:'wudayn-membership-v1'}};
}
const integrity = async u => (await db.query('select * from marriage.application_integrity_receipts where member_id=$1',[u.id])).rows[0];

test('signed first-time registration is atomic, private, automatically admitted and retry-safe',async()=>{
  const u=await user(),form=await validApplication(u,'+966500001001');
  const unsigned={...form};delete unsigned._applicationIntegrity;
  for(const invalid of [unsigned,{...form,_applicationIntegrity:true},{...form,_applicationIntegrity:'wudayn-application-integrity-v0'}]) {
    await assert.rejects(apply(u,invalid),/حدّث التطبيق/);
    assert.equal(await integrity(u),undefined);
    assert.equal(await q('exists(select 1 from marriage.profiles where member_id=$1)',[u.id]),false);
  }
  await assert.rejects(apply(u,{...form,birthDate:'2017-04-10',age:36}),/١٨/);
  await assert.rejects(apply(u,{...form,firstName:'  '}),/اسمك الأول/);
  await assert.rejects(apply(u,{...form,marriageBasics:{...form.marriageBasics,mahrRange:'unknown'}}));
  form.marriageBasics.mahrRange='from_50000';
  const submitted=await apply(u,form);
  assert.equal(submitted.profile.firstName,form.firstName);
  assert.equal(submitted.profile.lastName,form.lastName);
  assert.equal(submitted.profile.marriageBasics.mahrRange,'from_50000');
  const card=(await q('marriage.public_profile_snapshot($1)',[u.id])).card;
  assert.equal(card.alias,form.displayName);
  assert.equal(card.marriageBasics.mahrRange,'from_50000');
  assert.ok(!JSON.stringify(card).includes(form.firstName) && !JSON.stringify(card).includes(form.lastName));
  await assert.rejects(db.query("select marriage.validate_marriage_eligibility('man',$1)",[{mahrRange:'from_50000'}]),/للنساء/);
  assert.equal(submitted.user.applicationStatus,'approved');
  assert.equal(submitted.membership.active,false);
  assert.equal('_applicationIntegrity' in submitted.profile,false);
  const receipt=await integrity(u);
  assert.equal(receipt.agreement_version,form._applicationIntegrity);
  assert.ok(receipt.accepted_at);
  assert.equal(receipt.decision,'automatic');
  assert.deepEqual(receipt.review_reasons,[]);
  assert.equal((await apply(u,form)).user.applicationStatus,'approved');
  assert.equal(await q("(select count(*)::int from marriage.reviews where member_id=$1 and action='approve')",[u.id]),1);
  for(const role of ['anon','authenticated','service_role']) {
    await db.exec('set role '+role);
    try {
      await assert.rejects(db.query('select * from marriage.member_private_names'),/permission denied/);
      await assert.rejects(db.query('select * from marriage.application_integrity_receipts'),/permission denied/);
      await assert.rejects(db.query('select marriage.decide_registration($1)',[u.id]),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
  assert.equal((await apply(u,{...unsigned,profession:'مهندسة معمارية'})).user.applicationStatus,'pending');
  const reverted=await apply(u,form);
  assert.equal(reverted.user.applicationStatus,'pending');
  assert.equal(reverted.profile.profession,form.profession);
  assert.equal(await q("(select count(*)::int from marriage.reviews where member_id=$1 and action='approve')",[u.id]),1);
});

test('a linked device is privately flagged after admission; authorized review clears once without changing access',async()=>{
  const u=await user(),linked=await user(),staff=await user(),form=await validApplication(u,'+966500001002');
  const device='b'.repeat(64);
  await db.query('update marriage.members set suspended=true where id=$1',[linked.id]);
  await db.query('insert into marriage.registration_devices(user_id,device_hash) values($1,$3),($2,$3)',[u.id,linked.id,device]);
  await db.query('insert into marriage.reports(member_id,reported_id,reason) values($1,$2,$3)',[linked.id,u.id,'بلاغ تجريبي لم يُراجع']);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','فريق المراجعة')",[staff.id]);
  const staffCall=(sql,args)=>asMember(db,staff.id,staff.sessionId,async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:staff.id,session_id:staff.sessionId,role:'authenticated',aal:'aal2'})]);
    return q(sql,args);
  });
  const queue="public.marriage_admin_applications('registration_review',null)";
  const clear='public.marriage_admin_clear_registration_review($1,$2,$3)';
  assert.equal((await apply(u,form)).user.applicationStatus,'approved');
  assert.deepEqual((await integrity(u)).review_reasons,['repeat_registration','open_safety_report']);
  await assert.rejects(asMember(db,u.id,u.sessionId,()=>q(queue)),/42501|صلاحية|غير مصرح|الوصول|موظف/);
  const flagged=(await staffCall(queue)).find(row=>row.memberId===u.id);
  assert.equal(flagged.applicationDecision,'automatic');
  assert.deepEqual(flagged.applicationReviewReasons,['repeat_registration','open_safety_report']);
  assert.equal(flagged.applicationReviewResolvedAt,null);
  await assert.rejects(asMember(db,u.id,u.sessionId,()=>q(clear,[u.id,flagged.revision,'فحص تجريبي'])));
  await assert.rejects(staffCall(clear,[u.id,'outdated','فحص تجريبي']),/تغيّر/);
  const args=[u.id,flagged.revision,'راجعت ارتباط الجهاز التجريبي.'];
  const resolved=await staffCall(clear,args);
  assert.ok(resolved.applicationReviewResolvedAt);
  assert.equal((await staffCall(clear,args)).applicationReviewResolvedAt,resolved.applicationReviewResolvedAt);
  assert.equal((await staffCall(queue)).some(row=>row.memberId===u.id),false);
  assert.equal(await q("(select count(*)::int from marriage.staff_audit where target_id=$1 and action='registration_review_cleared')",[u.id]),1);
  assert.equal(await q('exists(select 1 from marriage.reports where reported_id=$1 and resolved_at is null)',[u.id]),true);
  await db.query('update marriage.members set suspended=true where id=$1',[u.id]);
  await assert.rejects(apply(u,form),/مراجعة/);
  assert.equal((await db.query('select suspended from marriage.members where id=$1',[u.id])).rows[0].suspended,true);
});

test('missing trusted phone verification holds the application and retry cannot replace a staff decision',async()=>{
  const u=await user(),form=await validApplication(u);
  const submitted=await apply(u,{...form,reviewStatus:'approved',applicationDecision:'automatic'});
  assert.equal(submitted.user.applicationStatus,'pending');
  assert.deepEqual((await integrity(u)).review_reasons,['phone_unverified']);
  assert.equal((await apply(u,form)).user.applicationStatus,'pending');
});

test('a historical unverified finalized male portrait cannot authorize first admission',async()=>{
  const u=await user(),form=await validApplication(u,'+966500001003');
  form.gender='man';
  form.signupConsents.photo=true;
  await db.query("insert into marriage.member_portraits(member_id,path,blur,ready) values($1,$2,0,true)",[u.id,u.id+'/old.jpg']);
  assert.equal((await apply(u,form)).user.applicationStatus,'pending');
  assert.deepEqual((await integrity(u)).review_reasons,['photo_review']);
  await assert.rejects(asService(db,()=>q("public.marriage_review($1,'approve')",[u.id])),/صورة/);
});

for (const staffAction of [null,'return_pending','suspend']) test('approved first portrait respects '+(staffAction ?? 'ordinary immediate admission'),async()=>{
  const phone=staffAction==='return_pending'?'+966500001006':staffAction==='suspend'?'+966500001007':'+966500001005';
  const u=await user(),staff=await user(),form=await validApplication(u,phone);
  form.gender='man';
  form.signupConsents.photo=true;
  const memberCall=(sql,args)=>asMember(db,u.id,u.sessionId,()=>q(sql,args));
  const photo=await memberCall("public.marriage_portrait_stage_prepare(0,'never','man',true)");
  await db.query("select set_config('storage.operation','object.upload',false)");
  try {
    await asMember(db,u.id,u.sessionId,()=>db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('nisfayn-profile-portraits',$1,$2)",
      [photo.path,{mimetype:'image/jpeg',size:2048}]));
  } finally { await db.query("select set_config('storage.operation','',false)"); }
  await memberCall("public.marriage_portrait_stage_action($1,'uploaded')",[photo.id]);
  await memberCall("public.marriage_portrait_stage_action($1,'moderation')",[photo.id]);
  assert.equal((await apply(u,form)).user.applicationStatus,'pending');
  assert.deepEqual((await integrity(u)).review_reasons,['photo_review']);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'owner','فريق الصور')",[staff.id]);
  await asMember(db,staff.id,staff.sessionId,async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:staff.id,session_id:staff.sessionId,role:'authenticated',aal:'aal2'})]);
    if (staffAction === 'suspend') {
      await q("public.marriage_staff_conduct('issue',$1)",[{memberId:u.id,requestId:randomUUID(),kind:'suspension',policy:'identity',explanation:'حماية عاجلة أثناء التحقق',urgent:true}]);
    } else if (staffAction) {
      const detail=await q('public.marriage_admin_member($1)',[u.id]);
      await q('public.marriage_admin_review($1,$2,$3,$4,$5)',[u.id,staffAction,detail.revision,'قرار مراجعة منفصل',randomUUID()]);
    }
    assert.equal(await q("public.marriage_admin_portrait_decide($1,true,'موافقة تجريبية')",[photo.id]),true);
  });
  const state=(await db.query('select suspended,review_status from marriage.members where id=$1',[u.id])).rows[0];
  assert.deepEqual(state,{suspended:staffAction==='suspend',review_status:staffAction?'pending':'approved'});
  assert.equal((await integrity(u)).decision,staffAction?'manual_review':'automatic');
  if (!staffAction) assert.deepEqual((await integrity(u)).review_reasons,[]);
});

test('admission checks the stored assessment, birth date and current publication consents',async()=>{
  const u=await user(),form=await validApplication(u,'+966500001004');
  assert.equal((await apply(u,form)).user.applicationStatus,'approved');
  await db.query('delete from marriage.member_birth_dates where member_id=$1',[u.id]);
  await db.query("delete from marriage.interview_receipts where owner_key='member:'||$1::text",[u.id]);
  await db.query("delete from marriage.signup_consent_events where member_id=$1 and purpose='sensitive_publication'",[u.id]);
  assert.deepEqual(await q('marriage.registration_review_reasons($1)',[u.id]),['consent_unconfirmed','eligibility_unconfirmed','assessment_unconfirmed']);
});

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

test('current registration accepts the self-only residence receipt end to end',async()=>{
 const u=await user(), form=profile(u);
 delete form.surveyAnswers.partner_residence_plan;
 const doc=review();
 const expected=doc.proposals.filter(p=>p.id!=='preference:residence_plan:partner');
 assert.equal(expected.length,46);
 let s=await start(u);
 s=await save(u,s,{...doc,proposals:expected});
 await attest(u,s,'analyzed');
 s=await save(u,s,{...s.document,status:'confirmed',confirmed:expected});
 await attest(u,s,'complete');
 await apply(u,form);
 const stored=(await db.query("select question_code from marriage.member_answers where member_id=$1 and question_code in ('partner_residence_plan','residence_plan')",[u.id])).rows;
 assert.deepEqual(stored,[{question_code:'residence_plan'}]);
});

test('v5 shortened receipts and applications require all three child-free facts',async()=>{
 const confirmed=structuredClone(proposals).filter(p=>p.fieldId!=='parenting_approach');
 confirmed.find(p=>p.fieldId==='children_plan'&&p.side==='self').values=['B'];
 const count={fieldId:'marriageBasics.childrenCount',values:['0'],mode:null,exclude:false};
 const strict={fieldId:'partnerCriteria.children',values:['none'],mode:'require',exclude:false};
 const doc={...review(),confirmed,status:'confirmed',profileContext:[count,strict]};
 assert.equal(await q('marriage.interview_complete_v5($1)',[doc]),true);
 assert.equal(await q('marriage.interview_document_valid($1)',[doc]),true);
 const selfOnly={...doc,confirmed:confirmed.filter(item=>item.id!=='preference:residence_plan:partner')};
 assert.equal(await q('marriage.interview_complete_v5($1)',[selfOnly]),true);
 assert.equal(await q('marriage.interview_complete_v5($1)',[{...selfOnly,profileContext:[]}]),false);
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

test('private statements require verbatim evidence in the same transcript and a preceding quote for corrections',async()=>{
 const base=review();
 const first={...turn,id:'a',answer:'أحب التصوير'};
 const second={...turn,id:'b',answer:'هوايتي الآن الرسم'};
 const doc={...base,proposals:[],turns:[first,second]};
 const note={subject:'self',topic:'interest',turnId:'b',quote:'الرسم',replacesQuote:'التصوير'};
 const valid=(notes,overrides={})=>q('marriage.interview_document_valid($1)',[{...doc,statements:notes,...overrides}]);
 assert.equal(await valid([note]),true);
 for(const invalid of [{...note,quote:'السباحة'},{...note,turnId:'elsewhere'},{...note,replacesQuote:'الآن'},
   {...note,subject:'staff'},{...note,score:4},{...note,topic:'score'},{...note,quote:null}]) assert.equal(await valid([invalid]),false);
 assert.equal(await valid([note],{turns:[{...first,skipped:true,answer:''},second]}),false);
 assert.equal(await valid([note],{turns:[first,{...second,skipped:true,answer:''}]}),false);
 assert.equal(await valid(Array(41).fill(note)),false);
 assert.equal(await q('marriage.interview_document_valid($1)',[doc]),true);
});

test('a reviewed range extends only a previously attested analysis, retries once and confers no completion',async()=>{
 const prompts=(await import('../../src/interview/refinement-prompts.json',{with:{type:'json'}})).default;
 const u=await user();
 let s=await start(u);
 const base={...review(),proposals:[],turns:[{...turn,answer:'أفضل زوجة قصيرة'}]};
 const refined={...turn,id:randomUUID(),topic:'intent',question:prompts.height,answer:'أفضّل طول الشريك بحد أقصى ١٦٥ سم.'};
 s=await save(u,s,base);
 s=await save(u,s,{...base,turns:[...base.turns,refined]});
 await assert.rejects(attest(u,s,'refined'),/Unverified refinement base/);
 s=await save(u,s,base);
 await attest(u,s,'analyzed');
 s=await save(u,s,{...base,turns:[{...base.turns[0],answer:'محتوى آخر'},refined]});
 await assert.rejects(attest(u,s,'refined'),/Unverified refinement base/);
 s=await save(u,s,{...base,turns:[...base.turns,{...refined,question:'نص مختلف'}]});
 await assert.rejects(attest(u,s,'refined'),/Invalid interview refinement/);
 s=await save(u,s,{...base,turns:[...base.turns,refined]});
 await assert.rejects(asMember(db,u.id,u.sessionId,()=>q("public.marriage_interview_attest($1,null,$2,'refined','')",[u.id,s.revision])),/permission denied/);
 await assert.rejects(attest(u,{...s,revision:s.revision-1},'refined'),/Changed assessment/);
 assert.deepEqual(await attest(u,s,'refined'),{ok:true});
 assert.deepEqual(await attest(u,s,'refined'),{ok:true});
 await assert.rejects(attest(u,s,'complete'),/Unverified assessment/);
 assert.equal(await q('(select completed_at is null from marriage.interview_receipts where owner_key=$1)',['member:'+u.id]),true);
 for(const topic of ['age','timeline']) {
   s=await save(u,s,{...s.document,turns:[...s.document.turns,{...refined,id:randomUUID(),question:prompts[topic],answer:'يكفيني الوصف اللي ذكرته بدون تحديد أدق.'}]});
   assert.deepEqual(await attest(u,s,'refined'),{ok:true});
 }
});
