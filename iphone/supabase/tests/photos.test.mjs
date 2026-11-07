import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';

function fixture(db){
 const rpc=async(expression,args=[]) => (await db.query('select '+expression+' as value',args)).rows[0].value;
 const call=(u,expression,args=[])=>asMember(db,u.id,u.sessionId,()=>rpc(expression,args));
 async function add(gender){
  const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  const state=await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-07-privacy',signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:false,assessment:true,photo:false}}]);
  await asService(db,()=>rpc("public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>rpc('public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));
  return u;
 }
 async function storage(u,operation,query,args=[]){
  await db.query("select set_config('storage.operation',$1,false)",[operation]);
  try{return await asMember(db,u.id,u.sessionId,()=>db.query(query,args));}
  finally{await db.query("select set_config('storage.operation','',false)");}
 }
 const read=async(u,path,operation='object.get_authenticated')=>(await storage(u,operation,'select name from storage.objects where bucket_id=$1 and name=$2',['nisfayn-private-photos',path])).rows;
 async function upload(u){
  const p=await call(u,'public.marriage_photo_prepare()');
  await storage(u,'object.upload','insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',['nisfayn-private-photos',p.path,u.id,{mimetype:'image/jpeg',size:1400}]);
  await call(u,'public.marriage_photo_commit($1)',[p.id]);return p;
 }
 return{rpc,call,add,storage,read,upload};
}

test('private photos require explicit mutual grants and block signed URLs, enumeration and writes',async()=>{
 const db=await createDatabase();try{
  const{call,add,storage,read,upload}=fixture(db);const a=await add('woman'),b=await add('man'),outsider=await add('woman');
  const request=await call(a,'public.marriage_request($1)',[b.id]);const p=await upload(a);
  assert.equal((await call(a,'public.marriage_photo_state()')).mine.id,p.id);
  assert.equal((await read(a,p.path)).length,1);assert.equal((await read(b,p.path)).length,0);
  await assert.rejects(call(a,'public.marriage_photo_share($1,true)',[request]),/غير متاحة/);
  await call(b,"public.marriage_act($1,'accept')",[request]);
  assert.equal((await call(b,'public.marriage_photo_state($1)',[request])).peer,null);
  await call(a,'public.marriage_photo_share($1,true)',[request]);
  assert.equal((await call(b,'public.marriage_photo_state($1)',[request])).peer.id,p.id);
  const exported=await call(a,'public.marriage_personal_data()');
  assert.equal(exported.exportVersion,2);assert.equal(exported.privatePhoto.id,p.id);assert.equal(exported.photoShares[0].requestId,request);
  assert(!JSON.stringify(exported).includes(p.path));
  assert.equal((await call(b,'public.marriage_personal_data()')).privatePhoto,null);
  assert.equal((await read(b,p.path)).length,1);assert.equal((await read(outsider,p.path)).length,0);
  await assert.rejects(call(outsider,'public.marriage_photo_state($1)',[request]),/غير متاحة/);
  for(const op of ['object.sign','object.sign_many','object.list','object.copy','render.image_authenticated','s3.object.get',''])assert.equal((await read(b,p.path,op)).length,0,op);
  assert.equal((await read(a,p.path,'object.sign')).length,0);
  assert.equal((await storage(b,'object.delete_many','delete from storage.objects where name=$1 returning id',[p.path])).rows.length,0);
  assert.equal((await storage(a,'object.upload_update','update storage.objects set metadata=$1 where name=$2 returning id',[{mimetype:'image/jpeg',size:99},p.path])).rows.length,0);
  await assert.rejects(storage(a,'object.upload','insert into storage.objects(bucket_id,name) values($1,$2)',['nisfayn-private-photos',a.id+'/'+randomUUID()+'.jpg']),/row-level security/);
  await assert.rejects(call(b,'public.marriage_photo_commit($1)',[p.id]),/غير متاحة/);
  await asMember(db,a.id,a.sessionId,()=>assert.rejects(db.query('select * from marriage.photo_grants'),/permission denied/));
  await call(a,'public.marriage_photo_commit($1)',[p.id]);
  assert.equal((await db.query("select count(*)::int n from marriage.consents where member_id=$1 and version='2026-11-06-private-photo'",[a.id])).rows[0].n,1);
  await call(a,'public.marriage_photo_share($1,false)',[request]);
  assert.equal((await read(b,p.path)).length,0);assert.equal((await call(b,'public.marriage_photo_state($1)',[request])).peer,null);
  await call(a,'public.marriage_photo_share($1,true)',[request]);
  await db.query("update marriage.photo_grants set expires_at=now()-interval '1 second' where photo_id=$1",[p.id]);
  assert.equal((await read(b,p.path)).length,0);
  await call(a,'public.marriage_photo_share($1,true)',[request]);
  await call(a,'public.marriage_pause(true)');assert.equal((await read(b,p.path)).length,1,'discovery pause preserves an explicit private photo grant');
  await call(a,'public.marriage_pause(false)');
  for(const [change,restore] of [
   ["update marriage.members set suspended=true where id=$1","update marriage.members set suspended=false where id=$1"],
   ["update marriage.store_transactions set revoked=true where original_id=$1::text","update marriage.store_transactions set revoked=false where original_id=$1::text"]
  ]){await db.query(change,[a.id]);assert.equal((await read(b,p.path)).length,0);await db.query(restore,[a.id]);}
  await db.query('insert into marriage.blocks values($1,$2,now())',[b.id,a.id]);assert.equal((await read(b,p.path)).length,0);
  await db.query('delete from marriage.blocks where member_id=$1 and blocked_id=$2',[b.id,a.id]);
  await db.query("update marriage.member_requests set status='closed' where id=$1",[request]);assert.equal((await read(b,p.path)).length,0);
  await db.query('delete from auth.sessions where id=$1',[a.sessionId]);
  await assert.rejects(read(a,p.path),/يلزم تسجيل الدخول/);
 }finally{await db.close();}
});

test('replacement and account deletion revoke grants and queue Storage API cleanup',async()=>{
 const db=await createDatabase();try{
  const{rpc,call,add,read,upload}=fixture(db);const a=await add('woman'),b=await add('man');
  const request=await call(a,'public.marriage_request($1)',[b.id]);await call(b,"public.marriage_act($1,'accept')",[request]);
  const old=await upload(a);await call(a,'public.marriage_photo_share($1,true)',[request]);
  const fresh=await upload(a);assert.equal((await read(b,old.path)).length,0);assert.equal((await read(b,fresh.path)).length,0);
  assert.equal((await db.query('select count(*)::int n from marriage.photo_assets where owner_id=$1',[a.id])).rows[0].n,1);
  assert((await asService(db,()=>rpc('public.marriage_photo_cleanup_batch()'))).includes(old.path));
  await assert.rejects(call(a,'public.marriage_photo_cleanup_batch()'),/permission denied/);
  const pending=await call(a,'public.marriage_photo_prepare()');
  await db.query("update marriage.photo_assets set created_at=now()-interval '16 minutes' where id=$1",[pending.id]);
  await assert.rejects(call(a,'public.marriage_photo_commit($1)',[pending.id]),/تأكيد رفع/);
  assert((await asService(db,()=>rpc('public.marriage_photo_cleanup_batch()'))).includes(pending.path));
  await call(a,'public.marriage_delete_account()');
  assert.equal((await db.query('select count(*)::int n from marriage.photo_assets where owner_id=$1',[a.id])).rows[0].n,0);
  assert((await asService(db,()=>rpc('public.marriage_photo_cleanup_batch()'))).includes(fresh.path));
  await asService(db,()=>rpc('public.marriage_photo_cleanup_done($1)',[[old.path,pending.path,fresh.path]]));
  assert.deepEqual(await asService(db,()=>rpc('public.marriage_photo_cleanup_batch()')),[]);
  const signals=(await db.query("select payload from realtime.messages where event='changed'")).rows;
  assert(signals.every(({payload})=>!JSON.stringify(payload).includes('.jpg')));
 }finally{await db.close();}
});
