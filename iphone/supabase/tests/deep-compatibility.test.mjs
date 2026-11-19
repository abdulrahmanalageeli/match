import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';
import currentPersonality from '../../src/compatibility/personality-catalog.json' with {type:'json'};

const sections=['summary','strengths','differences','patterns','expectations','friction','conversation','conclusion'];
async function setup(){
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const members=[];
 for(const gender of ['man','woman','man']){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,u);await seedCommunicationMember(db,u,gender);members.push(u);
  await db.query("insert into marriage.personality_answers select $1,code,$2 from marriage.personality_questions where ordinal<=12",[u.id,gender==='man'?'A':'E']);
  await db.query("insert into marriage.member_assessment values($1,'marriage-v2')",[u.id]);
  await db.query("insert into marriage.member_answers select $1,q.code,(select code from marriage.question_options where question_code=q.code order by position limit 1) from marriage.questions q",[u.id]);
 }
 const [a,b,c]=members;
 await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[a.id]);
 const connection=await asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_request($1)',[b.id]));
 await asMember(db,b.id,b.sessionId,()=>rpc("public.marriage_act($1,'accept',null)",[connection]));
 await db.query('update marriage.members set manual_access_until=null where id=$1',[a.id]);
 const call=(u,action='get',decisions=null)=>asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_deep_analysis($1,$2,$3)',[connection,action,decisions]));
 const job=(action,lease=null,report=null)=>asService(db,()=>rpc('public.marriage_deep_analysis_job($1,$2,$3,$4,$5)',[a.id,connection,action,lease,report]));
 const grant=async()=>{
  const state=await asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_state()'));
  await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[a.id,{bundleId:'com.blindmatch.marriage',appAccountToken:state.user.appAccountToken,productId:'com.blindmatch.marriage.monthly.seriousness',originalTransactionId:randomUUID(),transactionId:randomUUID(),signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
 };
 return {db,a,b,c,connection,call,job,grant,rpc};
}
function report(){return {findings:sections.map((section,i)=>({id:'f'+(i+1),section,kind:i===2?'manageable':'uncertain',text:'قراءة مشتركة حساسة لا تظهر قبل موافقتكما على الإفصاح.',reviewText:{a:'استنتاج عن صاحب الطلب مبني على إجاباته وحدها.',b:'استنتاج عن الطرف المستلم مبني على إجاباته وحدها.'},evidence:[{side:'a',key:'personality:'+['reassurance','reassurance','planning','novelty','openness','support','conflict_pace','directness'][i]},{side:'b',key:'personality:'+['reassurance','reassurance','planning','novelty','openness','support','conflict_pace','directness'][i]}]}))};}
const decisions=value=>Object.fromEntries(sections.map((_,i)=>['f'+(i+1),value]));

test('deep analysis requires higher tier and mutual consent; drafts and partner evidence never leak',async()=>{
 const {db,a,b,c,call,job,grant,connection,rpc}=await setup();
 try{
  assert.equal((await call(a)).canRequest,false);
  await assert.rejects(call(a,'request'),/وسام/);
  await grant();
  const requested=await call(a,'request');assert.equal(requested.status,'requested');
  assert.equal((await call(a,'request')).id,requested.id,'request retry is idempotent');
  assert.equal((await db.query('select snapshot from marriage.deep_analyses')).rows[0].snapshot,null,'no answers copied before both consent');
  assert.equal((await job('claim')).status,'idle');
  await assert.rejects(call(c),/القائم/);
  await assert.rejects(call(a,'accept'),/غير متاح/);
  assert.equal((await call(b,'accept')).status,'ready','free partner can accept');
  const claim=await job('claim');assert.equal(claim.status,'claimed');
  assert.equal(claim.snapshot.a.entries.find(e=>e.key==='personality:reassurance').answer,'لا يشبهني إطلاقًا');
  assert.equal(claim.snapshot.b.entries.find(e=>e.key==='personality:reassurance').answer,'يشبهني كثيرًا');
  assert.equal((await job('claim')).status,'busy');
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_deep_analysis_job($1,$2,$3)',[a.id,connection,'claim'])));
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>db.query('select * from marriage.deep_analyses')));
  const malformed=report();malformed.findings[0].evidence[1].key='invented';
  await assert.rejects(job('publish',claim.lease,malformed),/الدليل/);
  assert.equal((await job('publish',claim.lease,report())).status,'review');
  const reviewA=await call(a),reviewB=await call(b);
  assert.equal(reviewA.findings.length,0);assert.equal(reviewB.findings.length,0);
  assert.equal(reviewA.review[0].ownEvidence[0].value,'لا يشبهني إطلاقًا');
  assert.equal(reviewB.review[0].ownEvidence[0].value,'يشبهني كثيرًا');
  assert.equal(reviewA.review[0].ownInterpretation,report().findings[0].reviewText.a);
  assert.equal(reviewB.review[0].ownInterpretation,report().findings[0].reviewText.b);
  assert.equal(JSON.stringify(reviewA).includes(report().findings[0].reviewText.b),false);
  assert.equal(JSON.stringify(reviewB).includes(report().findings[0].reviewText.a),false);
  assert.equal(JSON.stringify(reviewA).includes('قراءة مشتركة حساسة'),false);
  assert.equal(JSON.stringify(reviewA).includes('يشبهني كثيرًا'),false);
  await assert.rejects(call(a,'review',{f1:true}),/كل إفصاح/);
  await call(a,'review',decisions(true));
  assert.equal((await call(b)).findings.length,0,'first reviewer cannot release shared text');
  const shared=await call(b,'review',{...decisions(true),f2:false});
  assert.equal(shared.status,'shared');assert.equal(shared.findings.length,6);
  assert.equal(shared.findings.some(f=>f.id==='f2'),false);
  assert.equal(shared.findings.some(f=>f.id==='f1'),false,'approved summary cannot indirectly reveal a source refused on another finding');
  assert.equal(shared.findings.some(f=>f.id==='f3'),true,'unrelated approved evidence remains available');
  assert.equal(shared.findings.some(f=>'evidence' in f),false);
  assert.equal(shared.findings.some(f=>'reviewText' in f),false);
  assert.equal((await db.query("select jsonb_array_length(report->'findings') n from marriage.deep_analyses")).rows[0].n,6,'denied and dependent findings deleted');
  await call(b,'cancel');assert.equal((await call(a)).findings.length,0);
  assert.equal((await db.query('select report,snapshot from marriage.deep_analyses')).rows[0].report,null);
 }finally{await db.close();}
});

