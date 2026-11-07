import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase as createMigratedDatabase,addUser,asMember,asService} from './harness.mjs';

// Historical behavior supplies real pre-restriction requests for migration tests.
// The final regression below applies the new restriction to those existing records.
const createDatabase=()=>createMigratedDatabase({throughMigration:'20261107073655_manual_verification_refresh_and_export.sql'});
const restrictUploads=async db=>db.exec(await readFile(new URL('../migrations/20261107093757_restrict_manual_verification_uploads.sql',import.meta.url),'utf8'));

test('restriction closes every new document path without altering existing review, history, withdrawal or cleanup',async()=>{
 const db=await createDatabase();try{
  const f=await fixture(db),a=await f.user(),reviewer=await f.user('reviewer');
  const pending=await f.pending(a),draft=await f.prepare(a,'identity');
  const path=(await f.member(a,'evidence',{requestId:pending.requestId,evidenceId:pending.evidenceId})).path;
  const before=await f.member(a,'state');
  await restrictUploads(db);
  assert.deepEqual(await f.member(a,'state'),before,'migration must not change user records');
  const restricted=e=>e.code==='42501' && e.detail==='verification_submission_restricted';
  for(const kind of ['identity','marital_status','education','employment','preparation_course']) await assert.rejects(f.prepare(a,kind),restricted);
  for(const action of ['upload','submit']) {
   await assert.rejects(f.member(a,action,{requestId:draft.requestId}),restricted);
   await assert.rejects(f.member(a,action,{requestId:pending.requestId}),restricted);
  }
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   try {for(const name of ['public.marriage_manual_verification','marriage.manual_verification_command'])
    await assert.rejects(f.rpc(name+'($1,$2,$3)',['prepare',{kind:'identity'},'a'.repeat(64)]),restricted);
   }finally{await db.exec('reset role');}
  }
  await assert.rejects(asService(db,()=>db.query("insert into storage.objects(bucket_id,name) values('nisfayn-verification-evidence','legacy-upload.pdf')")),restricted);
  await assert.rejects(asService(db,()=>db.query("update storage.objects set metadata='{\"size\":100}' where bucket_id='nisfayn-verification-evidence' and name=$1",[path])),restricted);
  await assert.rejects(asMember(db,a.id,a.sessionId,()=>db.query("insert into storage.objects(bucket_id,name) values('nisfayn-verification-evidence','direct-upload.pdf')")),restricted);
  assert.equal((await f.member(a,'evidence',{requestId:pending.requestId,evidenceId:pending.evidenceId})).path,path);
  assert.equal((await f.staff(reviewer,()=>f.rpc('public.marriage_admin_verifications()'))).items[0].id,pending.requestId);
  assert.equal((await f.review(reviewer,pending)).status,'approved');
  assert.equal((await f.member(a,'state')).claims.length,1);
  assert.equal((await f.member(a,'withdraw',{requestId:pending.requestId})).claims.length,0);
  await f.member(a,'withdraw',{requestId:draft.requestId});
  assert((await asService(db,()=>f.rpc('public.marriage_verification_cleanup_batch()'))).includes(path));
  await asService(db,()=>db.query("delete from storage.objects where bucket_id='nisfayn-verification-evidence' and name=$1",[path]));
  await asService(db,()=>f.rpc('public.marriage_verification_cleanup_done($1)',[[path]]));
  assert((await db.query('select deleted_at from marriage.manual_verification_evidence where request_id=$1',[pending.requestId])).rows[0].deleted_at);
 }finally{await db.close();}
});

