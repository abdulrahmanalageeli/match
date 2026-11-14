import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

test('member photo/audio uploads enforce consent, ownership, metadata, privacy and once-only redemption',async()=>{
 const db=await createDatabase();
 try {
  await db.query("insert into marriage.cities(label) values('الرياض') on conflict do nothing");
  const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,async()=>(await db.query('select '+sql+' value',args)).rows[0].value);
  async function member(gender='man') {
   const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
   await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[u.id]);
   await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,'عضو',29,$2,(select id from marriage.cities where label='الرياض'),'مهندس','نبذة')",[u.id,gender]);
   await db.query("insert into marriage.preferences(member_id,min_age,max_age,family_preference) values($1,25,40,'')",[u.id]);return u;
  }
  const a=await member(),b=await member('woman'),outside=await member();
  const request=await call(a,'public.marriage_request($1)',[b.id]);
  const media=(u,action,id,payload={})=>call(u,'public.marriage_chat_media($1,$2,$3,$4)',[action,request,id,payload]);
  const photo={kind:'photo',mime:'image/jpeg',size:100,viewOnce:false};
  const id=randomUUID();
  await assert.rejects(media(a,'prepare',id,photo),/غير متاحة/);
  await call(b,"public.marriage_act($1,'accept')",[request]);
  await assert.rejects(media(a,'prepare',id,photo),/اتفاق الجدية/);
  const proposal=await call(b,"public.marriage_agreement($1,'propose',$2)",[request,{days:7,signed:true}]);
  await call(a,"public.marriage_agreement($1,'accept',$2)",[request,{signed:true,proposalId:proposal.proposalId}]);
  await assert.rejects(media(outside,'prepare',id,photo),/غير متاح/);
  for(const invalid of [{...photo,size:8388609},{...photo,size:0},{...photo,size:12.5},{...photo,mime:'text/html'},{kind:'audio',mime:'audio/webm',size:100,duration:61},{kind:'audio',mime:'audio/webm',size:100},{kind:'audio',mime:'audio/webm',size:100,duration:2,viewOnce:true}])
   await assert.rejects(media(a,'prepare',randomUUID(),invalid));
  const reserved=await media(a,'prepare',id,photo);assert.equal(reserved.already,false);
  assert.equal((await media(a,'prepare',id,photo)).resume,true);
  await assert.rejects(media(a,'prepare',id,{...photo,size:101}),/معرّف الملف/);
  await assert.rejects(media(b,'prepare',id,photo),/غير متاح/);
  await assert.rejects(media(a,'commit',id),/لم يكتمل/);
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-member-chat',$1,'{}')",[reserved.path])),/row-level security/);
  const store=async(path,meta)=>asService(db,()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-member-chat',$1,$2)",[path,meta]));
  await store(reserved.path,{size:99,mimetype:'image/jpeg'});
  await assert.rejects(media(a,'commit',id),/لم يكتمل/);
  await db.query("update storage.objects set metadata=$2 where name=$1",[reserved.path,{size:100,mimetype:'image/jpeg'}]);
  assert.equal((await media(a,'commit',id)).id,id);
  assert.equal((await media(a,'commit',id)).id,id);
  assert.equal((await media(a,'prepare',id,photo)).already,true);
  assert.equal((await media(a,'abort',id)).path,null);
  assert.equal((await media(b,'access',id)).path,reserved.path);
  await assert.rejects(media(outside,'access',id),/غير متاح/);
  let thread=await call(b,'public.marriage_thread_page($1)',[request]);assert.equal(thread.length,1);assert.equal(thread[0].attachment.kind,'photo');assert.equal(thread[0].attachment.path,undefined);
  assert.equal((await call(b,"public.marriage_search_messages($1,'',null,'photo')",[request])).length,1);
  const voice=randomUUID(),voiceData={kind:'audio',mime:'audio/mp4',size:120,duration:4.5};
  const voiceReserved=await media(b,'prepare',voice,voiceData);await store(voiceReserved.path,{size:120,mimetype:'audio/mp4'});await media(b,'commit',voice);
  assert.equal((await call(a,"public.marriage_search_messages($1,'',null,'audio')",[request]))[0].attachment.duration,4.5);
  const once=randomUUID(),onceReserved=await media(a,'prepare',once,{...photo,viewOnce:true});await store(onceReserved.path,{size:100,mimetype:'image/jpeg'});await media(a,'commit',once);
  await assert.rejects(media(b,'access',once),/لمرة واحدة/);
  assert.equal((await media(a,'access',once)).path,onceReserved.path);
  assert.equal((await media(b,'open',once)).path,onceReserved.path);
  await assert.rejects(media(b,'open',once),/لمرة واحدة/);
  assert.ok((await call(a,'public.marriage_message_changes($1,$2)',[request,[once]]))[0].attachment.openedAt);
  assert.equal((await call(b,"public.marriage_search_messages($1,'',null,'photo')",[request])).length,1);
  await call(a,'public.marriage_delete_message($1,$2)',[request,id]);
  await assert.rejects(media(b,'access',id),/غير متاح/);
  thread=await call(b,'public.marriage_message_changes($1,$2)',[request,[id]]);assert.equal(thread[0].attachment,null);
  const cleanup=await asService(db,async()=>(await db.query('select public.marriage_chat_media_cleanup() value')).rows[0].value);assert.ok(cleanup.includes(reserved.path));
  await assert.rejects(call(a,'public.marriage_chat_media_cleanup()'),/permission denied/);
  const pending=randomUUID(),pendingReservation=await media(a,'prepare',pending,photo);
  await db.query("update marriage.conversation_agreements set data=jsonb_set(data,'{deadline}',to_jsonb((now()-interval '1 day')::text)) where request_id=$1",[request]);
  await assert.rejects(media(b,'access',voice),/اتفاق الجدية/);
  await assert.rejects(media(a,'commit',pending),/اتفاق الجدية/);
  assert.equal((await media(a,'abort',pending)).path,pendingReservation.path);
  assert.equal((await media(a,'abort',pending)).path,null);
  assert.equal((await db.query('select public from storage.buckets where id=$1',['nisfayn-member-chat'])).rows[0].public,false);
 }finally{await db.close();}
});
