import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
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
  assert.deepEqual(await call(a,'public.marriage_push_privacy(null)'),{preview:'private',configured:false});
  assert.deepEqual(await call(a,"public.marriage_push_privacy('name')"),{preview:'name',configured:true});
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
  const accepted=await service("public.marriage_push_claim('sandbox',20)");
  assert.deepEqual(accepted.map(job=>job.kind).sort(),['mutual','update']);
  assert(accepted.every(job=>job.token===a.id.replaceAll('-','').repeat(2)));
  const signed=accepted.find(job=>job.kind==='update');
  const signedDetail=await service('public.nisfayn_push_delivery($1,$2,false,$3)',[signed.id,signed.leaseId,signed.token]);
  assert.equal(signedDetail.event,'agreement:signed');
  assert.equal(signedDetail.target,request);
  for(const job of accepted) await service("public.marriage_push_finish($1,$2,'sent')",[job.id,job.leaseId]);
  await db.query("insert into marriage.activity_notifications(recipient_id,actor_id,kind,event_key) values($1,$2,'interest',$3)",[b.id,a.id,randomUUID()]);
  const [interest]=await service("public.marriage_push_claim('sandbox',20)");
  assert.equal((await service('public.nisfayn_push_delivery($1,$2,false,$3)',[interest.id,interest.leaseId,interest.token])).target,a.id);
  await service("public.marriage_push_finish($1,$2,'sent')",[interest.id,interest.leaseId]);
  await db.query("insert into marriage.activity_notifications(recipient_id,actor_id,kind,request_id,event_key) values($1,$2,'screenshot',$3,$4)",[b.id,a.id,request,randomUUID()]);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
  await call(b,'public.marriage_push_controls($1)',[{screenshot:true}]);
  await db.query("insert into marriage.activity_notifications(recipient_id,actor_id,kind,request_id,event_key) values($1,$2,'screenshot',$3,$4)",[b.id,a.id,request,randomUUID()]);
  const [capture]=await service("public.marriage_push_claim('sandbox',20)");
  const captureDetail=await service('public.nisfayn_push_delivery($1,$2,false,$3)',[capture.id,capture.leaseId,capture.token]);
  assert.equal(captureDetail.event,'screenshot:received');
  assert.equal(captureDetail.target,request);
  assert.equal(captureDetail.passive,true);
  await service("public.marriage_push_finish($1,$2,'sent')",[capture.id,capture.leaseId]);
  assert.deepEqual(await call(b,'public.marriage_push_thread_mute($1,null)',[request]),{muted:false});
  assert.deepEqual(await call(b,'public.marriage_push_thread_mute($1,true)',[request]),{muted:true});
  await call(a,'public.marriage_message($1,$2,$3)',[request,'رسالة مكتومة',randomUUID()]);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
  assert.deepEqual(await call(b,'public.marriage_push_thread_mute($1,false)',[request]),{muted:false});
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