async function fixture(db){
 await db.exec("insert into marriage.cities(label) values('الرياض') on conflict do nothing");
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 async function user(role){const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);
  if(role)await db.query('insert into marriage.staff_accounts(user_id,role,display_name) values($1,$2,$3)',[u.id,role,role]);
  else {await db.query("insert into marriage.members(id,review_status) values($1,'approved') on conflict(id) do update set review_status='approved'",[u.id]);
   await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,'اسم مستعار',29,'man',(select id from marriage.cities limit 1),'مهندس','ملف تجربة')",[u.id]);
   await db.query("insert into marriage.member_basics(member_id,marital_status,current_wives) values($1,'married',2)",[u.id]);
   await db.query("insert into marriage.profile_details(member_id,education) values($1,'بكالوريوس')",[u.id]);}
  return u;}
 const member=(u,action,payload={})=>asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_manual_verification($1,$2)',[action,payload]));
 async function staff(u,callback,aal='aal2'){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u.id,session_id:u.sessionId,role:'authenticated',aal})]);await db.exec('set role authenticated');
  try{return await callback();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
 }
 const prepare=(u,kind='marital_status',extra={})=>member(u,'prepare',{kind,consent:true,consentVersion:'manual-verification-v1',mimeType:'application/pdf',sizeBytes:12,fileName:'document.pdf',clientId:randomUUID(),...extra});
 async function upload(u,request){const reservation=await member(u,'upload',{requestId:request.requestId});await db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-verification-evidence',$1,$2)",[reservation.path,{size:12,mimetype:'application/pdf'}]);return reservation.path;}
 async function pending(u,kind='marital_status'){const request=await prepare(u,kind);await upload(u,request);await member(u,'submit',{requestId:request.requestId});return request;}
 const review=(u,request,action='approve',revision=1,extra={})=>staff(u,()=>rpc('public.marriage_admin_verification_review($1,$2,$3,$4,$5,$6,$7)',[request.requestId,action,revision,extra.reason??'تمت مراجعة المستند',extra.operation??randomUUID(),extra.days??90,extra.confirmed??true]));
 return {rpc,user,member,staff,prepare,upload,pending,review};
}

test('private requests require consent and live ownership; no badge before review; files and helpers are denied directly',async()=>{
 const db=await createDatabase();try{const f=await fixture(db),a=await f.user(),b=await f.user();
  await assert.rejects(f.prepare(a,'marital_status',{consent:false}));
  await assert.rejects(f.prepare(a,'marital_status',{sizeBytes:5242881}));
  await assert.rejects(f.prepare(a,'marital_status',{mimeType:'text/html'}));
  const clientId=randomUUID();const r=await f.prepare(a,'marital_status',{clientId});assert.deepEqual(await f.prepare(a,'marital_status',{clientId}),r);
  await assert.rejects(f.prepare(a,'identity',{clientId}),/معرّف/);
  assert.deepEqual((await f.member(a,'state')).claims,[]);
  await assert.rejects(f.member(a,'submit',{requestId:r.requestId}),/ارفع/);
  for(const action of ['upload','withdraw','submit'])await assert.rejects(f.member(b,action,{requestId:r.requestId}),/غير متاح/);
  await assert.rejects(f.member(b,'evidence',{requestId:r.requestId,evidenceId:r.evidenceId}),/صلاحية/);
  const path=await f.upload(a,r);const state=await f.member(a,'submit',{requestId:r.requestId});assert.equal(state.requests[0].status,'pending');assert.deepEqual(state.claims,[]);
  assert.deepEqual(state.requests[0].claimSnapshot,{maritalStatus:'married',currentWives:2});
  assert.deepEqual(await f.member(a,'submit',{requestId:r.requestId}),state);
  await assert.rejects(f.prepare(a),/قيد المراجعة/);
  const own=await f.member(a,'evidence',{requestId:r.requestId,evidenceId:r.evidenceId});assert.equal(own.path,path);
  await asMember(db,a.id,a.sessionId,async()=>{assert.equal((await db.query("select * from storage.objects where bucket_id='nisfayn-verification-evidence'")).rows.length,0);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('nisfayn-verification-evidence','fake')"),/row-level security/);});
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);try{
   for(const table of ['manual_verification_requests','manual_verification_evidence','manual_verification_events'])await assert.rejects(db.query('select * from marriage.'+table),/permission/);
   await assert.rejects(f.rpc('marriage.manual_verification_claims($1)',[a.id]),/permission/);
   if(role!=='service_role')await assert.rejects(f.rpc('public.marriage_verification_cleanup_batch()'),/permission/);
  }finally{await db.exec('reset role');}}
  await db.exec("set role anon");await assert.rejects(f.rpc("public.marriage_manual_verification('state')"),/حساب مؤكد/);await db.exec('reset role');
  await db.query('delete from auth.sessions where id=$1',[a.sessionId]);await assert.rejects(f.member(a,'state'),/حساب مؤكد/);
 }finally{await db.close();}
});

