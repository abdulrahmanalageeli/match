import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { buildRankingCompletion, rankingRoundsForPhase } from "./ranking-completion.mjs"

const MATCH = "00000000-0000-0000-0000-000000000003"
let db
before(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table event_state (
      match_id uuid primary key, current_event_id integer, phase text,
      test_mode_active boolean default false, test_mode_snapshot jsonb
    );
    create table event3_participants (match_id uuid, event_id integer, participant_number integer);
    create table session_assignments (match_id uuid, event_id integer, round integer, table_number integer, participant_id integer);
    create table participant_rankings (
      id uuid default gen_random_uuid() primary key, match_id uuid, event_id integer,
      ranker_number integer, ranked_number integer, rank integer,
      auto_saved boolean default false, submitted_at timestamptz default now(),
      unique(match_id,event_id,ranker_number,ranked_number)
    );
  `)
  await db.exec(await readFile(new URL("../../supabase/migrations/20260830085709_complete_event3_rankings_on_phase_exit.sql", import.meta.url), "utf8"))
})
after(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec("truncate event3_ranking_drafts, participant_rankings, session_assignments, event3_participants, event_state")
  await db.query("insert into event_state(match_id,current_event_id,phase) values ($1,26,'ranking1')", [MATCH])
  // #1 meets six people in round one, then five new people and one repeat.
  await db.query("insert into event3_participants values ($1,26,1)", [MATCH])
  for (const [round, people] of [[1, [1,2,3,4,5,6,7]], [2, [1,7,8,9,10,11,12]]]) {
    for (const number of people) await db.query("insert into session_assignments values ($1,26,$2,1,$3)", [MATCH, round, number])
  }
})
async function phase(value) {
  return db.query("update event_state set phase=$2 where match_id=$1", [MATCH, value])
}
async function save(order, round, revision, draft = false, auto = false) {
  return (await db.query("select save_event3_ranking($1,26,1,$2,$3,$4,$5,$6) as result", [MATCH, round, order, revision, draft, auto])).rows[0].result
}
async function complete(round = 2) {
  return db.query("select complete_event3_rankings($1,26,$2)", [MATCH, round])
}
async function ballot() {
  return (await db.query("select ranked_number,rank,auto_saved from participant_rankings where match_id=$1 and event_id=26 and ranker_number=1 order by rank", [MATCH])).rows
}
const first = [6,4,2,7,5,3]
const full = [...first,8,9,10,11,12]
const chosen = [12,4,8,2,6,7,3,5,9,11,10]
async function startSecondRound() {
  await save(first, 1, 1)
  await phase("round2")
  await phase("ranking2")
}

test("advancing round two completes a six-person ballot without an active phone or timer", async () => {
  await startSecondRound()
  await phase("phase2_processing")
  const rows = await ballot()
  assert.deepEqual(rows.map(r => r.ranked_number), full)
  assert.deepEqual(rows.map(r => r.rank), full.map((_, i) => i + 1))
  assert.deepEqual(rows.map(r => r.auto_saved), [...first.map(() => false), ...Array(5).fill(true)])
})
test("advancing saves the attendee's latest unfinished order, including round-two people", async () => {
  await startSecondRound()
  await save(chosen, 2, 2, true)
  assert.equal((await ballot()).length, 6, "drafts are not marked submitted")
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), chosen)
  assert.ok((await ballot()).every(r => r.auto_saved))
})
test("round-one advancement also saves unfinished orders", async () => {
  await save(first, 1, 1, true)
  await phase("round2")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), first)
  assert.ok((await ballot()).every(r => r.auto_saved))
})
test("no submission in either round still yields the entire distinct list", async () => {
  await phase("round2")
  assert.equal((await ballot()).length, 6)
  await phase("ranking2")
  await phase("break")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), [2,3,4,5,6,7,8,9,10,11,12])
})
test("timer backup completes partial ballots and repeated completion is harmless", async () => {
  await startSecondRound()
  await complete()
  await complete()
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), full)
})
test("phase exit finalizes everyone using their own seating, including a twelve-person list", async () => {
  await startSecondRound()
  await db.query("insert into session_assignments values ($1,26,2,1,13)", [MATCH])
  for (const n of [2,3,4,5,6,7,8,9,10,11,12,13]) {
    await db.query("insert into event3_participants values ($1,26,$2)", [MATCH,n])
  }
  await phase("phase2_processing")
  const rows = (await db.query("select * from participant_rankings")).rows
  const assignments = (await db.query("select * from session_assignments")).rows
  const status = buildRankingCompletion(assignments, rows, 2)
  for (let n=1; n<=13; n++) assert.equal(status(n).submitted, true, `#${n} completed`)
  assert.equal((await ballot()).length, 12)
  assert.deepEqual((await ballot()).slice(0,6).map(r=>r.ranked_number), first)
})
test("complete manually submitted ordering and provenance are preserved", async () => {
  await startSecondRound()
  await save(chosen, 2, 2)
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), chosen)
  assert.ok((await ballot()).every(r => !r.auto_saved))
})
test("out-of-order network drafts cannot replace newer drafts or submissions", async () => {
  await startSecondRound()
  await save(chosen, 2, 10, true)
  assert.equal((await save(full, 2, 9, true)).stale, true)
  await save(chosen, 2, 10)
  await save(full, 2, 10, true)
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), chosen)
})
test("late first-round and final submissions acknowledge completion without changing matching data", async () => {
  await startSecondRound()
  assert.equal((await save([...first].reverse(), 1, 8)).closed, true)
  await save(chosen, 2, 10, true)
  await phase("phase2_processing")
  assert.deepEqual(await save(full, 2, 20, false, true), { closed: true, complete: true, saved: false })
  assert.deepEqual((await ballot()).map(r => r.ranked_number), chosen)
})
test("validation rejects missing/duplicate/foreign participants without deleting saved choices", async () => {
  await startSecondRound()
  for (const order of [first, [...full.slice(0,-1),2], [...full.slice(0,-1),999]]) {
    await assert.rejects(save(order, 2, 2), /each participant/)
  }
  assert.deepEqual((await ballot()).map(r => r.ranked_number), first)
})
test("failed insertion rolls back the whole submission and is retryable", async () => {
  await startSecondRound()
  await db.exec("alter table participant_rankings add constraint simulated_failure check (ranked_number <> 12)")
  try {
    await assert.rejects(save(chosen, 2, 2), /simulated_failure/)
    assert.deepEqual((await ballot()).map(r => r.ranked_number), first)
  } finally { await db.exec("alter table participant_rankings drop constraint simulated_failure") }
  await save(chosen, 2, 2)
  assert.deepEqual((await ballot()).map(r => r.ranked_number), chosen)
})
test("any completion failure rolls back all ballots and the phase change", async () => {
  await startSecondRound()
  await db.query("insert into event3_participants values ($1,26,99)", [MATCH])
  await assert.rejects(phase("phase2_processing"), /no group seating/)
  assert.equal((await db.query("select phase from event_state")).rows[0].phase, "ranking2")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), first)
})
test("organizer corrections supersede old unfinished drafts", async () => {
  await startSecondRound()
  await save(chosen, 2, 2, true)
  await db.query("delete from participant_rankings where match_id=$1", [MATCH])
  for (let i=0; i<full.length; i++) await db.query("insert into participant_rankings(match_id,event_id,ranker_number,ranked_number,rank) values ($1,26,1,$2,$3)", [MATCH, full[i], i+1])
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), full)
})
test("test sessions and historical events cannot contribute live drafts", async () => {
  await startSecondRound()
  await db.exec("update event_state set test_mode_active=true,test_mode_snapshot='{\"started_at\":\"test-one\"}'")
  await save(chosen, 2, 10, true)
  await db.exec("update event_state set test_mode_active=false")
  await db.query("insert into participant_rankings(match_id,event_id,ranker_number,ranked_number,rank) values ($1,25,1,12,1)", [MATCH])
  await phase("phase2_processing")
  assert.deepEqual((await ballot()).map(r => r.ranked_number), full)
  assert.equal((await db.query("select count(*)::int as n from participant_rankings where event_id=25")).rows[0].n, 1)
})
test("reset to setup invalidates unfinished drafts without finalizing", async () => {
  await save(first, 1, 1, true)
  await phase("setup")
  assert.equal((await ballot()).length, 0)
  assert.equal((await db.query("select submitted from event3_ranking_drafts")).rows[0].submitted, true)
})
test("private drafts and RPCs cannot be read or invoked by attendee database roles", async () => {
  await db.exec("set role anon")
  try {
    await assert.rejects(db.query("select * from event3_ranking_drafts"), /permission denied/)
    await assert.rejects(complete(), /permission denied/)
    await assert.rejects(save(first, 1, 1), /permission denied/)
  } finally { await db.exec("reset role") }
})
test("organizer completion uses distinct actual tablemates, not six rows or a fixed eleven", async () => {
  const assignments = (await db.query("select * from session_assignments")).rows
  const rows = first.map(n => ({ ranker_number: 1, ranked_number: n }))
  assert.deepEqual(buildRankingCompletion(assignments, rows, 1)(1), { submitted: true, expected_count: 6, missing_count: 0 })
  assert.deepEqual(buildRankingCompletion(assignments, rows, 2)(1), { submitted: false, expected_count: 11, missing_count: 5 })
  assert.equal(buildRankingCompletion(assignments, [...rows, ...Array(5).fill({ ranker_number: 1, ranked_number: 999 })], 2)(1).submitted, false)
  assert.equal(rankingRoundsForPhase("round2"), 1)
  assert.equal(rankingRoundsForPhase("ranking2"), 2)
  assert.equal(rankingRoundsForPhase("round3"), 2)
  assert.equal(rankingRoundsForPhase("ranking3"), 3)
})
