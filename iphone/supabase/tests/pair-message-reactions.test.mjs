import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,asService} from './harness.mjs';
import {projectPairState} from '../functions/_shared/pair-privacy.ts';

test('tester reactions sync add, change, removal, grouped counts and private deletion without changing messages or receipts',async()=>{
 const db=await createDatabase();try{
  const a='a'.repeat(64),b='b'.repeat(64),id=randomUUID();
  const rpc=(action,session='',payload={})=>asService(db,async()=>projectPairState((await db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload])).rows[0].value));
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  const agreement=await rpc('agreement_propose',b,{days:7,signed:true});
  await rpc('agreement_accept',a,{proposalId:agreement.seriousness.proposalId,signed:true});
  const before=await rpc('send',a,{clientId:id,body:'reaction fixture'});
  const react=(session,reaction)=>rpc('message_react',session,{id,reaction});
  let state=await react(a,'❤️');
  assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[{emoji:'❤️',count:1,mine:true}]);
  assert.deepEqual((await rpc('state',b)).messages.find(m=>m.id===id).reactions,[{emoji:'❤️',count:1,mine:false}]);
  state=await react(b,'❤️');assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[{emoji:'❤️',count:2,mine:true}]);
  state=await react(b,'😂');assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[{emoji:'❤️',count:1,mine:false},{emoji:'😂',count:1,mine:true}]);
  assert.equal(state.messages.length,before.messages.length);assert.deepEqual(state.read,before.read);assert.deepEqual(state.delivered,before.delivered);
  assert.equal(state.messages.find(m=>m.id===id).body,'reaction fixture');
  assert.equal(state.messages.find(m=>m.id===id).reactionBy,undefined);
  state=await react(b,null);assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[{emoji:'❤️',count:1,mine:false}]);
  state=await react(a,null);assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[]);
  await react(a,'👍');state=await rpc('message_delete',a,{id});assert.deepEqual(state.messages.find(m=>m.id===id).reactions,[]);
  assert.equal((await db.query("select data->'messages' messages from nisfayn_test.room")).rows[0].messages.find(m=>m.id===id).reactionBy,undefined);
  await assert.rejects(react(b,'❤️'),/غير متاحة/);
 }finally{await db.close();}
});

test('tester reaction mutation rejects missing sessions, bad choices, unavailable members, expired agreements and closed conversations',async()=>{
 const db=await createDatabase();try{
  const a='a'.repeat(64),b='b'.repeat(64),id=randomUUID();
  const rpc=(action,session='',payload={})=>asService(db,async()=>(await db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload])).rows[0].value);
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await assert.rejects(rpc('message_react',a,{id,reaction:'❤️'}),/اتفاق/);
  const agreement=await rpc('agreement_propose',b,{days:7,signed:true});await rpc('agreement_accept',a,{proposalId:agreement.seriousness.proposalId,signed:true});
  await rpc('send',a,{clientId:id,body:'fixture'});
  await assert.rejects(rpc('message_react','bad',{id,reaction:'❤️'}),/جلسة/);
  for(const payload of [{id},{id,reaction:7},{id,reaction:'invalid'},{id:randomUUID(),reaction:'❤️'}])await assert.rejects(rpc('message_react',a,payload));
  await db.exec("update marriage.admin_test_members set paused=true where actor='reham'");
  await assert.rejects(rpc('message_react',a,{id,reaction:'❤️'}),/غير متاح/);
  await db.exec("update marriage.admin_test_members set paused=false where actor='reham'");
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{seriousness,deadline}',to_jsonb((now()-interval '1 second')::text))");
  await assert.rejects(rpc('message_react',a,{id,reaction:'❤️'}),/اتفاق/);
  await rpc('close',a);await assert.rejects(rpc('message_react',a,{id,reaction:null}),/مغلق/);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.nisfayn_test_rpc(text,text,jsonb)','execute') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