test('review enforces role, MFA, self-review, revision, confirmation and idempotency; approved badges are scoped and revocable',async()=>{
 const db=await createDatabase();try{const f=await fixture(db),a=await f.user(),reviewer=await f.user('reviewer'),moderator=await f.user('moderator'),r=await f.pending(a);
  const queue=()=>f.rpc('public.marriage_admin_verifications()');
  await assert.rejects(f.staff(a,queue),/صلاحية/);await assert.rejects(f.staff(moderator,queue),/صلاحية/);await assert.rejects(f.staff(reviewer,queue,'aal1'),/بخطوتين/);
  assert.equal((await f.staff(reviewer,queue)).items[0].id,r.requestId);
  await assert.rejects(f.review(moderator,r),/صلاحية/);await assert.rejects(f.review(reviewer,r,'approve',0),/تغيّر/);
  await assert.rejects(f.review(reviewer,r,'approve',1,{days:365}),/مدة/);await assert.rejects(f.review(reviewer,r,'approve',1,{confirmed:false}),/أكّد/);
  await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','self')",[a.id]);await assert.rejects(f.review(a,r),/الشخصي/);
  const operation=randomUUID(),row=await f.review(reviewer,r,'approve',1,{operation});assert.equal(row.status,'approved');assert.equal(row.revision,2);
  assert.deepEqual(await f.review(reviewer,r,'approve',1,{operation}),row);await assert.rejects(f.review(reviewer,r,'approve',1,{operation,reason:'سبب مختلف'}),/معرّف/);
  const claim=(await f.member(a,'state')).claims[0];assert.equal(claim.kind,'marital_status');assert.equal(claim.isTest,false);assert.match(claim.label,/2/);
  const signals=(await db.query("select * from realtime.messages where topic=$1",['marriage:member:'+a.id])).rows;
  assert(signals.length>=2);assert(signals.every(x=>x.private&&x.event==='changed'));
  assert(!JSON.stringify(signals).includes('marital_status'));assert(!JSON.stringify(signals).includes(r.requestId));
  for(const secret of ['fileName','path','memberNote','claimSnapshot','reviewedBy'])assert(!JSON.stringify(claim).includes(secret));
  await f.staff(reviewer,()=>f.rpc('public.marriage_manual_verification($1,$2)',['evidence',{requestId:r.requestId,evidenceId:r.evidenceId}]));
  assert.equal((await db.query("select count(*)::int n from marriage.staff_audit where target_id=$1 and action='verification_evidence_access'",[r.requestId])).rows[0].n,1);
  await assert.rejects(db.query("update marriage.staff_audit set reason='tampered' where target_id=$1",[r.requestId]),/غير قابل/);
  await f.review(reviewer,r,'revoke',2);assert.deepEqual((await f.member(a,'state')).claims,[]);
  const exported=await asMember(db,a.id,a.sessionId,()=>f.rpc('public.marriage_personal_data()'));
  assert.equal(exported.manualVerification.requests[0].id,r.requestId);assert.equal(exported.manualVerification.requests[0].consentVersion,'manual-verification-v1');
  assert(exported.manualVerification.events.length>0);assert(!JSON.stringify(exported.manualVerification).includes('nisfayn-verification-evidence'));assert(!JSON.stringify(exported.manualVerification).includes('"path"'));
  const expired=await f.pending(a,'education');await f.review(reviewer,expired);await db.query("update marriage.manual_verification_requests set expires_at=now()-interval '1 second' where id=$1",[expired.requestId]);
  const state=await f.member(a,'state');assert.equal(state.requests.find(x=>x.id===expired.requestId).status,'expired');assert.deepEqual(state.claims,[]);
  await db.query('delete from auth.sessions where id=$1',[reviewer.sessionId]);await assert.rejects(f.staff(reviewer,queue),/تسجيل الدخول/);
 }finally{await db.close();}
});

