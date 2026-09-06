import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

import { normalizeEvent3Round3ApplyRequest } from "./round3-seating-apply.mjs"

const EVENT3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
const EVENT_ID = 27
const MIGRATION_URL = new URL(
  "../../supabase/migrations/20260906154019_apply_event3_round3_seating_plan.sql",
  import.meta.url,
)

const currentRound3 = [
  { participant_id: 1, table_number: 1 },
  { participant_id: 2, table_number: 1 },
  { participant_id: 3, table_number: 2 },
  { participant_id: 5, table_number: 2 },
  { participant_id: 4, table_number: 3 },
  { participant_id: 6, table_number: 3 },
  { participant_id: 7, table_number: 4 },
  { participant_id: 8, table_number: 4 },
]
const expectedRound1 = [
  { participant_id: 1, table_number: 1 },
  { participant_id: 2, table_number: 1 },
  { participant_id: 3, table_number: 2 },
  { participant_id: 4, table_number: 2 },
  { participant_id: 5, table_number: 3 },
  { participant_id: 6, table_number: 3 },
  { participant_id: 7, table_number: 4 },
  { participant_id: 8, table_number: 4 },
]
const expectedRound2 = [
  { participant_id: 1, table_number: 1 },
  { participant_id: 2, table_number: 2 },
  { participant_id: 3, table_number: 1 },
  { participant_id: 4, table_number: 2 },
  { participant_id: 5, table_number: 3 },
  { participant_id: 6, table_number: 4 },
  { participant_id: 7, table_number: 3 },
  { participant_id: 8, table_number: 4 },
]
const repairedRound3 = [
  { participant_id: 1, table_number: 1 },
  { participant_id: 4, table_number: 1 },
  { participant_id: 2, table_number: 2 },
  { participant_id: 5, table_number: 2 },
  { participant_id: 3, table_number: 3 },
  { participant_id: 6, table_number: 3 },
  { participant_id: 7, table_number: 4 },
  { participant_id: 8, table_number: 4 },
]

function json(value) {
  return JSON.stringify(value)
}

function applyRound3(db, expectedAssignments, assignments, {
  round1 = expectedRound1,
  round2 = expectedRound2,
} = {}) {
  return db.query(`select apply_event3_round3_seating_plan_v2(
    $1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,4,false,null
  ) result`, [
    EVENT3_MATCH_ID,
    STATIC_MATCH_ID,
    EVENT_ID,
    json(round1),
    json(round2),
    json(expectedAssignments),
    json(assignments),
  ])
}

async function expectDbError(promise, pattern) {
  await assert.rejects(promise, error => {
    assert.match(String(error?.message || error), pattern)
    return true
  })
}

async function round3Rows(db) {
  return (await db.query(`select participant_id,table_number
    from session_assignments where round=3 order by participant_id`)).rows
}

test("normalizes a complete Round-3 CAS request and rejects ambiguous rows", () => {
  assert.deepEqual(normalizeEvent3Round3ApplyRequest({
    expected_round1_assignments: [...expectedRound1].reverse(),
    expected_round2_assignments: expectedRound2,
    expected_assignments: currentRound3,
    assignments: [...repairedRound3].reverse(),
    frozen_table: 4,
  }), {
    expectedRound1Assignments: expectedRound1,
    expectedRound2Assignments: expectedRound2,
    expectedAssignments: [...currentRound3].sort((a, b) => a.participant_id - b.participant_id),
    assignments: [...repairedRound3].sort((a, b) => a.participant_id - b.participant_id),
    frozenTable: 4,
  })
  assert.throws(() => normalizeEvent3Round3ApplyRequest({
    expected_round1_assignments: expectedRound1,
    expected_round2_assignments: expectedRound2,
    expected_assignments: currentRound3,
    assignments: [...repairedRound3, repairedRound3[0]],
    frozen_table: 4,
  }), /more than once/)
  assert.throws(() => normalizeEvent3Round3ApplyRequest({
    expected_round1_assignments: expectedRound1,
    expected_round2_assignments: expectedRound2,
    expected_assignments: currentRound3,
    assignments: repairedRound3.map((row, index) => index ? row : { ...row, participant_id: 99 }),
    frozen_table: 4,
  }), /exactly the expected/)
  assert.throws(() => normalizeEvent3Round3ApplyRequest({
    expected_round1_assignments: expectedRound1.slice(1),
    expected_round2_assignments: expectedRound2,
    expected_assignments: currentRound3,
    assignments: repairedRound3,
    frozen_table: 4,
  }), /expected_round1_assignments must contain exactly/)
})