test('account updates route to the right record and remain available in-app with push disabled',async()=>{
 const db=await createDatabase();
 try {
  const {add,call,service}=await fixture(db);
  const member=await add('woman'),other=await add('man');
  await call(member,'public.marriage_push_enable(true)');
  const ticket=randomUUID(),conduct=randomUUID();
  await db.query("insert into marriage.support_requests(id,owner_id,client_id,category,subject,body) values($1,$2,$3,'help','Help','Question for support')",[ticket,member.id,randomUUID()]);
  await db.query("update marriage.support_requests set response='Private reply' where id=$1",[ticket]);
  const [job]=await service("public.marriage_push_claim('sandbox',20)");
  assert.equal(job.kind,'update');
  assert.equal(job.requestId,null);
  const detail=await service('public.nisfayn_push_delivery($1,$2,false,$3)',[job.id,job.leaseId,job.token]);
  assert.equal(detail.event,'support:reply');
  assert.equal(detail.target,ticket);
  assert(!JSON.stringify(detail).includes('Private reply'));
  assert.equal((await call(member,'public.marriage_support_ticket($1)',[ticket])).response,'Private reply');
  assert.equal(await call(other,'public.marriage_support_ticket($1)',[ticket]),null);
  await call(member,'public.marriage_push_enable(false)');
  await db.query("insert into marriage.conduct_cases(id,member_id,kind,origin,policy,explanation) values($1,$2,'warning','staff','safety','Private reason')",[conduct,member.id]);
  assert.deepEqual(await service("public.marriage_push_claim('sandbox',20)"),[]);
  const rows=await call(member,'public.marriage_push_updates()');
  assert.deepEqual(rows.map(row=>row.event).sort(),['application:approved','safety:review','support:reply']);
  assert.equal(rows.find(row=>row.event==='safety:review').target,conduct);
  assert(!JSON.stringify(rows).includes('Private reason'));
  assert.deepEqual((await call(other,'public.marriage_push_updates()')).map(row=>row.event),['application:approved']);
  const first=rows[0];
  await call(other,'public.marriage_push_updates($1)',[first.id]);
  assert.equal((await call(member,'public.marriage_push_updates()')).find(row=>row.id===first.id).unread,true);
  await call(member,'public.marriage_push_updates($1)',[first.id]);
  assert.equal((await call(member,'public.marriage_push_updates()')).find(row=>row.id===first.id).unread,false);
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
  const {receipt,...nativeDetail}=await service('public.nisfayn_push_delivery($1,$2,false,$3)',[first.id,first.leaseId,first.token]);
  assert.deepEqual(nativeDetail,detail);assert.equal(receipt.job,first.id);
  await assert.rejects(call(sender,'public.nisfayn_push_delivery($1,$2,false,$3)',[first.id,first.leaseId,first.token]),/permission denied/);
  assert.equal(detail.badge,await call(recipient,'public.marriage_unread_count()'));assert.equal(detail.badge,1);
  await service("public.marriage_push_finish($1,$2,'sent')",[first.id,first.leaseId]);
  const messageState=async messageId=>(await call(sender,'public.marriage_message_changes($1,$2)',[id,[messageId]]))[0];
  const acknowledge=async(job,proof)=>{
   await db.exec('set role anon');
   try {await db.query('select public.wudayn_confirm_notification($1,$2)',[job,proof]);} finally {await db.exec('reset role');}
  };
  assert.equal((await messageState(detail.messageId)).deliveredAt,null,'provider acceptance alone never marks a device receipt');
  await acknowledge(first.id,randomUUID());
  assert.equal((await messageState(detail.messageId)).deliveredAt,null);
  await db.exec('truncate realtime.messages');
  await acknowledge(first.id,receipt.proof);
  const delivered=await messageState(detail.messageId);assert.ok(delivered.deliveredAt);assert.equal(delivered.readByPeer,false);
  const wakes=async()=>(await db.query("select topic,event,private from realtime.messages where event='changed'")).rows;
  assert.deepEqual(await wakes(),[{topic:'marriage:member:'+sender.id,event:'changed',private:true}]);
  await acknowledge(first.id,receipt.proof);
  assert.equal((await messageState(detail.messageId)).deliveredAt,delivered.deliveredAt,'duplicate device acknowledgments are idempotent');
  assert.equal((await wakes()).length,1);
  await call(sender,'public.marriage_message($1,$2,$3)',[id,'رسالة ثانية',randomUUID()]);
  const [second]=await claim();detail=await content(second);
  await acknowledge(second.id,receipt.proof);
  assert.equal((await messageState(detail.messageId)).deliveredAt,null,'proof is scoped to its exact job');
  await call(sender,'public.marriage_confirm_thread_delivery($1,$2)',[id,[detail.messageId]]);
  assert.equal((await messageState(detail.messageId)).deliveredAt,null,'senders cannot mark their own messages delivered');
  await call(recipient,'public.marriage_confirm_thread_delivery($1,$2)',[id,[detail.messageId]]);
  assert.ok((await messageState(detail.messageId)).deliveredAt);
  assert.equal(detail.passive,true);assert.equal(detail.badge,2);
  assert.equal(detail.badge,await call(recipient,'public.marriage_unread_count()'));
  await call(recipient,'public.marriage_push_controls($1)',[{sound:false}]);assert.equal((await content(second)).sound,false);
  await call(recipient,'public.marriage_push_controls($1)',[{message:false}]);assert.equal(await content(second),null);
  await call(recipient,'public.marriage_push_controls($1)',[{message:true}]);
  await call(recipient,'public.marriage_mark_thread_read($1,$2)',[id,detail.messageId]);assert.equal(await content(second),null);
  assert.equal(await call(recipient,'public.marriage_unread_count()'),0);
  await call(sender,'public.marriage_message($1,$2,$3)',[id,'تحديث',randomUUID()]);
  const [last]=await claim();
  const lastDetail=await service('public.nisfayn_push_delivery($1,$2,false,$3)',[last.id,last.leaseId,last.token]);
  await db.query("update marriage.push_outbox set expires_at=now()-interval '1 second' where id=$1",[last.id]);
  await acknowledge(last.id,lastDetail.receipt.proof);
  assert.equal((await messageState(lastDetail.messageId)).deliveredAt,null,'expired proof cannot confirm delivery');
  await db.query("update marriage.push_outbox set expires_at=now()+interval '1 minute' where id=$1",[last.id]);
  await call(recipient,"public.marriage_act($1,'block')",[id]);
  await acknowledge(last.id,lastDetail.receipt.proof);
  assert.equal((await db.query('select device_delivered_at from marriage.thread_messages where id=$1',[lastDetail.messageId])).rows[0].device_delivered_at,null);
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
  const claim=()=>service("public.marriage_push_claim('sandbox',20)");
  const delivery=job=>service('public.nisfayn_push_delivery($1,$2,false,$3)',[job.id,job.leaseId,job.token]);
  const notices=async member=>(await call(member,'public.marriage_push_updates(null)'))
   .filter(item=>item.event.startsWith('analysis:')&&item.target===first);
  const token=member=>member.id.replaceAll('-','').repeat(2);
  const secondToken=randomUUID().replaceAll('-','').repeat(2);
  await call(b,'public.marriage_push_register($1,$2,$3)',[secondToken,'sandbox',randomUUID()]);
  const optional=await insert();
  assert.deepEqual(await claim(),[],'analysis push requires category opt-in');
  assert.deepEqual((await notices(b)).map(row=>row.event),['analysis:invited'],'the in-app invitation remains available');
  await db.query("update marriage.deep_analyses set status='declined' where id=$1",[optional]);
  for(const member of [a,b,c]){
   await call(member,'public.marriage_push_enable(true)');
   await call(member,'public.marriage_push_controls($1)',[{analysis:true}]);
  }
  const hour=(await db.query("select extract(hour from now() at time zone 'Asia/Riyadh')::int h")).rows[0].h;
  await call(b,'public.marriage_push_controls($1)',[{quiet:true,start:(hour+23)%24,end:(hour+2)%24,zone:'Asia/Riyadh'}]);
  const expectJobs=async(phase,report,tokens)=>{
   const keys=['analysis:'+phase+':'+report];
   if(phase==='invited')keys.push('analysis:requested:'+report);
   const queued=(await db.query('select o.kind,d.token from marriage.push_outbox o join marriage.push_devices d using(installation_id) where o.event_key=any($1::text[])',[keys])).rows;
   assert.deepEqual(queued.map(row=>row.token).sort(),[...tokens].sort(),phase+' must enqueue one job per eligible installation');
   assert(queued.every(row=>row.kind==='update'));
   const batch=await claim();
   assert.deepEqual(batch.map(job=>job.token).sort(),[...tokens].sort(),phase+' must reach each intended installation exactly once');
   for(const job of batch){
    assert.equal(job.kind,'update');assert.equal(job.requestId,first);
    const payload=await delivery(job);
    assert.equal(payload.event,'analysis:'+phase);assert.equal(payload.target,first);assert.equal(payload.preview,'private');
    if([token(b),secondToken].includes(job.token))assert.equal(payload.passive,true);
   }
   assert.deepEqual(await claim(),[]);
   return batch;
  };
  const invitation=await insert();
  await db.query("update marriage.deep_analyses set status='requested' where id=$1",[invitation]);
  const invites=await expectJobs('invited',invitation,[token(b),secondToken]);
  assert.deepEqual(await notices(a),[]);assert.deepEqual(await notices(c),[]);
  const invitations=await notices(b);assert.equal(invitations.length,1);
  const [notice]=invitations;
  await call(c,'public.marriage_push_updates($1)',[notice.id]);
  assert.equal((await notices(b))[0].unread,true,'an outsider cannot mark the participant’s invitation read');
  await call(b,'public.marriage_push_controls($1)',[{analysis:false}]);
  assert.equal(await delivery(invites[0]),null,'revoking opt-in invalidates a worker lease');
  await call(b,'public.marriage_push_controls($1)',[{analysis:true}]);
  await call(b,"public.marriage_deep_analysis($1,'decline')",[first]);
  for(const job of invites)assert.equal(await delivery(job),null);
  assert.deepEqual(await notices(b),[]);

  const report=await insert();
  await db.query("update marriage.deep_analyses set status='shared',fingerprint=md5(jsonb_build_object('a',marriage.deep_evidence(requester_id),'b',marriage.deep_evidence(recipient_id))::text) where id=$1",[report]);
  const shared=await expectJobs('shared',report,[token(a),token(b),secondToken]);
  for(const member of [a,b])assert.deepEqual((await notices(member)).map(row=>row.event),['analysis:shared']);
  assert.deepEqual(await notices(c),[]);
  await db.query("insert into marriage.personality_answers select $1,code,'C' from marriage.personality_questions where ordinal=1",[a.id]);
  for(const job of shared)assert.equal(await delivery(job),null,'a changed answer invalidates a previously leased shared report alert');
  for(const member of [a,b])assert.deepEqual(await notices(member),[]);
  await db.query("update marriage.push_outbox set lease_until=now()-interval '1 second' where id=any($1::uuid[])",[shared.map(job=>job.id)]);
  assert.deepEqual(await claim(),[],'stale analysis notifications cannot be retried');
 }finally {await db.close();}
});

