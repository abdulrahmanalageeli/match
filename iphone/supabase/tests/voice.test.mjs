import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember,signCommunicationAgreement} from './communication-fixture.mjs';

function setup(db){
 const rpc=async(expression,args=[])=>(await db.query('select '+expression+' as value',args)).rows[0].value;
 const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
 const staff=(expression,args)=>asService(db,()=>rpc(expression,args));
 async function add(gender){
  const id=randomUUID(),u={id,email:id+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const appAccountToken=await seedCommunicationMember(db,u,gender);u.gender=gender;
  await staff('public.marriage_record_receipt($1,$2,false)',[id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken,
   originalTransactionId:id,transactionId:id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]);
  return u;
 }
 async function pair(a,b){const request=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[request]);await signCommunicationAgreement(call,a.gender==='woman'?a:b,a.gender==='man'?a:b,request);return request;}
 const start=(u,request,nonce=randomUUID())=>call(u,'public.marriage_call_start($1,$2)',[request,nonce]);
 const state=(u,id=null)=>call(u,'public.marriage_call_state($1)',[id]);
 const act=(u,id,action)=>call(u,'public.marriage_call_act($1,$2)',[id,action]);
 const grant=(u,id)=>call(u,'public.marriage_call_token_grant($1)',[id]);
 return {add,pair,start,state,act,grant,call};
}

test('voice requires accepted participants and mutual call consent; stable narrow credentials and private wakeups',async()=>{
 const db=await createDatabase();try{
  const {add,call,start,state,act,grant}=setup(db),a=await add('man'),b=await add('woman'),other=await add('woman');
  const request=await call(a,'public.marriage_request($1)',[b.id]);
  await assert.rejects(start(a,request),/غير متاحة/);
  await call(b,"public.marriage_act($1,'accept')",[request]);
  await assert.rejects(start(a,request),/غير متاحة/);
  await signCommunicationAgreement(call,b,a,request);
  await db.exec('delete from realtime.messages');
  const nonce=randomUUID(),ring=await start(a,request,nonce);
  assert.equal(ring.status,'ringing');assert.equal(ring.direction,'outgoing');assert.equal(ring.person.id,b.id);
  assert.equal((await start(a,request,nonce)).id,ring.id);
  assert.equal((await state(b)).direction,'incoming');assert.equal(await state(other),null);
  assert.equal(await grant(a,ring.id),null);assert.equal(await grant(b,ring.id),null);
  await assert.rejects(act(a,ring.id,'accept'),/قبول/);
  for(const operation of [()=>state(other,ring.id),()=>act(other,ring.id,'end'),()=>grant(other,ring.id),()=>start(other,request)])await assert.rejects(operation(),/غير متاحة/);
  const active=await act(b,ring.id,'accept');assert.equal(active.status,'active');assert(active.acceptedAt);
  assert.equal((await act(b,ring.id,'accept')).acceptedAt,active.acceptedAt);
  const first=await grant(a,ring.id),second=await grant(b,ring.id),renew=await grant(a,ring.id);
  assert.equal(first.channel,'n_'+ring.id.replaceAll('-',''));assert.equal(first.channel,second.channel);assert.equal(renew.uid,first.uid);
  assert.deepEqual([first.uid,second.uid],[1,2]);assert.equal(first.ttlSeconds,120);
  assert(Date.parse(first.expiresAt)>Date.now());assert(Date.parse(first.expiresAt)<=Date.now()+120000);
  assert.deepEqual(Object.keys(first).sort(),['callId','channel','expiresAt','ttlSeconds','uid']);
  const signals=(await db.query('select * from realtime.messages')).rows;
  assert.equal(signals.length,4); // exactly start and accept, two participants each
  assert(signals.every(m=>m.private&&m.event==='changed'&&Object.keys(m.payload).join()==='id'));
  assert.deepEqual(new Set(signals.map(m=>m.topic)),new Set([a,b].map(u=>'marriage:member:'+u.id)));
  const ended=await act(a,ring.id,'end');assert.equal(ended.endReason,'ended');assert.equal(await grant(b,ring.id),null);
  assert.equal((await act(b,ring.id,'accept')).status,'ended'); // late accept never resurrects
  assert.equal((await act(b,ring.id,'end')).endedAt,ended.endedAt);
 }finally{await db.close()}
});