test("admin API exposes only the authenticated atomic Round-3 apply boundary", async () => {
  const [api, migration] = await Promise.all([
    readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8"),
    readFile(MIGRATION_URL, "utf8"),
  ])
  const route = api.slice(
    api.indexOf('if (action === "e3-apply-round3-seating")'),
    api.indexOf("// e3-clear-rankings", api.indexOf('if (action === "e3-apply-round3-seating")')),
  )
  assert.match(route, /if \(!hasAdminAccess\) return res\.status\(403\)/)
  assert.match(route, /normalizeEvent3Round3ApplyRequest\(req\.body\)/)
  assert.match(route, /rpc\("apply_event3_round3_seating_plan_v2"/)
  assert.match(route, /p_expected_round1_assignments: request\.expectedRound1Assignments/)
  assert.match(route, /p_expected_round2_assignments: request\.expectedRound2Assignments/)
  assert.match(route, /\.\.\.displayedEvent3Context\.params/)
  assert.match(route, /recordSecurityEvent/)
  assert.match(migration, /security invoker/i)
  assert.match(migration, /global_timer_active[\s\S]*groups_locked/i)
  assert.match(migration, /Round 1 or 2 seating changed after this plan was reviewed/i)
  assert.match(migration, /v_roster_count = 44 and coalesce/i)
  assert.doesNotMatch(migration, /requires exactly 22 female and 22 male roster profiles/i)
  assert.match(migration, /revoke all[\s\S]*from PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /grant execute[\s\S]*to service_role/i)
})

test("atomically applies only Round 3 and fails closed on stale or unsafe plans", async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table event_state (
      match_id uuid primary key,
      phase text,
      current_event_id integer,
      test_mode_active boolean default false,
      test_mode_snapshot jsonb,
      global_timer_active boolean default false,
      groups_locked boolean default false
    );
    create table event3_event_settings (
      match_id uuid not null,
      event_id integer not null,
      event_format text not null,
      primary key (match_id,event_id)
    );
    create table event3_participants (
      match_id uuid not null,
      event_id integer not null,
      participant_number integer not null,
      primary key (match_id,event_id,participant_number)
    );
    create table participants (
      match_id uuid not null,
      assigned_number integer not null,
      gender text,
      primary key (match_id,assigned_number)
    );
    create table session_assignments (
      id bigint generated by default as identity primary key,
      match_id uuid not null,
      event_id integer not null,
      round smallint not null,
      table_number integer not null,
      participant_id integer not null,
      unique (match_id,event_id,round,participant_id)
    );
    create table locked_matches (
      match_id uuid not null,
      event_id integer not null,
      participant1_number integer not null,
      participant2_number integer not null
    );
    create table event3_exclusions (
      match_id uuid not null,
      event_id integer not null,
      participant_a_number integer not null,
      participant_b_number integer not null
    );
  `)
  await db.exec(await readFile(MIGRATION_URL, "utf8"))

  const privileges = await db.query(`select
    has_function_privilege('anon',
      'public.apply_event3_round3_seating_plan_v2(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,integer,boolean,text)',
      'execute') as anon_can_apply,
    has_function_privilege('authenticated',
      'public.apply_event3_round3_seating_plan_v2(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,integer,boolean,text)',
      'execute') as authenticated_can_apply,
    has_function_privilege('service_role',
      'public.apply_event3_round3_seating_plan_v2(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,integer,boolean,text)',
      'execute') as service_can_apply`)
  assert.deepEqual(privileges.rows, [{
    anon_can_apply: false,
    authenticated_can_apply: false,
    service_can_apply: true,
  }])

  await db.query(`insert into event_state(match_id,phase,current_event_id,test_mode_active)
    values ($1,'setup',$2,false)`, [EVENT3_MATCH_ID, EVENT_ID])
  await db.query(`insert into event3_event_settings values ($1,$2,'choice_only_three_groups')`,
    [EVENT3_MATCH_ID, EVENT_ID])
  await db.query(`insert into event3_participants(match_id,event_id,participant_number)
    select $1,$2,n from generate_series(1,8) n`, [EVENT3_MATCH_ID, EVENT_ID])
  await db.query(`insert into session_assignments(match_id,event_id,round,table_number,participant_id)
    select $1,$2,row_data.round,row_data.table_number,row_data.participant_id
    from (values
      (1::smallint,1,1),(1::smallint,1,2),(1::smallint,2,3),(1::smallint,2,4),
      (1::smallint,3,5),(1::smallint,3,6),(1::smallint,4,7),(1::smallint,4,8),
      (2::smallint,1,1),(2::smallint,1,3),(2::smallint,2,2),(2::smallint,2,4),
      (2::smallint,3,5),(2::smallint,3,7),(2::smallint,4,6),(2::smallint,4,8),
      (3::smallint,1,1),(3::smallint,1,2),(3::smallint,2,3),(3::smallint,2,5),
      (3::smallint,3,4),(3::smallint,3,6),(3::smallint,4,7),(3::smallint,4,8)
    ) row_data(round,table_number,participant_id)`, [EVENT3_MATCH_ID, EVENT_ID])

  const historyBefore = (await db.query(`select round,table_number,participant_id
    from session_assignments where round in (1,2) order by round,participant_id`)).rows
  const applied = await applyRound3(db, currentRound3, repairedRound3)
  assert.equal(applied.rows[0].result.success, true)
  assert.equal(applied.rows[0].result.moved_assignments, 3)
  assert.deepEqual(await round3Rows(db), [...repairedRound3].sort((a, b) => a.participant_id - b.participant_id))
  assert.deepEqual((await db.query(`select round,table_number,participant_id
    from session_assignments where round in (1,2) order by round,participant_id`)).rows, historyBefore)

  await expectDbError(
    applyRound3(db, currentRound3, repairedRound3),
    /changed after this plan was reviewed/i,
  )
  assert.deepEqual(await round3Rows(db), [...repairedRound3].sort((a, b) => a.participant_id - b.participant_id))

  await db.query(`update event_state set global_timer_active=true where match_id=$1`, [EVENT3_MATCH_ID])
  await expectDbError(
    applyRound3(db, repairedRound3, repairedRound3),
    /active unlocked setup event/i,
  )
  await db.query(`update event_state set global_timer_active=false,groups_locked=true where match_id=$1`, [EVENT3_MATCH_ID])
  await expectDbError(
    applyRound3(db, repairedRound3, repairedRound3),
    /active unlocked setup event/i,
  )
  await db.query(`update event_state set groups_locked=false where match_id=$1`, [EVENT3_MATCH_ID])

  await db.query(`update session_assignments set table_number=2
    where round=1 and participant_id=1`)
  await expectDbError(
    applyRound3(db, repairedRound3, repairedRound3),
    /Round 1 or 2 seating changed after this plan was reviewed/i,
  )
  await db.query(`update session_assignments set table_number=1
    where round=1 and participant_id=1`)

  const changedFrozen = repairedRound3.map(row => row.participant_id === 1
    ? { ...row, table_number: 4 }
    : row.participant_id === 7 ? { ...row, table_number: 1 } : row)
  await expectDbError(applyRound3(db, repairedRound3, changedFrozen), /changes the frozen table/i)

  const changedCapacity = repairedRound3.map(row => row.participant_id === 3
    ? { ...row, table_number: 2 } : row)
  await expectDbError(applyRound3(db, repairedRound3, changedCapacity), /changes table capacities/i)

  await expectDbError(applyRound3(db, repairedRound3, currentRound3), /repeats an earlier encounter/i)

  await db.query(`insert into event3_exclusions values ($1,$2,1,4)`, [EVENT3_MATCH_ID, EVENT_ID])
  await expectDbError(applyRound3(db, repairedRound3, repairedRound3), /protected or excluded pair/i)
  await db.query(`delete from event3_exclusions`)

  await db.query(`insert into locked_matches values ($1,$2,2,5)`, [STATIC_MATCH_ID, EVENT_ID])
  await expectDbError(applyRound3(db, repairedRound3, repairedRound3), /protected or excluded pair/i)
  await db.query(`delete from locked_matches`)

  await db.query(`delete from session_assignments where round=2 and participant_id=8`)
  await expectDbError(applyRound3(db, repairedRound3, repairedRound3), /complete active roster/i)
  assert.deepEqual(await round3Rows(db), [...repairedRound3].sort((a, b) => a.participant_id - b.participant_id))
})
