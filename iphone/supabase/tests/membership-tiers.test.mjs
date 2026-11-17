import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
import {seedCommunicationMember,signCommunicationAgreement} from './communication-fixture.mjs';

test('Premium permits three connections, free recipients one, and expiry preserves existing connections',async()=>{
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender,paid=false){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);await seedCommunicationMember(db,u,gender);if(paid)await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[u.id]);return u;}
 try{
  const man=await member('man',true),other=await member('man',true);
  const women=[];for(let n=0;n<4;n++)women.push(await member('woman'));
  for(const woman of women.slice(0,3)){
   const id=await call(man,'public.marriage_request($1)',[woman.id]);
   await call(woman,"public.marriage_act($1,'accept',null)",[id]);
  }
  await assert.rejects(call(man,'public.marriage_request($1)',[women[3].id]));
  await assert.rejects(call(other,'public.marriage_request($1)',[women[0].id]));
  const cards=await call(other,'public.marriage_browse($1)',[{mode:'all'}]);
  assert.equal(cards.find(p=>p.id===women[0].id)?.atCapacity,true);
  assert.equal(cards.find(p=>p.id===women[3].id)?.atCapacity,false);
  await db.query('update marriage.members set manual_access_until=null where id=$1',[man.id]);
  assert.equal((await call(man,'public.marriage_inbox()')).filter(c=>c.status==='accepted').length,3);
  assert.equal(await rpc('marriage.connection_limit($1)',[man.id]),1);
 }finally{await db.close();}
});

test('free members browse, accept and communicate; only premium can initiate and see full scores',async()=>{
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const member=async gender=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);await seedCommunicationMember(db,u,gender);return u;};
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 try{
  const man=await member('man'),woman=await member('woman'),other=await member('woman');
  const free=await call(man,'public.marriage_browse($1)',[{mode:'all'}]);
  assert.equal(free.length,2);assert.ok(free.every(p=>!p.fit&&p.compatibilityLocked&&p.premium===false));
  const hiddenThreshold=await call(man,'public.marriage_browse($1)',[{mode:'all',minFit:100}]);
  assert.deepEqual(hiddenThreshold.map(p=>p.id).sort(),free.map(p=>p.id).sort(),'free filters cannot probe hidden scores');
  const rec=await call(man,'public.marriage_browse($1)',[{mode:'recommended'}]);
  assert.ok(rec.length);assert.ok(rec.every(p=>'recommendationPercentage' in p&&!p.fit));
  await assert.rejects(call(man,'public.marriage_request($1)',[woman.id]));
  await call(man,'public.marriage_discovery_action($1,$2,$3)',[woman.id,'interest',null]);
  const interested=await call(man,'public.marriage_browse($1)',[{mode:'all'}]);
  assert.equal(interested.find(p=>p.id===woman.id)?.interested,true,'free members can express interest');
  await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[man.id]);
  const paid=await call(man,'public.marriage_browse($1)',[{mode:'all'}]);assert.ok(paid.every(p=>p.fit));
  const request=await call(man,'public.marriage_request($1)',[woman.id]);
  const inbox=await call(woman,'public.marriage_inbox()');assert.equal(inbox[0].person.premium,true);assert.equal(inbox[0].person.fit,undefined);
  await call(woman,'public.marriage_act($1,$2,$3)',[request,'accept',null]);
  await db.query('update marriage.members set manual_access_until=null where id=$1',[man.id]);
  await assert.rejects(call(woman,'public.marriage_message($1,$2,$3)',[request,'قبل الاتفاق',randomUUID()]),/اتفاق/);
  await signCommunicationAgreement(call,woman,man,request);
  await call(woman,'public.marriage_message($1,$2,$3)',[request,'أهلًا',randomUUID()]);
  await call(man,'public.marriage_message($1,$2,$3)',[request,'مرحبًا',randomUUID()]);
  assert.equal((await call(man,'public.marriage_inbox()')).length,1,'conversations survive subscription expiry');
  const paused=await call(man,'public.marriage_pause(true)');assert.equal(paused.user.paused,true);
  assert.equal((await call(man,'public.marriage_inbox()')).length,1,'free pause preserves accepted conversations');
  await call(man,'public.marriage_message($1,$2,$3)',[request,'تواصل أثناء إيقاف الظهور',randomUUID()]);
  const resumed=await call(man,'public.marriage_pause(false)');assert.equal(resumed.user.paused,false);
  // Shared benefits must work after both participants have returned to Free.
  const ring=await call(man,'public.marriage_call_start($1,$2)',[request,randomUUID()]);
  assert.equal(ring.status,'ringing');
  assert.equal((await call(woman,"public.marriage_call_act($1,'accept')",[ring.id])).status,'active');
  assert.ok(await call(man,'public.marriage_call_token_grant($1)',[ring.id]));
  await call(man,"public.marriage_call_act($1,'end')",[ring.id]);
  const invite=await call(woman,'public.marriage_family($1,$2)',['invite_link',{relationship:'father'}]);
  assert.ok(invite.token,'free members can invite family');
  await call(woman,'public.marriage_family($1,$2)',['consent',{connectionId:request,agree:true}]);
  await call(man,'public.marriage_family($1,$2)',['consent',{connectionId:request,agree:true}]);
  await call(woman,'public.marriage_next_step($1,1,true,true)',[request]);
  assert.equal((await call(man,'public.marriage_next_step($1,1,true,true)',[request])).exclusive,true);
  await assert.rejects(call(other,'public.marriage_message($1,$2,$3)',[request,'intruder',randomUUID()]));
  await call(woman,'public.marriage_act($1,$2,$3)',[request,'block',null]);
  await assert.rejects(call(man,'public.marriage_message($1,$2,$3)',[request,'blocked',randomUUID()]));
 }finally{await db.close();}
});

