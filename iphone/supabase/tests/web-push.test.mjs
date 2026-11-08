import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

test('Web Push shares opt-in queue, isolates devices, rejects unsafe endpoints and revokes on signout', async () => {
 const db = await createDatabase();
 try {
  const rpc = async (sql, args = []) => (await db.query('select ' + sql + ' as v', args)).rows[0].v;
  const call = (u, sql, args = []) => asMember(db, u.id, u.sessionId, () => rpc(sql, args));
  const service = (sql, args = []) => asService(db, () => rpc(sql, args));
  const add = async gender => {
   const u = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test', installation: randomUUID() };
   await addUser(db, u);
   const state = await call(u, 'public.marriage_apply($1)', [{ displayName: 'اختبار', age: 29, gender, city: 'الرياض', profession: 'مهندس', bio: 'مثال اختباري', contact: u.email, preferredMinAge: 25, preferredMaxAge: 40, familyPreference: '', consentVersion: '2026-11-07-privacy', signupConsents:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true,sensitiveProfile:true,sensitivePublication:true,assessment:true,photo:false} }]);
   await service("public.marriage_review($1,'approve')", [u.id]);
   await service('public.marriage_record_receipt($1,$2,false)', [u.id, { bundleId: 'com.blindmatch.marriage', productId: 'com.blindmatch.marriage.monthly', appAccountToken: state.user.appAccountToken, originalTransactionId: u.id, transactionId: u.id, signedDate: Date.now(), expiresDate: Date.now() + 86400000, environment: 'Sandbox' }]);
   return u;
  };
  const a = await add('woman'), b = await add('man');
  const sub = { endpoint: 'https://web.push.apple.com/' + randomUUID(), keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } };
  for (const endpoint of ['https://127.0.0.1/test', 'https://web.push.apple.com.evil.test/a', 'https://user@web.push.apple.com/a', 'https://web.push.apple.com:444/a', 'http://web.push.apple.com/a']) {
   await assert.rejects(call(b, 'public.marriage_web_push_register($1,$2)', [{ ...sub, endpoint }, b.installation]), /تعذّر تسجيل/);
  }
  await call(b, 'public.marriage_web_push_register($1,$2)', [{ ...sub, privateExtra: 'must be removed' }, b.installation]);
  assert.equal((await call(b, 'public.marriage_push_settings()')).enabled, false);
  await asMember(db, a.id, a.sessionId, () => assert.rejects(db.query('select web_subscription from marriage.push_devices'), /permission denied/));
  await assert.rejects(call(a, "public.marriage_push_claim('web',20)"), /permission denied/);
  await call(b, 'public.marriage_push_enable(true)');
  const request = await call(a, 'public.marriage_request($1)', [b.id]);
  assert.deepEqual(await service("public.marriage_push_claim('production',20)"), []);
  const jobs = await service("public.marriage_push_claim('web',20)");
  assert.equal(jobs.length, 1); assert.equal(jobs[0].requestId, request); assert.deepEqual(jobs[0].subscription, sub);
  assert.equal(await service('public.marriage_push_validate($1,$2)', [jobs[0].id, jobs[0].leaseId]), true);
  assert(!JSON.stringify(jobs).includes('must be removed')); assert(!JSON.stringify(jobs).includes('@example.test'));
  // Moving the same browser endpoint to another account cancels the old account's job.
  await call(a, 'public.marriage_web_push_register($1,$2)', [sub, a.installation]);
  assert.equal(await service('public.marriage_push_validate($1,$2)', [jobs[0].id, jobs[0].leaseId]), false);
  assert.equal((await db.query("select count(*)::int n from marriage.push_devices where environment='web'")).rows[0].n, 1);
  await call(b, 'public.marriage_web_push_register($1,$2)', [sub, b.installation]);
  await call(b, "public.marriage_act($1,'accept')", [request]);
  const mutual = await service("public.marriage_push_claim('web',20)"); assert.equal(mutual.length, 1);
  const rotated = { ...sub, keys: { ...sub.keys, auth: 'C'.repeat(22) } };
  await call(b, 'public.marriage_web_push_register($1,$2)', [rotated, b.installation]);
  await service("public.marriage_push_finish($1,$2,'invalid',$3)", [mutual[0].id, mutual[0].leaseId, mutual[0].token]);
  assert.equal((await db.query('select count(*)::int n from marriage.push_devices where member_id=$1', [b.id])).rows[0].n, 1);
  await call(a, 'public.marriage_message($1,$2,$3)', [request, 'رسالة خاصة', randomUUID()]);
  const messages = await service("public.marriage_push_claim('web',20)"); assert.equal(messages.length, 1);
  await call(b, 'public.marriage_push_enable(false)');
  assert.equal(await service('public.marriage_push_validate($1,$2)', [messages[0].id, messages[0].leaseId]), false);
  await call(b, 'public.marriage_push_enable(true)');
  const readClient = randomUUID();
  await call(a, 'public.marriage_message($1,$2,$3)', [request, 'تُقرأ قبل إرسال التنبيه', readClient]);
  const readId = (await db.query('select id from marriage.thread_messages where client_id=$1', [readClient])).rows[0].id;
  await call(b, 'public.marriage_mark_thread_read($1,$2)', [request, readId]);
  assert.deepEqual(await service("public.marriage_push_claim('web',20)"), []);
  const deletedClient = randomUUID();
  await call(a, 'public.marriage_message($1,$2,$3)', [request, 'تُحذف قبل إرسال التنبيه', deletedClient]);
  const deletedId = (await db.query('select id from marriage.thread_messages where client_id=$1', [deletedClient])).rows[0].id;
  await call(a, 'public.marriage_delete_message($1,$2)', [request, deletedId]);
  assert.deepEqual(await service("public.marriage_push_claim('web',20)"), []);
  await db.query('delete from auth.sessions where id=$1', [b.sessionId]);
  assert.equal((await db.query('select count(*)::int n from marriage.push_devices where member_id=$1', [b.id])).rows[0].n, 0);
  await assert.rejects(call(b, 'public.marriage_web_push_register($1,$2)', [sub, b.installation]), /تسجيل الدخول/);
 } finally { await db.close(); }
});
