import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

test('male portraits/gallery require owned unexpired server proof; female uploads unchanged', async () => {
 const db = await createDatabase();
 try {
  const rpc = async (sql,args=[]) => (await db.query('select '+sql+' v',args)).rows[0].v;
  const call = (u,sql,args=[]) => asMember(db,u.id,u.sessionId,()=>rpc(sql,args));
  const service = (sql,args=[]) => asService(db,()=>rpc(sql,args));
  async function member(gender) {
   const u={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
   await addUser(db,u);
   await call(u,'public.marriage_apply($1)',[{displayName:'مثال',age:29,birthDate:'1997-01-01',gender,city:'الرياض',profession:'مهندس',bio:'ملف تجريبي',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
   return u;
  }
  const man=await member('man'), woman=await member('woman'), other=await member('man');
  assert.equal(await call(man,'public.marriage_photo_face_required()'),true);
  assert.equal(await call(woman,'public.marriage_photo_face_required()'),false);
  async function prepare(u,kind) {
   const p=await call(u,kind==='portrait'?"public.marriage_portrait_prepare_v2(0,'never')":"public.marriage_gallery('prepare')");
   await db.query('insert into storage.objects(id,bucket_id,name,metadata) values($1,$2,$3,$4)',[randomUUID(),'nisfayn-profile-'+(kind==='portrait'?'portraits':'gallery'),p.path,{mimetype:'image/jpeg',size:1200}]);
   return p;
  }
  const p=await prepare(man,'portrait');
  await assert.rejects(call(man,'public.marriage_portrait_commit($1)',[p.id]),/الكاميرا/);
  await assert.rejects(call(man,"public.marriage_photo_face_begin($1,$2,'portrait','face-photo-v1')",[man.id,p.id]),/permission denied/);
  await assert.rejects(service("public.marriage_photo_face_begin($1,$2,'portrait','face-photo-v1')",[other.id,p.id]),/photo_unavailable/);
  await assert.rejects(service("public.marriage_photo_face_begin($1,$2,'portrait','other')",[man.id,p.id]),/consent_required/);
  const proof=await service("public.marriage_photo_face_begin($1,$2,'portrait','face-photo-v1')",[man.id,p.id]);
  await assert.rejects(call(man,'public.marriage_portrait_commit($1)',[p.id]),/الكاميرا/);
  await assert.rejects(call(man,'public.marriage_photo_face_finish($1,$2,$3)',[proof.attempt,man.id,'a'.repeat(64)]),/permission denied/);
  await service('public.marriage_photo_face_finish($1,$2,$3)',[proof.attempt,man.id,'a'.repeat(64)]);
  await call(man,'public.marriage_portrait_commit($1)',[p.id]);
  assert.ok((await db.query('select consumed_at from marriage.photo_face_checks where id=$1',[proof.attempt])).rows[0].consumed_at);
  const replacement=await prepare(man,'portrait');
  await assert.rejects(call(man,'public.marriage_portrait_commit($1)',[replacement.id]),/الكاميرا/);
  assert.equal((await call(man,'public.marriage_portrait_info()')).id,p.id);
  await call(man,"public.marriage_photo_discard($1,'portrait')",[replacement.id]);
  assert.equal((await call(man,'public.marriage_portrait_info()')).id,p.id);
  const female=await prepare(woman,'portrait'); await call(woman,'public.marriage_portrait_commit($1)',[female.id]);
  const gallery=await prepare(man,'gallery');
  await assert.rejects(call(man,"public.marriage_gallery('commit',$1)",[gallery.id]),/الكاميرا/);
  const gp=await service("public.marriage_photo_face_begin($1,$2,'gallery','face-photo-v1')",[man.id,gallery.id]);
  await service('public.marriage_photo_face_finish($1,$2,$3)',[gp.attempt,man.id,'b'.repeat(64)]);
  // Storage deletion cannot replace a pending verified object under the same path.
  await db.query("select set_config('storage.operation','object.delete',false)");
  const deleted=await asMember(db,man.id,man.sessionId,()=>db.query('delete from storage.objects where name=$1 returning id',[gallery.path]));
  assert.equal(deleted.rows.length,0);
  await db.query("select set_config('storage.operation','',false)");
  // An object changed by a privileged maintenance process also invalidates the proof.
  await db.query('update storage.objects set id=$1 where name=$2',[randomUUID(),gallery.path]);
  await assert.rejects(call(man,"public.marriage_gallery('commit',$1)",[gallery.id]),/الكاميرا/);
  await db.query("update marriage.photo_face_checks set created_at=now()-interval '16 minutes' where member_id=$1",[man.id]);
  const fresh=await service("public.marriage_photo_face_begin($1,$2,'gallery','face-photo-v1')",[man.id,gallery.id]);
  await db.query("update marriage.photo_face_checks set created_at=now()-interval '3 minutes' where id=$1",[fresh.attempt]);
  await assert.rejects(service('public.marriage_photo_face_finish($1,$2,$3)',[fresh.attempt,man.id,'c'.repeat(64)]),/expired_attempt/);
  for(let i=0;i<3;i++) await service("public.marriage_photo_face_begin($1,$2,'gallery','face-photo-v1')",[man.id,gallery.id]);
  await assert.rejects(service("public.marriage_photo_face_begin($1,$2,'gallery','face-photo-v1')",[man.id,gallery.id]),/rate_limited/);
 } finally { await db.close(); }
});

