import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

test('onboarding stages verify before profile, reuse proof, preserve privacy and support audited manual review', async () => {
 const db = await createDatabase({throughMigration:'20261113092359_immediate_portrait_verification.sql'});
 try {
  await db.exec(await readFile(new URL('../migrations/20261113092739_private_portrait_review_rpc.sql',import.meta.url),'utf8'));
  const rpc = async (sql,args=[]) => (await db.query('select '+sql+' v',args)).rows[0].v;
  const call = (u,sql,args=[]) => asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
  const service = (sql,args=[]) => asService(db,()=>rpc(sql,args));
  async function user() { const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};await addUser(db,u);return u; }
  async function apply(u,gender='man') { return call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,birthDate:'1997-01-01',gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]); }
  async function prepare(u,gender='man') {
   const p=await call(u,"public.marriage_portrait_stage_prepare(0,'never',$1,true)",[gender]);
   await db.query("select set_config('storage.operation','object.upload',false)");
   await asMember(db,u.id,u.sessionId,()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('nisfayn-profile-portraits',$1,$2)",[p.path,{mimetype:'image/jpeg',size:1200}]));
   await db.query("select set_config('storage.operation','',false)");
   const receipt=await call(u,"public.marriage_portrait_stage_action($1,'uploaded')",[p.id]);return {...p,...receipt};
  }
  const man=await user(),other=await user();
  await assert.rejects(call(man,"public.marriage_portrait_stage_prepare(0,'never','man',false)"),/وافق/);
  const p=await prepare(man);assert.equal(p.status,'uploaded');
  assert.equal((await db.query('select count(*)::int n from marriage.profiles where member_id=$1',[man.id])).rows[0].n,0);
  await assert.rejects(call(other,"public.marriage_portrait_stage_action($1,'status')",[p.id]),/صلاحية/);
  await assert.rejects(call(man,"public.marriage_portrait_stage_action($1,'finalize')",[p.id]),/بيانات/);
  await assert.rejects(call(man,'public.marriage_portrait_commit($1)',[p.id]),/التحقق/);
  const proof=await service("public.marriage_photo_face_begin($1,$2,'portrait','face-photo-v1')",[man.id,p.id]);
  await service('public.marriage_photo_face_finish($1,$2,$3)',[proof.attempt,man.id,'a'.repeat(64)]);
  assert.equal((await call(man,"public.marriage_portrait_stage_action($1,'status')",[p.id])).status,'verified');
  assert.equal((await call(man,'public.marriage_portrait_stage_resume()')).id,p.id);
  assert.equal(await call(other,'public.marriage_portrait_stage_resume()'),null);
  assert.equal(await rpc('marriage.portrait_json($1)',[man.id]),null);
  await db.query("update marriage.member_portraits set created_at=now()-interval '1 hour' where id=$1",[p.id]);
  await db.query("update marriage.photo_face_checks set created_at=now()-interval '1 hour' where id=$1",[proof.attempt]);
  assert.ok(!(await service('public.marriage_portrait_cleanup_batch()')).includes(p.path));
  await apply(man);
  const final=await call(man,"public.marriage_portrait_stage_action($1,'finalize')",[p.id]);assert.equal(final.id,p.id);
  assert.equal((await call(man,"public.marriage_portrait_stage_action($1,'finalize')",[p.id])).id,p.id);
  assert.ok((await db.query('select consumed_at from marriage.photo_face_checks where id=$1',[proof.attempt])).rows[0].consumed_at);
  assert.ok((await db.query("select count(*)::int n from marriage.signup_consent_events where member_id=$1 and purpose='profile_photo' and granted",[man.id])).rows[0].n>=1);

  // A declared woman cannot publish first and later bypass a man's face check.
  const bypass=await user(), bp=await prepare(bypass,'woman');assert.equal(bp.status,'ready');
  await assert.rejects(call(bypass,'public.marriage_portrait_commit($1)',[bp.id]),/بيانات/);
  assert.equal(await rpc('marriage.has_onboarding_portrait($1)',[bypass.id]),false);
  await apply(bypass);
  await assert.rejects(call(bypass,"public.marriage_portrait_stage_action($1,'finalize')",[bp.id]),/الكاميرا/);
  const woman=await user(),wp=await prepare(woman,'woman');await apply(woman,'woman');
  assert.equal((await call(woman,"public.marriage_portrait_stage_action($1,'finalize')",[wp.id])).id,wp.id);

  const manual=await user(), mp=await prepare(manual);
  await call(manual,"public.marriage_portrait_stage_action($1,'moderation')",[mp.id]);
  assert.equal(await rpc('marriage.has_onboarding_portrait($1)',[manual.id]),true);
  await apply(manual);
  assert.equal(await call(manual,"public.marriage_portrait_stage_action($1,'finalize')",[mp.id]),null);
  assert.equal(await rpc('marriage.portrait_json($1)',[manual.id]),null);
  await assert.rejects(service("public.marriage_review($1,'approve')",[manual.id]),/صورة/);
  await assert.rejects(call(manual,'public.marriage_admin_portrait_queue()'),/صلاحية/);
  const staff=await user();await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'reviewer','مراجع')",[staff.id]);
  async function staffCall(sql,args=[]) {
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:staff.id,role:'authenticated',session_id:staff.sessionId,aal:'aal2'})]);await db.exec('set role authenticated');
   try{return await rpc(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','',false)");}
  }
  assert.equal((await staffCall('public.marriage_admin_portrait_queue()')).length,1);
  assert.equal((await staffCall('public.marriage_admin_portrait_media($1)',[mp.id])).path,mp.path);
  await staffCall("public.marriage_admin_portrait_decide($1,false,'اختر صورة أوضح')",[mp.id]);
  await assert.rejects(service("public.marriage_review($1,'approve')",[manual.id]),/صورة/);
  await call(manual,"public.marriage_portrait_stage_action($1,'moderation')",[mp.id]);
  await staffCall("public.marriage_admin_portrait_decide($1,true,'صورة مناسبة للملف')",[mp.id]);
  assert.equal((await rpc('marriage.portrait_json($1)',[manual.id])).id,mp.id);
  await service("public.marriage_review($1,'approve')",[manual.id]);
  assert.equal((await db.query('select count(*)::int n from marriage.photo_face_checks where member_id=$1 and matched_at is not null',[manual.id])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from marriage.staff_audit where target_id=$1 and action like 'portrait_%'",[manual.id])).rows[0].n,3);

  const stale=await user(), sp=await prepare(stale);await db.query("update marriage.portrait_stages set created_at=now()-interval '8 days' where photo_id=$1",[sp.id]);
  await assert.rejects(call(stale,"public.marriage_portrait_stage_action($1,'status')",[sp.id]),/صلاحية/);
 } finally { await db.close(); }
});
