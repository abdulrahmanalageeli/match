import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';
import {seedCommunicationMember,signCommunicationAgreement} from './communication-fixture.mjs';

async function fixture(db) {
 const rpc=async(sql,args=[]) => (await db.query('select '+sql+' as v',args)).rows[0].v;
 const call=(u,sql,args=[]) => asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 const service=(sql,args=[])=>asService(db,()=>rpc(sql,args));
 const add=async(gender)=>{
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test',installation:randomUUID()};
  await addUser(db,u);
  const appAccountToken=await seedCommunicationMember(db,u,gender);
  await service('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  await call(u,'public.marriage_push_register($1,$2,$3)',[u.id.replaceAll('-','').repeat(2),'sandbox',u.installation]);
  return u;
 };
 return {rpc,call,service,add};
}

test('private push queue enforces opt-in, recipient, environment, consent, dedup and leases',async()=>{
 const db=await createDatabase();
 try {
  const {add,call,service}=await fixture(db);const a=await add('woman'),b=await add('man');
  assert.equal((await call(a,'public.marriage_push_settings()')).enabled,false);
  await call(a,'public.marriage_push_enable(true)');await call(b,'public.marriage_push_enable(true)');
  const request=await call(a,'public.marriage_request($1)',[b.id]);
  await assert.rejects(call(a,"public.marriage_push_claim('sandbox',20)"),/permission denied/);
  await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select * from marriage.push_devices'),/permission denied/));
  assert.deepEqual(await service("public.marriage_push_claim('production',20)"),[]);
  const pending=await service("public.marriage_push_claim('sandbox',20)");
  assert.equal(pending.length,1);assert.equal(pending[0].kind,'request');assert.equal(pending[0].requestId,request);
  assert(!JSON.stringify(pending).includes('@example.test'));assert(!JSON.stringify(pending).includes('مثال'));
  assert.equal(await service('public.marriage_push_validate($1,$2)',[pending[0].id,pending[0].leaseId]),true);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
  assert.equal(await service("public.marriage_push_finish($1,$2,'sent')",[pending[0].id,randomUUID()]),false);
  await service("public.marriage_push_finish($1,$2,'sent')",[pending[0].id,pending[0].leaseId]);
  await call(b,"public.marriage_act($1,'accept')",[request]);
  await signCommunicationAgreement(call,a,b,request);
  const mutual=await service("public.marriage_push_claim('sandbox',20)");assert.equal(mutual.length,2);assert(mutual.every(j=>j.kind==='mutual'));
  for(const job of mutual) await service("public.marriage_push_finish($1,$2,'sent')",[job.id,job.leaseId]);
  const client=randomUUID();await call(a,'public.marriage_message($1,$2,$3)',[request,'رسالة خاصة يجب ألا تدخل الإشعار',client]);
  await call(a,'public.marriage_message($1,$2,$3)',[request,'رسالة خاصة يجب ألا تدخل الإشعار',client]);
  const messages=await service("public.marriage_push_claim('sandbox',20)");assert.equal(messages.length,1);assert.equal(messages[0].kind,'message');
  assert(!JSON.stringify(messages).includes('رسالة'));
  await call(b,"public.marriage_act($1,'block')",[request]);
  assert.equal(await service('public.marriage_push_validate($1,$2)',[messages[0].id,messages[0].leaseId]),false);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
 } finally {await db.close();}
});

test('push stops on opt-out and signout and invalid device is deleted',async()=>{
 const db=await createDatabase();
 try {
  const {add,call,service}=await fixture(db);const a=await add('woman'),b=await add('man');
  await call(b,'public.marriage_push_enable(true)');
  const request=await call(a,'public.marriage_request($1)',[b.id]);
  const queue=await service("public.marriage_push_claim('sandbox',20)");assert.equal(queue.length,1);
  await call(b,'public.marriage_push_enable(false)');
  assert.equal(await service('public.marriage_push_validate($1,$2)',[queue[0].id,queue[0].leaseId]),false);
  await call(b,'public.marriage_push_enable(true)');await call(b,"public.marriage_act($1,'accept')",[request]);
  await signCommunicationAgreement(call,a,b,request);
  const mutual=await service("public.marriage_push_claim('sandbox',20)");assert.equal(mutual.length,1);
  const rotatedToken=randomUUID().replaceAll('-','').repeat(2);
  await call(b,'public.marriage_push_register($1,$2,$3)',[rotatedToken,'sandbox',b.installation]);
  await service("public.marriage_push_finish($1,$2,'invalid',$3)",[mutual[0].id,mutual[0].leaseId,mutual[0].token]);
  assert.equal((await db.query('select token from marriage.push_devices where member_id=$1',[b.id])).rows[0].token,rotatedToken);
  await call(a,'public.marriage_message($1,$2,$3)',[request,'اختبار تدوير الرمز',randomUUID()]);
  const rotated=await service("public.marriage_push_claim('sandbox',20)");assert.equal(rotated.length,1);
  await service("public.marriage_push_finish($1,$2,'invalid',$3)",[rotated[0].id,rotated[0].leaseId,rotated[0].token]);
  assert.equal((await db.query('select count(*)::int as n from marriage.push_devices where member_id=$1',[b.id])).rows[0].n,0);
  await call(b,'public.marriage_push_register($1,$2,$3)',[b.id.replaceAll('-','').repeat(2),'sandbox',b.installation]);
  await call(a,'public.marriage_message($1,$2,$3)',[request,'اختبار',randomUUID()]);
  await db.query('delete from auth.sessions where id=$1',[b.sessionId]);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
  await assert.rejects(call(b,'public.marriage_push_settings()'),/تسجيل الدخول/);
 } finally {await db.close();}
});
