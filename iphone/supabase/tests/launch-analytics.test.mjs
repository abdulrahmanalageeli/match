import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';

test('private launch aggregates include profile-less accounts, deduplicate observations and enforce staff scope',async()=>{
 const db=await createDatabase({throughMigration:'20261123120000_launch_analytics.sql'});
 try {
  const make=async()=>{const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.invalid'};await addUser(db,u);return u;};
  const owner=await make(), member=await make(), dummy=await make();
  await db.query("insert into marriage.staff_accounts(user_id,display_name,role) values($1,'owner','owner')",[owner.id]);
  await db.query("update marriage.members set is_dummy=true where id=$1",[dummy.id]);
  await asMember(db,member.id,member.sessionId,async()=>{
   await assert.rejects(db.query('select public.marriage_admin_launch_directory()'));
   await assert.rejects(db.query('select * from marriage.launch_members'));
   for (let i=0;i<2;i++) await db.query("select public.marriage_launch_note('reached','identity')");
   await assert.rejects(db.query("select public.marriage_launch_note('reached','private text')"));
  });
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
  await db.exec('set role authenticated');
  const directory=(await db.query('select public.marriage_admin_launch_directory() as x')).rows[0].x;
  assert.equal(directory.length,1);assert.equal(directory[0].memberId,member.id);assert.equal(directory[0].hasProfile,false);
  const stats=(await db.query("select public.marriage_admin_launch_analytics((now() at time zone 'Asia/Riyadh')::date,(now() at time zone 'Asia/Riyadh')::date) x")).rows[0].x;
  assert.equal(stats.metrics.reached_identity.unknown,1);assert.equal(stats.metrics.joined.total,1);
  const signals=(await db.query('select public.marriage_admin_member_signals($1,7) x',[member.id])).rows[0].x;
  assert.equal(signals.level,'calibrating');assert.equal(signals.replied,0);
  await assert.rejects(db.query('select public.marriage_admin_follow_policy(5,0.8)'),/المعايرة/);
  await db.exec('reset role');
  const peer=await make(),pairId=randomUUID();
  await db.exec("set session_replication_role='replica'");
  await db.query("insert into marriage.member_requests(id,requester_id,recipient_id,status,created_at) values($1,$2,$3,'accepted',now()-interval '5 days')",[pairId,member.id,peer.id]);
  await db.query("insert into marriage.conversation_agreements values($1,jsonb_build_object('status','accepted','womanSignedAt',now()-interval '4 days','manSignedAt',now()-interval '4 days'))",[pairId]);
  await db.query("insert into marriage.thread_messages(request_id,sender_id,client_id,body,created_at) values($1,$2,gen_random_uuid(),'hello',now()-interval '3 days'),($1,$3,gen_random_uuid(),'reply',now()-interval '2 days')",[pairId,peer.id,member.id]);
  await db.exec("set session_replication_role='origin';set role authenticated");
  const engagement=(await db.query('select public.marriage_admin_member_signals($1,7) x',[member.id])).rows[0].x;
  assert.equal(engagement.opportunities,1);assert.equal(engagement.replied,1);assert.equal(engagement.twoWay,1);
  await db.exec('reset role');
  await asMember(db,member.id,member.sessionId,()=>db.query("select public.marriage_launch_note('fault','review','ios','version123')"));
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner.id,session_id:owner.sessionId,role:'authenticated',aal:'aal2'})]);
  await db.exec('set role authenticated');
  const affected=(await db.query("select public.marriage_admin_launch_directory('', 'incident:review:ios:version123',0,null) x")).rows[0].x;
  assert.deepEqual(affected.map(m=>m.memberId),[member.id]);
  const incident=(await db.query("select public.marriage_admin_launch_analytics((now() at time zone 'Asia/Riyadh')::date,(now() at time zone 'Asia/Riyadh')::date) x")).rows[0].x.incidents[0];
  assert.equal(incident.affected,1);assert.equal(incident.build,'version123');
 }finally{await db.close();}
});
