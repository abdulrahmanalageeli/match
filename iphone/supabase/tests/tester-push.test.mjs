import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, asService } from './harness.mjs';

test('each tester can close an introduction and the other gets its exact historical target',async()=>{
 const db=await createDatabase();
 try {
  const actors=['abdulrahman','reham'], sessions=['a'.repeat(64),'b'.repeat(64)];
  const call=(fn,action,i,payload={})=>asService(db,async()=>(await db.query('select public.'+fn+'($1,$2,$3) result',[action,sessions[i],JSON.stringify(payload)])).rows[0].result);
  const summaries=i=>call('nisfayn_test_push_updates','push_updates',i);
  await db.exec("update marriage.admin_test_members set paused=false,suspended=false,review_status='approved',access_until=now()+interval '7 days'");
  for (const [i,actor] of actors.entries()) {
   await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),$2,now()+interval '1 day')",[sessions[i],actor]);
   await call('nisfayn_test_push','push_register',i,{installation:randomUUID(),device_token:(i?'c':'d').repeat(64),device_environment:'production'});
   await call('nisfayn_test_push','push_enable',i,{enabled:true});
   await call('nisfayn_test_push','push_privacy',i,{preview_mode:i?'event':'private'});
  }
  let previousId;
  for (const [i,actor] of actors.entries()) {
   const context=i?'pact':'general', recipient=1-i, now=new Date().toISOString();
   await db.query("update nisfayn_test.room set data=data||$1 where id",[JSON.stringify({matched:true,matchedAt:now,seriousness:{status:'accepted',womanSignedAt:now,manSignedAt:now}})]);
   await assert.rejects(call('nisfayn_test_introduction','close_introduction',i,{closureContext:context,familyPhone:'0551234567'}));
   const choice={closureContext:context,allowRematch:true};
   await call('nisfayn_test_introduction','close_introduction',i,choice);
   await call('nisfayn_test_introduction','close_introduction',i,choice);
   const alerts=(await summaries(recipient)).filter(x=>x.event==='introduction:closed');
   assert.equal(alerts.length,1);
   const [notice]=alerts;
   assert.equal(notice.closureContext,context);
   assert.equal(notice.hasFamilyContact,false);
   assert.notEqual(notice.target,previousId); previousId=notice.target;
   assert(!(await summaries(i)).some(x=>x.target===notice.target));
   const [archive]=await call('nisfayn_test_introduction','closure_history',recipient,{id:notice.target});
   assert.equal(archive.id,notice.target); assert.equal(archive.closureContext,context);
   const jobs=await asService(db,async()=>(await db.query("select public.nisfayn_test_push_claim('production',16) jobs")).rows[0].jobs);
   const job=jobs.find(j=>j.kind==='update'&&j.token===(recipient?'c':'d').repeat(64) && j.id);
   assert(job,actor+' closure delivers to the peer');
   const detail=await asService(db,async()=>(await db.query('select public.nisfayn_push_delivery($1,$2,true,$3) d',[job.id,job.leaseId,job.token])).rows[0].d);
   assert.equal(detail.target,notice.target); assert.equal(detail.closureContext,recipient?context:undefined);
  }
 } finally {await db.close();}
});