test('ordinary dummy members retain test provenance across classification changes and every kind invalidates correctly',async()=>{
 const db=await createDatabase();try{const f=await fixture(db),a=await f.user(),reviewer=await f.user('reviewer');
  await db.query('update marriage.members set is_dummy=true where id=$1',[a.id]);
  const first=await f.pending(a,'education');await f.review(reviewer,first);
  assert.equal((await f.member(a,'state')).claims[0].isTest,true);
  await db.query('update marriage.members set is_dummy=false where id=$1',[a.id]);assert.equal((await f.member(a,'state')).claims[0].isTest,true,'dummy evidence never becomes genuine');
  assert.equal((await f.staff(reviewer,()=>f.rpc("public.marriage_admin_verifications('approved')"))).items[0].isDummy,true);
  await db.query("update marriage.profile_details set education='ماجستير' where member_id=$1",[a.id]);assert.deepEqual((await f.member(a,'state')).claims,[]);
  const employment=await f.pending(a,'employment');await f.review(reviewer,employment);assert.equal((await f.member(a,'state')).claims[0].isTest,false);
  await db.query('update marriage.members set is_dummy=true where id=$1',[a.id]);await db.query('update marriage.members set is_dummy=false where id=$1',[a.id]);assert.equal((await f.member(a,'state')).claims[0].isTest,true);
  await db.query("update marriage.profiles set profession='طبيب' where member_id=$1",[a.id]);assert.deepEqual((await f.member(a,'state')).claims,[]);
  const identity=await f.pending(a,'identity');await f.review(reviewer,identity);await db.query("update marriage.profiles set display_name='اسم آخر' where member_id=$1",[a.id]);assert.deepEqual((await f.member(a,'state')).claims,[]);
  const course=await f.prepare(a,'preparation_course',{claimLabel:'مهارات الحياة الزوجية'});await f.upload(a,course);await f.member(a,'submit',{requestId:course.requestId});await f.review(reviewer,course);
  assert.equal((await f.member(a,'state')).claims[0].kind,'preparation_course');
  await db.query("update marriage.manual_verification_evidence set delete_after=now()-interval '1 second' where request_id=$1",[course.requestId]);
  await assert.rejects(f.member(a,'evidence',{requestId:course.requestId,evidenceId:course.evidenceId}),/غير متاح/);
  assert.equal((await f.member(a,'state')).claims[0].kind,'preparation_course','document retention and badge validity are independent');
  const counts=(await f.staff(reviewer,()=>f.rpc('public.marriage_admin_verifications()'))).counts;assert.equal(counts.pending,0);assert.equal(counts.approved,1);
 }finally{await db.close();}
});