test('voice serializes busy participants, preserves nonce idempotency and handles decline/cancel races',async()=>{
 const db=await createDatabase();try{
  const {add,pair,start,act,state}=setup(db),a=await add('man'),b=await add('woman'),c=await add('woman');
  const ab=await pair(a,b),ac=await pair(a,c),nonce=randomUUID(),ring=await start(a,ab,nonce);
  await assert.rejects(start(b,ab),/مكالمة أخرى/); // opposite simultaneous start
  await assert.rejects(start(c,ac),/مكالمة أخرى/); // a participant is busy as recipient
  await assert.rejects(start(a,ac),/مكالمة أخرى/);
  await assert.rejects(start(a,ac,nonce),/غير صالح/);
  assert.equal((await act(b,ring.id,'decline')).endReason,'declined');
  assert.equal((await act(a,ring.id,'end')).endReason,'declined');
  const next=await start(c,ac);assert.equal((await state(a)).id,next.id);
  assert.equal((await act(c,next.id,'end')).endReason,'cancelled');
  assert.equal((await act(a,next.id,'accept')).status,'ended');
  assert.equal((await start(a,ab,nonce)).id,ring.id); // an old network retry never rings again
 }finally{await db.close()}
});

test('ring timeout, individual participant lease and hard call deadline expire without a worker',async()=>{
 const db=await createDatabase();try{
  const {add,pair,start,state,act,grant}=setup(db),a=await add('man'),b=await add('woman'),request=await pair(a,b);
  const missed=await start(a,request);await db.query("update marriage.voice_calls set ringing_until=now()-interval '1 second' where id=$1",[missed.id]);
  assert.equal((await act(b,missed.id,'accept')).endReason,'missed');assert.equal(await grant(b,missed.id),null);
  const lease=await start(a,request);await act(b,lease.id,'accept');await grant(a,lease.id);
  await db.query("update marriage.voice_call_participants set lease_until=now()-interval '1 second' where call_id=$1 and member_id=$2",[lease.id,b.id]);
  assert.equal(await grant(a,lease.id),null);assert.equal((await state(b,lease.id)).endReason,'expired');
  const hard=await start(a,request);await act(b,hard.id,'accept');
  await db.query("update marriage.voice_calls set active_until=now()+interval '20 seconds' where id=$1",[hard.id]);
  assert((await grant(a,hard.id)).ttlSeconds<=20);
  await db.query("update marriage.voice_calls set active_until=now()-interval '1 second' where id=$1",[hard.id]);
  assert.equal((await state(a,hard.id)).endReason,'expired');
  await db.query("update marriage.voice_calls set ended_at=now()-interval '6 minutes'");assert.equal(await state(a),null);
 }finally{await db.close()}
});

