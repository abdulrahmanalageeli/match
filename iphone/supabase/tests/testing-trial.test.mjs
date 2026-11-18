import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,addUser,asMember} from './harness.mjs';
import {seedCommunicationMember} from './communication-fixture.mjs';

test('standalone trial cannot grant access to an approved member',async()=>{
 const db=await createDatabase();
 try{
  const user={id:randomUUID(),sessionId:randomUUID(),email:'trial@example.test'};
  await addUser(db,user);
  await seedCommunicationMember(db,user,'man');
  await assert.rejects(asMember(db,user.id,user.sessionId,()=>db.query("select public.marriage_accept_testing_trial('testing-7d-12999-v1')")),/Apple/);
  assert.equal((await db.query('select enabled from marriage.testing_signup_config')).rows[0].enabled,false);
  assert.equal((await db.query('select count(*)::int n from marriage.testing_signup_trials')).rows[0].n,0);
 }finally{await db.close();}
});
