import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember } from './harness.mjs';
import { comparePreferences, describeFit, dimensions } from '../../src/compatibility/model.ts';

const migration = await readFile(new URL('../migrations/20261114082310_contextual_residence_compatibility.sql', import.meta.url), 'utf8');
const consent = { version: '2026-11-07-privacy', adult: true, terms: true, privacy: true, sensitiveProfile: true, sensitivePublication: true, assessment: true, photo: false };

test('contextual residence aligns live eligibility, reciprocal score and explanations without editing answers', async () => {
  const db = await createDatabase({ throughMigration: '20261108091929_preference_evidence.sql' });
  const rpc = async (query, args = []) => (await db.query('select ' + query + ' value', args)).rows[0].value;
  const profiles = [];
  async function add(gender) {
    const user = { id: randomUUID(), sessionId: randomUUID(), email: randomUUID() + '@example.test' };
    await addUser(db, user);
    const surveyAnswers = Object.fromEntries(dimensions.flatMap(d => [[d.id, 'A'], [d.partnerId, 'A']]));
    surveyAnswers.partner_residence_plan = 'B';
    const profile = { displayName: 'مثال', age: 30, city: 'الرياض', gender, profession: 'الهندسة والعمارة', education: 'بكالوريوس', bio: 'نبذة', contact: user.email,
      preferredMinAge: 25, preferredMaxAge: 40, familyPreference: '', consentVersion: consent.version, signupConsents: consent,
      appearanceVersion: 'appearance-v1', assessmentVersion: 'marriage-v2', surveyAnswers, hardRequirements: ['residence_plan'], priorityCategories: [],
      personalityAnswers: {}, personalityVersion: 'personality-v1', marriageBasics: {} };
    await asMember(db, user.id, user.sessionId, () => rpc('public.marriage_apply($1)', [profile]));
    await db.query("update marriage.members set review_status='approved',manual_access_until=now()+interval '1 day' where id=$1", [user.id]);
    profiles.push({ ...profile, id: user.id });
    return user;
  }
  try {
    const a = await add('man'), b = await add('woman');
    const ids = [a.id, b.id];
    const savedBefore = (await db.query('select * from marriage.member_answers order by member_id,question_code')).rows;
    assert.equal(await rpc('marriage.compatible($1,$2)', ids), false, 'Reproduce the old same-city hard-requirement mismatch');
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from marriage.member_answers order by member_id,question_code')).rows, savedBefore);
    assert.equal(await rpc('marriage.compatible($1,$2)', ids), true);
    async function checkParity() {
      const fit = (await db.query('select fit from marriage.pair_fit($1,$2)', ids)).rows[0].fit;
      const client = describeFit(...profiles).fit;
      for (const key of ['percentage', 'strengths', 'discussion', 'missing', 'preferenceEvidence']) assert.deepEqual(fit[key], client[key], key);
      assert.equal(await rpc('marriage.compatible($1,$2)', ids), comparePreferences(...profiles) !== null);
      assert.deepEqual((await db.query('select fit from marriage.pair_fit($1,$2)', ids.toReversed())).rows[0].fit.preferenceEvidence, fit.preferenceEvidence);
      return fit;
    }
    assert.equal((await checkParity()).percentage, 100);
    assert((await rpc('marriage.match_reasons($1,$2)', ids)).includes('مدينتاكما واختيارات السكن تتيحان الاستقرار في مدينة مشتركة.'));
    // All existing residence choices can converge on the city they already share.
    for (const own of ['A', 'B', 'C']) {
      profiles[1].surveyAnswers.residence_plan = own;
      await db.query("update marriage.member_answers set option_code=$2 where member_id=$1 and question_code='residence_plan'", [b.id, own]);
      assert.equal((await checkParity()).percentage, 100);
    }
    async function city(index, label) {
      await db.query('insert into marriage.cities(label) values($1) on conflict(label) do nothing', [label]);
      const cityId = await rpc('(select id from marriage.cities where label=$1)', [label]);
      assert(cityId, 'Fixture city exists: ' + label);
      profiles[index].city = label;
      await db.query('update marriage.profiles set city_id=$2 where member_id=$1', [profiles[index].id, cityId]);
    }
    await city(1, 'Riyadh');
    assert.equal((await checkParity()).percentage, 100, 'Canonical city aliases share the same outcome');
    await city(1, 'جدة');
    const distant = await checkParity();
    assert.equal(distant.preferenceEvidence.topics.find(t => t.id === 'residence_plan').status, 'different');
    assert(distant.percentage < 100);
    for (const label of ['مدينة أخرى داخل السعودية', 'مدينة أخرى خارج السعودية']) {
      await city(0, label); await city(1, label);
      assert.equal((await checkParity()).preferenceEvidence.topics.find(t => t.id === 'residence_plan').status, 'different');
    }
    await city(0, 'الرياض'); await city(1, 'الرياض');
    delete profiles[1].surveyAnswers.residence_plan;
    await db.query("delete from marriage.member_answers where member_id=$1 and question_code='residence_plan'", [b.id]);
    const missing = await checkParity();
    assert.equal(missing.percentage, null);
    assert.equal(missing.preferenceEvidence.topics.find(t => t.id === 'residence_plan').status, 'missing');
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await rpc('has_function_privilege($1,$2,$3)', [role, 'marriage.preference_answer_fit(text,uuid,uuid,text,text)', 'execute']), false);
  } finally { await db.close(); }
});
