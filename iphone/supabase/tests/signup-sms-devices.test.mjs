import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { createDatabase,asService } from './harness.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('SMS proof is single-use, bound to email/device, mandatory on rollout; duplicate devices still allowed',async()=>{
 const db=await createDatabase();try{
  const rpc=async(action,payload)=>asService(db,async()=>(await db.query('select public.marriage_signup_sms($1,$2) v',[action,payload])).rows[0].v);
  await db.exec('update marriage.signup_sms_settings set required=true');
  const device=hash('device'),network=hash('network');
  async function start(email,phone,token=randomUUID()){
   const proofHash=hash(token);const result=await rpc('start',{proofHash,consentVersion:'signup-sms-device-v1',deviceHash:device,networkHash:network,email,phone});return{proofHash,result};
  }
  async function verified(p){await rpc('sent',p);const c=await rpc('claim',{...p,deviceHash:device});await rpc('finish',{...p,lease:c.lease,verified:true});}
  async function signup(email,proofHash,deviceHash=device){const id=randomUUID();await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,email,{signupKind:'member_self_claimed_email',emailOwnershipVerified:false,signupPhoneProof:proofHash,signupDeviceHash:deviceHash}]);return id;}
  await assert.rejects(signup('missing@example.test',hash('missing')),/تأكيد/);
  const p=await start('one@example.test','+966500000001');
  assert.equal(p.result.duplicateDevice,false);
  await assert.rejects(signup('one@example.test',p.proofHash),/تأكيد/);
  await rpc('sent',{proofHash:p.proofHash});
  await assert.rejects(rpc('claim',{proofHash:p.proofHash,deviceHash:hash('foreign')}),/expired/);
  const c=await rpc('claim',{proofHash:p.proofHash,deviceHash:device});
  await assert.rejects(rpc('claim',{proofHash:p.proofHash,deviceHash:device}),/expired/);
  await assert.rejects(rpc('finish',{proofHash:p.proofHash,lease:randomUUID(),verified:true}),/expired/);
  await rpc('finish',{proofHash:p.proofHash,lease:c.lease,verified:false});
  await assert.rejects(signup('one@example.test',p.proofHash),/تأكيد/);
  const retry=await rpc('claim',{proofHash:p.proofHash,deviceHash:device});
  await rpc('finish',{proofHash:p.proofHash,lease:retry.lease,verified:true});
  await assert.rejects(signup('different@example.test',p.proofHash),/تأكيد/);
  await assert.rejects(signup('one@example.test',p.proofHash,hash('different-device')),/تأكيد/);
  const user=await signup('one@example.test',p.proofHash);
  const meta=(await db.query('select raw_app_meta_data from auth.users where id=$1',[user])).rows[0].raw_app_meta_data;
  assert.equal(meta.phoneOwnershipVerified,true);assert.equal(meta.signupPhoneProof,undefined);assert.equal(meta.emailOwnershipVerified,false);
  assert.equal((await db.query('select phone from marriage.signup_phone_verifications where user_id=$1',[user])).rows[0].phone,'+966500000001');
  await assert.rejects(signup('one@example.test',p.proofHash),/تأكيد/);
  const second=await start('two@example.test','+966500000002');assert.equal(second.result.duplicateDevice,true);
  await verified({proofHash:second.proofHash});await signup('two@example.test',second.proofHash);
  assert.equal((await db.query('select count(*)::int n from marriage.registration_devices where device_hash=$1',[device])).rows[0].n,2);
  await assert.rejects(start('third@example.test','+966500000002'),/rate_limited/);
  const expired=await start('expired@example.test','+966500000003');await verified({proofHash:expired.proofHash});
  await db.query("update marriage.signup_sms_challenges set expires_at=now()-interval '1 second' where proof_hash=$1",[expired.proofHash]);
  await assert.rejects(signup('expired@example.test',expired.proofHash),/تأكيد/);
  const permissions=(await db.query("select has_function_privilege('authenticated','public.marriage_signup_sms(text,jsonb)','execute') allowed")).rows[0];assert.equal(permissions.allowed,false);
 }finally{await db.close();}
});