test('launch trial allocation is server-only, idempotent and capped at 50 per gender',async()=>{
 const db=await createDatabase();let serial=100000;
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' as value',args)).rows[0].value;
 const prepare=(u,apple,claim)=>asService(db,()=>rpc('public.marriage_prepare_launch_offer($1,$2,$3)',[u.id,apple,claim]));
 try{
  for(const gender of ['man','woman']){
   const users=[];
   for(let i=0;i<51;i++){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);await seedCommunicationMember(db,u,gender);users.push(u);}
   const apple=String(++serial);
   assert.equal((await prepare(users[0],apple,true)).eligible,false,'campaign defaults off');
   await db.query('update marriage.launch_offer_campaigns set enabled=true where gender=$1',[gender]);
   assert.equal((await prepare(users[0],apple,false)).eligible,true);
   assert.equal((await db.query('select count(*)::int as n from marriage.launch_offer_claims where gender=$1',[gender])).rows[0].n,0,'viewing never reserves');
   await assert.rejects(asMember(db,users[0].id,users[0].sessionId,()=>rpc('public.marriage_prepare_launch_offer($1,$2,true)',[users[0].id,apple])));
   assert.equal((await prepare(users[0],apple,true)).eligible,true);
   assert.equal((await prepare(users[0],apple,true)).eligible,true,'retry reuses its slot');
   await assert.rejects(prepare(users[1],apple,true),/آخر/);
   for(let i=1;i<50;i++)assert.equal((await prepare(users[i],String(++serial),true)).eligible,true);
   assert.equal((await prepare(users[50],String(++serial),true)).eligible,false);
   assert.equal((await db.query('select count(*)::int as n from marriage.launch_offer_claims where gender=$1',[gender])).rows[0].n,50);
   assert.equal((await rpc('marriage.member_state($1)',[users[0].id])).membership.active,false,'reservation grants no premium');
   const state=await rpc('marriage.member_state($1)',[users[0].id]);
   const receipt={bundleId:'com.blindmatch.marriage',appAccountToken:state.user.appAccountToken,
    appTransactionId:apple,offerType:1,offerDiscountType:'FREE_TRIAL',originalTransactionId:randomUUID(),transactionId:randomUUID(),
    productId:`com.blindmatch.marriage.monthly.${gender==='man'?'men':'women'}`,environment:'Sandbox',signedDate:Date.now(),expiresDate:Date.now()+7*86400000};
   const record=r=>asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[users[0].id,r]));
   await assert.rejects(record({...receipt,appTransactionId:'999'}),/حجز/);
   assert.equal((await record(receipt)).membership.active,true);
   assert.equal((await record(receipt)).membership.active,true,'trial delivery is idempotent');
   await assert.rejects(record({...receipt,originalTransactionId:randomUUID(),transactionId:randomUUID()}),/حجز/);
   assert.equal((await prepare(users[0],apple,true)).eligible,false,'an existing subscriber cannot receive another launch trial');
  }
 }finally{await db.close();}
});