test('pause and subscription expiry preserve voice; closed, blocked, unapproved, suspended and revoked sessions cannot renew it',async()=>{
 const db=await createDatabase();try{
  const {add,pair,start,state,act,grant,call}=setup(db),a=await add('man'),b=await add('woman'),request=await pair(a,b);
  const first=await start(a,request);await act(b,first.id,'accept');await grant(a,first.id);
  await db.query('delete from auth.sessions where id=$1',[a.sessionId]);
  await assert.rejects(grant(a,first.id),/تسجيل الدخول/);
  await db.query('insert into auth.sessions values($1,$2,null)',[a.sessionId,a.id]);
  await call(b,'public.marriage_pause(true)');assert(await grant(a,first.id));assert.equal((await state(a,first.id)).status,'active');
  await call(b,'public.marriage_pause(false)');
  for(const field of ['suspended','review_status']){
   await db.query('update marriage.members set '+field+'=$1 where id=$2',[field==='review_status'?'pending':true,b.id]);
   assert.equal(await grant(a,first.id),null);assert.equal((await state(a,first.id)).person,null);
   await assert.rejects(start(a,request),/غير متاحة/);
   await db.query('update marriage.members set '+field+'=$1 where id=$2',[field==='review_status'?'approved':false,b.id]);
  }
  // Restore the accepted request for isolated membership-expiry and block checks.
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[request]);
  const paid=await start(a,request);await act(b,paid.id,'accept');
  await db.query('update marriage.store_transactions set revoked=true');
  assert.ok(await grant(a,paid.id),'voice is shared by Free and Premium');assert.equal((await state(b,paid.id)).status,'active');
  assert.equal((await act(a,paid.id,'end')).status,'ended');
  await db.query('update marriage.store_transactions set revoked=false');
  const blocked=await start(a,request);await act(b,blocked.id,'accept');
  await call(b,"public.marriage_act($1,'block')",[request]);
  assert.equal((await db.query('select status from marriage.voice_calls where id=$1',[blocked.id])).rows[0].status,'ended');
  assert.equal(await grant(a,blocked.id),null);assert.equal((await state(a,blocked.id)).person,null);
  await assert.rejects(start(a,request),/غير متاحة/);
 }finally{await db.close()}
});

test('voice call and token issuance limits are enforced server-side',async()=>{
 const db=await createDatabase();try{
  const {add,pair,start,act,grant}=setup(db),a=await add('man'),b=await add('woman'),request=await pair(a,b);
  const active=await start(a,request);await act(b,active.id,'accept');
  for(let i=0;i<6;i++)assert(await grant(a,active.id));
  await assert.rejects(grant(a,active.id),/انتظر/);assert(await grant(b,active.id));
  await db.query("update marriage.voice_call_participants set token_window_at=now()-interval '61 seconds' where call_id=$1 and member_id=$2",[active.id,a.id]);
  assert(await grant(a,active.id));await act(a,active.id,'end');
  for(let i=0;i<2;i++){const ring=await start(a,request);await act(a,ring.id,'end');}
  await assert.rejects(start(a,request),/انتظر/);
 }finally{await db.close()}
});

test('voice tables and unchecked helpers are inaccessible to API roles',async()=>{
 const db=await createDatabase();try{
  const {add}=setup(db),a=await add('man');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role);
   for(const table of ['voice_calls','voice_call_participants'])await assert.rejects(db.query('select * from marriage.'+table),/permission denied/);
   await assert.rejects(db.query('select marriage.voice_refresh($1)',[a.id]),/permission denied/);
   await assert.rejects(db.query('select marriage.voice_allowed($1,$1,$1)',[a.id]),/permission denied/);
   if(role!=='authenticated')await assert.rejects(db.query('select public.marriage_call_state(null)'),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close()}
});

