import { before, beforeEach, after, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { buildMutualRound } from "./mutual-choice.mjs"
import { projectMutualRuntime, readMutualRuntime } from "./mutual-runtime.mjs"

const MATCH = "00000000-0000-0000-0000-000000000003"
const KEY = "live:28:1"
const roster = Array.from({ length: 12 }, (_, i) => ({ participant_number: i + 1, name: `Person${i + 1}`, gender: i % 2 ? "female" : "male" }))
const initial = buildMutualRound({ participants: roster, round: 1 })
let db
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table event_state(match_id uuid primary key,current_event_id integer,phase text,test_mode_active boolean default false,test_mode_snapshot jsonb,event3_runtime_generation integer default 1,global_timer_active boolean default false);
    create table event3_event_settings(match_id uuid,event_id integer,event_format text);
    create table event3_participants(match_id uuid,event_id integer,participant_number integer,position integer);
    create table participants(match_id uuid,assigned_number integer);
    create table session_assignments(match_id uuid,event_id integer,round integer,table_number integer,participant_id integer);
    create function set_event3_event_format(uuid,integer,text) returns boolean language sql as $$select $3 in ('classic', 'choice_only_three_groups')$$;`)
  const hardened = await readFile(new URL("../../supabase/migrations/20260905125242_harden_event3_variable_test_runtime.sql", import.meta.url), "utf8")
  await db.exec(hardened.match(/create or replace function public\.assert_event3_auxiliary_session\([\s\S]*?\$\$;/)[0])
  await db.exec(await readFile(new URL("../../supabase/migrations/20260919061904_event3_mutual_choice_six_rounds.sql", import.meta.url), "utf8"))
})
after(async () => db?.close())
beforeEach(async () => {
  await db.exec("truncate event3_mutual_runtime,event_state,event3_participants,event3_event_settings,participants")
  await db.query("insert into event_state(match_id,current_event_id,phase) values ($1,28,'setup')", [MATCH])
  await db.query("insert into event3_event_settings values ($1,28,'mutual_choice_six_rounds')", [MATCH])
  for (const p of roster) await db.query("insert into event3_participants values($1,28,$2,$2)", [MATCH, p.participant_number])
  for (const p of roster) await db.query("insert into participants values('00000000-0000-0000-0000-000000000000',$1)", [p.participant_number])
})
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result
const start = () => scalar("select event3_mutual_start(28,$1,120,$2,$3) result", [KEY, JSON.stringify(roster), JSON.stringify(initial)])
const snapshot = (key = KEY) => scalar("select event3_mutual_snapshot(28,$1) result", [key])
const choose = (n, chosen, round = 1, key = KEY) => scalar("select event3_mutual_choose(28,$1,$2,$3,$4) result", [key, n, round, chosen])
const expire = () => db.exec("update event3_mutual_runtime set ends_at=now()-interval '10 minutes'")
const commit = (s, assignments) => scalar("select event3_mutual_commit(28,$1,$2,$3) result", [KEY, s.revision, JSON.stringify(assignments)])
const control = command => scalar("select event3_mutual_control(28,$1,$2) result", [KEY, command])
const planned = s => buildMutualRound({ participants: s.roster, previousAssignments: s.assignments, choices: Object.entries(s.choices).map(([participant_number, chosen_number]) => ({ participant_number: Number(participant_number), chosen_number })), history: s.history, round: s.round_number + 1 })

test("mutual pair, nonmutual choices and skip advance together exactly once with a full next timer", async () => {
  await start()
  const group = initial.filter(a => a.group_number === initial[0].group_number)
  const [a,b,c,d] = group.map(a => a.participant_number)
  await choose(a,b); await choose(b,a); await choose(c,a); await choose(d,null)
  const before = await snapshot()
  await expire()
  const next = await commit(before, planned(before))
  assert.equal(next.round_number, 2)
  assert.equal(next.remaining_seconds, 120)
  assert.equal(next.assignments.find(row => row.participant_number === a).partner_number, b)
  assert.equal(next.assignments.filter(row => row.kind === "pair").length, 2)
  assert.equal(next.assignments.length, 12)
  assert.deepEqual(await commit(before, planned(before)), { stale: true })
  await expire()
  const third = await commit(next, planned(next))
  assert.ok(third.assignments.filter(row => [a,b].includes(row.participant_number)).every(row => row.kind === "group"))
})

test("cutoff, group membership, self-selection and revisions are enforced in the database", async () => {
  const first = await start()
  const mine = initial[0], peer = initial.find(a => a.group_number === mine.group_number && a.participant_number !== mine.participant_number), outsider = initial.find(a => a.group_number !== mine.group_number)
  await assert.rejects(choose(mine.participant_number, mine.participant_number), /current group/)
  await assert.rejects(choose(mine.participant_number, outsider.participant_number), /current group/)
  await assert.rejects(choose(999, null), /current group/)
  await choose(mine.participant_number, peer.participant_number)
  await expire()
  await assert.rejects(choose(peer.participant_number, mine.participant_number), /closed/)
  assert.deepEqual(await commit(first, planned(first)), { stale: true })
  const current = await snapshot()
  const forced = planned(current).map(row => [mine.participant_number,peer.participant_number].includes(row.participant_number) ? { ...row, kind: "pair", partner_number: row.participant_number === mine.participant_number ? peer.participant_number : mine.participant_number, table_number: 99 } : row)
  await assert.rejects(commit(current, forced), /reciprocal/)
})

test("pause freezes the clock and ballot; resume restores remaining time", async () => {
  await start()
  const paused = await control("pause")
  assert.equal(paused.status, "paused")
  assert.equal(paused.remaining_seconds, 120)
  await assert.rejects(choose(1, null), /closed/)
  const resumed = await control("resume")
  assert.equal(resumed.status, "running")
  assert.equal(resumed.remaining_seconds, 120)
  assert.deepEqual(await commit(resumed, planned(resumed)), { stale: true })
})

test("six sessions complete with no seventh, and final group has no unfulfillable ballot", async () => {
  let current = await start()
  for (let round = 1; round <= 6; round++) {
    if (round === 6) await assert.rejects(choose(1, null, 6), /closed/)
    await expire()
    current = await commit(current, round < 6 ? planned(current) : [])
  }
  assert.equal(current.round_number, 6)
  assert.equal(current.status, "complete")
  assert.equal(current.history.length, 72)
  assert.deepEqual(await commit(current, []), { stale: true })
})

test("reset invalidates old requests; live and test sessions remain isolated", async () => {
  await start()
  await control("reset")
  await assert.rejects(snapshot(), /session changed/)
  assert.equal((await snapshot("live:28:2")).status, "setup")
  await db.exec("update event_state set test_mode_active=true,test_mode_snapshot='{\"started_at\":\"test-new\"}'")
  assert.equal((await snapshot("test-new")).status, "setup")
  await assert.rejects(snapshot("live:28:2"), /session changed/)
})

test("personal projection reveals only the person's group and own choice", async () => {
  await start()
  await choose(1, null)
  const s = await snapshot()
  const result = projectMutualRuntime(s, { participantNumber: 1, sessionKey: KEY })
  assert.equal(result.choice.submitted, true)
  assert.equal(result.choice.chosen_number, null)
  assert.ok(!("choices" in result) && !("assignments" in result) && !("roster" in result) && !("history" in result))
  const table = initial.find(a => a.participant_number === 1).table_number
  assert.deepEqual(result.members.map(p => p.participant_number).sort((a,b) => a-b), initial.filter(a => a.table_number === table && a.participant_number !== 1).map(a => a.participant_number).sort((a,b) => a-b))
  assert.equal(result.can_choose, true)
})

test("API runtime polling commits one due step and refreshes a losing concurrent snapshot", async () => {
  await start(); await expire()
  const s = await snapshot()
  const calls = []
  const fake = { rpc: async (name, params) => { calls.push(name); return { data: name === "event3_mutual_commit" ? { stale: true } : calls.length === 1 ? s : { ...s, round_number: 2, remaining_seconds: 120 }, error: null } } }
  const result = await readMutualRuntime(fake, { eventId: 28, sessionKey: KEY })
  assert.equal(result.round_number, 2)
  assert.deepEqual(calls, ["event3_mutual_snapshot", "event3_mutual_commit", "event3_mutual_snapshot"])
})

test("private runtime tables and RPCs are inaccessible to browser database roles", async () => {
  for (const role of ["anon","authenticated"]) {
    assert.equal(await scalar("select has_table_privilege($1,'event3_mutual_runtime','select') result", [role]), false)
    assert.equal(await scalar("select has_function_privilege($1,'event3_mutual_choose(integer,text,integer,integer,integer)','execute') result", [role]), false)
  }
})

test("roster changes require setup and six valid unique participants", async () => {
  const replace = numbers => db.query("select event3_mutual_roster(28,$1,false,null)", [numbers])
  await assert.rejects(replace([1,2,3,4]), /6 to 100/)
  await assert.rejects(replace([1,2,3,4,5,5]), /unique/)
  await assert.rejects(replace([1,2,3,4,5,999]), /existing/)
  await replace(roster.map(row => row.participant_number))
  await start()
  await assert.rejects(replace([1,2,3,4,5,6]), /Reset the sessions/)
  assert.equal(await scalar("select count(*)::integer result from event3_participants"), 12)
})
