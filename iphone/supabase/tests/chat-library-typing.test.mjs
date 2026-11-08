import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('member search/read anchors and private typing respect connection gates, pagination and expiration',async()=>{
 const db=await createDatabase();try{
  const rpc=async(expression,args=[])=>(await db.query('select '+expression+' value',args)).rows[0].value;
  const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
  async function member(gender){
   const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
   const state=await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
   await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
   await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
  }
  const a=await member('woman'),b=await member('man'),other=await member('man');
  const request=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[request]);
  const ids=[];
  for(let i=0;i<56;i++){const id=randomUUID();ids.push(id);await db.query('insert into marriage.thread_messages(id,request_id,sender_id,body,created_at,client_id) values($1,$2,$3,$4,$5,$6)',[id,request,b.id,i===55?'literal 100%':'family '+i,new Date(Date.now()-60000+i*100).toISOString(),randomUUID()]);}
  const search=(u,q='',before=null,kind=null)=>call(u,'public.marriage_search_messages($1,$2,$3,$4)',[request,q,before,kind]);
  const page=await search(a,'family');assert.equal(page.length,50);assert.equal(page[0].id,ids[5]);
  assert.equal((await search(a,'family',page[0].id)).length,5);
  assert.equal((await search(a,'%'))[0].id,ids[55],'percent is a literal, not a wildcard');
  assert.deepEqual(await search(a),[],'text-only messages do not appear in the media library');
  assert.deepEqual(await call(a,'public.marriage_thread_read_state($1)',[request]),{firstUnreadId:ids[0],unreadCount:56});
  await call(a,'public.marriage_mark_thread_read($1,$2)',[request,ids[15]]);
  await call(b,'public.marriage_delete_message($1,$2)',[request,ids[16]]);
  assert.deepEqual(await call(a,'public.marriage_thread_read_state($1)',[request]),{firstUnreadId:ids[17],unreadCount:39});
  assert(!(await search(a,'family')).some(row=>row.id===ids[16]));
  await db.exec('truncate realtime.messages');
  const typing=(u,active)=>call(u,'public.marriage_set_typing($1,$2)',[request,active]);
  const peerTyping=u=>call(u,'public.marriage_typing_state($1)',[request]);
  await typing(a,true);assert.equal(await peerTyping(b),true);assert.equal(await peerTyping(a),false);
  await typing(a,true);assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,1,'TTL renewals do not wake whole app');
  const event=(await db.query('select topic,payload from realtime.messages')).rows[0];assert.equal(event.topic,'marriage:member:'+b.id);assert.deepEqual(Object.keys(event.payload),['id']);
  await typing(a,false);assert.equal(await peerTyping(b),false);
  await typing(a,true);await db.query("update marriage.chat_typing set expires_at=now()-interval '1 second'");assert.equal(await peerTyping(b),false);
  await assert.rejects(search(other,'family'));await assert.rejects(typing(other,true));await assert.rejects(peerTyping(other));
  await assert.rejects(search(a,'x'.repeat(101)));await assert.rejects(search(a,'',null,'video'));
  await call(a,"public.marriage_act($1,'cancel')",[request]);
  await assert.rejects(search(a,'family'));await assert.rejects(peerTyping(b));
  for(const role of['anon','authenticated','service_role'])assert.equal((await db.query("select has_table_privilege($1,'marriage.chat_typing','select,insert,update,delete') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});

test('private tester typing is ephemeral and separate from messages, with agreement/session gates',async()=>{
 const db=await createDatabase();try{
  const a='a'.repeat(64),b='b'.repeat(64);
  const rpc=(action,session='',payload={})=>asService(db,async()=>(await db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload])).rows[0].value);
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await assert.rejects(rpc('typing_set',a,{active:true}),/اتفاق/);
  const agreement=await rpc('agreement_propose',b,{days:7,signed:true});await rpc('agreement_accept',a,{proposalId:agreement.seriousness.proposalId,signed:true});
  const before=(await db.query('select data from nisfayn_test.room')).rows[0].data;
  await rpc('typing_set',a,{active:true});assert.equal(await rpc('typing_state',b),true);assert.equal(await rpc('typing_state',a),false);
  assert.deepEqual((await db.query('select data from nisfayn_test.room')).rows[0].data,before);
  await rpc('typing_set',a,{active:false});assert.equal(await rpc('typing_state',b),false);
  await rpc('typing_set',a,{active:true});await db.exec("update nisfayn_test.chat_typing set expires_at=now()-interval '1 second'");assert.equal(await rpc('typing_state',b),false);
  await assert.rejects(rpc('typing_set','invalid',{active:true}));await assert.rejects(rpc('typing_set',a,{active:'true'}));
  await db.exec("update marriage.admin_test_members set paused=true where actor='reham'");await assert.rejects(rpc('typing_state',a));
  for(const role of['anon','authenticated','service_role'])assert.equal((await db.query("select has_table_privilege($1,'nisfayn_test.chat_typing','select,insert,update,delete') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