test('analysis push migration reconciles outstanding invitations without redelivering sent invitations or losing a worker lease',async()=>{
 const db=await createDatabase({throughMigration:'20261127221139_strict_discovery_recommendations.sql'});
 try{
  const {add,call,service}=await fixture(db);
  const a=await add('woman'),b=await add('man');
  const connection=await call(a,'public.marriage_request($1)',[b.id]);
  await call(b,"public.marriage_act($1,'accept')",[connection]);
  await call(b,'public.marriage_push_enable(true)');
  await call(b,'public.marriage_push_controls($1)',[{analysis:true}]);

  // Each real historical insert enqueues the legacy and actionable jobs together.
  // Columns are the starting states of those jobs and the expected surviving kind.
  const cases=[
   ['pending','pending','update'],
   ['leased','pending','analysis'],
   ['pending','leased','update'],
   ['leased','leased','update'],
   ['sent','leased',null],
   ['leased','sent',null],
   ['failed','pending','update'],
   ['pending','revoked','analysis'],
   ['pending','expired','analysis'],
   ['pending','exhausted','analysis'],
   ['pending','absent','analysis'],
   ['absent','pending','update']
  ];
  const expected=new Set(), sent=new Set(), activeLeases=new Map(), twins=[];
  for(const [legacy,canonical,winner] of cases){
   const report=(await db.query("insert into marriage.deep_analyses(connection_id,requester_id,recipient_id,status) values($1,$2,$3,'requested') returning id",[connection,a.id,b.id])).rows[0].id;
   const jobs=(await db.query("select id,kind from marriage.push_outbox where installation_id=$1 and event_key in ($2,$3)",[b.installation,'analysis:requested:'+report,'analysis:invited:'+report])).rows;
   assert.deepEqual(jobs.map(job=>job.kind).sort(),['analysis','update'],'the fixture must contain two genuine historical jobs');
   for(const {id,kind} of jobs){
    const state=kind==='analysis'?legacy:canonical;
    if(state==='absent'){await db.query('delete from marriage.push_outbox where id=$1',[id]);continue;}
    twins.push(id);
    if(kind===winner)expected.add(id);
    if(state==='leased'){
     const lease=randomUUID();activeLeases.set(id,lease);
     await db.query("update marriage.push_outbox set lease_id=$2,lease_until=now()+interval '10 minutes',attempts=1 where id=$1",[id,lease]);
    }else if(['failed','revoked','sent'].includes(state)){
     await db.query('update marriage.push_outbox set finished_at=now(),outcome=$2 where id=$1',[id,state]);
     if(state==='sent')sent.add(id);
    }else if(state==='expired'){
     await db.query("update marriage.push_outbox set expires_at=now()-interval '1 minute' where id=$1",[id]);
    }else if(state==='exhausted'){
     await db.query('update marriage.push_outbox set attempts=5 where id=$1',[id]);
    }
   }
  }
  const dir=new URL('../migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(file=>file.endsWith('_deduplicate_deep_analysis_notifications.sql'));
  assert.equal(files.length,1);
  await db.exec((await readFile(new URL(files[0],dir),'utf8')).replace(/\r\n/g,'\n'));
  const rows=(await db.query('select id,outcome,finished_at from marriage.push_outbox where id=any($1::uuid[])',[twins])).rows;
  assert.deepEqual(new Set(rows.filter(row=>row.finished_at===null).map(row=>row.id)),expected);
  assert.deepEqual(new Set(rows.filter(row=>row.outcome==='sent').map(row=>row.id)),sent);
  const claim=()=>service("public.marriage_push_claim('sandbox',50)");
  const available=await claim();
  const seen=new Set(available.map(job=>job.id));
  for(const [id,lease] of activeLeases){
   assert.equal(await service('public.marriage_push_validate($1,$2)',[id,lease]),expected.has(id),'the worker must revalidate an existing lease');
   if(expected.has(id)){assert(!seen.has(id));seen.add(id);}
  }
  assert.deepEqual(seen,expected,'every survivor is claimed exactly once or already held by a valid worker');
  assert.deepEqual(await claim(),[]);
 }finally{await db.close();}
});
