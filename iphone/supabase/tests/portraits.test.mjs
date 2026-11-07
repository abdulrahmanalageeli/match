import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const bucket='nisfayn-profile-portraits';
const consents={version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true};
function fixture(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender,approved=true){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  u.profile={displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:consents};
  const state=await call(u,'public.marriage_apply($1)',[u.profile]);
  if(approved){
   await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
   await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
  }
  return u;
 }
 async function storage(u,operation,sql,args=[]){
  await db.query("select set_config('storage.operation',$1,false)",[operation]);
  try{return await asMember(db,u.id,u.sessionId,()=>db.query(sql,args));}
  finally{await db.query("select set_config('storage.operation','',false)");}
 }
 const read=(u,path,op='object.get_authenticated')=>storage(u,op,'select name from storage.objects where bucket_id=$1 and name=$2',[bucket,path]).then(r=>r.rows.length);
 const put=(u,p,metadata={mimetype:'image/jpeg',size:1200})=>storage(u,'object.upload','insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,p.path,metadata]);
 async function portrait(u,blur=45){const p=await call(u,'public.marriage_portrait_prepare($1)',[blur]);await put(u,p);assert.deepEqual(await call(u,'public.marriage_portrait_commit($1)',[p.id]),{...p,revealPolicy:'never',hasClear:false});return p;}
 return{rpc,call,member,storage,read,put,portrait};
}

test('portrait consent, atomic replacement, account deletion and stale cleanup',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,put,read,portrait}=fixture(db);
  const pending=await member('woman',false),foreign=await member('man',false);
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[pending.id])).rows[0].review_status,'pending');
  const first=await portrait(pending,55);
  assert.equal((await call(pending,'public.marriage_state()')).profile.portrait.id,first.id);
  assert.equal(await read(pending,first.path),1);
  for(const invalid of [-1,101,null])await assert.rejects(call(pending,'public.marriage_portrait_prepare($1)',[invalid]),/التمويه/);
  const second=await call(pending,'public.marriage_portrait_prepare(70)');
  assert.equal((await call(pending,'public.marriage_portrait_info()')).id,first.id);
  await assert.rejects(call(pending,'public.marriage_portrait_commit($1)',[second.id]),/لم يكتمل/);
  assert.equal((await call(pending,'public.marriage_portrait_info()')).id,first.id);
  await put(pending,second,{mimetype:'image/png',size:1200});
  await assert.rejects(call(pending,'public.marriage_portrait_commit($1)',[second.id]),/لم يكتمل/);
  await db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/jpeg',size:1200},second.path]);
  await assert.rejects(call(foreign,'public.marriage_portrait_commit($1)',[second.id]),/مهلة/);
  await call(pending,'public.marriage_portrait_commit($1)',[second.id]);
  assert.equal(await read(pending,first.path),0);assert.equal(await read(pending,second.path),1);
  assert((await asService(db,()=>rpc('public.marriage_portrait_cleanup_batch()'))).includes(first.path));
  const staged=await call(pending,'public.marriage_portrait_prepare(20)');await put(pending,staged);
  await db.query("update marriage.member_portraits set created_at=now()-interval '16 minutes' where id=$1",[staged.id]);
  await assert.rejects(call(pending,'public.marriage_portrait_commit($1)',[staged.id]),/مهلة/);
  assert((await asService(db,()=>rpc('public.marriage_portrait_cleanup_batch()'))).includes(staged.path));
  assert.equal((await call(pending,'public.marriage_portrait_info()')).id,second.id);
  await assert.rejects(call(pending,'public.marriage_portrait_cleanup_batch()'),/permission denied/);
  await call(pending,'public.marriage_delete_account()');
  assert.equal((await db.query('select count(*)::int n from marriage.member_portraits where member_id=$1',[pending.id])).rows[0].n,0);
  assert((await asService(db,()=>rpc('public.marriage_portrait_cleanup_batch()'))).includes(second.path));
  const fresh={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,fresh);
  await assert.rejects(call(fresh,'public.marriage_portrait_prepare(20)'),/وافق/);
 }finally{await db.close();}
});