test('profile changes, withdrawn consent, closed matches and expired sessions block analysis',async()=>{
 const {db,a,b,call,job,grant,connection}=await setup();
 try{
  await grant();await call(a,'request');await call(b,'accept');const claim=await job('claim');
  await db.query("update marriage.personality_answers set option_code='C' where member_id=$1",[b.id]);
  assert.equal((await call(a)).status,'stale');
  await assert.rejects(job('publish',claim.lease,report()),/صلاحية/);
  await call(a,'request');await call(b,'accept');const next=await job('claim');
  await call(b,'cancel');await assert.rejects(job('publish',next.lease,report()),/صلاحية/);
  await call(a,'request');await call(b,'decline');await assert.rejects(call(a,'request'),/وسام/,'three requests per day anti-abuse cap');
  await db.query("update marriage.member_requests set status='closed' where id=$1",[connection]);
  await assert.rejects(call(a),/القائم/);
  await db.query('delete from auth.sessions where id=$1',[b.sessionId]);
  await assert.rejects(call(b),/تسجيل الدخول/);
 }finally{await db.close();}
});

test('generation leases are retryable and bounded, and stale workers cannot publish',async()=>{
 const {db,a,b,call,job,grant}=await setup();
 try{
  await grant();await call(a,'request');await call(b,'accept');let claim=await job('claim');
  await db.query("update marriage.deep_analyses set leased_until=now()-interval '1 second'");
  const old=claim;claim=await job('claim');assert.equal(claim.status,'claimed');
  await assert.rejects(job('publish',old.lease,report()),/صلاحية/);
  await job('fail',claim.lease);claim=await job('claim');await job('fail',claim.lease);
  assert.equal((await job('claim')).status,'idle');assert.equal((await call(a)).canGenerate,false);
 }finally{await db.close();}
});