test('chat timeline persists only missed calls, preserves message RPCs, and revokes access with the thread', async () => {
 const db = await createDatabase();
 try {
  const {add,pair,start,act,call} = setup(db);
  const a = await add('man'), b = await add('woman'), other = await add('woman');
  const request = await pair(a,b);
  const page = (user, before = null) => call(user,'public.marriage_chat_timeline($1,$2)',[request,before]);
  const changed = (user, ids) => call(user,'public.marriage_chat_timeline_changes($1,$2)',[request,ids]);
  const textId = await call(a,'public.marriage_message($1,$2,$3)',[request,'مساء الخير',randomUUID()]);
  const declined = await start(a,request); await act(b,declined.id,'decline');
  const cancelled = await start(b,request); await act(b,cancelled.id,'end');
  const answered = await start(b,request); await act(a,answered.id,'accept'); await act(a,answered.id,'end');
  const ring = await start(a,request);
  const originalMessages = await call(b,'public.marriage_thread_page($1,null)',[request]);
  assert.deepEqual(await page(b),originalMessages);
  await db.query("update marriage.voice_calls set ringing_until = now() - interval '1 second' where id=$1",[ring.id]);

  await db.exec('delete from realtime.messages');
  // No call-state poll or native device event is needed to settle the timeout.
  const missed = {id:ring.id,createdAt:ring.createdAt,senderIsMe:false,body:'',missedCall:true};
  assert.deepEqual(await page(b),[...originalMessages,missed]);
  assert.deepEqual(await page(b),[...originalMessages,missed]);
  assert.deepEqual(await changed(a,[ring.id]),[{...missed,senderIsMe:true}]);
  const eventKey = 'missed_call:received:' + ring.id;
  const notices = await db.query('select member_id, request_id, target_id from marriage.notification_updates where event_key=$1', [eventKey]);
  assert.deepEqual(notices.rows, [{member_id:b.id,request_id:request,target_id:request}]);
  const received = (await call(b,'public.marriage_push_updates()',[])).filter(n=>n.event==='missed_call:received');
  assert.deepEqual(received.map(n=>n.target), [request]);
  const signals = (await db.query("select distinct topic from realtime.messages where private and event='changed' order by topic")).rows;
  assert.deepEqual(signals.map(row=>row.topic), [a.id,b.id].map(id=>'marriage:member:'+id).sort());
  assert.deepEqual(await changed(b,[textId,declined.id,cancelled.id,answered.id]),originalMessages);
  assert.deepEqual(await call(b,'public.marriage_thread_page($1,null)',[request]),originalMessages);
  assert.deepEqual(await page(b,ring.id),originalMessages);
  assert.deepEqual(await page(b,cancelled.id),[]);
  await assert.rejects(changed(a,Array(101).fill(ring.id)),/دفعات/);
  await assert.rejects(page(other),/غير متاحة/);
  await assert.rejects(changed(other,[ring.id]),/غير متاحة/);
  await call(b,"public.marriage_act($1,'block')",[request]);
  await assert.rejects(page(a),/غير متاحة/);
  await assert.rejects(changed(b,[ring.id]),/غير متاحة/);
 } finally { await db.close(); }
});

test('mixed call and message history has stable fifty-row pages even at a timestamp tie', async () => {
 const db = await createDatabase();
 try {
  const {add,pair,call} = setup(db);
  const a = await add('man'), b = await add('woman'), request = await pair(a,b);
  const textId = await call(a,'public.marriage_message($1,$2,$3)',[request,'رسالة قديمة',randomUUID()]);
  const stamp = '2026-01-01T10:00:00Z';
  await db.query('update marriage.thread_messages set created_at=$2 where id=$1',[textId,stamp]);
  await db.query(`insert into marriage.voice_calls(request_id, caller_id, callee_id, client_id, status, created_at, ended_at, end_reason)
   select $1,$2,$3,gen_random_uuid(),'ended',$4,$4,'missed' from generate_series(1,51)`,[request,a.id,b.id,stamp]);
  const page = before => call(b,'public.marriage_chat_timeline($1,$2)',[request,before]);
  const latest = await page(null), oldest = await page(latest[0].id);
  assert.equal(latest.length,50); assert.equal(oldest.length,2);
  const combined = [...oldest,...latest], ids = combined.map(row => row.id);
  assert.equal(new Set(ids).size,52); assert.deepEqual(ids,[...ids].sort());
  assert.equal(combined.filter(row => row.missedCall).length,51); assert(ids.includes(textId));
  assert.deepEqual(await page(oldest[0].id),[]);
  for (const role of ['anon','service_role']) {
   const access = await db.query("select has_function_privilege($1, 'public.marriage_chat_timeline(uuid,uuid)', 'execute') as allowed",[role]);
   assert.equal(access.rows[0].allowed,false);
  }
 } finally { await db.close(); }
});
