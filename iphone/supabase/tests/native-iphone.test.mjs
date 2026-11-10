import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,asService,asMember,addUser} from './harness.mjs';

test('member native credentials cannot escape their session or impersonate another member',async()=>{
 const db=await createDatabase();try{
  const a={id:randomUUID(),sessionId:randomUUID(),email:'native-a@example.test'},b={id:randomUUID(),sessionId:randomUUID(),email:'native-b@example.test'};
  await addUser(db,a);await addUser(db,b);
  const iid=randomUUID();
  const registered=await asMember(db,a.id,a.sessionId,async()=>(await db.query("select public.marriage_native_call_register($1,'production',null) v",[iid])).rows[0].v);
  assert.match(registered.credential,/^[0-9a-f]{64}$/);
  const state=()=>asService(db,async()=>(await db.query("select public.nisfayn_native_call($1,$2,'state',$3) v",[iid,registered.credential,randomUUID()])).rows[0].v);
  await assert.rejects(state(),/غير متاحة/,'unknown calls are rejected by the normal member RPC');
  await db.query('delete from auth.sessions where id=$1',[a.sessionId]);
  await assert.rejects(state(),/Session expired/);
  await asMember(db,b.id,b.sessionId,()=>assert.rejects(db.query("select public.nisfayn_native_call($1,$2,'state',$3)",[iid,registered.credential,randomUUID()]),/permission denied/));
  await asMember(db,b.id,b.sessionId,async()=>{
   assert.equal((await db.query("select public.marriage_push_privacy('name') v")).rows[0].v.preview,'name');
  });
  assert.equal((await db.query('select count(*) from marriage.notification_privacy where member_id=$1',[a.id])).rows[0].count,0);
 }finally{await db.close();}
});

test('native call authorization, consent, push targeting and revocation',async()=>{
 const db=await createDatabase();try{
  const rpc=(name,args)=>asService(db,async()=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result);
  const a='a'.repeat(64),b='b'.repeat(64),ai=randomUUID(),bi=randomUUID();
  const pair=(action,session,payload={})=>rpc('nisfayn_test_rpc',[action,session,payload]);
  await pair('login',a,{actor:'abdulrahman'});await pair('login',b,{actor:'reham'});
  await rpc('nisfayn_test_native_register',[a,ai,'production','c'.repeat(64)]);
  await rpc('nisfayn_test_native_register',[b,bi,'production','d'.repeat(64)]);
  const native=(iid,key,cmd,id)=>rpc('nisfayn_native_call',[iid,key,cmd,id]);
  await assert.rejects(native(ai,b,'state',randomUUID()),/Session expired/);
  await assert.rejects(native(ai,a,'profile',randomUUID()),/Invalid command/);
  await assert.rejects(pair('call_start',a,{clientId:randomUUID()}));
  await pair('permission_invite',a);await pair('permission_accept',b);
  const agreement=await pair('agreement_propose',b,{days:14,signed:true,nextStep:'family_call'});
  await pair('agreement_accept',a,{proposalId:agreement.seriousness.proposalId,signed:true});
  const state=await pair('call_start',a,{clientId:randomUUID()}),id=state.call.id;
  assert.equal((await native(bi,b,'state',id)).direction,'incoming');
  assert.equal((await rpc('nisfayn_native_call_targets',[id,null,b])).length,0,'callee cannot ring itself');
  const targets=await rpc('nisfayn_native_call_targets',[id,null,a]);
  assert.equal(targets.length,1);assert.equal(targets[0].token,'d'.repeat(64));
  assert.equal((await rpc('nisfayn_native_call_targets',[id,null,a])).length,0,'deduplicated');
  await assert.rejects(native(ai,a,'accept',id));
  assert.equal((await native(bi,b,'accept',id)).status,'active');
  const grant=await native(bi,b,'token',id);assert.equal(grant.callId,id);assert.equal(grant.uid,2);assert(grant.ttlSeconds<=120);
  assert.equal((await native(ai,a,'end',id)).status,'ended');
  await native(bi,b,'unregister',null);
  await assert.rejects(native(bi,b,'state',id),/Session expired/);
  await pair('logout',a);
  await assert.rejects(native(ai,a,'state',id),/Session expired/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.nisfayn_native_call_targets($1,null,null)',[id]),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});

test('notification privacy is opt-in and evaluated again just before delivery',async()=>{
 const db=await createDatabase();try{
  const rpc=(name,args)=>asService(db,async()=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result);
  const a='a'.repeat(64),b='b'.repeat(64),iid=randomUUID(),id=randomUUID();
  await rpc('nisfayn_test_rpc',['login',a,{actor:'abdulrahman'}]);await rpc('nisfayn_test_rpc',['login',b,{actor:'reham'}]);
  const push=(action,payload={})=>rpc('nisfayn_test_push',[action,b,payload]);
  await push('push_register',{installation:iid,device_token:'d'.repeat(64),device_environment:'production'});
  await push('push_enable',{enabled:true});
  await db.query("update nisfayn_test.room set data=data||jsonb_build_object('messages',jsonb_build_array($1::jsonb),'read','{}'::jsonb)",[{id,sender:'abdulrahman',body:'Private hello',createdAt:new Date().toISOString()}]);
  const [job]=await rpc('nisfayn_test_push_claim',['production',10]);assert(job);
  const content=()=>rpc('nisfayn_push_content',[job.id,job.leaseId,true]);
  let result=await content();assert.equal(result.preview,'private');assert.equal(result.sender,undefined);assert.equal(result.body,undefined);assert.equal(result.badge,1);
  await push('push_privacy',{preview_mode:'name'});result=await content();assert.equal(result.sender,'عبدالرحمن');assert.equal(result.body,undefined);
  await push('push_privacy',{preview_mode:'content'});result=await content();assert.equal(result.body,'Private hello');assert.equal(result.messageId,id);
  await push('push_privacy',{preview_mode:'private'});assert.equal((await content()).body,undefined,'queued content uses current choice');
  await db.query("insert into nisfayn_test.message_deletions(id,actor) values($1,'abdulrahman')",[id]);
  assert.equal(await content(),null,'deleted messages never reach APNs');
  await assert.rejects(push('push_privacy',{preview_mode:'everything'}),/Invalid preview/);
 }finally{await db.close();}
});
