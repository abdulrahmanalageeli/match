import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, addUser, asMember, asService } from "./harness.mjs";

test("pilot expiry, two-party progression, capacity and private access work through member RPCs", async () => {
  const db = await createDatabase();
  const call = (user, expression, params = []) => asMember(db, user.id, user.sessionId, async () =>
    (await db.query("select " + expression + " as value", params)).rows[0].value);
  async function add(gender) {
    const id = randomUUID(), user = { id, email: id + "@example.test", sessionId: randomUUID() };
    await addUser(db, user);
    const state = await call(user, "public.marriage_apply($1)", [{
      displayName: "عضو تجريبي", age: 30, city: "الرياض", gender, profession: "معلّم", bio: "ملف اختباري",
      contact: user.email, preferredMinAge: 25, preferredMaxAge: 40, familyPreference: "",
      consentVersion: "2026-11-05",
    }]);
    await asService(db, () => db.query("select public.marriage_review($1,'approve')", [id]));
    await asService(db, () => db.query("select public.marriage_record_receipt($1,$2,false)", [id, {
      bundleId: "com.blindmatch.marriage", productId: "com.blindmatch.marriage.monthly",
      appAccountToken: state.user.appAccountToken, originalTransactionId: id, transactionId: id,
      signedDate: Date.now(), expiresDate: Date.now() + 86400000, environment: "Sandbox",
    }]));
    return user;
  }
  try {
    const member = await add("woman"), peers = [];
    for (let i = 0; i < 5; i++) peers.push(await add("man"));
    await db.query("insert into marriage.cities(label) values ('جدة') on conflict do nothing");
    await db.query("update marriage.profiles set city_id=(select id from marriage.cities where label='جدة') where member_id=$1", [peers[0].id]);
    const cityFit = async () => (await db.query("select marriage.compatible($1,$2) as ok", [member.id,peers[0].id])).rows[0].ok;
    assert.equal(await cityFit(), false);
    await db.query("insert into marriage.member_answers(member_id,question_code,option_code) values($1,'residence_plan','A'),($2,'residence_plan','B')", [member.id,peers[0].id]);
    assert.equal(await cityFit(), true);
    assert.match((await db.query("select marriage.match_reasons($1,$2) as r", [member.id,peers[0].id])).rows[0].r[0], /مدينة مشتركة/);
    await db.query("update marriage.member_answers set option_code='A' where member_id=$1 and question_code='residence_plan'", [peers[0].id]);
    assert.equal(await cityFit(), false);
    await db.query("update marriage.member_answers set option_code='B' where member_id=$1 and question_code='residence_plan'", [peers[0].id]);
    await call(member, "public.marriage_discover()");
    await call(member, "public.marriage_discover()");
    await call(member, "public.marriage_note_profile_open($1)", [peers[0].id]);
    await call(member, "public.marriage_note_profile_open($1)", [peers[0].id]);
    const ids = [];
    for (const p of peers) ids.push(await call(member, "public.marriage_request($1)", [p.id]));
    for (let i = 0; i < 2; i++) await call(peers[i], "public.marriage_act($1,'accept')", [ids[i]]);
    await assert.rejects(call(peers[2], "public.marriage_act($1,'accept')", [ids[2]]), /تعارفان/);
    await db.query("update marriage.member_requests set created_at=now()-interval '8 days' where id=$1", [ids[4]]);
    await assert.rejects(call(peers[4], "public.marriage_act($1,'accept')", [ids[4]]), /مهلة/);
    assert(!(await call(peers[4], "public.marriage_inbox()")).some(r => r.id === ids[4]));
    await call(peers[1], "public.marriage_act($1,'cancel')", [ids[1]]);
    await call(peers[3], "public.marriage_act($1,'accept')", [ids[3]]);
    const stageState=({stage,mine,peer,exclusive,consentMine,consentPeer})=>({stage,mine,peer,exclusive,consentMine,consentPeer});
    assert.deepEqual(stageState(await call(member, "public.marriage_next_step($1,1,true,true)", [ids[0]])), { stage: 0, mine: true, peer: false, exclusive: false, consentMine: true, consentPeer: false });
    assert.deepEqual(stageState(await call(peers[0], "public.marriage_progress($1)", [ids[0]])), { stage: 0, mine: false, peer: true, exclusive: false, consentMine: false, consentPeer: true });
    await assert.rejects(call(peers[1], "public.marriage_progress($1)", [ids[0]]), /المحادثة/);
    await assert.rejects(call(member, "public.marriage_next_step($1,2,true)", [ids[0]]), /الحصري/);
    await call(member, "public.marriage_next_step($1,1,false)", [ids[0]]);
    assert.equal((await call(peers[0], "public.marriage_progress($1)", [ids[0]])).peer, false);
    await call(member, "public.marriage_next_step($1,1,true,true)", [ids[0]]);
    for (let i=0; i<2; i++) assert.equal((await call(peers[0], "public.marriage_next_step($1,1,true,true)", [ids[0]])).stage, 1);
    await call(peers[0], "public.marriage_next_step($1,2,true)", [ids[0]]);
    await call(member, "public.marriage_next_step($1,2,true)", [ids[0]]);
    const cohorts = (await asService(db, () => db.query("select * from public.marriage_fit_cohorts()"))).rows;
    assert.equal(cohorts.length, 1);
    const cohort = cohorts[0];
    assert.deepEqual([cohort.returned,cohort.opened,cohort.requested,cohort.accepted,cohort.formal].map(Number), [5,1,5,3,1]);
    assert.equal(cohort.band, "insufficient");
    await asMember(db, member.id, member.sessionId, () =>
      assert.rejects(db.query("select * from public.marriage_fit_cohorts()"), /permission denied/));
    await call(member, "public.marriage_message($1,$2,$3)", [ids[0], "my own message", randomUUID()]);
    await call(peers[0], "public.marriage_message($1,$2,$3)", [ids[0], "peer-private-message", randomUUID()]);
    const mine = await call(member, "public.marriage_personal_data()");
    assert.equal(mine.account.email, member.email);
    assert.deepEqual(mine.sentMessages.map(m => m.body), ["my own message"]);
    assert(!JSON.stringify(mine).includes(peers[0].email));
    assert(!JSON.stringify(mine).includes("peer-private-message"));
    await asMember(db, member.id, member.sessionId, () => assert.rejects(db.query("select * from public.marriage_pilot_totals()"), /permission denied/));
    const counts = (await asService(db, () => db.query("select event,total from public.marriage_pilot_totals()"))).rows;
    assert.equal(Number(counts.find(row => row.event === "serious_discussion_agreed").total), 1);
    assert.equal(Number(counts.find(row => row.event === "formal_step_agreed").total), 1);
    assert.equal(Number(counts.find(row => row.event === "first_message_sent").total), 1);
    await call(member, "public.marriage_act($1,'block')", [ids[0]]);
    await assert.rejects(call(peers[0], "public.marriage_next_step($1,2,true)", [ids[0]]), /المحادثة/);
    const phoneOnly = { id: randomUUID(), sessionId: randomUUID() };
    await db.query("insert into auth.users(id,phone) values($1,'+966500000000')", [phoneOnly.id]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [phoneOnly.sessionId,phoneOnly.id]);
    await assert.rejects(call(phoneOnly, "public.marriage_state()"), /مؤكد/);
    await db.query("update auth.users set phone_confirmed_at=now() where id=$1", [phoneOnly.id]);
    assert.equal((await call(phoneOnly, "public.marriage_state()")).user.id, phoneOnly.id);
    assert.equal((await call(phoneOnly, "public.marriage_personal_data()")).account.phone, "+966500000000");
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [phoneOnly.sessionId]);
    await assert.rejects(call(phoneOnly, "public.marriage_state()"), /مؤكد/);
    await db.exec("set role anon");
    try { await assert.rejects(db.query("select public.marriage_personal_data()"), /permission denied/); }
    finally { await db.exec("reset role"); }
  } finally { await db.close(); }
});
