import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';
import {seedCommunicationMember,signCommunicationAgreement} from './communication-fixture.mjs';

async function fixture(db) {
 const rpc=async(sql,args=[]) => (await db.query('select '+sql+' as v',args)).rows[0].v;
 const call=(u,sql,args=[]) => asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 const service=(sql,args=[])=>asService(db,()=>rpc(sql,args));
 const add=async(gender,paid=true)=>{
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test',installation:randomUUID()};
  await addUser(db,u);
  const appAccountToken=await seedCommunicationMember(db,u,gender);
  if(paid) await service('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
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
  const mutual=await service("public.marriage_push_claim('sandbox',20)");assert.equal(mutual.length,1);assert.equal(mutual[0].token,a.id.replaceAll('-','').repeat(2));assert(mutual.every(j=>j.kind==='mutual'));
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
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[],'accepting does not notify the actor');
  await call(a,'public.marriage_message($1,$2,$3)',[request,'رسالة قبل تدوير الرمز',randomUUID()]);
  const [beforeRotation]=await service("public.marriage_push_claim('sandbox',20)");
  const rotatedToken=randomUUID().replaceAll('-','').repeat(2);
  await call(b,'public.marriage_push_register($1,$2,$3)',[rotatedToken,'sandbox',b.installation]);
  assert.deepEqual(await service('public.nisfayn_push_delivery($1,$2,false,$3)',[beforeRotation.id,beforeRotation.leaseId,beforeRotation.token]),{retry:true});
  await service("public.marriage_push_finish($1,$2,'invalid',$3)",[beforeRotation.id,beforeRotation.leaseId,beforeRotation.token]);
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

test('free paused recipient gets unread chat, shared badge total and scoped actions until read or blocked', async()=>{
 const db=await createDatabase();
 try {
  const {add,call,service}=await fixture(db);
  const sender=await add('woman'), recipient=await add('man',false);
  await call(recipient,'public.marriage_push_enable(true)');
  const id=await call(sender,'public.marriage_request($1)',[recipient.id]);
  await call(recipient,"public.marriage_act($1,'accept')",[id]);
  await signCommunicationAgreement(call,sender,recipient,id);
  await db.query('update marriage.members set paused=true where id=$1',[recipient.id]);
  const claim=()=>service("public.marriage_push_claim('sandbox',10)");
  const content=j=>service('public.nisfayn_push_content($1,$2,false)',[j.id,j.leaseId]);
  const firstId=randomUUID();
  await call(sender,'public.marriage_message($1,$2,$3)',[id,'أهلًا',firstId]);
  const [first]=await claim();assert.equal(first.kind,'message');
  let detail=await content(first);
  assert.equal(detail.preview,'private');assert.equal(detail.passive,false);
  assert.match(detail.scope,/^[a-f0-9]{64}$/);
  assert.deepEqual(await service('public.nisfayn_push_delivery($1,$2,false,$3)',[first.id,first.leaseId,first.token]),detail);
  await assert.rejects(call(sender,'public.nisfayn_push_delivery($1,$2,false,$3)',[first.id,first.leaseId,first.token]),/permission denied/);
  assert.equal(detail.badge,await call(recipient,'public.marriage_unread_count()'));assert.equal(detail.badge,1);
  await service("public.marriage_push_finish($1,$2,'sent')",[first.id,first.leaseId]);
  await call(sender,'public.marriage_message($1,$2,$3)',[id,'رسالة ثانية',randomUUID()]);
  const [second]=await claim();detail=await content(second);
  assert.equal(detail.passive,true);assert.equal(detail.badge,2);
  assert.equal(detail.badge,await call(recipient,'public.marriage_unread_count()'));
  await call(recipient,'public.marriage_push_controls($1)',[{sound:false}]);assert.equal((await content(second)).sound,false);
  await call(recipient,'public.marriage_push_controls($1)',[{message:false}]);assert.equal(await content(second),null);
  await call(recipient,'public.marriage_push_controls($1)',[{message:true}]);
  await call(recipient,'public.marriage_mark_thread_read($1,$2)',[id,detail.messageId]);assert.equal(await content(second),null);
  assert.equal(await call(recipient,'public.marriage_unread_count()'),0);
  await call(sender,'public.marriage_message($1,$2,$3)',[id,'تحديث',randomUUID()]);
  const [last]=await claim();
  await call(recipient,"public.marriage_act($1,'block')",[id]);
  assert.equal(await content(last),null);assert.equal(await call(recipient,'public.marriage_unread_count()'),0);
 } finally {await db.close();}
});

test('per-connection deadlines, optional analysis and local overnight quiet hours',async()=>{
 const db=await createDatabase();
 try {
  const {add,call,service}=await fixture(db);const a=await add('woman'),b=await add('man'),c=await add('woman');
  await call(b,'public.marriage_push_enable(true)');
  const make=async peer=>{
   const id=await call(peer,'public.marriage_request($1)',[b.id]);
   await call(b,"public.marriage_act($1,'accept')",[id]);return id;
  };
  const first=await make(a),second=await make(c);
  const date=new Date(Date.now()+4*3600000).toISOString();
  for(const id of [first,second])await db.query("insert into marriage.conversation_agreements(request_id,data) values($1,$2) on conflict(request_id) do update set data=excluded.data",[id,{status:'accepted',deadline:date}]);
  assert.equal(await service('public.nisfayn_enqueue_deadline_reminders()'),2);
  assert.equal(await service('public.nisfayn_enqueue_deadline_reminders()'),0);
  const jobs=await service("public.marriage_push_claim('sandbox',10)");assert.equal(jobs.length,2);
  const detail=j=>service('public.nisfayn_push_content($1,$2,false)',[j.id,j.leaseId]);
  assert.equal((await detail(jobs[0])).passive,true);
  await call(b,'public.marriage_push_controls($1)',[{reminder:false,quiet:true,start:22,end:7,zone:'Asia/Riyadh'}]);
  assert.equal(await detail(jobs[1]),null);
  await assert.rejects(call(b,'public.marriage_push_controls($1)',[{zone:'Not/AZone'}]),/Invalid notification/);
  const quiet=async utc=>(await db.query("select marriage.push_quiet(controls,$2) q from marriage.push_preferences where member_id=$1",[b.id,utc])).rows[0].q;
  assert.equal(await quiet('2026-11-18T19:00:00Z'),true);assert.equal(await quiet('2026-11-19T04:00:00Z'),false);
  const insert=async()=> (await db.query("insert into marriage.deep_analyses(connection_id,requester_id,recipient_id,status) values($1,$2,$3,'requested') returning id",[first,a.id,b.id])).rows[0].id;
  await insert();assert.deepEqual(await service("public.marriage_push_claim('sandbox',10)"),[]);
  await call(b,'public.marriage_push_controls($1)',[{analysis:true}]);const report=await insert();
  const [invite]=await service("public.marriage_push_claim('sandbox',10)");assert.equal(invite.kind,'analysis');
  assert.equal((await detail(invite)).preview,'private');
  await db.query("update marriage.deep_analyses set status='declined' where id=$1",[report]);assert.equal(await detail(invite),null);
  await db.query("update marriage.deep_analyses set status='shared',fingerprint=md5(jsonb_build_object('a',marriage.deep_evidence(requester_id),'b',marriage.deep_evidence(recipient_id))::text) where id=$1",[report]);
  const [ready]=await service("public.marriage_push_claim('sandbox',10)");assert.equal(ready.kind,'analysis');
  assert.equal((await detail(ready)).preview,'private');
 }finally {await db.close();}
});
