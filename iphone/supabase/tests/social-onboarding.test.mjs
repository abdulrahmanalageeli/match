import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const consent = {version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sms:true,registrationVersion:'wudayn-entry-2026-11-23-v2',sensitiveProfile:true,sensitivePublication:false,photo:false,assessment:true,transcript:false};

test('social registration requires verified phone and consent without changing existing member access', async () => {
 const db = await createDatabase();
 try {
  async function user(provider) {
   const id=randomUUID(), sessionId=randomUUID(), email=id+'@example.test';
   if(provider) {
    await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id,email,{provider}]);
    await db.query('insert into auth.sessions values($1,$2,null)',[sessionId,id]);
   } else { await addUser(db,{id,email,sessionId}); }
   return {id,sessionId,email};
  }
  const rpc = (u,name,args=[]) => asMember(db,u.id,u.sessionId,async()=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v);
  const sms = (action,payload) => asService(db,async()=> (await db.query('select public.marriage_signup_sms($1,$2) v',[action,payload])).rows[0].v);
  let phoneIndex=0;
  async function proof(email,verified=true) {
   const proofHash=hash(randomUUID()),deviceHash=hash(randomUUID()),phone='+96650000000'+(++phoneIndex);
   await sms('start',{proofHash,deviceHash,networkHash:hash('network'),email,phone,consentVersion:'signup-sms-device-v1'});
   await sms('sent',{proofHash});
   if(verified) {const {lease}=await sms('claim',{proofHash,deviceHash});await sms('finish',{proofHash,lease,verified:true});}
   return {proofHash,deviceHash,phone};
  }
  const legacy=await user(), google=await user('google'), apple=await user('apple'), email=await user('email');
  assert.equal((await rpc(legacy,'marriage_social_onboarding_status')).required,false);
  assert.equal((await rpc(legacy,'marriage_state')).user.id,legacy.id);
  for(const u of [google,apple,email]) {
   assert.deepEqual(await rpc(u,'marriage_social_onboarding_status'),{required:true,email:u.email});
   await assert.rejects(rpc(u,'marriage_state'),/تأكيد الجوال/);
  }
  await db.query('update auth.users set email=null,email_confirmed_at=null,phone=$2,phone_confirmed_at=now() where id=$1',[legacy.id,'+966500000099']);
  assert.equal((await rpc(legacy,'marriage_social_onboarding_status')).required,false);
  assert.equal((await rpc(legacy,'marriage_state')).user.id,legacy.id);
  const pending=await proof(google.email,false);
  // Return with a fresh Google session after leaving during phone verification.
  await db.query('delete from auth.sessions where id=$1',[google.sessionId]);
  google.sessionId=randomUUID();
  await db.query('insert into auth.sessions values($1,$2,null)',[google.sessionId,google.id]);
  assert.deepEqual(await rpc(google,'marriage_social_onboarding_status'),{required:true,email:google.email});
  await assert.rejects(rpc(google,'marriage_complete_social_onboarding',[pending.proofHash,pending.deviceHash,consent]),/تأكيد رقم الجوال/);
  const valid=await proof(google.email);
  await assert.rejects(rpc(apple,'marriage_complete_social_onboarding',[valid.proofHash,valid.deviceHash,consent]),/تأكيد رقم الجوال/);
  await assert.rejects(rpc(google,'marriage_complete_social_onboarding',[valid.proofHash,hash('wrong-device'),consent]),/تأكيد رقم الجوال/);
  for(const flag of ['adult','terms','privacy','sms','assessment','sensitiveProfile']) {
   await assert.rejects(rpc(google,'marriage_complete_social_onboarding',[valid.proofHash,valid.deviceHash,{...consent,[flag]:false}]),/الموافقات/);
  }
  assert.equal((await rpc(google,'marriage_complete_social_onboarding',[valid.proofHash,valid.deviceHash,consent])).required,false);
  assert.equal((await rpc(google,'marriage_social_onboarding_status')).required,false);
  assert.equal((await rpc(google,'marriage_state')).user.id,google.id);
  assert.equal((await rpc(google,'marriage_complete_social_onboarding',[valid.proofHash,valid.deviceHash,consent])).required,false);
  assert.equal((await db.query('select status from marriage.signup_sms_challenges where proof_hash=$1',[valid.proofHash])).rows[0].status,'used');
  const metadata=(await db.query('select raw_app_meta_data from auth.users where id=$1',[google.id])).rows[0].raw_app_meta_data;
  assert.equal(metadata.provider,'google');assert.equal(metadata.phoneOwnershipVerified,true);assert.equal(metadata.signupConsent.privacy,true);assert.equal(metadata.signupConsent.transcript,false);
  assert.equal((await db.query('select phone from marriage.signup_phone_verifications where user_id=$1',[google.id])).rows[0].phone,valid.phone);
  assert.equal((await db.query('select device_hash from marriage.registration_devices where user_id=$1',[google.id])).rows[0].device_hash,valid.deviceHash);
  await assert.rejects(rpc(apple,'marriage_complete_social_onboarding',[valid.proofHash,valid.deviceHash,consent]),/تأكيد رقم الجوال/);
  const expired=await proof(apple.email);
  await db.query("update marriage.signup_sms_challenges set expires_at=now()-interval '1 second' where proof_hash=$1",[expired.proofHash]);
  await assert.rejects(rpc(apple,'marriage_complete_social_onboarding',[expired.proofHash,expired.deviceHash,consent]),/تأكيد رقم الجوال/);
  const appleProof=await proof(apple.email);
  await db.query('delete from auth.sessions where id=$1',[apple.sessionId]);
  await assert.rejects(rpc(apple,'marriage_social_onboarding_status'),/تسجيل الدخول/);
  await assert.rejects(rpc(apple,'marriage_complete_social_onboarding',[appleProof.proofHash,appleProof.deviceHash,consent]),/تسجيل الدخول/);
  await db.query('insert into auth.sessions values($1,$2,null)',[apple.sessionId,apple.id]);
  assert.equal((await rpc(apple,'marriage_complete_social_onboarding',[appleProof.proofHash,appleProof.deviceHash,consent])).required,false);
  await assert.rejects(asMember(db,apple.id,apple.sessionId,()=>db.exec('update marriage.social_onboarding set completed_at=now()')),/permission denied/);
  const permissions=(await db.query("select has_function_privilege('anon','public.marriage_complete_social_onboarding(text,text,jsonb)','execute') anon,has_function_privilege('authenticated','marriage.onboarding_user()','execute') helper")).rows[0];
  assert.deepEqual(permissions,{anon:false,helper:false});
 } finally {await db.close();}
});
