import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createDatabase, addUser, asMember, asService } from './harness.mjs';

let db;
before(async () => { db = await createDatabase(); });
after(async () => { await db?.close(); });
const baseline = createHash('sha256').update('new').digest('hex');
const permissions = { version: '2026-11-07-privacy', sensitiveProfile: true, assessment: true };
const rpc = async (sql, args = []) => (await db.query('select ' + sql + ' value', args)).rows[0].value;
async function member() {
  const user = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' };
  await addUser(db, user);
  return user;
}
const call = (u, command, payload = {}) => asMember(db, u.id, u.sessionId, () => rpc('public.marriage_onboarding_draft($1,$2)', [command, payload]));
const document = (u, patch = {}) => ({ version: 1, owner: u.id, baseline, step: 'details', returnToReview: false,
  savedAt: 1, answers: { displayName: 'مسودة خاصة', bio: 'نبذة لم تُنشر', marriageBasics: { heightCm: 170 } }, permissions, ...patch });

test('drafts belong only to the confirmed active session; direct reads/writes and service/anonymous RPCs are denied', async () => {
  const a = await member(), b = await member();
  await call(a, 'save', document(a));
  assert.equal((await call(a, 'load')).owner, a.id);
  assert.equal(await call(b, 'load', { owner: a.id }), null);
  await assert.rejects(call(b, 'save', document(a)), /المسودة غير صالحة/);
  await call(b, 'delete', { owner: a.id });
  assert.equal((await call(a, 'load')).owner, a.id);
  assert.equal(await rpc("(select relrowsecurity from pg_class where oid='marriage.onboarding_drafts'::regclass)"), true);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(db.query('select * from marriage.onboarding_drafts'), /permission denied/);
      await assert.rejects(db.query('delete from marriage.onboarding_drafts'), /permission denied/);
      if (role !== 'authenticated') await assert.rejects(rpc("public.marriage_onboarding_draft('load','{}')"), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.query('delete from auth.sessions where id=$1', [a.sessionId]);
  for (const command of ['load', 'save', 'delete']) await assert.rejects(call(a, command, document(a)), /تسجيل الدخول/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1', [b.id]);
  await assert.rejects(call(b, 'save', document(b)), /تسجيل الدخول/);
});

test('draft purpose choices strip sensitive/assessment fields without publishing a profile or accepting final terms', async () => {
  const u = await member();
  const answers = { displayName: 'عضوة', bio: 'نبذة خاصة', marriageBasics: { heightCm: 168, skinTone: 'tone_3', tribalBackground: 'tribal', tribeName: 'اسم', religiousAffiliation: 'sunni', prayerPractice: 'regular' },
    partnerCriteria: { height: { mode: 'prefer', min: 170 }, skinTone: { mode: 'prefer', values: ['tone_3'] }, tribalBackground: { mode: 'require', target: 'same_tribe' } },
    publicAvatar: { style: 'hijab', skinTone: 'tone_3' }, surveyAnswers: { conversation_initiative: 'A' }, personalityAnswers: { social_energy: 'A' }, hardRequirements: ['conversation_initiative'], priorityCategories: ['personality'], beena: { story: 'private' } };
  await call(u, 'save', document(u, { answers, consent: true, terms: true, permissions: { ...permissions, sensitiveProfile: false } }));
  let saved = await call(u, 'load');
  assert.deepEqual(saved.answers.marriageBasics, { heightCm: 168 });
  assert.deepEqual(saved.answers.partnerCriteria, { height: { mode: 'prefer', min: 170 } });
  assert.equal(saved.answers.publicAvatar, null);
  assert.equal(saved.answers.personalityAnswers.social_energy, 'A');
  assert.equal(saved.consent, undefined); assert.equal(saved.terms, undefined);
  assert.equal(saved.baseline, baseline); assert(saved.savedAt > 1);
  await call(u, 'save', document(u, { answers, permissions: { ...permissions, assessment: false } }));
  saved = await call(u, 'load');
  for (const field of ['surveyAnswers', 'personalityAnswers', 'partnerCriteria']) assert.deepEqual(saved.answers[field], {});
  for (const field of ['hardRequirements', 'priorityCategories']) assert.deepEqual(saved.answers[field], []);
  assert.equal(saved.answers.beena, null);
  assert.equal(saved.answers.marriageBasics.skinTone, 'tone_3');
  assert.equal(await rpc('(select count(*)::int from marriage.profiles where member_id=$1)', [u.id]), 0);
  assert.equal(await rpc('(select count(*)::int from marriage.signup_consent_events where member_id=$1)', [u.id]), 0);
  assert.equal(await rpc('(select review_status from marriage.members where id=$1)', [u.id]), 'draft');
});

test('invalid purpose/version/baseline/documents cannot overwrite the last valid account draft', async () => {
  const u = await member();
  await call(u, 'save', document(u));
  for (const payload of [
    document(u, { baseline: 'raw private profile answers' }),
    document(u, { permissions: undefined }),
    document(u, { permissions: { ...permissions, version: 'outdated' } }),
    document(u, { permissions: { ...permissions, sensitiveProfile: 'true' } }),
    document(u, { permissions: { ...permissions, terms: true } }),
    document(u, { answers: { portrait: { path: 'private' } } }),
    document(u, { answers: { signupConsents: { terms: true } } }),
    document(u, { answers: { bio: 'x'.repeat(20001) } }),
    document(u, { step: 'public-profile' }),
  ]) await assert.rejects(call(u, 'save', payload));
  await assert.rejects(call(u, null, document(u)), /طلب غير صالح/);
  assert.equal((await call(u, 'load')).answers.displayName, 'مسودة خاصة');
  await db.query('update marriage.members set suspended=true where id=$1', [u.id]);
  await assert.rejects(call(u, 'save', document(u)), /الحساب غير متاح/);
});

test('seven-day expiry blocks reads, cleanup purges expired rows, and account deletion cascades', async () => {
  const a = await member(), b = await member(), c = await member();
  for (const u of [a, b, c]) await call(u, 'save', document(u));
  assert.equal(await rpc("(select expires_at-updated_at=interval '7 days' from marriage.onboarding_drafts where member_id=$1)", [a.id]), true);
  await db.query("update marriage.onboarding_drafts set expires_at=now()-interval '1 second' where member_id=$1", [a.id]);
  assert.equal(await call(a, 'load'), null);
  assert.equal(await rpc('(select count(*)::int from marriage.onboarding_drafts where member_id=$1)', [a.id]), 0);
  await db.query("update marriage.onboarding_drafts set expires_at=now()-interval '1 second' where member_id=$1", [b.id]);
  const cleaned = await asService(db, () => rpc('public.marriage_operations_cleanup()'));
  assert.equal(cleaned.expiredOnboardingDrafts, 1);
  assert.equal((await call(c, 'load')).owner, c.id);
  await db.query('delete from auth.users where id=$1', [c.id]);
  assert.equal(await rpc('(select count(*)::int from marriage.onboarding_drafts where member_id=$1)', [c.id]), 0);
});

test('personal-data export includes only the owners unexpired draft without its internal baseline hash', async () => {
  const a = await member(), b = await member();
  await call(a, 'save', document(a));
  await call(b, 'save', document(b, { answers: { displayName: 'شخص آخر' } }));
  const exported = await asMember(db, a.id, a.sessionId, () => rpc('public.marriage_personal_data()'));
  assert.equal(exported.onboardingDraft.owner, a.id);
  assert.equal(exported.onboardingDraft.answers.displayName, 'مسودة خاصة');
  assert.equal(exported.onboardingDraft.baseline, undefined);
  assert(exported.onboardingDraft.expiresAt); assert(exported.onboardingDraft.updatedAt);
  assert(!JSON.stringify(exported).includes('شخص آخر'));
  await db.query("update marriage.onboarding_drafts set expires_at=now()-interval '1 second' where member_id=$1", [a.id]);
  assert.equal((await asMember(db, a.id, a.sessionId, () => rpc('public.marriage_personal_data()'))).onboardingDraft, null);
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await rpc("has_function_privilege($1,'marriage.personal_data_before_onboarding_drafts()','EXECUTE')", [role]), false);
});
