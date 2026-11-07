import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

const bucket='nisfayn-profile-portraits';
const consents={version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true};
function fixture(db){
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
 async function member(gender){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  const state=await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:consents}]);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
  return u;
 }
 async function storage(u,operation,sql,args=[]){
  await db.query("select set_config('storage.operation',$1,false)",[operation]);
  try{return await asMember(db,u.id,u.sessionId,()=>db.query(sql,args));}
  finally{await db.query("select set_config('storage.operation','',false)");}
 }
 const read=(u,path,op='object.get_authenticated')=>storage(u,op,'select name from storage.objects where bucket_id=$1 and name=$2',[bucket,path]).then(r=>r.rows.length);
 const put=(u,path,metadata={mimetype:'image/jpeg',size:1200})=>storage(u,'object.upload','insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,metadata]);
 const prepare=(u,policy)=>call(u,'public.marriage_portrait_prepare_v2(55,$1)',[policy]);
 async function portrait(u,policy){const p=await prepare(u,policy);await put(u,p.path);if(p.clearPath)await put(u,p.clearPath);await call(u,'public.marriage_portrait_commit($1)',[p.id]);return p;}
 const view=(u,p)=>call(u,'public.marriage_portrait_view($1)',[p.id]);
 return {rpc,call,member,storage,read,put,prepare,portrait,view};
}

test('clear portrait is per-peer, mutual-stage gated and revoked by rewind, closure, block and owner policy',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,read,portrait,view}=fixture(db);
  const owner=await member('woman'),peer=await member('man'),other=await member('man');
  const p=await portrait(owner,'matched');
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[owner.id]));
  assert.deepEqual(await view(owner,p),{id:p.id,path:p.path,blur:55,revealed:false},'owner sees public blurred preview');
  assert.equal(await read(peer,p.path),1);assert.equal(await read(peer,p.clearPath),0);
  assert.equal((await view(peer,p)).revealed,false);
  const request=await call(peer,'public.marriage_request($1)',[owner.id]);
  assert.equal((await view(peer,p)).revealed,false,'one-sided interest does not reveal');
  await call(owner,"public.marriage_act($1,'accept')",[request]);
  assert.deepEqual(await view(peer,p),{id:p.id,path:p.clearPath,blur:0,revealed:true});
  assert.equal(await read(peer,p.clearPath),1);assert.equal(await read(other,p.clearPath),0);
  const card=(await call(peer,'public.marriage_browse()')).find(c=>c.id===owner.id);
  assert.deepEqual(card.portrait,{id:p.id,path:p.path,blur:55,revealed:true},'cards never embed clear paths or owner policy');
  for(const op of ['object.sign','object.sign_many','object.list','object.copy','render.image_authenticated','s3.object.get',''])assert.equal(await read(peer,p.clearPath,op),0,op);
  await assert.rejects(call(peer,"public.marriage_portrait_policy($1,'family')",[p.id]),/تغيّرت/);
  await call(owner,"public.marriage_portrait_policy($1,'serious')",[p.id]);
  assert.equal(await read(peer,p.clearPath),0);
  await call(owner,'public.marriage_next_step($1,1,true,true)',[request]);
  assert.equal(await read(peer,p.clearPath),0,'one person cannot confirm a relationship stage');
  await call(peer,'public.marriage_next_step($1,1,true,true)',[request]);assert.equal(await read(peer,p.clearPath),1);
  await call(owner,"public.marriage_portrait_policy($1,'family')",[p.id]);assert.equal(await read(peer,p.clearPath),0);
  await call(owner,'public.marriage_next_step($1,2,true,true)',[request]);assert.equal(await read(peer,p.clearPath),0);
  await call(peer,'public.marriage_next_step($1,2,true,true)',[request]);assert.equal(await read(peer,p.clearPath),1);
  await call(owner,'public.marriage_rewind_step($1,2,true)',[request]);assert.equal(await read(peer,p.clearPath),1);
  await call(peer,'public.marriage_rewind_step($1,2,true)',[request]);assert.equal(await read(peer,p.clearPath),0,'mutual rewind immediately revokes clear object');
  await call(owner,"public.marriage_portrait_policy($1,'serious')",[p.id]);assert.equal(await read(peer,p.clearPath),1);
  await call(owner,"public.marriage_portrait_policy($1,'matched')",[p.id]);
  await call(owner,"public.marriage_act($1,'cancel')",[request]);
  assert.equal(await read(peer,p.clearPath),0,'ending match revokes even when the path is known');
  assert.equal((await view(peer,p)).revealed,false);
  await db.query("update marriage.member_requests set status='accepted' where id=$1",[request]);
  assert.equal(await read(peer,p.clearPath),1);
  await db.query('insert into marriage.blocks values($1,$2,now())',[owner.id,peer.id]);
  assert.equal(await read(peer,p.clearPath),0);await assert.rejects(view(peer,p),/غير متاحة/);
  await db.query('delete from marriage.blocks where member_id=$1',[owner.id]);
  assert.equal(await read(peer,p.clearPath),0,'unblocking does not resurrect the ended match');
  assert.equal((await view(peer,p)).revealed,false);
  const off=await call(owner,"public.marriage_portrait_policy($1,'never')",[p.id]);
  assert.equal(off.hasClear,false);assert.equal(off.revealPolicy,'never');assert.equal(await read(owner,p.clearPath),0);
  assert((await db.query('select path from marriage.portrait_cleanup')).rows.some(r=>r.path===p.clearPath));
  await call(owner,"public.marriage_portrait_policy($1,'never')",[p.id]);
  assert.equal((await db.query('select count(*)::int n from marriage.portrait_cleanup where path=$1',[p.clearPath])).rows[0].n,1);
  await assert.rejects(call(owner,"public.marriage_portrait_policy($1,'matched')",[p.id]),/مجددًا/);
 }finally{await db.close();}
});

