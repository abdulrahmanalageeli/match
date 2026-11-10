import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, asService } from './harness.mjs';

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
  const send=async(sender)=>{
   const message={id:randomUUID(),sender,body:'Private text must never enter APNs',createdAt:new Date().toISOString()};
   await db.query("update nisfayn_test.room set data=jsonb_set(data,'{messages}',(data->'messages')||jsonb_build_array($1::jsonb))",[JSON.stringify(message)]);
   return message;
  };
  const first=await send('abdulrahman');
  let jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].token,'c'.repeat(64));assert.equal(await valid(jobs[0]),true);
  assert(!JSON.stringify(jobs).includes('Private text'));
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

