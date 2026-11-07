import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

const catalog = JSON.parse(await readFile(new URL('../../src/compatibility/catalog.json', import.meta.url), 'utf8'));
test('recommended filters, authoritative expiry and neutral history retain participant privacy', async () => {
  const db = await createDatabase();
  const call = (user, sql, args = []) => asMember(db, user.id, user.sessionId, () => db.query('select ' + sql + ' value', args).then(result => result.rows[0].value));
  async function add(gender, name, city = 'الرياض') {
    const user = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' };
    await addUser(db, user);
    const profile = { displayName: name, age: 30, city, gender, profession: 'مهندس', bio: 'نبذة تجريبية', contact: user.email,
      preferredMinAge: 25, preferredMaxAge: 40, familyPreference: '', consentVersion: '2026-11-07-privacy', assessmentVersion: 'marriage-v2',
      surveyAnswers: Object.fromEntries(catalog.dimensions.flatMap(d => [[d.id, 'A'], [d.partnerId, 'A']])), hardRequirements: [],
      marriageBasics: { smoking: 'never', maritalStatus: 'never_married', nationality: 'السعودية' },
      signupConsents: { version: '2026-11-07-privacy', adult: true, terms: true, privacy: true, sensitiveProfile: true, sensitivePublication: true, assessment: true, photo: false } };
    const state = await call(user, 'public.marriage_apply($1)', [profile]);
    await asService(db, () => db.query("select public.marriage_review($1,'approve')", [user.id]));
    await asService(db, () => db.query('select public.marriage_record_receipt($1,$2,false)', [user.id, {
      bundleId: 'com.blindmatch.marriage', productId: 'com.blindmatch.marriage.monthly', appAccountToken: state.user.appAccountToken,
      originalTransactionId: user.id, transactionId: user.id, signedDate: Date.now(), expiresDate: Date.now() + 86400000, environment: 'Sandbox',
    }]));
    return user;
  }
  try {
    const man = await add('man', 'رائد'), woman = await add('woman', 'ليلى'), second = await add('woman', 'منى'), outsider = await add('man', 'سالم');
    const discover = filters => call(man, 'public.marriage_browse($1)', [{ mode: 'recommended', ...filters }]);
    assert.equal((await discover({})).length, 2);
    assert.equal((await discover({ city: 'الرياض' })).length, 2);
    assert.deepEqual((await discover({ search: 'ليلى' })).map(p => p.id), [woman.id]);
    assert.deepEqual(await discover({ city: 'جدة' }), []);
    assert.deepEqual(await discover({ excludeCities: ['الرياض'] }), []);
    assert.deepEqual(await discover({ smoking: 'daily' }), []);
    assert.deepEqual(await discover({ nationality: 'الكويت' }), []);
    assert.deepEqual(await discover({ onlineOnly: true }), []);
    await call(woman, 'public.marriage_heartbeat()');
    assert.deepEqual((await discover({ onlineOnly: true })).map(p => p.id), [woman.id]);
    assert.equal((await discover({ minFit: 90 })).length, 2);

    const request = await call(man, 'public.marriage_request($1)', [woman.id]);
    assert.equal(await call(man, 'public.marriage_request($1)', [woman.id]), request, 'retry returns the same request');
    assert(!(await discover({})).some(p => p.id === woman.id), 'recommended excludes open requests');
    const pending = (await call(man, 'public.marriage_inbox()')).find(r => r.id === request);
    assert.equal(Date.parse(pending.expiresAt) - Date.parse(pending.createdAt), 7 * 86400000);
    assert.deepEqual(await call(outsider, 'public.marriage_request_history()'), []);
    await db.query("update marriage.member_requests set created_at=now()-interval '8 days' where id=$1", [request]);
    assert(!(await call(man, 'public.marriage_inbox()')).some(r => r.id === request));
    const expired = (await call(woman, 'public.marriage_request_history()'))[0];
    assert.equal(expired.outcome, 'expired'); assert(expired.closedAt);
    assert.equal(expired.direction, 'incoming');
    assert.deepEqual(Object.keys(expired).sort(), ['alias', 'closedAt', 'createdAt', 'direction', 'id', 'outcome']);
    await assert.rejects(call(woman, "public.marriage_act($1,'accept')", [request]));
    await db.query('update marriage.member_requests set closed_at=null,closure_outcome=null,closed_requester_alias=null,closed_recipient_alias=null where id=$1', [request]);
    const legacy = (await call(man, 'public.marriage_request_history()'))[0];
    assert.equal(legacy.outcome, 'closed', 'legacy closure age never invents an expiration reason');
    assert.equal(legacy.closedAt, null, 'unknown historical closure dates remain unknown');
    assert.equal(legacy.alias, 'عضو', 'legacy history does not look up a closed peer’s current profile');

    const closed = await call(man, 'public.marriage_request($1)', [second.id]);
    await call(second, "public.marriage_act($1,'report','اختبار')", [closed]);
    const history = await call(man, 'public.marriage_request_history()');
    assert.equal(history.find(r => r.id === closed).outcome, 'closed');
    assert(!JSON.stringify(history).includes('اختبار'), 'report details do not reach the other participant');
    await db.query('update marriage.profiles set display_name=$1 where member_id=$2', ['اسم لاحق', second.id]);
    assert.equal((await call(man, 'public.marriage_request_history()')).find(r => r.id === closed).alias, 'منى', 'closure keeps the previously shared alias, never later profile changes');
    assert.deepEqual(await call(outsider, 'public.marriage_request_history()'), []);
    await db.exec("set role anon");
    try { await assert.rejects(db.query('select public.marriage_request_history()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});