test('private portrait reads follow directory, block, pause and exclusive-match eligibility',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,put,read,portrait,storage}=fixture(db);
  const a=await member('woman'),b=await member('man'),c=await member('man');const p=await portrait(a);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[a.id]));
  assert.equal(await read(b,p.path),1);
  assert.equal((await call(b,'public.marriage_portrait_info($1)',[a.id])).id,p.id);
  assert.equal((await call(b,'public.marriage_browse()')).find(v=>v.id===a.id).portrait.id,p.id);
  for(const op of ['object.sign','object.sign_many','object.list','object.copy','render.image_authenticated','s3.object.get',''])assert.equal(await read(b,p.path,op),0,op);
  await assert.rejects(put(a,{path:a.id+'/'+randomUUID()+'.jpg'}),/row-level security/);
  const staged=await call(a,'public.marriage_portrait_prepare(60)');await put(a,staged);
  assert.equal(await read(b,staged.path),0,'uncommitted bytes are private to owner');
  assert.equal((await storage(a,'object.upload_update','update storage.objects set metadata=$1 where name=$2 returning id',[{size:3,mimetype:'image/jpeg'},p.path])).rows.length,0);
  assert.equal((await storage(a,'object.delete','delete from storage.objects where name=$1 returning id',[p.path])).rows.length,0);
  for(const field of ['paused','suspended']){
   await db.query('update marriage.members set '+field+'=true where id=$1',[a.id]);assert.equal(await read(b,p.path),0);
   await db.query('update marriage.members set '+field+'=false where id=$1',[a.id]);
  }
  await db.query('insert into marriage.blocks values($1,$2,now())',[b.id,a.id]);assert.equal(await read(b,p.path),0);
  await db.query('delete from marriage.blocks where member_id=$1',[b.id]);
  const match=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[match]);
  await call(a,'public.marriage_apply($1)',[a.profile]);
  assert.equal((await db.query('select review_status from marriage.members where id=$1',[a.id])).rows[0].review_status,'approved');
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[match])).rows[0].status,'accepted','unchanged saves preserve the match');
  await call(a,'public.marriage_next_step($1,1,true,true)',[match]);await call(b,'public.marriage_next_step($1,1,true,true)',[match]);
  assert.equal(await read(b,p.path),1);assert.equal(await read(c,p.path),0);
  await assert.rejects(call(c,'public.marriage_portrait_info($1)',[a.id]),/غير متاحة/);
  const withdrawn=await call(a,'public.marriage_apply($1)',[{...a.profile,signupConsents:{...consents,photo:false}}]);
  assert.equal(withdrawn.profile.portrait,null);assert.equal(await call(a,'public.marriage_portrait_info()'),null);assert.equal(await read(b,p.path),0);
  await assert.rejects(call(a,'public.marriage_portrait_prepare(50)'),/وافق/);
  const queued=await asService(db,()=>db.query('select public.marriage_portrait_cleanup_batch() value').then(r=>r.rows[0].value));assert(queued.includes(p.path));assert(queued.includes(staged.path));
  assert.equal(await call(a,'public.marriage_portrait_remove()'),true);
 }finally{await db.close();}
});

test('pair portraits use sessions and mutual eligibility, preserve current upload and return updated state',async()=>{
 const db=await createDatabase();const a='a'.repeat(64),b='b'.repeat(64);
 const rpc=async(action,session,payload={})=>{
  if(['portrait_prepare','portrait_commit','portrait_remove'].includes(action)&&!('expectedRevision' in payload))payload={...payload,expectedRevision:(await rpc('state',session)).profileRevision};
  return asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
 };
 const put=p=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,p.path,{mimetype:'image/jpeg',size:1000}]);
 try{
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await assert.rejects(rpc('portrait_prepare','c'.repeat(64),{blur:30,expectedRevision:'invalid'}),/جلسة/);
  await assert.rejects(rpc('portrait_prepare',a,{blur:30}),/وافق/);
  let state=await rpc('state',a);
  state=await rpc('profile',a,{expectedRevision:state.profileRevision,profile:{displayName:'عبدالرحمن',gender:'man',age:29,consentVersion:consents.version,signupConsents:consents}});
  const revision=state.profileRevision;
  const first=await rpc('portrait_prepare',a,{blur:35});await put(first);
  state=await rpc('portrait_commit',a,{id:first.id});assert.deepEqual(state.profiles.abdulrahman.portrait,first);assert.notEqual(state.profileRevision,revision);
  assert.deepEqual(await rpc('portrait_info',b,{id:first.id}),{id:first.id,path:first.path,blur:first.blur,revealed:false});
  const second=await rpc('portrait_prepare',a,{blur:80});
  await assert.rejects(rpc('portrait_commit',a,{id:second.id,expectedRevision:revision}),/تغيّر الملف/);
  await assert.rejects(rpc('portrait_commit',a,{id:second.id}),/لم يكتمل/);
  assert.equal((await rpc('portrait_info',a)).id,first.id);
  await put(second);await assert.rejects(rpc('portrait_commit',b,{id:second.id}),/وافق|مهلة/);
  state=await rpc('portrait_commit',a,{id:second.id});assert.equal(state.profiles.abdulrahman.portrait.id,second.id);
  assert.equal(await rpc('portrait_info',b,{id:first.id}),null);
  state=await rpc('profile',a,{expectedRevision:state.profileRevision,profile:{displayName:'عبدالرحمن',gender:'man',age:29,consentVersion:consents.version,signupConsents:consents,portrait:{id:first.id,path:'forged',blur:0}}});
  assert.equal(state.profiles.abdulrahman.portrait.id,second.id);
  await db.exec("update marriage.admin_test_members set paused=true where actor='abdulrahman'");
  await assert.rejects(rpc('portrait_info',b,{id:second.id}),/متاح/);await assert.rejects(rpc('portrait_info',a),/متاح/);
  await db.exec("update marriage.admin_test_members set paused=false where actor='abdulrahman'");
  await rpc('close',b);await assert.rejects(rpc('portrait_info',b,{id:second.id}),/غير متاحة/);
  assert.equal((await rpc('state',b)).profiles.abdulrahman.portrait,null);
  state=await rpc('portrait_remove',a);assert.equal(state.profiles.abdulrahman.portrait,null);assert.equal(await rpc('portrait_info',a),null);
  const final=await rpc('portrait_prepare',a,{blur:40});await put(final);state=await rpc('portrait_commit',a,{id:final.id});
  state=await rpc('profile',a,{expectedRevision:state.profileRevision,profile:{displayName:'عبدالرحمن',gender:'man',age:29,consentVersion:consents.version,signupConsents:{...consents,photo:false}}});
  assert.equal(state.profiles.abdulrahman.portrait,null);assert.equal(await rpc('portrait_info',a),null);
  await assert.rejects(rpc('portrait_prepare',a,{blur:40}),/وافق/);
  const queued=await asService(db,()=>db.query('select public.marriage_portrait_cleanup_batch() value').then(r=>r.rows[0].value));
  assert(queued.includes(first.path));assert(queued.includes(second.path));assert(queued.includes(final.path));
 }finally{await db.close();}
});
