import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';

test('exclusions are private, deduplicated, and omit rematchable and expired requests', async () => {
 const db = await createDatabase();
 try {
  const users = [];
  for (let i=0;i<6;i++) {
   const user={id:randomUUID(),sessionId:randomUUID(),email:randomUUID()+'@example.test'};
   await addUser(db,user); users.push(user);
   await db.query("insert into marriage.cities(label) values('الرياض') on conflict do nothing");
   await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1",[user.id]);
   await db.query("insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio) values($1,'عضو',29,$2,(select id from marriage.cities where label='الرياض'),'مهندس','نبذة')",[user.id,i===0?'man':'woman']);
   await db.query("insert into marriage.preferences(member_id,min_age,max_age,family_preference) values($1,25,40,'')",[user.id]);
  }
  const [me,blocked,noRematch,rematch,expired,other]=users;
  const request=async(peer,allow,outcome='closed')=>db.query("insert into marriage.member_requests(requester_id,recipient_id,status,allow_rematch,closure_outcome,closed_recipient_alias) values($1,$2,'cancelled',$3,$4,'اسم سابق')",[me.id,peer.id,allow,outcome]);
  await request(blocked,false); await request(noRematch,false); await request(rematch,true); await request(expired,false,'expired');
  await db.query('insert into marriage.blocks(member_id,blocked_id) values($1,$2),($3,$1)',[me.id,blocked.id,other.id]);
  const list=u=>asMember(db,u.id,u.sessionId,async()=>(await db.query('select public.marriage_matching_exclusions() value')).rows[0].value);
  const rows=await list(me);
  assert.equal(rows.length,2);
  assert.equal(rows.find(r=>r.id===blocked.id).reason,'blocked');
  assert.equal(rows.find(r=>r.id===noRematch.id).reason,'no_rematch');
  assert.equal(rows.find(r=>r.id===noRematch.id).alias,'اسم سابق');
  assert.deepEqual((await list(other)).map(r=>r.id),[me.id]);
  assert.deepEqual(await list(rematch),[]);
  await db.query('delete from auth.sessions where id=$1',[me.sessionId]);
  await assert.rejects(list(me),/تسجيل الدخول/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.marriage_matching_exclusions()'),/permission denied/);
 } finally { await db.close(); }
});
