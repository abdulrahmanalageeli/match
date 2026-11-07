import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,asService} from './harness.mjs';
test('tester upgrades: permission, acknowledged receipts and private attachment ownership',async()=>{
 const db=await createDatabase();try{
 const rpc=(action,session='',payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) as value',[action,session,payload]).then(r=>r.rows[0].value));
 const a='a'.repeat(64),b='b'.repeat(64),id='10000000-0000-4000-8000-000000000011',file='10000000-0000-4000-8000-000000000012';
 await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
 const proposal=await rpc('agreement_propose',b,{days:7,signed:true});await rpc('agreement_accept',a,{proposalId:proposal.seriousness.proposalId,signed:true});
 assert.equal((await db.query("select has_function_privilege('service_role','nisfayn_test.rpc_v1(text,text,jsonb)','execute') ok")).rows[0].ok,false);
 assert.equal((await db.query("select public from storage.buckets where id='nisfayn-test-chat'")).rows[0].public,false);
 await assert.rejects(rpc('call_start',a,{clientId:id}));
 await rpc('permission_invite',a);await assert.rejects(rpc('permission_accept',a));
 let s=await rpc('permission_accept',b);assert.equal(s.callPermission.status,'accepted');
 s=await rpc('call_start',a,{clientId:id});await rpc('call_end',a,{callId:s.call.id});
 s=await rpc('call_start',b,{clientId:file});await rpc('call_end',b,{callId:s.call.id});
 await rpc('send',a,{clientId:id,body:'new receipt test'});
 s=await rpc('state',b);assert.equal(s.delivered?.reham,undefined);
 s=await rpc('delivered',a,{id});assert.equal(s.delivered?.abdulrahman,undefined,'cannot self-deliver own message');
 s=await rpc('delivered',b,{id});assert.equal(s.delivered.reham,s.messages[0].createdAt);assert.equal(s.read.reham,undefined);
 s=await rpc('read',b,{id});assert.equal(s.read.reham,s.messages[0].createdAt);
 await assert.rejects(rpc('media_reserve',a,{id:file,mime:'text/html',size:100}));
 await assert.rejects(rpc('media_reserve',a,{id:file,mime:'image/jpeg',size:8388609}));
 const reservation=await rpc('media_reserve',a,{id:file,mime:'image/jpeg',size:100});
 await rpc('media_abort',a,{id:file});
 assert.equal((await rpc('media_reserve',a,{id:file,mime:'image/jpeg',size:100})).path,reservation.path);
 await assert.rejects(rpc('media_publish',a,{id:file}));
 await assert.rejects(rpc('media_publish',b,{id:file}));
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-test-chat',$1,$2)",[reservation.path,{size:100,mimetype:'image/jpeg'}]);
 assert.equal((await rpc('media_reserve',a,{id:file,mime:'image/jpeg',size:100})).resume,true);
 s=await rpc('media_publish',a,{id:file});assert.equal(s.messages.at(-1).attachment.kind,'photo');
 const length=s.messages.length;s=await rpc('media_publish',a,{id:file});assert.equal(s.messages.length,length);
 assert.equal((await rpc('media_reserve',a,{id:file,mime:'image/jpeg',size:100})).already,true);
 assert.equal((await rpc('media_url',b,{id:file})).path,reservation.path);
 await assert.rejects(rpc('media_url','invalid',{id:file}));
 await assert.rejects(rpc('media_url',b,{id:'10000000-0000-4000-8000-000000000099'}));
 await rpc('close',a);await assert.rejects(rpc('media_url',b,{id:file}));await assert.rejects(rpc('call_start',b,{clientId:file}));
 }finally{await db.close();}
});
