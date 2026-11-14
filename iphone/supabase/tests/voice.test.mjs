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

test('discovery pause preserves voice; closed, blocked, unapproved, suspended, unpaid and revoked sessions cannot renew it',async()=>{
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
  assert.equal(await grant(a,paid.id),null);assert.equal((await state(b,paid.id)).endReason,'unavailable');
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
