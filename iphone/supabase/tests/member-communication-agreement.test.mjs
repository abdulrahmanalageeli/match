import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';

test('real member communication requires mutual agreement; history and cleanup remain usable',async()=>{
 const db=await createDatabase();
 try {
  await db.query("insert into marriage.cities(label) values('الرياض') on conflict do nothing");
  const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,async()=>(await db.query('select '+sql+' value',args)).rows[0].value);
  async function member(gender='man') {
   const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
   await addUser(db,u);
   // Seed already-approved members; this test targets communication, not intake.
   await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[u.id]);
   await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,'عضو اختبار',29,$2,(select id from marriage.cities where label='الرياض'),'مهندس','ملف تجريبي')",[u.id,gender]);
   await db.query("insert into marriage.preferences(member_id,min_age,max_age,family_preference) values($1,25,40,'')",[u.id]);
   return u;
  }
  const a=await member(),b=await member('woman'),outsider=await member();
  const id=await call(a,'public.marriage_request($1)',[b.id]);
  await call(b,"public.marriage_act($1,'accept')",[id]);
  const send=u=>call(u,'public.marriage_message($1,$2,$3)',[id,'رسالة اختبار',randomUUID()]);
  const startVoice=u=>call(u,'public.marriage_call_start($1,$2)',[id,randomUUID()]);
  const agreement=(u,action='read',payload={})=>call(u,'public.marriage_agreement($1,$2,$3)',[id,action,payload]);
  const voiceAllowed=async()=>(await db.query('select marriage.voice_allowed($1,$2,$3) allowed',[id,a.id,b.id])).rows[0].allowed;
  await assert.rejects(send(a),/اتفاق الجدية/);
  await assert.rejects(startVoice(a),/غير متاحة/);
  assert.equal(await voiceAllowed(),false);
  assert.equal((await call(a,'public.marriage_inbox()')).length,1);
  assert.deepEqual(await call(a,'public.marriage_thread($1)',[id]),[]);
  await call(a,'public.marriage_notifications()');
  await call(a,'public.marriage_set_typing($1,false)',[id]);
  await assert.rejects(call(a,'public.marriage_set_typing($1,true)',[id]),/اتفاق الجدية/);
  const proposal=await agreement(b,'propose',{days:7,signed:true});
  await assert.rejects(send(b),/اتفاق الجدية/);
  await agreement(a,'accept',{proposalId:proposal.proposalId,signed:true});
  const message=await send(a);
  assert.equal(await voiceAllowed(),true);
  const ringing=await startVoice(a);
  assert.equal(ringing.status,'ringing');
  assert.equal((await call(b,"public.marriage_call_act($1,'accept')",[ringing.id])).status,'active');
  assert.equal((await call(a,'public.marriage_call_token_grant($1)',[ringing.id])).callId,ringing.id);
  await assert.rejects(send(outsider),/غير متاحة/);
  await call(b,'public.marriage_reply($1,$2,$3,$4)',[id,'رد اختبار',randomUUID(),message]);
  await call(b,'public.marriage_react_to_message($1,$2,$3)',[id,message,'👍']);
  await call(b,'public.marriage_set_typing($1,true)',[id]);
  for(const invalid of [{}, {status:'proposed'}, {status:'accepted'}, {status:'accepted',deadline:null}, {status:'accepted',deadline:'invalid'}, {status:'accepted',deadline:'infinity'}, {status:'accepted',deadline:new Date(Date.now()-86400000).toISOString()}]) {
   await db.query('update marriage.conversation_agreements set data=$2 where request_id=$1',[id,invalid]);
   await assert.rejects(send(a),/اتفاق الجدية/);
   await assert.rejects(call(b,'public.marriage_reply($1,$2,$3,$4)',[id,'رد ممنوع',randomUUID(),message]),/اتفاق الجدية/);
   await assert.rejects(call(b,'public.marriage_react_to_message($1,$2,$3)',[id,message,'❤️']),/اتفاق الجدية/);
   await assert.rejects(call(b,'public.marriage_set_typing($1,true)',[id]),/اتفاق الجدية/);
   assert.equal(await voiceAllowed(),false);
   await assert.rejects(startVoice(a),/غير متاحة/);
  }
  assert.equal(await call(a,'public.marriage_call_token_grant($1)',[ringing.id]),null);
  assert.equal((await call(a,"public.marriage_call_act($1,'end')",[ringing.id])).status,'ended');
  assert.equal((await call(b,'public.marriage_thread($1)',[id])).length,2);
  await call(b,'public.marriage_react_to_message($1,$2,null)',[id,message]);
  await call(b,'public.marriage_set_typing($1,false)',[id]);
  await call(a,'public.marriage_delete_message($1,$2)',[id,message]);
  await db.query("update marriage.conversation_agreements set data='{\"status\":\"family\"}' where request_id=$1",[id]);
  await send(b);assert.equal(await voiceAllowed(),true);
  await assert.rejects(call(a,'marriage.agreement_allows_communication($1)',[id]),/permission denied/);
 } finally {await db.close();}
});