test('incomplete evidence blocks generation, blocking invalidates drafts, cleanup and export preserve privacy',async()=>{
 const {db,a,b,call,job,grant,rpc,connection}=await setup();
 try{
  await grant();await call(a,'request');
  await db.query("delete from marriage.personality_answers where member_id=$1 and question_code='reassurance'",[b.id]);
  await assert.rejects(call(b,'accept'),/اكتمال/);
  assert.equal((await job('claim')).status,'idle');
  await db.query("insert into marriage.personality_answers values($1,'reassurance','E')",[b.id]);
  await call(b,'accept');const claim=await job('claim');await job('publish',claim.lease,report());
  const exported=await asMember(db,a.id,a.sessionId,()=>rpc('marriage.personal_data()'));
  assert.equal(JSON.stringify(exported.deepCompatibilityAnalyses).includes('قراءة مشتركة حساسة'),false);
  assert.equal(JSON.stringify(exported.deepCompatibilityAnalyses).includes('يشبهني كثيرًا'),false);
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[b.id,a.id]);
  assert.deepEqual((await db.query('select status,report,snapshot from marriage.deep_analyses')).rows[0],{status:'cancelled',report:null,snapshot:null});
  await assert.rejects(call(a),/القائم/);
  await assert.rejects(job('publish',claim.lease,report()),/القائم/);
  await db.query('delete from marriage.blocks where member_id=$1 and blocked_id=$2',[b.id,a.id]);
  // Existing block policy closes the match too; simulate a later renewed match.
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[connection]);
  assert.equal((await call(a)).status,'cancelled','unblocking never resurrects prior consent');
  assert.equal((await job('claim')).status,'idle');
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2)',[b.id,a.id]);
  await asService(db,()=>rpc('marriage.operations_cleanup()'));
  assert.equal((await db.query('select count(*)::int n from marriage.deep_analyses')).rows[0].n,0);
 }finally{await db.close();}
});
test('fictional readings require membership and have an independent daily quota',async()=>{
 const {db,a,grant,rpc}=await setup();
 const reserve=()=>asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_demo_deep_reserve()'));
 try {
  await assert.rejects(reserve(),error=>error.code==='42501');
  await grant();
  for(let i=0;i<3;i++) {
   const own=await reserve();
   assert.equal(own.entries.find(e=>e.key==='personality:reassurance').answer,'لا يشبهني إطلاقًا');
  }
  await assert.rejects(reserve(),error=>error.code==='54000');
  await db.query("update marriage.demo_deep_usage set usage_date=usage_date-1 where member_id=$1",[a.id]);
  assert.ok((await reserve()).entries.length>2);
 } finally {await db.close();}
});

const modernConsent={consentVersion:'deep-assessment-v2'};

async function upgradeAssessment(db,member,skipParenting=false) {
 await db.query("update marriage.member_assessment set version='marriage-v4' where member_id=$1",[member.id]);
 await db.query(`insert into marriage.personality_answers
   select $1,code,chr(65+((ordinal-13)%5)) from marriage.personality_questions where ordinal between 13 and 27
   on conflict(member_id,question_code) do update set option_code=excluded.option_code`,[member.id]);
 if(skipParenting){
  await db.query('insert into marriage.member_basics(member_id,children_count) values($1,0)',[member.id]);
  await db.query("insert into marriage.partner_criteria values($1,'children',$2)",[member.id,{mode:'require',target:'none'}]);
  await db.query("update marriage.member_answers set option_code='B' where member_id=$1 and question_code='children_plan'",[member.id]);
 }
}

