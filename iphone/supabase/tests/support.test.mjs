import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember } from './harness.mjs';

async function user(db, name) { const u = { id: randomUUID(), sessionId: randomUUID(), email: name + '@example.invalid' }; await addUser(db, u); return u; }
const rpc = async (db, action, payload = {}) => (await db.query('select public.marriage_support($1,$2) as result', [action, payload])).rows[0].result;
const input = () => ({ category: 'access', subject: 'مساعدة في الحساب', body: 'أحتاج مساعدة في ربط حساب الأهل.', clientId: randomUUID() });
async function staffCall(db, u, action, payload, aal = 'aal2') {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: u.id, session_id: u.sessionId, role: 'authenticated', aal })]); await db.exec('set role authenticated');
  try { return await rpc(db, action, payload); } finally { await db.exec('reset role'); }
}

test('support is account-scoped, idempotent, bounded, and usable without a paid member profile', async () => {
  const db = await createDatabase();
  try {
    const a = await user(db, 'member'), b = await user(db, 'guardian');
    await db.query("update auth.users set raw_app_meta_data='{" + '"guardian_account":true' + "}' where id=$1", [b.id]);
    const value = input(), created = await asMember(db, a.id, a.sessionId, () => rpc(db, 'create', value));
    assert.equal(created.status, 'open'); assert.equal(created.response, null); assert.equal(created.ownerId, undefined);
    const repeat = await asMember(db, a.id, a.sessionId, () => rpc(db, 'create', value)); assert.equal(repeat.id, created.id);
    await assert.rejects(asMember(db, a.id, a.sessionId, () => rpc(db, 'create', { ...value, body: 'تفاصيل مختلفة للطلب' })), /معرّف/);
    await asMember(db, b.id, b.sessionId, () => rpc(db, 'create', input()));
    const mine = await asMember(db, b.id, b.sessionId, () => rpc(db, 'list')); assert.equal(mine.items.length, 1); assert.notEqual(mine.items[0].id, created.id);
    await assert.rejects(asMember(db, b.id, b.sessionId, () => rpc(db, 'list', { before: created.id })), /تعذّر/);
    await assert.rejects(asMember(db, a.id, a.sessionId, () => db.query('select * from marriage.support_requests')), /permission/i);
    for (let i = 0; i < 4; i++) await asMember(db, a.id, a.sessionId, () => rpc(db, 'create', input()));
    await assert.rejects(asMember(db, a.id, a.sessionId, () => rpc(db, 'create', input())), /خمسة/);
    assert.equal((await asMember(db, a.id, a.sessionId, () => rpc(db, 'create', value))).id, created.id);
    await db.query('delete from auth.sessions where id=$1', [a.sessionId]);
    await assert.rejects(asMember(db, a.id, a.sessionId, () => rpc(db, 'list')), /تسجيل الدخول/);
    await db.exec('set role anon'); await assert.rejects(rpc(db, 'list'), /permission/i); await db.exec('reset role');
  } finally { await db.close(); }
});

test('support replies require staff MFA, protect revisions and retries, and appear only to their owner', async () => {
  const db = await createDatabase();
  try {
    const member = await user(db, 'member'), moderator = await user(db, 'moderator'), reviewer = await user(db, 'reviewer');
    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'moderator','مشرف'),($2,'reviewer','مراجع')", [moderator.id, reviewer.id]);
    const ticket = await asMember(db, member.id, member.sessionId, () => rpc(db, 'create', input()));
    for (const action of ['admin_list', 'admin_reply']) await assert.rejects(staffCall(db, member, action, {}), /صلاحية/);
    await assert.rejects(staffCall(db, reviewer, 'admin_list', {}), /صلاحية/);
    await assert.rejects(staffCall(db, moderator, 'admin_list', {}, 'aal1'), /خطوتين/);
    const queue = await staffCall(db, moderator, 'admin_list', { status: 'open' }); assert.equal(queue.items[0].ownerId, member.id);
    const reply = { id: ticket.id, revision: ticket.revision, status: 'in_review', response: 'نراجع مشكلة الربط وسنتابعها هنا.', requestId: randomUUID() };
    const updated = await staffCall(db, moderator, 'admin_reply', reply); assert.equal(updated.revision, 2);
    assert.deepEqual(await staffCall(db, moderator, 'admin_reply', reply), updated);
    await assert.rejects(staffCall(db, moderator, 'admin_reply', { ...reply, requestId: randomUUID() }), /تغيّر/);
    await assert.rejects(staffCall(db, moderator, 'admin_reply', { ...reply, response: 'نص آخر مختلف' }), /معرّف/);
    const own = await asMember(db, member.id, member.sessionId, () => rpc(db, 'list')); assert.equal(own.items[0].response, reply.response); assert.equal(own.items[0].status, 'in_review');
    assert.equal((await db.query('select count(*)::int as n from marriage.support_actions')).rows[0].n, 1);
    await db.query('delete from auth.users where id=$1', [member.id]);
    assert.equal((await db.query('select count(*)::int as n from marriage.support_requests')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from marriage.support_actions')).rows[0].n, 0);
  } finally { await db.close(); }
});