test('clear upload is explicit, atomic, MIME/size validated, owner scoped and cleaned on replacement or account removal',async()=>{
 const db=await createDatabase();try{
  const{call,member,read,put,prepare,portrait}=fixture(db);const owner=await member('woman'),peer=await member('man');
  const unblurred=await call(owner,"public.marriage_portrait_prepare_v2(0,'never')");await put(owner,unblurred.path);
  await call(owner,'public.marriage_portrait_commit($1)',[unblurred.id]);
  await assert.rejects(call(owner,"public.marriage_portrait_policy($1,'matched')",[unblurred.id]),/تمويهًا/);
  const old=await portrait(owner,'never');assert.equal(old.clearPath,undefined);assert.equal(old.hasClear,false);
  await assert.rejects(call(owner,"public.marriage_portrait_prepare_v2(0,'matched')"),/تمويهًا/);
  for(const policy of ['',null,'public'])await assert.rejects(prepare(owner,policy),/إظهار/);
  const p=await prepare(owner,'family');await put(owner,p.path);
  await assert.rejects(put(peer,p.clearPath),/row-level security/);
  await assert.rejects(call(owner,'public.marriage_portrait_commit($1)',[p.id]),/النسخة الواضحة/);
  assert.equal((await call(owner,'public.marriage_portrait_info()')).id,old.id,'failed clear upload preserves live portrait');
  await put(owner,p.clearPath,{mimetype:'image/png',size:1200});
  await assert.rejects(call(owner,'public.marriage_portrait_commit($1)',[p.id]),/النسخة الواضحة/);
  await db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/jpeg',size:3145729},p.clearPath]);
  await assert.rejects(call(owner,'public.marriage_portrait_commit($1)',[p.id]),/النسخة الواضحة/);
  await db.query('update storage.objects set metadata=$1 where name=$2',[{mimetype:'image/jpeg',size:1200},p.clearPath]);
  await call(owner,'public.marriage_portrait_commit($1)',[p.id]);
  assert.equal(await read(owner,old.path),0);assert.equal(await read(peer,p.clearPath),0);
  const replacement=await prepare(owner,'matched');await put(owner,replacement.clearPath);
  await assert.rejects(call(owner,'public.marriage_portrait_commit($1)',[replacement.id]),/لم يكتمل/);
  assert.equal((await call(owner,'public.marriage_portrait_info()')).id,p.id,'clear-only upload cannot replace current portrait');
  await put(owner,replacement.path);await call(owner,'public.marriage_portrait_commit($1)',[replacement.id]);
  let queue=(await db.query('select path from marriage.portrait_cleanup')).rows.map(r=>r.path);
  assert(queue.includes(p.path));assert(queue.includes(p.clearPath));assert.equal(await read(owner,p.clearPath),0);
  const stale=await prepare(owner,'serious');await put(owner,stale.clearPath);
  await db.query("update marriage.member_portraits set created_at=now()-interval '16 minutes' where id=$1",[stale.id]);
  await asService(db,()=>db.query('select public.marriage_portrait_cleanup_batch()'));
  assert.equal(await read(owner,stale.clearPath),0);
  await call(owner,'public.marriage_delete_account()');
  queue=(await db.query('select path from marriage.portrait_cleanup')).rows.map(r=>r.path);
  for(const path of [replacement.path,replacement.clearPath,stale.path,stale.clearPath])assert(queue.includes(path));
  await assert.rejects(call(peer,'marriage.portrait_revealed($1,$2,$3)',[peer.id,owner.id,'matched']),/permission denied/);
 }finally{await db.close();}
});

