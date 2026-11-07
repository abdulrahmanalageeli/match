import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
test('rematch requires opt-in, fresh acceptance and preserves closed history',async()=>{
 const db=await createDatabase();
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>db.query('select '+sql+' value',args).then(r=>r.rows[0].value));
 async function add(gender,work='A',hard=false){
  const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const answers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']]));answers.wife_work=work;
  const payload={displayName:'مثال',age:30,city:'الرياض',gender,profession:'مهندس',bio:'وصف للاختبار',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false},assessmentVersion:'marriage-v2',surveyAnswers:answers,hardRequirements:hard?['wife_work']:[],marriageBasics:{smoking:'never',maritalStatus:'never_married'}};
  const state=await call(u,'public.marriage_apply($1)',[payload]);
  await asService(db,()=>db.query("select public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
 }

 try {
  const man=await add('man'),woman=await add('woman'),other=await add('woman');
  const first=await call(man,'public.marriage_request($1)',[woman.id]);
  await call(woman,"public.marriage_act($1,'accept')",[first]);
  await assert.rejects(call(other,'public.marriage_cancel($1,true)',[first]));
  await call(man,'public.marriage_cancel($1,true)',[first]);
  assert((await call(man,'public.marriage_browse()')).some(p=>p.id===woman.id));
  const second=await call(woman,'public.marriage_request($1)',[man.id]);
  assert.notEqual(first,second);
  assert.equal(await call(man,'public.marriage_request($1)',[woman.id]),second);
  await assert.rejects(call(woman,"public.marriage_act($1,'accept')",[second]));
  await call(man,"public.marriage_act($1,'accept')",[second]);
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[first])).rows[0].status,'cancelled');
  await call(man,'public.marriage_cancel($1,false)',[second]);
  await call(woman,'public.marriage_cancel($1,true)',[second]);
  await assert.rejects(call(woman,'public.marriage_request($1)',[man.id]));
  assert(!(await call(man,'public.marriage_browse()')).some(p=>p.id===woman.id));
  const blocked=await call(man,'public.marriage_request($1)',[other.id]);
  await call(other,"public.marriage_act($1,'accept')",[blocked]);
  await call(man,'public.marriage_cancel($1,true)',[blocked]);
  await call(other,"public.marriage_act($1,'block')",[blocked]);
  await assert.rejects(call(man,'public.marriage_request($1)',[other.id]));
 }finally{await db.close();}
});

test('pair rematch needs peer acceptance and acknowledges celebration per person',async()=>{
 const db=await createDatabase();const a='a'.repeat(64),b='b'.repeat(64);
 const rpc=(action,session,payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
 try{
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await rpc('close',a,{allowRematch:true});
  let s=await rpc('rematch_request',a);assert(!s.matched);assert.equal(s.rematchRequestedBy,'abdulrahman');
  await assert.rejects(rpc('rematch_accept',a));
  s=await rpc('rematch_accept',b);assert(s.matched);assert(s.matchCelebration);assert.equal(s.seriousness.status,'none');
  s=await rpc('match_seen',a,{key:s.matchCelebration});assert.equal(s.celebrationSeen.abdulrahman,s.matchCelebration);assert(!s.celebrationSeen.reham);
  await rpc('close',b,{allowRematch:false});await assert.rejects(rpc('rematch_request',a));
  await rpc('close',a,{allowRematch:true});await assert.rejects(rpc('rematch_request',a));
 }finally{await db.close();}
});