test('profile changes permanently invalidate claims; replacement and withdrawal cannot bypass evidence or retain access',async()=>{
 const db=await createDatabase();try{const f=await fixture(db),a=await f.user(),reviewer=await f.user('owner'),r=await f.pending(a);await f.review(reviewer,r);
  await db.query('update marriage.member_basics set current_wives=3 where member_id=$1',[a.id]);assert.equal((await f.member(a,'state')).requests[0].status,'stale');
  await db.query('update marriage.member_basics set current_wives=2 where member_id=$1',[a.id]);assert.deepEqual((await f.member(a,'state')).claims,[]);
  const second=await f.pending(a);await f.review(reviewer,second,'request_changes');const replacement=await f.prepare(a);assert.equal((await f.member(a,'state')).requests.find(x=>x.id===second.requestId).status,'withdrawn');
  const path=await f.upload(a,replacement);await f.member(a,'submit',{requestId:replacement.requestId});await f.review(reviewer,replacement);
  await f.member(a,'withdraw',{requestId:replacement.requestId});assert.deepEqual((await f.member(a,'state')).claims,[]);
  await assert.rejects(f.member(a,'evidence',{requestId:replacement.requestId,evidenceId:replacement.evidenceId}),/غير متاح/);
  await assert.rejects(f.staff(reviewer,()=>f.rpc('public.marriage_manual_verification($1,$2)',['evidence',{requestId:replacement.requestId,evidenceId:replacement.evidenceId}])),/غير متاح/);
  const batch=await asService(db,()=>f.rpc('public.marriage_verification_cleanup_batch()'));assert(batch.includes(path));
  await asService(db,()=>f.rpc('public.marriage_verification_cleanup_done($1)',[[path]]));assert.equal((await db.query('select deleted_at from marriage.manual_verification_evidence where request_id=$1',[replacement.requestId])).rows[0].deleted_at,null,'cannot claim deletion while object exists');
  await db.query("delete from storage.objects where bucket_id='nisfayn-verification-evidence' and name=$1",[path]);await asService(db,()=>f.rpc('public.marriage_verification_cleanup_done($1)',[[path]]));
  assert((await db.query('select deleted_at from marriage.manual_verification_evidence where request_id=$1',[replacement.requestId])).rows[0].deleted_at);
  const draft=await f.prepare(a,'identity');const draftPath=await f.upload(a,draft);await db.query('delete from marriage.members where id=$1',[a.id]);
  assert((await asService(db,()=>f.rpc('public.marriage_verification_cleanup_batch()'))).includes(draftPath),'account deletion queues real object removal');
  await assert.rejects(db.query("delete from marriage.manual_verification_events"),/غير قابل/);
 }finally{await db.close();}
});

test('tester identity is server-derived, claims always marked test, token expiry/revocation and other owner access denied',async()=>{
 const db=await createDatabase();try{const f=await fixture(db),reviewer=await f.user('reviewer'),token='a'.repeat(64),other='b'.repeat(64);
  await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),'abdulrahman',now()+interval '1 hour'),(sha256($2::text::bytea),'reham',now()+interval '1 hour')",[token,other]);
  await db.exec("update marriage.admin_test_members set review_status='approved',suspended=false,paused=false,access_until=now()+interval '1 day';update nisfayn_test.room set data=jsonb_set(data,'{profiles}', '{\"abdulrahman\":{\"displayName\":\"عبدالرحمن\",\"age\":28,\"marriageBasics\":{\"maritalStatus\":\"never_married\"}}}'::jsonb)");
  const tester=async(action,payload={},session=token)=>{await db.exec('set role anon');try{return await f.rpc('public.marriage_manual_verification($1,$2,$3)',[action,payload,session]);}finally{await db.exec('reset role');}};
  await assert.rejects(tester('state',{},'c'.repeat(64)),/جلسة/);await assert.rejects(tester('state',{},'bad'),/جلسة/);
  const r=await tester('prepare',{kind:'marital_status',consent:true,consentVersion:'manual-verification-v1',fileName:'test.pdf',mimeType:'application/pdf',sizeBytes:12,owner_key:'test:reham'});
  const reservation=await tester('upload',{requestId:r.requestId});await db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-verification-evidence',$1,'{\"size\":12}')",[reservation.path]);await tester('submit',{requestId:r.requestId});
  assert.equal((await tester('state')).requests[0].memberId,'test:abdulrahman');await assert.rejects(tester('evidence',{requestId:r.requestId,evidenceId:r.evidenceId},other),/غير متاح/);
  await f.review(reviewer,r);assert.equal((await tester('state')).claims[0].isTest,true);
  const badges=await asService(db,()=>f.rpc('public.marriage_test_manual_verification_badges($1)',[token]));assert.equal(badges.abdulrahman[0].isTest,true);assert.deepEqual(badges.reham,[]);
  await db.query("update marriage.admin_test_members set suspended=true where actor='abdulrahman'");await assert.rejects(tester('state'),/جلسة/);
  await db.query("update marriage.admin_test_members set suspended=false where actor='abdulrahman'");await db.query("update nisfayn_test.sessions set expires_at=now()-interval '1 second' where token_hash=sha256($1::text::bytea)",[token]);await assert.rejects(tester('state'),/جلسة/);
 }finally{await db.close();}
});
