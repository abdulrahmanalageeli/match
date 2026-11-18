import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, addUser, asMember } from './harness.mjs';

test('phone ownership spans registration methods and survives only suspended deletions', async () => {
  const db = await createDatabase({throughMigration: '20261118062256_enable_membership_testing_for_reham.sql'});
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const phone = '+966500000021';
  const denied = /تعذّر استخدام رقم الجوال/;
  const user = async () => {
    const id = randomUUID(), sessionId = randomUUID(), email = id + '@example.test';
    await addUser(db, {id, sessionId, email});
    return {id, sessionId, email};
  };
  const confirmNative = (id, number) => db.query('update auth.users set phone=$2, phone_confirmed_at=now() where id=$1', [id, number.slice(1)]);
  const bindSms = (id, number) => db.query('insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values($1,$2,now())', [id, number]);
  const setSuspended = (id, suspended) => db.query('update marriage.members set suspended=$2 where id=$1', [id, suspended]);
  const remove = u => asMember(db, u.id, u.sessionId, () => scalar('select public.marriage_delete_account()'));
  const reason = 'قُبل الاعتراض';
  const release = () => scalar('select public.marriage_release_deleted_phone_block($1,$2)', [phone, reason]);
  try {
    const old = await user(), returning = await user(), staff = await user();
    await bindSms(old.id, phone);
    await confirmNative(old.id, phone);
    await setSuspended(old.id, true);
    await db.exec(await readFile(new URL('../migrations/20261118100756_guard_phone_reuse.sql', import.meta.url), 'utf8'));
    await assert.rejects(confirmNative(returning.id, phone), denied);
    await assert.rejects(bindSms(returning.id, phone), denied);

    await db.query("insert into marriage.staff_accounts(user_id,role,display_name) values($1,'moderator','Safety')", [staff.id]);
    const asStaff = (aal, work) => asMember(db, staff.id, staff.sessionId, async () => {
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:staff.id, session_id:staff.sessionId, role:'authenticated', aal})]);
      return work();
    });
    assert.equal(await asStaff('aal2', release), false);
    await remove(old);
    await assert.rejects(confirmNative(returning.id, phone), denied);
    await assert.rejects(bindSms(returning.id, phone), denied);
    await assert.rejects(asMember(db, returning.id, returning.sessionId, release), /صلاحية/);
    await assert.rejects(asStaff('aal1', release), /بخطوتين/);
    assert.equal(await asStaff('aal2', release), true);
    assert.equal(await asStaff('aal2', release), false);
    assert.equal(await scalar("select count(*)::int from marriage.staff_audit where action='release_phone_block' and target_id=$1 and reason=$2", [old.id, reason]), 1);
    await confirmNative(returning.id, phone);

    // Only verified phone proof can reach password or social binding. Both
    // channels must reject a collision and leave the challenge unconsumed.
    const social = await user(), device = 'a'.repeat(64);
    await db.query('insert into marriage.social_onboarding(user_id) values($1)', [social.id]);
    async function verifiedProof(email) {
      const hash = randomBytes(32).toString('hex');
      await db.query("insert into marriage.signup_sms_challenges(proof_hash,email,phone,device_hash,status,verified_at) values($1,$2,$3,$4,'verified',now())", [hash,email,phone,device]);
      return hash;
    }
    const socialProof = await verifiedProof(social.email);
    const finishSocial = () => asMember(db, social.id, social.sessionId, () => scalar('select public.marriage_complete_social_onboarding($1,$2,$3)',
      [socialProof, device, {version:'2026-11-07-privacy', adult:true, terms:true, privacy:true, sms:true}]));
    await assert.rejects(finishSocial(), denied);
    const passwordId = randomUUID(), email = passwordId + '@example.test', passwordProof = await verifiedProof(email);
    const passwordSignup = () => db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)', [passwordId,email,
      {signupKind:'member_self_claimed_email', signupPhoneProof:passwordProof, signupDeviceHash:device}]);
    await assert.rejects(passwordSignup(), denied);
    assert.equal(await scalar('select count(*)::int from auth.users where id=$1', [passwordId]), 0);

    // Restoring an account clears its hold but keeps its current number owned.
    await setSuspended(returning.id, true);
    await setSuspended(returning.id, false);
    await assert.rejects(finishSocial(), denied);
    await remove(returning);
    await finishSocial();
    await assert.rejects(passwordSignup(), denied);
    await remove(social);
    await passwordSignup();

    // Removing one source cannot release a number still owned via the other.
    const other = await user();
    await confirmNative(passwordId, phone);
    await confirmNative(passwordId, '+966500000022');
    await assert.rejects(confirmNative(other.id, phone), denied);
    for (const exception of ['+966560899666', '+966553576798']) {
      const first = await user(), second = await user();
      await bindSms(first.id, exception);
      await setSuspended(first.id, true);
      await bindSms(second.id, exception);
      await remove(first);
      assert.equal(await scalar('select count(*)::int from marriage.phone_claims where member_id in ($1,$2)', [first.id, second.id]), 0);
    }
    assert.equal(await scalar("select has_table_privilege('authenticated','marriage.phone_claims','SELECT')"), false);
    assert.equal(await scalar("select has_function_privilege('anon','public.marriage_release_deleted_phone_block(text,text)','EXECUTE')"), false);
  } finally { await db.close(); }
});
