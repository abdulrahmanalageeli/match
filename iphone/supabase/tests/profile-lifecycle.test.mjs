import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

function fixture(db) {
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 const approve=u=>asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
 async function member(gender='woman',approved=true) {
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  u.profile={displayName:'الاسم المعتمد',age:29,gender,city:'الرياض',profession:'مهندس',bio:'النص المعتمد',lookingFor:'',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'من البداية',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:false,assessment:true,photo:true}};
  await call(u,'public.marriage_apply($1)',[u.profile]);
  if(approved)await approve(u);
  await db.query("update marriage.members set manual_access_until=now()+interval '2 days' where id=$1",[u.id]);return u;
 }
 const apply=(u,patch={})=>call(u,'public.marriage_apply($1)',[{...u.profile,...patch}]);
 const state=u=>call(u,'public.marriage_state()');
 async function connect(a,b){const id=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[id]);return id;}
 const send=(u,id,body='رسالة مستمرة')=>call(u,'public.marriage_message($1,$2,$3)',[id,body,randomUUID()]);
 const family=async(u,action,payload={})=>{const r=await call(u,'public.marriage_family($1,$2)',[action,payload]);if(r?.error)throw Error(r.error);return r;};
 return {rpc,call,approve,member,apply,state,connect,send,family};
}

test('discovery pause preserves accepted chat, replies, receipts, progress and voice while stopping new requests',async()=>{
 const db=await createDatabase();try {
  const {call,member,connect,send}=fixture(db),a=await member(),b=await member('man'),c=await member('man');
  const id=await connect(a,b),pending=await call(a,'public.marriage_request($1)',[c.id]);
  await call(a,'public.marriage_pause(true)');
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[id])).rows[0].status,'accepted');
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[pending])).rows[0].status,'closed');
  await assert.rejects(call(a,'public.marriage_discover()'));
  await assert.rejects(call(a,'public.marriage_request($1)',[c.id]));
  await assert.rejects(call(c,'public.marriage_request($1)',[a.id]));
  const first=await send(a,id),reply=await call(b,'public.marriage_reply($1,$2,$3,$4)',[id,'رد مستمر',randomUUID(),first]);
  assert.equal((await call(a,'public.marriage_thread_page($1)',[id])).length,2);
  assert.equal((await call(a,'public.marriage_thread($1)',[id])).length,2);
  assert.equal((await call(a,'public.marriage_message_changes($1,$2)',[id,[reply]])).length,1);
  assert.equal(await call(a,'public.marriage_unread_count()'),1);
  await call(a,'public.marriage_mark_thread_read($1,$2)',[id,reply]);
  assert.equal(await call(a,'public.marriage_unread_count()'),0);
  assert.equal((await call(a,'public.marriage_inbox()'))[0].id,id);
  assert.equal((await call(b,'public.marriage_inbox()'))[0].id,id);
  await call(a,'public.marriage_progress($1)',[id]);
  await call(a,'public.marriage_next_step($1,1,true,true)',[id]);
  await call(b,'public.marriage_next_step($1,1,true,true)',[id]);
  await call(a,'public.marriage_photo_state($1)',[id]);
  const voice=await call(a,'public.marriage_call_start($1,$2)',[id,randomUUID()]);assert.equal(voice.status,'ringing');
 } finally {await db.close();}
});

test('continued conversations retain payment, block, suspension and session boundaries',async()=>{
 const db=await createDatabase();try {
  const {call,member,connect,send}=fixture(db),a=await member(),b=await member('man'),outsider=await member('man');const id=await connect(a,b);
  await call(a,'public.marriage_pause(true)');
  await assert.rejects(send(outsider,id));
  await db.query('update marriage.members set manual_access_until=null where id=$1',[b.id]);
  await assert.rejects(send(a,id));assert.equal((await call(a,'public.marriage_inbox()')).length,0);
  await db.query("update marriage.members set manual_access_until=now()+interval '1 day' where id=$1",[b.id]);
  await send(a,id);
  await db.query('delete from auth.sessions where id=$1',[a.sessionId]);await assert.rejects(send(a,id));
  await db.query('insert into auth.sessions values($1,$2,null)',[a.sessionId,a.id]);
  await call(a,"public.marriage_act($1,'block')",[id]);await assert.rejects(send(b,id));
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[id])).rows[0].status,'closed');
 } finally {await db.close();}
});