test('curated introductions reveal only after both decisions and revoke when closed',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,member,read,portrait}=fixture(db),owner=await member('woman'),peer=await member('man');
  const p=await portrait(owner,'matched');
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[owner.id]));
  const intro=(await db.query('insert into marriage.introductions(member_a,member_b) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid)) returning id',[owner.id,peer.id])).rows[0].id;
  assert.equal(await read(peer,p.clearPath),0);
  await db.query('insert into marriage.introduction_decisions(introduction_id,member_id) values($1,$2)',[intro,owner.id]);
  assert.equal(await read(peer,p.clearPath),0);
  await db.query('insert into marriage.introduction_decisions(introduction_id,member_id) values($1,$2)',[intro,peer.id]);
  assert.equal(await read(peer,p.clearPath),1);
  await call(owner,"public.marriage_portrait_policy($1,'serious')",[p.id]);assert.equal(await read(peer,p.clearPath),0);
  await call(owner,"public.marriage_portrait_policy($1,'matched')",[p.id]);
  await db.query('update marriage.introductions set closed_at=now() where id=$1',[intro]);assert.equal(await read(peer,p.clearPath),0);
 }finally{await db.close();}
});

test('pair tester reveal follows server stage, owner revision, account eligibility and privacy-safe state',async()=>{
 const db=await createDatabase(),a='a'.repeat(64),b='b'.repeat(64);
 const rpc=async(action,session,payload={})=>{
  if(['portrait_prepare','portrait_commit','portrait_policy'].includes(action)&&!('expectedRevision' in payload))payload={...payload,expectedRevision:(await rpc('state',session)).profileRevision};
  return asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
 };
 const put=path=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,{mimetype:'image/jpeg',size:1200}]);
 try{
  await rpc('login',a,{actor:'abdulrahman'});let s=await rpc('login',b,{actor:'reham'});
  s=await rpc('profile',b,{expectedRevision:s.profileRevision,profile:{displayName:'رهام',gender:'woman',age:29,consentVersion:consents.version,signupConsents:consents}});
  await assert.rejects(rpc('portrait_prepare',b,{blur:0,revealPolicy:'matched'}),/تمويهًا/);
  const p=await rpc('portrait_prepare',b,{blur:60,revealPolicy:'family'});await put(p.path);
  await assert.rejects(rpc('portrait_commit',b,{id:p.id}),/النسخة الواضحة/);await put(p.clearPath);
  s=await rpc('portrait_commit',b,{id:p.id});const revision=s.profileRevision;
  assert.equal(s.profiles.reham.portrait.revealPolicy,'family');assert.equal(s.profiles.reham.portrait.clearPath,undefined);
  assert.equal((await rpc('portrait_info',a,{id:p.id})).path,p.path);
  s=await rpc('state',a);assert.equal(s.profiles.reham.portrait.revealPolicy,undefined);assert.equal(s.profiles.reham.portrait.revealed,false);
  await db.exec(`update nisfayn_test.room set data=data||'{"matched":true,"stage":2,"exclusive":true,"agree":{},"retiredFictional":true}'::jsonb`);
  assert.equal((await rpc('portrait_info',a,{id:p.id})).path,p.clearPath);
  s=await rpc('state',a);assert.equal(s.profiles.reham.portrait.path,p.path);assert.equal(s.profiles.reham.portrait.revealed,true);
  assert(!JSON.stringify(s).includes(p.clearPath),'state never returns retained original path');
  await rpc('rewind',a,{stage:2,agree:true});await rpc('rewind',b,{stage:2,agree:true});
  assert.equal((await rpc('portrait_info',a,{id:p.id})).revealed,false);
  s=await rpc('portrait_policy',b,{id:p.id,revealPolicy:'serious'});assert.notEqual(s.profileRevision,revision);
  await assert.rejects(rpc('portrait_policy',b,{id:p.id,revealPolicy:'never',expectedRevision:revision}),/تغيّر الملف/);
  assert.equal((await rpc('portrait_info',a,{id:p.id})).revealed,true);
  await assert.rejects(rpc('portrait_policy',a,{id:p.id,revealPolicy:'matched'}),/وافق|تغيّرت/);
  await db.exec("update marriage.admin_test_members set suspended=true where actor='reham'");
  await assert.rejects(rpc('portrait_info',a,{id:p.id}),/متاح/);
  await db.exec("update marriage.admin_test_members set suspended=false where actor='reham'");
  await rpc('close',a);await assert.rejects(rpc('portrait_info',a,{id:p.id}),/غير متاحة/);
  s=await rpc('portrait_policy',b,{id:p.id,revealPolicy:'never'});assert.equal(s.profiles.reham.portrait.hasClear,false);
  assert((await db.query('select path from marriage.portrait_cleanup')).rows.some(r=>r.path===p.clearPath));
  await assert.rejects(rpc('portrait_policy',b,{id:p.id,revealPolicy:'matched'}),/مجددًا/);
  const unknown='c'.repeat(64);await assert.rejects(rpc('portrait_info',unknown,{id:p.id}),/جلسة/);
 }finally{await db.close();}
});
