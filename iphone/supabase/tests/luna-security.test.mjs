import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';

test('Luna warnings and cooldown belong to a live principal across sessions', async () => {
  const db = await createDatabase();
  const guard = async (refused = false, token = null) =>
    (await db.query('select public.wudayn_luna_guard($1,$2) as v', [token, refused])).rows[0].v;
  const user = () => ({ id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' });
  const a = user(), b = user(), secondSession = randomUUID();
  const as = (u, op) => asMember(db, u.id, u.sessionId, op);
  try {
    await addUser(db, a); await addUser(db, b);
    await db.query('insert into auth.sessions values($1,$2,null)', [secondSession,a.id]);
    assert.equal((await as(a, () => guard())).status, 'allowed');
    assert.deepEqual(await as(a, () => guard(true)), { status:'warning',remaining:2 });
    assert.deepEqual(await asMember(db,a.id,secondSession,() => guard(true)), { status:'warning',remaining:1 });
    assert.deepEqual(await as(a, () => guard(true)), { status:'locked',retryAfter:86400 });
    assert.equal((await asMember(db,a.id,secondSession,() => guard())).status,'locked');
    assert.equal((await as(b, () => guard())).status,'allowed');
    await assert.rejects(as(b, () => db.query('delete from marriage.luna_access_windows')));
    await assert.rejects(as(b, () => db.query('select * from marriage.luna_access_windows')));
    await db.query("update marriage.luna_access_windows set window_start=now()-interval '2 days',locked_until=now()-interval '1 second' where member_id=$1",[a.id]);
    assert.equal((await as(a, () => guard())).status,'allowed');
    assert.equal((await as(a, () => guard(true))).remaining,2);
    const tester='a'.repeat(64), tester2='b'.repeat(64);
    await db.query("insert into nisfayn_test.sessions values(sha256($1::text::bytea),'reham',now()+interval '1 hour'),(sha256($2::text::bytea),'reham',now()+interval '1 hour')",[tester,tester2]);
    await assert.rejects(as(a, () => guard(true,tester)));
    await db.exec('set role anon');
    await assert.rejects(guard(true));
    await assert.rejects(guard(true,'c'.repeat(64)));
    assert.equal((await guard(true,tester)).remaining,2);
    assert.equal((await guard(true,tester2)).remaining,1);
    assert.equal((await guard(true,tester)).status,'locked');
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id=$1',[secondSession]);
    await assert.rejects(asMember(db,a.id,secondSession,() => guard()));
  } finally { await db.close(); }
});
