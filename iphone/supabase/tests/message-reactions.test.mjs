import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('private reactions synchronize aggregates, change/remove atomically and enforce live chat permissions',async()=>{
 const db=await createDatabase();try{
  const rpc=async(expression,args=[])=>{try{return(await db.query('select '+expression+' value',args)).rows[0].value;}catch(error){error.message=expression+': '+error.message+' '+(error.where||'');throw error;}};
  const call=(u,expression,args)=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
  async function member(gender){
   const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
   const state=await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
   await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
   await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
   return u;
  }
  const a=await member('woman'),b=await member('man'),outsider=await member('man');
  const request=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[request]);
  const id=await call(a,'public.marriage_message($1,$2,$3)',[request,'hello',randomUUID()]);
  const react=async(u,emoji,message=id,connection=request)=>{try{return await call(u,'public.marriage_react_to_message($1,$2,$3)',[connection,message,emoji]);}catch(error){error.message='reaction '+emoji+': '+error.message;throw error;}};
  const changes=u=>call(u,'public.marriage_message_changes($1,$2)',[request,[id]]);
  await db.exec('truncate realtime.messages');
  assert.deepEqual(await react(a,'❤️'),[{emoji:'❤️',count:1,mine:true}]);
  assert.deepEqual((await changes(b))[0].reactions,[{emoji:'❤️',count:1,mine:false}]);
  const broadcast=await db.query('select topic,event,private,payload from realtime.messages');
  assert.equal(broadcast.rows.length,2);assert.deepEqual(new Set(broadcast.rows.map(r=>r.topic)),new Set([a,b].map(u=>'marriage:member:'+u.id)));
  assert(broadcast.rows.every(r=>r.private&&r.event==='changed'&&Object.keys(r.payload).every(k=>k==='id')),'broadcast does not carry private content or reactions');
  assert.deepEqual(await react(b,'❤️'),[{emoji:'❤️',count:2,mine:true}]);
  assert.deepEqual(await react(a,'👍'),[{emoji:'❤️',count:1,mine:false},{emoji:'👍',count:1,mine:true}]);
  assert.deepEqual((await call(b,'public.marriage_thread_page($1)',[request]))[0].reactions,[{emoji:'❤️',count:1,mine:true},{emoji:'👍',count:1,mine:false}]);
  assert.deepEqual((await call(a,'public.marriage_thread($1)',[request]))[0].reactions,[{emoji:'❤️',count:1,mine:false},{emoji:'👍',count:1,mine:true}]);
  const count=(await db.query('select count(*)::int n from realtime.messages')).rows[0].n;
  await react(a,'👍');assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,count,'idempotent retry does not broadcast');
  assert.deepEqual(await react(a,null),[{emoji:'❤️',count:1,mine:false}]);
  assert.deepEqual(await react(b,null),[]);
  assert.equal((await db.query('select count(*)::int n from marriage.message_reactions')).rows[0].n,0);
  await assert.rejects(react(a,'not emoji'),/تفاعلاً/);
  await assert.rejects(react(outsider,'❤️'),/المحادثة/);
  await assert.rejects(react(a,'❤️',randomUUID()),/الرسالة/);
  await assert.rejects(react(a,'❤️',id,randomUUID()),/المحادثة/);
  await db.query('update marriage.members set suspended=true where id=$1',[b.id]);
  await assert.rejects(react(a,'❤️'),/المحادثة/);await assert.rejects(react(b,'❤️'));
  await db.query('update marriage.members set suspended=false where id=$1',[b.id]);
  // Suspension correctly closes existing connections; restore this disposable
  // fixture so the remaining checks can exercise deletion independently.
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[request]);
  await react(a,'😂');await call(a,'public.marriage_delete_message($1,$2)',[request,id]);
  assert.deepEqual((await changes(b))[0].reactions,[]);
  assert.equal((await db.query('select count(*)::int n from marriage.message_reactions')).rows[0].n,0,'deleting a message removes its reactions');
  await assert.rejects(react(a,'❤️'),/الرسالة/);
  const second=await call(b,'public.marriage_message($1,$2,$3)',[request,'bye',randomUUID()]);
  await call(a,"public.marriage_act($1,'cancel')",[request]);
  await assert.rejects(react(b,'❤️',second),/المحادثة/);
  assert.equal((await db.query("select relrowsecurity enabled from pg_class where oid='marriage.message_reactions'::regclass")).rows[0].enabled,true);
  for(const role of['anon','authenticated','service_role']){
   assert.equal((await db.query("select has_table_privilege($1,'marriage.message_reactions','select,insert,update,delete') allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'marriage.message_reactions_json(uuid,uuid)','execute') allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select has_function_privilege('anon','public.marriage_react_to_message(uuid,uuid,text)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