test('public edits enter review, preserve approved text and accepted chat, and enforce rolling thirty days atomically',async()=>{
 const db=await createDatabase();try {
  const {call,approve,member,apply,state,connect,send}=fixture(db),a=await member(),b=await member('man');const id=await connect(a,b);
  let result=await apply(a,{bio:'نص جديد تحت المراجعة'});
  assert.equal(result.user.applicationStatus,'pending');assert.equal(result.user.profileReviewPending,true);
  assert(Date.parse(result.user.nextPublicProfileEditAt)>Date.now()+29*86400000);
  assert.equal((await call(b,'public.marriage_inbox()'))[0].person.bio,'النص المعتمد');
  assert.equal((await call(b,'public.marriage_inbox()'))[0].person.portrait,null);
  await send(a,id);await send(b,id);
  await assert.rejects(call(a,'public.marriage_discover()'));
  result=await apply(a,{bio:'تصحيح أثناء المراجعة'});assert.equal(result.profile.bio,'تصحيح أثناء المراجعة');
  await approve(a);assert.equal((await state(a)).user.profileReviewPending,false);
  assert.equal((await call(b,'public.marriage_inbox()'))[0].person.bio,'تصحيح أثناء المراجعة');
  await assert.rejects(apply(a,{bio:'تعديل مبكر'}),/٣٠ يومًا/);
  result=await state(a);assert.equal(result.profile.bio,'تصحيح أثناء المراجعة');assert.equal(result.user.applicationStatus,'approved');
  assert.equal(result.user.profileReviewPending,false);await send(a,id);
  await db.query("update marriage.members set last_public_profile_edit_at=now()-interval '30 days' where id=$1",[a.id]);
  assert.equal((await state(a)).user.nextPublicProfileEditAt,null);
  assert.equal((await apply(a,{bio:'تعديل في الموعد'})).user.applicationStatus,'pending');
 } finally {await db.close();}
});

test('initial corrections and private preferences do not consume the approved public-edit allowance',async()=>{
 const db=await createDatabase();try {
  const {member,apply,approve,state}=fixture(db),a=await member('woman',false);
  await apply(a,{bio:'التصحيح الأول'});await apply(a,{bio:'التصحيح الثاني'});
  assert.equal((await state(a)).user.nextPublicProfileEditAt,null);await approve(a);
  const profile=(await state(a)).profile;
  const before=(await db.query('select marriage.public_profile_snapshot($1) value',[a.id])).rows[0].value;
  const result=await apply(a,{...profile,preferredMinAge:26});
  assert.deepEqual((await db.query('select marriage.public_profile_snapshot($1) value',[a.id])).rows[0].value,before);
  assert.equal(result.user.applicationStatus,'approved');assert.equal(result.user.profileReviewPending,false);assert.equal(result.user.nextPublicProfileEditAt,null);
 } finally {await db.close();}
});

test('administrative suspension during member edit review ends accepted access',async()=>{
 const db=await createDatabase();try {
  const {rpc,call,member,apply,connect,send,state}=fixture(db),a=await member(),b=await member('man');const id=await connect(a,b);
  await apply(a,{bio:'تحديث عام',displayName:'اسم غير معتمد'});await asService(db,()=>rpc("public.marriage_review($1,'suspend')",[a.id]));
  assert.equal((await state(a)).user.profileReviewPending,false);await assert.rejects(send(a,id));await assert.rejects(send(b,id));
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[id])).rows[0].status,'closed');
  assert(!JSON.stringify(await call(b,'public.marriage_request_history()')).includes('اسم غير معتمد'));
 } finally {await db.close();}
});

