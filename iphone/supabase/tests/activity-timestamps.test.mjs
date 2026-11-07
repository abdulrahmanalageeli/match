import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('activity times use persisted events and are stable across reads',async()=>{
 const db=await createDatabase();
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>db.query('select '+sql+' value',args).then(r=>r.rows[0].value));
 async function add(gender){
  const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const state=await call(u,'public.marriage_apply($1)',[{displayName:'عضو',age:30,city:'الرياض',gender,profession:'معلّم',bio:'اختبار',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false}}]);
  await asService(db,()=>db.query("select public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
 }
 try{
  const a=await add('man'),b=await add('woman');await call(a,'public.marriage_discover()');
  const id=await call(a,'public.marriage_request($1)',[b.id]);
  const before=(await call(b,'public.marriage_inbox()'))[0];assert(before.createdAt);assert(before.updatedAt);
  assert.equal((await call(b,'public.marriage_inbox()'))[0].createdAt,before.createdAt);
  await call(b,"public.marriage_act($1,'accept')",[id]);
  assert.equal((await call(a,'public.marriage_progress($1)',[id])).updatedAt,undefined);
  const step=await call(a,'public.marriage_next_step($1,1,true,true)',[id]);assert(step.updatedAt);
  assert.equal((await call(b,'public.marriage_progress($1)',[id])).updatedAt,step.updatedAt);
  const room=async()=>(await db.query('select data from nisfayn_test.room')).rows[0].data;
  assert.equal((await room()).journeyUpdatedAt,undefined);
  await db.exec(`update nisfayn_test.room set data=data||'{"agree":{"reham":true}}'::jsonb`);
  const stamp=(await room()).journeyUpdatedAt;assert(stamp);
  await db.exec(`update nisfayn_test.room set data=data||'{"read":{"reham":"2026-11-06"}}'::jsonb`);
  assert.equal((await room()).journeyUpdatedAt,stamp);
  assert.equal((await room()).matchedAt,undefined);
  await db.exec(`update nisfayn_test.room set data=data||'{"matched":false}'::jsonb;update nisfayn_test.room set data=data||'{"matched":true}'::jsonb;`);
  assert((await room()).matchedAt);
 }finally{await db.close();}
});
