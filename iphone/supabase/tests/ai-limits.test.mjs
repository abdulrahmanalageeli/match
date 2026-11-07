import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';

test('AI quota derives identity, rejects revoked/suspended accounts and enforces shared caps without exposing data', async () => {
  const db = await createDatabase();
  try {
    const token = 'c'.repeat(64), token2 = 'd'.repeat(64);
    await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),'reham',now()+interval '1 hour'),(sha256($2::text::bytea),'reham',now()+interval '1 hour')", [token, token2]);
    const call = async (testToken = token, reserve = false, feature = 'demo_reply') => (await db.query('select public.nisfayn_ai_allow($1,$2,$3) result', [testToken, feature, reserve])).rows[0].result;
    await db.exec('set role anon');
    await assert.rejects(call('forged'));
    await assert.rejects(call(''));
    const first = await call(); assert.match(first.owner, /^[0-9a-f]{64}$/);
    assert.equal((await call(token2)).owner, first.owner, 'New session cannot reset the actor quota');
    for (let i = 0; i < 6; i++) assert.equal((await call(token, true)).status, 'allowed');
    assert.equal((await call(token2, true)).status, 'limited');
    await assert.rejects(db.query('select * from marriage.ai_usage'));
    await db.exec('reset role');
    await db.query("update marriage.ai_usage set created_at=now()-interval '2 minutes'");
    await db.query("insert into marriage.ai_usage(owner_key,feature,created_at) select 'tester:reham','demo_reply',now()-interval '2 minutes' from generate_series(1,74)");
    assert.equal((await call(token2, true)).status, 'limited', 'Daily owner cap spans sessions');
    await db.query("update marriage.admin_test_members set suspended=true where actor='reham'");
    await assert.rejects(call(token));
    await db.query("update marriage.admin_test_members set suspended=false where actor='reham'");
    await db.query("update nisfayn_test.sessions set expires_at=now()-interval '1 minute' where token_hash=sha256($1::text::bytea)", [token]);
    await assert.rejects(call(token));

    const user = { id: randomUUID(), sessionId: randomUUID(), email: 'ai@example.test' };
    await addUser(db, user);
    await db.query("update marriage.members set review_status='approved' where id=$1", [user.id]);
    const memberResult = await asMember(db, user.id, user.sessionId, () => call('', false, 'opener'));
    assert.match(memberResult.owner, /^[0-9a-f]{64}$/); assert.notEqual(memberResult.owner, first.owner);
    assert.equal((await asMember(db, user.id, user.sessionId, () => call('', true, 'opener'))).status, 'allowed');
    await assert.rejects(asMember(db, user.id, user.sessionId, () => call('', true, 'demo_reply')));
    await db.query("update marriage.members set suspended=true where id=$1", [user.id]);
    await assert.rejects(asMember(db, user.id, user.sessionId, () => call('', false, 'opener')));
    await db.query("update marriage.members set suspended=false where id=$1", [user.id]);
    await db.query("delete from auth.sessions where id=$1", [user.sessionId]);
    await assert.rejects(asMember(db, user.id, user.sessionId, () => call('', false, 'opener')));
    await db.query("insert into marriage.ai_usage(owner_key,feature,created_at) select 'tester:global-'||n,'opener',now()-interval '2 minutes' from generate_series(1,220) n");
    const adminToken = 'e'.repeat(64);
    await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),'abdulrahman',now()+interval '1 hour')", [adminToken]);
    assert.equal((await call(adminToken, true)).status, 'limited', 'Global cap spans every owner');
    const grants = (await db.query("select has_function_privilege('anon','public.nisfayn_ai_allow(text,text,boolean)','EXECUTE') allowed, has_schema_privilege('anon','marriage','USAGE') private_schema, has_table_privilege('authenticated','marriage.ai_usage','SELECT') table_read")).rows[0];
    assert.deepEqual(grants, { allowed: true, private_schema: false, table_read: false });
  } finally { await db.close(); }
});