test('accepted family communication survives discovery pause and profile review but not revoked access',async()=>{
 const db=await createDatabase();try {
  const {call,member,apply,connect,family}=fixture(db),a=await member(),b=await member('man'),g={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
  await addUser(db,g);await db.query('update auth.users set raw_app_meta_data=$2 where id=$1',[g.id,{guardian_account:true}]);
  await family(g,'register',{displayName:'أحد الأهل',adult:true,consentVersion:'family-v1'});
  const id=await connect(a,b),inv=await family(a,'invite_link',{relationship:'father'});
  await family(g,'claim_link',{token:inv.token});const link=(await family(a,'state')).links[0];await family(a,'approve_link',{linkId:link.id});
  await db.query("update marriage.family_links set admin_review='approved' where id=$1",[link.id]);
  await family(a,'consent',{connectionId:id,agree:true});await family(b,'consent',{connectionId:id,agree:true});
  const made=await family(a,'create_room',{connectionId:id,title:'حديث عائلي',participantIds:['member:'+a.id,'member:'+b.id,'family:'+g.id]});const roomId=made.rooms[0].id;
  await family(b,'approve_room',{roomId,agree:true});await family(g,'accept_room',{roomId,agree:true});
  await call(a,'public.marriage_pause(true)');await apply(a,{displayName:'اسم لم يعتمد بعد'});
  const visible=(await family(g,'state'));assert.equal(visible.rooms[0].status,'active');assert(!JSON.stringify(visible).includes('اسم لم يعتمد بعد'));
  await family(g,'send',{roomId,body:'رسالة عائلية مستمرة',clientId:randomUUID()});
  await call(b,"public.marriage_act($1,'block')",[id]);
  await assert.rejects(family(g,'send',{roomId,body:'لا ينبغي إرسالها',clientId:randomUUID()}));
 } finally {await db.close();}
});

test('profile photo replacement is reviewed and limited while immediate photo removal remains possible',async()=>{
 const db=await createDatabase();try {
  const {call,member,approve,state}=fixture(db),a=await member(),b=await member('man');
  async function upload(){const p=await call(a,"public.marriage_portrait_prepare_v2(65,'never')");await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['nisfayn-profile-portraits',p.path,{mimetype:'image/jpeg',size:100}]);return p;}
  const p=await upload();await call(a,'public.marriage_portrait_commit($1)',[p.id]);
  assert.equal((await state(a)).user.profileReviewPending,true);await assert.rejects(call(b,'public.marriage_portrait_view($1)',[p.id]));
  await approve(a);assert.equal((await call(b,'public.marriage_portrait_view($1)',[p.id])).path,p.path);
  await call(a,'public.marriage_portrait_commit($1)',[p.id]);assert.equal((await state(a)).user.applicationStatus,'approved','retrying same committed photo is idempotent');
  const next=await upload();await assert.rejects(call(a,'public.marriage_portrait_commit($1)',[next.id]),/٣٠ يومًا/);
  await call(a,'public.marriage_portrait_remove()');assert.equal((await state(a)).profile.portrait,null);
 } finally {await db.close();}
});

test('consent withdrawal stays immediate during the cooldown and cannot carry an unrelated public edit',async()=>{
 const db=await createDatabase();try {
  const {member,apply,approve,state}=fixture(db),a=await member('woman',false);
  const published={...a.profile,appearanceVersion:'appearance-v1',marriageBasics:{skinTone:'tone_4'},signupConsents:{...a.profile.signupConsents,sensitivePublication:true}};
  await apply(a,published);await approve(a);
  await apply(a,{...published,bio:'نص تمت مراجعته'});await approve(a);
  const current=(await state(a)).profile;
  const withdrawn={...current,signupConsents:{...current.signupConsents,sensitivePublication:false}};
  await assert.rejects(apply(a,{...withdrawn,bio:'تعديل غير متعلق بسحب الموافقة'}),/٣٠ يومًا/);
  const result=await apply(a,withdrawn);assert.equal(result.user.applicationStatus,'approved');assert.equal(result.profile.signupConsents.sensitivePublication,false);
  assert(result.user.nextPublicProfileEditAt);assert.equal(result.user.profileReviewPending,false);
 } finally {await db.close();}
});

test('mutual curated introductions survive pause and public review without revealing new contact details',async()=>{
 const db=await createDatabase();try {
  const {rpc,call,member,apply,state}=fixture(db),a=await member(),b=await member('man');
  for(const u of [a,b]){const account=await state(u);await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:account.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));}
  const id=await asService(db,()=>rpc('public.marriage_assign($1,$2)',[a.id,b.id]));
  await call(a,"public.marriage_respond($1,'accept',null)",[id]);await call(b,"public.marriage_respond($1,'accept',null)",[id]);
  await call(a,'public.marriage_pause(true)');assert.equal((await state(b)).introduction.status,'mutual');
  await apply(a,{bio:'نص لم يعتمد',contact:'unreviewed@example.test'});
  const intro=(await state(b)).introduction;assert.equal(intro.id,id);assert.equal(intro.person.bio,'النص المعتمد');assert.equal(intro.contact,a.email);
  assert.equal((await db.query('select closed_at from marriage.introductions where id=$1',[id])).rows[0].closed_at,null);
 } finally {await db.close();}
});

