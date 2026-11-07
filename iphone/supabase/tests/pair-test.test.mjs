import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,asService} from './harness.mjs';
test('private testers: server-only access, shared messages, role isolation and mutually accepted audio',async()=>{
 const db=await createDatabase();try{
 const rpc=(action,session='',payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) as value',[action,session,payload]).then(r=>r.rows[0].value));
 assert.equal((await db.query("select has_function_privilege('anon','public.nisfayn_test_rpc(text,text,jsonb)','execute') ok")).rows[0].ok,false);
 const a='a'.repeat(64),b='b'.repeat(64);
 await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
 const proposal=await rpc('agreement_propose',b,{days:7,signed:true});await rpc('agreement_accept',a,{proposalId:proposal.seriousness.proposalId,signed:true});
 await assert.rejects(rpc('state','invalid'));
 await rpc('send',a,{clientId:'10000000-0000-4000-8000-000000000001',body:'hello'});
 await rpc('send',a,{clientId:'10000000-0000-4000-8000-000000000001',body:'hello'});
 let s=await rpc('state',b);assert.equal(s.messages.length,1);assert.equal(s.messages[0].sender,'abdulrahman');
 await rpc('profile',b,{profile:{displayName:'اسم الاختبار',gender:'man'},expectedRevision:s.profileRevision});s=await rpc('state',a);assert.equal(s.profiles.reham.displayName,'اسم الاختبار');assert.equal(s.profiles.reham.gender,'woman');
 await rpc('permission_invite',a);await rpc('permission_accept',b);
 s=await rpc('call_start',a,{clientId:'10000000-0000-4000-8000-000000000002'});const callId=s.call.id;
 await assert.rejects(rpc('token',a,{callId}));await assert.rejects(rpc('call_accept',a,{callId}));
 await rpc('call_accept',b,{callId});assert.equal((await rpc('token',a,{callId})).uid,1);assert.equal((await rpc('token',b,{callId})).uid,2);
 await rpc('call_end',a,{callId});await assert.rejects(rpc('token',b,{callId}));
 await rpc('close',b);assert.equal((await rpc('state',a)).matched,false);await assert.rejects(rpc('reset',b));await rpc('reset',a);
 await rpc('logout',b);await assert.rejects(rpc('state',b));
 }finally{await db.close();}
});
