import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addUser, createDatabase } from './harness.mjs';

test('member release policy', async t => {
  const db = await createDatabase();
  t.after(() => db.close());
  const empty = { minimumBuild: 0, recommendedBuild: 0, storeUrl: null, maintenanceUntil: null, revision: 0 };
  const appleUrl = 'https://apps.apple.com/app/id1234567890';
  const badInput = { code: '22023' };
  const scalar = async (sql, args) => (await db.query('select ' + sql + ' as value', args)).rows[0].value;
  const read = platform => scalar('public.wudayn_release_policy($1)', [platform]);
  const write = (platform, revision, min, recommended, url = null, until = null) =>
    scalar('public.wudayn_set_release_policy($1,$2,$3,$4,$5,$6)', [platform, revision, min, recommended, url, until]);

  async function user(role) {
    const u = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.invalid' };
    await addUser(db, u);
    if (role) await db.query('insert into marriage.staff_accounts(user_id,display_name,role) values ($1,$2,$2)', [u.id, role]);
    return u;
  }
  async function session(u, aal, fn) {
    const claims = u ? { sub: u.id, session_id: u.sessionId, role: 'authenticated', aal } : {};
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
    await db.exec(u ? 'set role authenticated' : 'set role anon');
    try { return await fn(); }
    finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims','',false)");
    }
  }
  const owner = await user('owner');
  const moderator = await user('moderator');
  const member = await user();
  const asOwner = fn => session(owner, 'aal2', fn);

  await t.test('read before sign-in, narrow response and MFA owner enforcement', async () => {
    await session(null, null, async () => {
      assert.deepEqual(await read('ios'), empty);
      assert.deepEqual(await read('web'), empty);
      await assert.rejects(read('android'), badInput);
      await assert.rejects(db.query('select * from marriage.release_policies'), { code: '42501' });
      await assert.rejects(write('ios', 0, 0, 0), { code: '42501' });
    });
    for (const [u, aal] of [[member, 'aal2'], [moderator, 'aal2'], [owner, 'aal1']]) {
      await session(u, aal, async () => {
        assert.deepEqual(await read('ios'), empty);
        await assert.rejects(write('ios', 0, 0, 0));
        await assert.rejects(db.query("update marriage.release_policies set revision=2 where platform='ios'"), { code: '42501' });
      });
    }
  });

  await t.test('reject invalid builds, Store destinations and excessive maintenance', async () => {
    await asOwner(async () => {
      for (const [min, rec] of [[null, 0], [0, null], [-1, 0], [0, -1], [2, 1], [1000000, 0], [0, 1000000]]) {
        await assert.rejects(write('ios', 0, min, rec, appleUrl), badInput);
      }
      for (const url of [null, '0123', '0', '1'.repeat(20), 'http://apps.apple.com/app/id12',
        'https://apps.apple.com@other.test/app/id12', 'https://other.test@apps.apple.com/app/id12',
        'https://apps.apple.com:443/app/id12', appleUrl + '?link=x', appleUrl + '#fragment',
        'https://apps.apple.com.fake.test/app/id123']) {
        await assert.rejects(write('ios', 0, 0, 2, url), badInput);
      }
      await assert.rejects(write('ios', 0, 2, 0), badInput);
      await assert.rejects(write('web', 0, 0, 0, appleUrl), badInput);
      await assert.rejects(write('web', 0, 0, 0, null, new Date(Date.now() + 25 * 3600000).toISOString()), badInput);
      assert.deepEqual(await read('ios'), empty);
      assert.deepEqual(await read('web'), empty);
    });
  });

  await t.test('recommendation, required update, stale writes and audited rollback', async () => {
    const suggestion = { ...empty, recommendedBuild: 11, storeUrl: appleUrl, revision: 1 };
    const required = { ...suggestion, minimumBuild: 12, recommendedBuild: 0, revision: 2 };
    const reverted = { ...empty, revision: 3 };
    await asOwner(async () => {
      assert.deepEqual(await write('ios', 0, 0, 11, 'https://apps.apple.com/sa/app/wudayn/id1234567890'), suggestion);
      assert.deepEqual(await write('ios', 1, 0, 11, appleUrl), suggestion);
      const updates = await Promise.allSettled([
        write('ios', 1, 12, 0, '1234567890'), write('ios', 1, 12, 0, appleUrl)
      ]);
      assert.deepEqual(updates.filter(r => r.status === 'fulfilled').map(r => r.value), [required]);
      assert.deepEqual(updates.filter(r => r.status === 'rejected').map(r => r.reason.code), ['40001']);
      assert.deepEqual(await read('web'), empty);
      assert.deepEqual(await write('ios', 2, 0, 0), reverted);
    });
    assert.deepEqual(await session(null, null, () => read('ios')), reverted);
    const { rows } = await db.query("select actor_id, target_id, result from marriage.staff_audit where action='release_policy_updated' order by id");
    assert.deepEqual(rows.map(r => r.result), [
      { platform: 'ios', before: empty, after: suggestion },
      { platform: 'ios', before: suggestion, after: required },
      { platform: 'ios', before: required, after: reverted }
    ]);
    assert.ok(rows.every(r => r.actor_id === owner.id && r.target_id === rows[0].target_id));
  });

  await t.test('independent web policy, early reopening and automatic expiry', async () => {
    const soon = new Date(Date.now() + 1800000).toISOString();
    const active = await asOwner(() => write('web', 0, 999999, 999999, null, soon));
    assert.equal(Date.parse(active.maintenanceUntil), Date.parse(soon));
    assert.deepEqual(await session(null, null, () => read('web')), active);
    assert.deepEqual(await asOwner(() => write('web', 1, 0, 0)), { ...empty, revision: 2 });
    await asOwner(() => write('web', 2, 0, 0, null, soon));
    await db.exec("update marriage.release_policies set maintenance_until=now()-interval '1 second' where platform='web'");
    assert.deepEqual(await session(null, null, () => read('web')), { ...empty, revision: 3 });
    const staleTimestamp = new Date(Date.now() - 60000).toISOString();
    assert.deepEqual(await asOwner(() => write('web', 3, 2, 3, null, staleTimestamp)), {
      ...empty, minimumBuild: 2, recommendedBuild: 3, revision: 4
    });
  });
});