test('tester APNs routes privately, deduplicates, and revokes stale notifications', async () => {
 const db=await createDatabase();
 try {
  const sessions={abdulrahman:'a'.repeat(64),reham:'b'.repeat(64)};
  const devices={abdulrahman:randomUUID(),reham:randomUUID()};
  await db.exec("update marriage.admin_test_members set paused=false,suspended=false,review_status='approved',access_until=now()+interval '7 days'");
  for(const actor of Object.keys(sessions)) await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),$2,now()+interval '1 day')",[sessions[actor],actor]);
  const rpc=(action,actor,payload={})=>asService(db, async()=> (await db.query('select public.nisfayn_test_push($1,$2,$3) result',[action,sessions[actor]||actor,JSON.stringify(payload)])).rows[0].result);
  const claim=()=>asService(db,async()=>(await db.query("select public.nisfayn_test_push_claim('production',10) result")).rows[0].result);
  const valid=job=>asService(db,async()=>(await db.query('select public.nisfayn_test_push_validate($1,$2) result',[job.id,job.leaseId])).rows[0].result);
  await assert.rejects(rpc('push_register','invalid',{}),/انتهت/);
  for(const actor of Object.keys(sessions)) {
   await rpc('push_register',actor,{installation:devices[actor],device_token:(actor==='reham'?'c':'d').repeat(64),device_environment:'production'});
   await rpc('push_enable',actor,{enabled:true});
  }
  await db.exec(`update nisfayn_test.room set data=data||'{"matched":true,"messages":[],"read":{}}'::jsonb`);
  const proposalId=randomUUID();
  const agreement=(data)=>db.query("update nisfayn_test.room set data=jsonb_set(data,'{seriousness}',$1) where id",[data]);
  await agreement({status:'proposed',proposalId,womanSignedAt:new Date().toISOString()});
  const [proposal]=await claim();
  assert.equal(proposal.kind,'update');
  assert.equal(proposal.token,'d'.repeat(64));
  const proposalDetail=await asService(db, async()=>(await db.query('select public.nisfayn_push_delivery($1,$2,true,$3) detail',[proposal.id,proposal.leaseId,proposal.token])).rows[0].detail);
  assert.equal(proposalDetail.event,'agreement:proposed');
  const alerts=async actor=>asService(db,async()=>(await db.query("select public.nisfayn_test_push_updates('push_updates',$1,'{}') value",[sessions[actor]])).rows[0].value);
  assert.equal((await alerts('abdulrahman'))[0].event,'agreement:proposed');
  assert.deepEqual(await alerts('reham'),[]);
  await agreement({status:'none'});
  assert.equal(await valid(proposal),false);
  assert.deepEqual(await claim(),[]);
  assert.deepEqual(await alerts('abdulrahman'),[]);
  const send=async(sender)=>{
   const message={id:randomUUID(),sender,body:'Private text must never enter APNs',createdAt:new Date().toISOString()};
   await db.query("update nisfayn_test.room set data=jsonb_set(data,'{messages}',(data->'messages')||jsonb_build_array($1::jsonb))",[JSON.stringify(message)]);
   return message;
  };
  const first=await send('abdulrahman');
  let jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].token,'c'.repeat(64));assert.equal(await valid(jobs[0]),true);
  assert(!JSON.stringify(jobs).includes('Private text'));
  const native=(await asService(db,()=>db.query('select public.nisfayn_push_delivery($1,$2,true,$3) as detail',[jobs[0].id,jobs[0].leaseId,jobs[0].token]))).rows[0].detail;
  assert.equal(native.receipt.job,jobs[0].id);
  await db.exec('set role anon');
  try {
   await db.query('select public.wudayn_confirm_notification($1,$2)',[native.receipt.job,native.receipt.proof]);
  } finally {await db.exec('reset role');}
  const state=(await db.query('select data from nisfayn_test.room')).rows[0].data;
  assert.ok(state.messages.find(message=>message.id===first.id).deliveredAt);
  assert.deepEqual(state.read,{},'a device receipt does not mark a tester chat read');
  assert.equal((await claim()).length,0,'leased jobs cannot be claimed twice');
  await db.query("update nisfayn_test.room set data=jsonb_set(data,'{read,reham}',to_jsonb($1::text))",[first.createdAt]);
  assert.equal(await valid(jobs[0]),false,'read message is suppressed');
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{read}','{}')");
  await rpc('push_enable','reham',{enabled:false});
  assert.equal(await valid(jobs[0]),false);
  await rpc('push_enable','reham',{enabled:true});
  await send('reham');jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].token,'d'.repeat(64));
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{matched}','false')");
  assert.equal(await valid(jobs[0]),false,'closed match revokes push');
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{matched}','true')");
  await claim();
  await send('abdulrahman');jobs=await claim();assert.equal(jobs.length,1);
  await db.query("update nisfayn_test.sessions set expires_at=now() where actor='reham'");
  assert.equal(await valid(jobs[0]),false,'logout/session expiry revokes delivery');
  // A token moving to another account must not inherit old queued alerts.
  await rpc('push_register','abdulrahman',{installation:devices.reham,device_token:'c'.repeat(64),device_environment:'production'});
  assert.equal((await db.query('select actor from nisfayn_test.push_devices where installation_id=$1',[devices.reham])).rows[0].actor,'abdulrahman');
  assert.equal((await db.query('select count(*)::int n from nisfayn_test.push_outbox where installation_id=$1',[devices.reham])).rows[0].n,0);
  await db.exec("set role anon");
  await assert.rejects(db.query("select public.nisfayn_test_push_claim('production',10)"),/permission denied/);
  await db.exec('reset role');
 } finally {await db.close();}
});