test('lifecycle timestamps, snapshots and unchecked authorization helpers cannot be changed or called by members',async()=>{
 const db=await createDatabase();try {
  const {member}=fixture(db),a=await member();
  await asMember(db,a.id,a.sessionId,async()=>{
   await assert.rejects(db.query('update marriage.members set last_public_profile_edit_at=null,profile_review_pending=true where id=$1',[a.id]),/permission denied/);
   for(const expression of ['marriage.public_profile_snapshot($1)','marriage.relationship_member_allowed($1)','marriage.require_communication_member()'])
    await assert.rejects(db.query('select '+expression,expression.includes('$1')?[a.id]:[]),/permission denied/);
  });
  const insecure=(await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='marriage' and p.proname in ('apply_profile','portrait_commit','gallery','member_card','public_profile_snapshot','require_communication_member','relationship_eligible') and (has_function_privilege('anon',p.oid,'EXECUTE') or not coalesce(p.proconfig@>array['search_path=\"\"'],false))")).rows;
  assert.deepEqual(insecure,[]);
 } finally {await db.close();}
});

test('withdrawing a story or sensitive publication during pending review immediately redacts the approved snapshot',async()=>{
 const db=await createDatabase();try {
  const {call,member,apply,approve,state,connect}=fixture(db),a=await member('woman',false),b=await member('man');
  const published={...a.profile,appearanceVersion:'appearance-v1',marriageBasics:{skinTone:'tone_4'},signupConsents:{...a.profile.signupConsents,sensitivePublication:true},
   beena:{version:'beena-v1',answers:{},story:{scenarioId:'family_boundaries',text:'نناقش ما يهمنا بهدوء قبل أن نتخذ قرارًا.',share:true}}};
  await apply(a,published);await approve(a);await connect(a,b);
  await apply(a,{...published,bio:'تحديث ينتظر المراجعة'});
  let card=(await call(b,'public.marriage_inbox()'))[0].person;assert(card.beenaStory);assert.equal(card.marriageBasics.skinTone,'tone_4');
  const current=(await state(a)).profile;
  await apply(a,{...current,beena:{...current.beena,story:{...current.beena.story,share:false}},signupConsents:{...current.signupConsents,sensitivePublication:false}});
  card=(await call(b,'public.marriage_inbox()'))[0].person;assert.equal(card.beenaStory,undefined);assert.equal(card.marriageBasics.skinTone,undefined);
  const snapshot=(await db.query('select approved_profile_snapshot value from marriage.members where id=$1',[a.id])).rows[0].value;
  assert.equal(snapshot.card.beenaStory,undefined);assert.equal(snapshot.card.marriageBasics.skinTone,undefined);
  await apply(a,{...current,beena:current.beena,signupConsents:current.signupConsents});
  card=(await call(b,'public.marriage_inbox()'))[0].person;assert.equal(card.beenaStory,undefined);assert.equal(card.marriageBasics.skinTone,undefined,'re-grant cannot resurrect the old snapshot');
 } finally {await db.close();}
});

test('public gallery commits share the monthly allowance, are hidden during review and permit immediate removal',async()=>{
 const db=await createDatabase();try {
  const {call,member,approve,state,apply}=fixture(db),a=await member(),b=await member('man');
  async function upload(){const p=await call(a,"public.marriage_gallery('prepare')");await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['nisfayn-profile-gallery',p.path,{mimetype:'image/jpeg',size:100}]);await call(a,"public.marriage_gallery('commit',$1)",[p.id]);return p;}
  const first=await upload();assert.equal((await state(a)).user.profileReviewPending,true);
  await assert.rejects(call(b,"public.marriage_gallery('list',null,$1)",[a.id]));
  await upload();await approve(a);assert.equal((await call(b,"public.marriage_gallery('list',null,$1)",[a.id])).length,2);
  await call(a,"public.marriage_gallery('commit',$1)",[first.id]);assert.equal((await state(a)).user.applicationStatus,'approved');
  await assert.rejects(call(a,"public.marriage_gallery('prepare')"),/٣٠ يومًا/);
  await assert.rejects(apply(a,{bio:'تعديل عام بعد المعرض'}),/٣٠ يومًا/);
  await call(a,"public.marriage_gallery('remove',$1)",[first.id]);assert.equal((await call(b,"public.marriage_gallery('list',null,$1)",[a.id])).length,1);
 } finally {await db.close();}
});
