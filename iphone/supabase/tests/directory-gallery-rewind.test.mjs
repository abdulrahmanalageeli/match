import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase,addUser,asMember,asService} from './harness.mjs';
const catalog=JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json',import.meta.url),'utf8'));
test('directory, maximum two matches, mutual rewind, work preferences and scoped gallery',async()=>{
 const db=await createDatabase();
 const call=(u,sql,args=[])=>asMember(db,u.id,u.sessionId,()=>db.query('select '+sql+' value',args).then(r=>r.rows[0].value));
 async function add(gender,work='A',hard=false){
  const u={id:randomUUID(),email:randomUUID()+'@example.test',sessionId:randomUUID()};await addUser(db,u);
  const answers=Object.fromEntries(catalog.dimensions.flatMap(d=>[[d.id,'A'],[d.partnerId,'A']]));answers.wife_work=work;
  const payload={displayName:'مثال',age:30,city:'الرياض',gender,profession:'مهندس',bio:'وصف للاختبار',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-06-assessment',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:false},assessmentVersion:'marriage-v2',surveyAnswers:answers,hardRequirements:hard?['wife_work']:[],marriageBasics:{smoking:'never',maritalStatus:'never_married'}};
  const state=await call(u,'public.marriage_apply($1)',[payload]);
  await asService(db,()=>db.query("select public.marriage_review($1,'approve')",[u.id]));
  await asService(db,()=>db.query('select public.marriage_record_receipt($1,$2,false)',[u.id,{bundleId:'com.blindmatch.marriage',productId:'com.blindmatch.marriage.monthly',appAccountToken:state.user.appAccountToken,originalTransactionId:u.id,transactionId:u.id,signedDate:Date.now(),expiresDate:Date.now()+86400000,environment:'Sandbox'}]));return u;
 }
 async function storage(u,op,sql,args){await db.query("select set_config('storage.operation',$1,false)",[op]);return asMember(db,u.id,u.sessionId,()=>db.query(sql,args));}
 try{
  const man=await add('man'),women=[];for(let i=0;i<7;i++)women.push(await add('woman'));
  const strict=await add('woman','A',true),opposed=await add('man','B');
  assert(!(await call(strict,'public.marriage_browse()')).some(p=>p.id===opposed.id),'work essential preference excludes conflicting partner');
  const five=await call(man,'public.marriage_discover()');assert.equal(five.length,5);
  let all=await call(man,'public.marriage_browse()');assert.equal(all.length,8);assert(all.every(p=>p.fit.total===16&&p.fit.percentage===100));
  assert.equal((await call(man,'public.marriage_browse($1)',[{city:'جدة'}])).length,0);
  assert.equal((await call(man,'public.marriage_browse($1)',[{work:'B'}])).length,0);
  assert.equal((await call(man,'public.marriage_browse($1)',[{smoking:'never',minFit:90,offset:5}])).length,3);
  const outsider=women.find(w=>!five.some(p=>p.id===w.id));
  const ab=await call(man,'public.marriage_request($1)',[outsider.id]);await call(outsider,"public.marriage_act($1,'accept')",[ab]);
  const second=women.find(w=>w.id!==outsider.id),third=women.find(w=>![outsider.id,second.id].includes(w.id));
  const ac=await call(man,'public.marriage_request($1)',[second.id]);const ad=await call(man,'public.marriage_request($1)',[third.id]);
  await call(second,"public.marriage_act($1,'accept')",[ac]);await assert.rejects(call(third,"public.marriage_act($1,'accept')",[ad]),/تعارفان/);
  assert((await call(third,'public.marriage_browse()')).find(p=>p.id===man.id).atCapacity);
  assert(!(await call(third,'public.marriage_browse($1)',[{availableOnly:true}])).some(p=>p.id===man.id));
  await call(third,'public.marriage_note_profile_open($1)',[man.id]);assert((await call(man,'public.marriage_notifications()')).some(n=>n.person.id===third.id));
  const photos=[];for(let i=0;i<3;i++){
   const p=await call(man,"public.marriage_gallery('prepare')");photos.push(p);
   await storage(man,'object.upload','insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['nisfayn-profile-gallery',p.path,{mimetype:'image/jpeg',size:200}]);
   await call(man,"public.marriage_gallery('commit',$1)",[p.id]);
  }
  await assert.rejects(call(man,"public.marriage_gallery('prepare')"),/ثلاث/);
  await assert.rejects(call(third,"public.marriage_gallery('list',null,$1)",[man.id]),/متاح/);
  await asService(db,()=>db.query("select public.marriage_review($1,'approve')",[man.id]));
  assert.equal((await call(third,"public.marriage_gallery('list',null,$1)",[man.id])).length,3);
  assert.equal((await storage(third,'object.get_authenticated','select name from storage.objects where name=$1',[photos[0].path])).rows.length,1);
  assert.equal((await storage(third,'object.sign','select name from storage.objects where name=$1',[photos[0].path])).rows.length,0);
  await call(third,"public.marriage_gallery('remove',$1)",[photos[0].id]);assert.equal((await call(man,"public.marriage_gallery('list')")).length,3);
  await call(man,'public.marriage_next_step($1,1,true,true)',[ab]);await call(outsider,'public.marriage_next_step($1,1,true,true)',[ab]);
  assert(!(await call(third,'public.marriage_browse()')).some(p=>p.id===man.id));
  assert.equal((await storage(third,'object.get_authenticated','select name from storage.objects where name=$1',[photos[0].path])).rows.length,0);
  await assert.rejects(call(third,'public.marriage_rewind_step($1,1,true)',[ab]));
  let p=await call(man,'public.marriage_rewind_step($1,1,true)',[ab]);assert(p.rewindMine);assert(p.exclusive);assert.equal(p.stage,1);
  p=await call(man,'public.marriage_rewind_step($1,1,true)',[ab]);assert.equal(p.stage,1,'same person cannot approve twice');
  p=await call(outsider,'public.marriage_rewind_step($1,1,false)',[ab]);assert.equal(p.stage,1);assert(!p.rewindPeer);
  await call(man,'public.marriage_rewind_step($1,1,true)',[ab]);p=await call(outsider,'public.marriage_rewind_step($1,1,true)',[ab]);assert.equal(p.stage,0);assert(!p.exclusive);
  assert.equal((await db.query('select status from marriage.member_requests where id=$1',[ac])).rows[0].status,'closed','rewind never reopens old conversations');
  await assert.rejects(call(man,'public.marriage_rewind_step($1,1,true)',[ab]),/تغيّرت/);
  await call(man,'public.marriage_next_step($1,1,true,true)',[ab]);await call(outsider,'public.marriage_next_step($1,1,true,true)',[ab]);
  await call(man,'public.marriage_next_step($1,2,true,true)',[ab]);await call(outsider,'public.marriage_next_step($1,2,true,true)',[ab]);
  await call(man,'public.marriage_rewind_step($1,2,true)',[ab]);p=await call(outsider,'public.marriage_rewind_step($1,2,true)',[ab]);assert.equal(p.stage,1);assert(p.exclusive);
 }finally{await db.close();}
});
test('private pair rewind and gallery remain reciprocal and isolated',async()=>{
 const db=await createDatabase();const a='a'.repeat(64),b='b'.repeat(64);
 const rpc=(action,session,payload={})=>asService(db,()=>db.query('select public.nisfayn_test_rpc($1,$2,$3) value',[action,session,payload]).then(r=>r.rows[0].value));
 try{
  await rpc('login',a,{actor:'abdulrahman'});await rpc('login',b,{actor:'reham'});
  await db.exec(`update nisfayn_test.room set data=data||'{"matched":true,"stage":2,"exclusive":true,"agree":{},"retiredFictional":true}'::jsonb`);
  let s=await rpc('rewind',a,{stage:2,agree:true});assert.equal(s.stage,2);assert.equal(s.rewind.actor,'abdulrahman');
  s=await rpc('rewind',b,{stage:2,agree:true});assert.equal(s.stage,1);assert(s.exclusive);
  await rpc('rewind',a,{stage:1,agree:true});s=await rpc('rewind',b,{stage:1,agree:true});assert.equal(s.stage,0);assert(!s.exclusive);assert(s.retiredFictional);
  const images=[];for(let i=0;i<3;i++){const p=await rpc('gallery_prepare',a);images.push(p);await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['nisfayn-profile-gallery',p.path]);await rpc('gallery_commit',a,{id:p.id});}
  await assert.rejects(rpc('gallery_prepare',a),/ثلاث/);assert.equal((await rpc('gallery_list',b,{subject:'abdulrahman'})).length,3);
  await rpc('gallery_remove',b,{id:images[0].id});assert.equal((await rpc('gallery_list',a)).length,3);
  await db.exec("update marriage.admin_test_members set paused=true where actor='abdulrahman'");
  await assert.rejects(rpc('gallery_list',a),/متاح/);await assert.rejects(rpc('gallery_list',b,{subject:'abdulrahman'}),/متاح/);
  await assert.rejects(rpc('gallery_url',b,{id:images[0].id}),/متاح/);
  await db.exec("update marriage.admin_test_members set paused=false where actor='abdulrahman'");
  await rpc('close',b);await assert.rejects(rpc('gallery_url',b,{id:images[0].id}),/متاحة/);assert.equal((await rpc('gallery_list',a)).length,3);
 }finally{await db.close();}
});
