import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
test('trial requires completed signup, lasts seven days, never renews or charges',async()=>{
 const db=await createDatabase();try{
 const u={id:randomUUID(),sessionId:randomUUID(),email:'trial@example.test'};await addUser(db,u);
 const call=(sql,args=[])=>asMember(db,u.id,u.sessionId,async()=>(await db.query('select '+sql+' value',args)).rows[0].value);
 await call('public.marriage_state()');
 await assert.rejects(call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']));
 await call('public.marriage_apply($1)',[{displayName:'عضو التجربة',birthDate:'1997-01-01',gender:'man',city:'الرياض',profession:'مهندس',bio:'ملف للتجربة',contact:u.email,preferredMinAge:25,preferredMaxAge:40,familyPreference:'',consentVersion:'2026-11-05',signupConsents:{version:'2026-11-06-onboarding',adult:true,terms:true,privacy:true,sensitiveProfile:true,assessment:true,photo:true}}]);
 await assert.rejects(call('public.marriage_accept_testing_trial($1)',['forged']));
 const state=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);
 assert.equal(state.user.applicationStatus,'approved');assert.equal(state.membership.active,true);
 const again=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);assert.equal(again.testingTrial.expiresAt,state.testingTrial.expiresAt);
 assert.equal((await db.query('select count(*)::int n from marriage.store_transactions')).rows[0].n,0);
 await db.query("update marriage.members set manual_access_until=now()-interval '1 second' where id=$1",[u.id]);
 await db.query("update marriage.testing_signup_trials set expires_at=now()-interval '1 second' where member_id=$1",[u.id]);
 const expired=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);assert.equal(expired.membership.active,false);
 }finally{await db.close();}
});
