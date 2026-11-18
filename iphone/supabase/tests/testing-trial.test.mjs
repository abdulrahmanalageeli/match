import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';
test('trial requires completed signup, lasts seven days, never renews or charges',async()=>{
 const db=await createDatabase();try{
 const u={id:randomUUID(),sessionId:randomUUID(),email:'trial@example.test'};await addUser(db,u);
 const call=(sql,args=[])=>asMember(db,u.id,u.sessionId,async()=>(await db.query('select '+sql+' value',args)).rows[0].value);
 await call('public.marriage_state()');
 await assert.rejects(call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']));
 await seedCommunicationMember(db,u,'man','pending');
 await db.query("insert into marriage.consents(member_id,version) values($1,'2026-11-05')",[u.id]);
 await db.query("insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values($1,'+966500000019',now())",[u.id]);
 assert.equal((await call('public.marriage_state()')).testingTrial.enabled,false);
 await db.exec("update marriage.testing_signup_config set enabled=true");
 await assert.rejects(call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']),{code:'42501'});
 assert.equal((await call('public.marriage_state()')).user.applicationStatus,'pending');
 await db.query("update marriage.members set review_status='approved' where id=$1",[u.id]);
 await assert.rejects(call('public.marriage_accept_testing_trial($1)',['forged']));
 const state=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);
 assert.equal(state.user.applicationStatus,'approved');assert.equal(state.membership.status,'trial');
 const again=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);assert.equal(again.testingTrial.expiresAt,state.testingTrial.expiresAt);
 assert.equal((await db.query('select count(*)::int n from marriage.store_transactions')).rows[0].n,0);
 await db.query("update marriage.members set manual_access_until=now()-interval '1 second' where id=$1",[u.id]);
 await db.query("update marriage.testing_signup_trials set expires_at=now()-interval '1 second' where member_id=$1",[u.id]);
 const expired=await call('public.marriage_accept_testing_trial($1)',['testing-7d-12999-v1']);assert.equal(expired.membership.active,false);
 const next={id:randomUUID(),sessionId:randomUUID(),email:'second@example.test'};
 await db.query('delete from auth.users where id=$1',[u.id]);
 await addUser(db,next);await seedCommunicationMember(db,next,'man');
 await db.query("insert into marriage.consents(member_id,version) values($1,'2026-11-05')",[next.id]);
 await db.query("insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values($1,'+966500000019',now())",[next.id]);
 await assert.rejects(asMember(db,next.id,next.sessionId,()=>db.query("select public.marriage_accept_testing_trial('testing-7d-12999-v1')")),{code:'42501'});
 }finally{await db.close();}
});