test('changing either instrument invalidates old invitations and leases; mixed and current consent bind the precise invitation',async()=>{
 const {db,a,b,call,job,grant,rpc}=await setup();
 try{
  await grant();
  const old=await call(a,'request');
  await upgradeAssessment(db,b,true);
  assert.equal((await call(b)).status,'stale');
  await assert.rejects(call(b,'accept',{...modernConsent,requestId:old.id}),e=>e.code==='42501');
  await assert.rejects(call(a,'request'),e=>e.code==='42501');
  await assert.rejects(call(a,'request',{consentVersion:'deep-assessment-v1'}),e=>e.code==='42501');
  const mixed=await call(a,'request',modernConsent);
  assert.equal((await call(a,'request',modernConsent)).id,mixed.id);
  await assert.rejects(call(b,'accept'),e=>e.code==='42501');
  await assert.rejects(call(b,'accept',{...modernConsent,requestId:old.id}),e=>e.code==='42501');
  await assert.rejects(call(a,'accept',{...modernConsent,requestId:mixed.id}),e=>e.code==='42501');
  assert.deepEqual(await job('claim'),{status:'idle'});
  assert.equal(await rpc('(select count(*)::int from marriage.deep_analyses where snapshot is not null)'),0);
  await db.query("delete from marriage.personality_answers where member_id=$1 and question_code='stress_recovery'",[b.id]);
  await assert.rejects(call(b,'accept',{...modernConsent,requestId:mixed.id}),e=>e.code==='22023');
  await db.query("insert into marriage.personality_answers values($1,'stress_recovery','C')",[b.id]);
  await db.query("update marriage.member_answers set partner_answer_origin='inferred' where member_id=$1 and question_code='partner_marriage_timeline'",[b.id]);
  assert.equal((await call(b,'accept',{...modernConsent,requestId:mixed.id})).status,'ready');
  const claim=await job('claim');
  assert.equal(claim.status,'claimed');
  assert.equal(claim.snapshot.a.entries.length,44);
  assert.deepEqual(claim.snapshot.a,await rpc('marriage.deep_evidence_legacy($1)',[a.id]));
  const side=claim.snapshot.b;
  assert.equal(side.assessmentVersion,'marriage-v4');
  assert.equal(side.personalityVersion,'personality-v2');
  assert.equal(side.entries.length,45);
  assert.ok(!side.entries.some(e=>e.key.includes('parenting_approach')));
  const labels=['لا يشبهني إطلاقًا','لا يشبهني كثيرًا','يشبهني إلى حد ما','يشبهني','يشبهني كثيرًا'];
  for(const [i,item] of currentPersonality.entries()){
   assert.deepEqual(side.entries.find(e=>e.key==='personality:'+item.id),{key:'personality:'+item.id,question:item.prompt,answer:labels[i%5]});
  }
  assert.equal(side.entries.find(e=>e.key==='answer:partner_marriage_timeline').provenance,'inferred');
  assert.equal(side.entries.find(e=>e.key==='answer:partner_children_plan').provenance,'unverified');

  await upgradeAssessment(db,a);
  assert.equal((await call(a)).status,'stale');
  await assert.rejects(job('publish',claim.lease,report()),e=>e.code==='42501');
  assert.deepEqual(await job('claim'),{status:'idle'});
  const fresh=await call(a,'request',modernConsent);
  assert.ok(fresh.id!==mixed.id);
  await assert.rejects(call(b,'accept',{...modernConsent,requestId:mixed.id}),e=>e.code==='42501');
  await call(b,'accept',{...modernConsent,requestId:fresh.id});
  const next=await job('claim');
  assert.equal(next.snapshot.a.entries.length,47);
  assert.equal(next.snapshot.b.entries.length,45);
  const draft=report();
  for(const f of draft.findings)f.evidence=[{side:'a',key:'personality:lasting_tension'},{side:'b',key:'answer:partner_marriage_timeline'}];
  assert.equal((await job('publish',next.lease,draft)).status,'review');
  assert.match((await call(b)).review[0].ownEvidence[0].label,/مقترح/);
  assert.equal((await call(a)).findings.length,0);
  await call(a,'cancel');
  assert.deepEqual(await job('claim'),{status:'idle'});
  assert.equal(await rpc('(select count(*)::int from marriage.deep_analyses where snapshot is not null or report is not null)'),0);
 }finally{await db.close();}
});

test('fictional current reading requires positive permission and a complete instrument before consuming quota',async()=>{
 const {db,a,grant,rpc}=await setup();
 const reserve=consent=>asMember(db,a.id,a.sessionId,()=>rpc('public.marriage_demo_deep_reserve($1)',[consent]));
 try{
  await grant();
  await upgradeAssessment(db,a);
  await assert.rejects(reserve(null),e=>e.code==='42501');
  await assert.rejects(reserve('deep-assessment-v1'),e=>e.code==='42501');
  assert.equal(await rpc('(select count(*)::int from marriage.demo_deep_usage)'),0);
  assert.equal((await reserve(modernConsent.consentVersion)).entries.length,47);
  await db.query("delete from marriage.member_answers where member_id=$1 and question_code='money_management'",[a.id]);
  await assert.rejects(reserve(modernConsent.consentVersion),e=>e.code==='22023');
  assert.equal(await rpc('(select attempts from marriage.demo_deep_usage where member_id=$1)',[a.id]),1);
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>rpc('marriage.marriage_demo_deep_reserve()')),e=>e.code==='42501');
 }finally{await db.close();}
});
