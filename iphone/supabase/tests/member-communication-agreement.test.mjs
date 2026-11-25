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
   await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,$3,29,$2,(select id from marriage.cities where label='الرياض'),'مهندس','ملف تجريبي')",[u.id,gender,gender==='woman'?'ليلى':'خالد']);
   await db.query("insert into marriage.preferences(member_id,min_age,max_age,family_preference) values($1,25,40,'')",[u.id]);
   return u;
  }
  const a=await member(),b=await member('woman'),outsider=await member();
  const id=await call(a,'public.marriage_request($1)',[b.id]);
  await call(b,"public.marriage_act($1,'accept')",[id]);
  const send=u=>call(u,'public.marriage_message($1,$2,$3)',[id,'رسالة اختبار',randomUUID()]);
  const startVoice=u=>call(u,'public.marriage_call_start($1,$2)',[id,randomUUID()]);
  const agreement=(u,action='read',payload={})=>call(u,'public.marriage_agreement($1,$2,$3)',[id,action,payload]);
  // PostgREST omits the default action on initial load. A read must work even
  // in a read-only transaction and must not materialize an empty agreement.
  const readOnlyAgreement = async user => asMember(db,user.id,user.sessionId,async()=>{
   await db.exec('begin read only');
   try { return (await db.query('select public.marriage_agreement($1) as value',[id])).rows[0].value; }
   finally { await db.exec('rollback'); }
  });
  for(const [user,actor,mineName,peerName] of [[a,'abdulrahman','خالد','ليلى'],[b,'reham','ليلى','خالد']]){
   assert.deepEqual(await readOnlyAgreement(user),{status:'none',actor,mineName,peerName});
  }
  assert.equal((await db.query('select count(*)::int as count from marriage.conversation_agreements where request_id=$1',[id])).rows[0].count,0);
  await assert.rejects(readOnlyAgreement(outsider),error=>error.code==='42501');
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
  assert.equal((await readOnlyAgreement(a)).proposalId,proposal.proposalId);
  await assert.rejects(send(b),/اتفاق الجدية/);
  await agreement(a,'accept',{proposalId:proposal.proposalId,signed:true});
  const choice=(u,topic,action,token=null,stage=null)=>call(u,'public.marriage_journey_choice($1,$2,$3,$4,$5)',[id,topic,action,token,stage]);
  for(const [proposer,responder] of [[a,b],[b,a]]){
   let family=await agreement(proposer,'family_propose',{confirmed:true});
   const token=family.familyProposalId;
   await agreement(proposer,'family_clear',{proposalId:token});
   await assert.rejects(agreement(responder,'family_accept',{confirmed:true,proposalId:token}));
   family=await agreement(proposer,'family_propose',{confirmed:true});
   await agreement(responder,'family_clear',{proposalId:family.familyProposalId});
   family=await agreement(proposer,'family_propose',{confirmed:true});
   await assert.rejects(agreement(responder,'family_accept',{confirmed:true,proposalId:token}));
   assert.equal((await agreement(responder,'family_accept',{confirmed:true,proposalId:family.familyProposalId})).status,'family');
   assert.equal((await agreement(proposer,'family_clear',{proposalId:family.familyProposalId})).status,'accepted');
   let proposal=await choice(proposer,'exclusive','propose');
   assert.equal((await choice(responder,'exclusive','clear',proposal.exclusiveId)).exclusive,false);
   await assert.rejects(choice(responder,'exclusive','accept',proposal.exclusiveId));
   proposal=await choice(proposer,'exclusive','propose');
   assert.equal((await choice(responder,'exclusive','accept',proposal.exclusiveId)).exclusive,true);
   assert.equal((await choice(proposer,'exclusive','clear',proposal.exclusiveId)).stage,0);
   assert.equal(await voiceAllowed(),true);
  }
  for(const stage of [1,2]){
   const p=await choice(a,'step','propose',null,stage);
   assert.equal((await call(b,'public.marriage_progress($1)',[id])).peer,true);
   const next=await choice(b,'step','accept',p.stepId,stage);
   assert.equal(next.stage,stage);assert.equal(next.exclusive,false);
   if(stage===2)assert.equal((await choice(b,'step','clear',next.stepId,2)).stage,1);
  }
  await assert.rejects(choice(outsider,'exclusive','propose'));
  const deadline=(await agreement(a)).deadline;
  await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb(now()-interval '1 second')) where request_id=$1",[id]);
  for(const user of [a,b]){
   assert.equal((await agreement(user)).status,'expired');
   await assert.rejects(send(user),/اتفاق الجدية/);
  }
  const family=await agreement(a,'family_propose',{confirmed:true});
  await agreement(b,'family_accept',{proposalId:family.familyProposalId,confirmed:true});
  assert.equal((await agreement(b,'family_clear',{proposalId:family.familyProposalId})).status,'expired');
  await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb($2::text)) where request_id=$1",[id,deadline]);
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
  const uncertain=randomUUID(), args=[id,'رسالة قبل الحظر',uncertain];
  const committed=await call(a,'public.marriage_message($1,$2,$3)',args);
  assert.equal(await call(a,'public.marriage_message($1,$2,$3)',args),committed);
  const committedKeys=u=>call(u,'public.marriage_committed_chat_sends($1,$2)',[id,[uncertain]]);
  assert.deepEqual(await committedKeys(a),[uncertain]);assert.deepEqual(await committedKeys(b),[]);await assert.rejects(committedKeys(outsider));
  await call(b,"public.marriage_act($1,'block')",[id]);
  await assert.rejects(readOnlyAgreement(a),error=>error.code==='42501');
  await assert.rejects(call(a,'public.marriage_message($1,$2,$3)',args));
  await assert.rejects(send(a));await assert.rejects(committedKeys(a));await assert.rejects(call(a,'public.marriage_thread_page($1)',[id]));
  assert.equal((await db.query('select count(*)::int n from marriage.thread_messages where client_id=$1',[uncertain])).rows[0].n,1);
  await assert.rejects(call(a,'marriage.agreement_allows_communication($1)',[id]),/permission denied/);
 } finally {await db.close();}
});

