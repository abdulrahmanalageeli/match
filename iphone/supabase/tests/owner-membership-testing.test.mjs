import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('only the verified owner and Reham can switch memberships; reset and expiry preserve billing',async()=>{
 const db=await createDatabase();
 const rpc=async(sql,args=[])=>(await db.query('select '+sql+' value',args)).rows[0].value;
 const call=(u,tier)=>asMember(db,u.id,u.sessionId,()=>rpc('public.marriage_test_membership($1)',[tier]));
 async function member(email,id=randomUUID(),gender='man'){const u={id,sessionId:randomUUID(),email};await addUser(db,u);await seedCommunicationMember(db,u,gender);return u;}
 try{
  const owner=await member('timgoldenz1999@yahoo.com'),other=await member('other@example.test');
  const reham=await member('reham@example.test','4c6ad0d9-a5c5-42dd-bb6c-a0614e7341b9','woman');
  const rehamState=await call(reham,'premium');
  assert.equal(rehamState.membershipTesting.selected,'premium');
  assert.equal(rehamState.demoInteractionsEnabled,false);
  assert.equal((await call(reham,'actual')).membershipTesting.selected,'actual');
  await assert.rejects(call(other,'seriousness'),/الاختبار/);
  assert.equal((await rpc('marriage.member_state($1)',[other.id])).membershipTesting,undefined);
  for(const [tier,active,capacity] of [['free',false,1],['premium',true,2],['seriousness',true,3]]){
   const state=await call(owner,tier);
   assert.equal(state.membership.active,active);assert.equal(state.membership.tier,tier);
   assert.equal(state.membership.connectionLimit,capacity);assert.equal(state.membershipTesting.selected,tier);
   assert.equal(state.demoInteractionsEnabled,true);
  }
  assert.equal((await db.query('select count(*)::int n from marriage.store_transactions')).rows[0].n,0);
  assert.equal((await call(owner,'actual')).membership.active,false);
  await call(owner,'seriousness');
  await db.query("update marriage.membership_test_overrides set expires_at=now()-interval '1 second'");
  assert.equal((await rpc('marriage.member_state($1)',[owner.id])).membership.tier,'free');
  await assert.rejects(call(owner,'invalid'),/غير صالح/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner.id]);
  await assert.rejects(call(owner,'premium'));
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[owner.id]);
  await db.query('delete from auth.sessions where id=$1',[owner.sessionId]);
  await assert.rejects(call(owner,'seriousness'));
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from marriage.membership_test_overrides'),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});
