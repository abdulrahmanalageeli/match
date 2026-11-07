import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const deleted='تم حذف هذه الرسالة';
const consents={version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true};
async function pair(db){
 const a='a'.repeat(64),b='b'.repeat(64);
 const rpc=(action,session='',payload={})=>asService(db,async()=>(await db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload])).rows[0].value);
 await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
 const p=await rpc('agreement_propose',b,{days:7,signed:true});await rpc('agreement_accept',a,{proposalId:p.seriousness.proposalId,signed:true});
 async function photo({once=true,sender=a,kind='photo'}={}){
  const id=randomUUID(),mime=kind==='photo'?'image/jpeg':'audio/webm';
  const reservation=await rpc('media_reserve',sender,{id,mime,size:100,viewOnce:once,duration:kind==='audio'?2:null});
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-test-chat',$1,$2)",[reservation.path,{size:100,mimetype:mime}]);
  const state=await rpc('media_publish',sender,{id});return{id,path:reservation.path,message:state.messages.find(m=>m.id===id)};
 }
 return{a,b,rpc,photo};
}

test('view-once photos have atomic recipient-only redemption, persistent opened state and no URL bypass',async()=>{
 const db=await createDatabase();try{
  const{a,b,rpc,photo}=await pair(db);const p=await photo();
  assert.equal(p.message.attachment.viewOnce,true);assert.equal(p.message.attachment.openedAt,null);
  await assert.rejects(rpc('media_url',a,{id:p.id}),/مرة واحدة/);
  await assert.rejects(rpc('media_url',b,{id:p.id}),/مرة واحدة/);
  await assert.rejects(rpc('media_open',a,{id:p.id}),/مرة أخرى/);
  await assert.rejects(rpc('media_open','bad',{id:p.id}),/جلسة/);
  const results=await asService(db,()=>Promise.allSettled([0,1].map(()=>db.query("select public.nisfayn_test_rpc('media_open',$1,$2) value",[b,{id:p.id}]))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results.map(r=>r.reason?.message)));
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.deepEqual(results.find(r=>r.status==='fulfilled').value.rows[0].value,{path:p.path,mime:'image/jpeg'});
  const opened=(await rpc('state',a)).messages.find(m=>m.id===p.id).attachment.openedAt;
  assert(opened);assert.equal((await rpc('state',b)).messages.find(m=>m.id===p.id).attachment.openedAt,opened);
  await assert.rejects(rpc('media_open',b,{id:p.id}),/مرة أخرى/);
  assert.equal((await db.query('select ready from nisfayn_test.media where id=$1',[p.id])).rows[0].ready,true);
  assert.deepEqual((await asService(db,()=>db.query('select public.nisfayn_chat_cleanup_batch() items'))).rows[0].items,[],'opened object is retained briefly for in-flight binary delivery');
  await asService(db,()=>db.query('select public.nisfayn_chat_cleanup_done($1)',[[p.path]]));
  assert.equal((await db.query('select count(*)::int n from nisfayn_test.chat_cleanup')).rows[0].n,1,'early cleanup ACK cannot remove delayed queue');
  await db.query("update nisfayn_test.chat_cleanup set available_at=now()-interval '1 second'");
  assert.deepEqual((await asService(db,()=>db.query('select public.nisfayn_chat_cleanup_batch() items'))).rows[0].items,[p.path]);
  await asService(db,()=>db.query('select public.nisfayn_chat_cleanup_done($1)',[[p.path]]));
  assert.equal((await db.query('select count(*)::int n from nisfayn_test.chat_cleanup')).rows[0].n,0);
  await assert.rejects(rpc('media_open',b,{id:p.id}),/مرة أخرى/,'cleanup never resets consumption');
  const normal=await photo({once:false});assert.deepEqual(await rpc('media_url',b,{id:normal.id}),{path:normal.path,mime:'image/jpeg'});
  await assert.rejects(rpc('media_open',b,{id:normal.id}),/مرة أخرى/);
  await assert.rejects(rpc('media_reserve',a,{id:normal.id,mime:'image/jpeg',size:100,viewOnce:true}),/إعادة المحاولة/);
  await assert.rejects(photo({kind:'audio'}),/للصور/);
  await assert.rejects(rpc('media_reserve',a,{id:randomUUID(),mime:'image/jpeg',size:100,viewOnce:'true'}),/غير صالح/);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.nisfayn_chat_cleanup_batch()','execute') allowed")).rows[0].allowed,false);
  await db.exec('set role authenticated');try{assert.deepEqual((await db.query("select name from storage.objects where bucket_id='nisfayn-test-chat'")).rows,[]);}finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('view-once authorization checks current match, account and agreement without consuming failed opens',async()=>{
 const db=await createDatabase();try{
  const{a,b,rpc,photo}=await pair(db);const p=await photo();
  await db.exec("update marriage.admin_test_members set suspended=true where actor='abdulrahman'");
  await assert.rejects(rpc('media_open',b,{id:p.id}),/غير متاح/);
  await db.exec("update marriage.admin_test_members set suspended=false where actor='abdulrahman'");
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{seriousness,deadline}',to_jsonb((now()-interval '1 second')::text))");
  await assert.rejects(rpc('media_open',b,{id:p.id}),/اتفاق/);
  assert.equal((await db.query('select opened_at from nisfayn_test.media where id=$1',[p.id])).rows[0].opened_at,null);
  const agreed=(await db.query("select data->'seriousness' agreement from nisfayn_test.room")).rows[0].agreement;
  for(const agreement of [null,{}, {status:'accepted'}, {status:'accepted',deadline:null}]){
   await db.query("update nisfayn_test.room set data=jsonb_set(data,'{seriousness}',$1)",[JSON.stringify(agreement)]);
   await assert.rejects(rpc('media_open',b,{id:p.id}),/اتفاق/,'missing agreement/status/deadline must fail closed');
   assert.equal((await db.query('select opened_at from nisfayn_test.media where id=$1',[p.id])).rows[0].opened_at,null);
  }
  await db.query("update nisfayn_test.room set data=jsonb_set(data,'{seriousness}',$1)",[agreed]);
  await db.exec("update nisfayn_test.room set data=jsonb_set(data,'{seriousness,deadline}',to_jsonb((now()+interval '1 day')::text))");
  await rpc('close',a);await assert.rejects(rpc('media_open',b,{id:p.id}),/مغلق|متاح/);
  assert.equal((await db.query('select opened_at from nisfayn_test.media where id=$1',[p.id])).rows[0].opened_at,null);
 }finally{await db.close();}
});

test('pair deletion is sender-only, permanent, 48-hour bounded and removes copied replies and media access',async()=>{
 const db=await createDatabase();try{
  const{a,b,rpc,photo}=await pair(db);const id=randomUUID(),reply=randomUUID();
  await rpc('send',a,{clientId:id,body:'private original body'});
  await rpc('send',b,{clientId:reply,body:'answer',replyToId:id});
  const before=(await rpc('state',a)).messages.find(m=>m.id===id);
  await rpc('read',b,{id});
  await assert.rejects(rpc('message_delete',b,{id}),/رسائلك/);
  const state=await rpc('message_delete',a,{id});const tomb=state.messages.find(m=>m.id===id);
  assert.equal(tomb.body,deleted);assert(tomb.deletedAt);assert.equal(tomb.createdAt,before.createdAt);assert.equal(tomb.clientId,before.clientId);
  assert.equal(state.read.reham,before.createdAt);assert.equal(state.messages.find(m=>m.id===reply).reply.body,deleted);
  assert.equal(state.messages.find(m=>m.id===reply).reply.deletedAt,tomb.deletedAt);
  assert(!JSON.stringify(state).includes('private original body'));
  assert(!JSON.stringify((await db.query('select data from nisfayn_test.room')).rows[0].data).includes('private original body'));
  assert.equal((await rpc('message_delete',a,{id})).messages.find(m=>m.id===id).deletedAt,tomb.deletedAt,'delete retries are idempotent');
  await assert.rejects(rpc('send',a,{clientId:id,body:'resurrection'}),/حذف/);
  const reply2=randomUUID();await rpc('send',b,{clientId:reply2,body:'reply after removal',replyToId:id});
  assert.equal((await rpc('state',a)).messages.find(m=>m.id===reply2).reply.body,deleted);
  const normal=await photo({once:false}),once=await photo();
  for(const p of[normal,once]){
   const res=await rpc('message_delete',a,{id:p.id});assert.equal(res._deletedMediaPath,p.path);assert.equal(res.messages.find(m=>m.id===p.id).attachment,undefined);
   await assert.rejects(rpc('media_url',b,{id:p.id}));await assert.rejects(rpc('media_open',b,{id:p.id}));
   await assert.rejects(rpc('media_publish',a,{id:p.id}));await assert.rejects(rpc('media_reserve',a,{id:p.id,mime:'image/jpeg',size:100,viewOnce:false}));
  }
  const old=randomUUID(),fresh=randomUUID();await rpc('send',a,{clientId:old,body:'too old'});await rpc('send',a,{clientId:fresh,body:'delete after ending'});
  await db.query("update nisfayn_test.room set data=jsonb_set(data,'{messages}',(select jsonb_agg(case when m->>'id'=$1 then jsonb_set(m,'{createdAt}',to_jsonb((now()-interval '49 hours')::text)) else m end order by ord) from jsonb_array_elements(data->'messages') with ordinality rows(m,ord)))",[old]);
  await assert.rejects(rpc('message_delete',a,{id:old}),/٤٨/);
  await rpc('close',a);assert((await rpc('message_delete',a,{id:fresh})).messages.find(m=>m.id===fresh).deletedAt);
  await db.exec("update marriage.admin_test_members set paused=true where actor='abdulrahman'");
  assert.deepEqual(await rpc('message_delete',a,{id:fresh}),{ok:true});
  await db.exec("update marriage.admin_test_members set suspended=true where actor='abdulrahman'");await assert.rejects(rpc('message_delete',a,{id:fresh}),/الحساب/);
  assert.deepEqual(new Set((await asService(db,()=>db.query('select public.nisfayn_chat_cleanup_batch() paths'))).rows[0].paths),new Set([normal.path,once.path]));
 }finally{await db.close();}
});

test('real messages redact body, exports, inbox and historical reply changes; sender can delete after ending',async()=>{
 const db=await createDatabase();try{
  const rpc=async(expression,args=[])=>(await db.query('select '+expression+' value',args)).rows[0].value;
  const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
  async function add(gender){
   const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
   const s=await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:consents}]);
   await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
   await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:s.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
  }
  const a=await add('woman'),b=await add('man'),outsider=await add('man');const request=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[request]);
  const original=await call(a,'public.marriage_message($1,$2,$3)',[request,'secret original',randomUUID()]);
  const answer=await call(b,'public.marriage_reply($1,$2,$3,$4)',[request,'reply',randomUUID(),original]);
  await assert.rejects(call(b,'public.marriage_delete_message($1,$2)',[request,original]),/رسائلك/);
  await assert.rejects(call(outsider,'public.marriage_delete_message($1,$2)',[request,original]),/المحادثة/);
  await call(a,'public.marriage_delete_message($1,$2)',[request,original]);
  const rows=await call(b,'public.marriage_thread_page($1)',[request]);assert.equal(rows.find(m=>m.id===original).body,deleted);assert(rows.find(m=>m.id===original).deletedAt);
  assert.equal(rows.find(m=>m.id===answer).reply.body,deleted);assert(rows.find(m=>m.id===answer).reply.deletedAt);
  assert(!JSON.stringify(await call(a,'public.marriage_personal_data()')).includes('secret original'));
  assert(!JSON.stringify(await call(b,'public.marriage_inbox()')).includes('secret original'));
  assert(!JSON.stringify(await call(b,'public.marriage_thread($1)',[request])).includes('secret original'));
  const changes=await call(b,'public.marriage_message_changes($1,$2)',[request,[original,answer,randomUUID()]]);assert.equal(changes.length,2);assert(changes.find(m=>m.id===answer).reply.deletedAt);
  await assert.rejects(call(outsider,'public.marriage_message_changes($1,$2)',[request,[original]]));
  await assert.rejects(call(b,'public.marriage_message_changes($1,$2)',[request,Array.from({length:101},()=>original)]),/دفعات/);
  const old=await call(a,'public.marriage_message($1,$2,$3)',[request,'old message',randomUUID()]);await db.query("update marriage.thread_messages set created_at=now()-interval '49 hours' where id=$1",[old]);
  await assert.rejects(call(a,'public.marriage_delete_message($1,$2)',[request,old]),/٤٨/);
  await call(a,"public.marriage_act($1,'cancel')",[request]);await call(b,'public.marriage_delete_message($1,$2)',[request,answer]);
  assert.equal((await db.query('select body from marriage.thread_messages where id=$1',[answer])).rows[0].body,deleted);
  assert.equal((await db.query("select count(*)::int n from realtime.messages where event='changed' and payload::text not like '%secret%'")).rows[0].n>0,true);
  await assert.rejects(call(b,'public.marriage_message_changes($1,$2)',[request,[original]]),/المحادثة/);
  for(const fn of ['marriage.chat_peer(uuid)','marriage.chat_message_json(marriage.thread_messages,uuid)','nisfayn_test.chat_messages(jsonb)','nisfayn_test.rpc_before_chat_privacy(text,text,jsonb)']){
   assert.equal((await db.query("select has_function_privilege('authenticated',$1,'execute') allowed",[fn])).rows[0].allowed,false,fn);
  }
  assert.equal((await db.query("select has_function_privilege('anon','public.marriage_delete_message(uuid,uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
