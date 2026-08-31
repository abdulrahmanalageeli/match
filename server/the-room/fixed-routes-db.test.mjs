import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"

const migrations = [
  "20260822122616_create_the_room_event_system.sql",
  "20260822122850_harden_the_room_access_and_indexes.sql",
  "20260824004240_persist_the_room_active_round.sql",
  "20260824130627_make_the_room_walk_ins_concurrency_safe.sql",
  "20260831123042_the_room_atomic_setup.sql",
  "20260831124115_the_room_round_timer.sql",
  "20260831131002_the_room_fixed_routes.sql",
]
const migrationSql = Promise.all(migrations.map(name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8")))

async function fixture(t, tableCount = 2, roundCount = 3) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec("create role anon; create role authenticated; create role service_role;")
  for (const sql of await migrationSql) await db.exec(sql)
  const event = (await db.query("select create_fixed_the_room_event(1,$1,$2) as event", [tableCount, roundCount])).rows[0].event
  const snapshot = async () => ({
    event: (await db.query("select to_jsonb(e) as value from the_room_events e where id=$1", [event.id])).rows[0]?.value,
    attendees: (await db.query("select to_jsonb(a) as value from the_room_attendees a where event_id=$1 order by attendee_number", [event.id])).rows.map(row => row.value),
    runs: (await db.query("select to_jsonb(r) as value from the_room_schedule_runs r where event_id=$1 order by id", [event.id])).rows.map(row => row.value),
    seats: (await db.query("select to_jsonb(s) as value from the_room_seats s where event_id=$1 order by round_number,table_number,seat_number", [event.id])).rows.map(row => row.value),
  })
  const arrive = async (gender, rows, options = {}) => {
    const current = (await snapshot()).event
    const id = options.id || rows[0]?.attendee_id || randomUUID()
    const result = await db.query("select commit_the_room_fixed_arrival($1,$2,$3,$4,$5,$6::jsonb,$7) as value", [
      event.id, id, gender, options.revision ?? current.route_revision, options.round ?? current.active_round,
      JSON.stringify(rows), options.repeatPairCount ?? 0,
    ])
    return result.rows[0].value
  }
  return { db, event, snapshot, arrive }
}

function route(id, tables, seat = 1, firstRound = 1) {
  return tables.map((table, index) => ({ attendee_id: id, round_number: firstRound + index, table_number: table, seat_number: seat }))
}
const code = expected => error => error.code === expected

test("fixed-route events start empty, with an active schedule and a 30-minute timer", async t => {
  const f = await fixture(t)
  const initial = await f.snapshot()
  assert.equal(initial.event.seating_mode, "fixed_routes")
  assert.equal(initial.event.minimum_attendees, 0)
  assert.equal(initial.event.route_revision, 0)
  assert.equal(initial.event.status, "ready")
  assert.equal(initial.event.timer_remaining_seconds, 1800)
  assert.equal(initial.runs.length, 1)
  assert.equal(initial.runs[0].is_active, true)
  assert.equal(initial.runs[0].participant_count, 0)
  assert.equal(initial.attendees.length, 0)
  assert.equal(initial.seats.length, 0)
  await f.db.query("select control_the_room_timer($1,1,0,'start')", [f.event.id])
  assert.ok((await f.snapshot()).event.timer_ends_at)
  const legacy = (await f.db.query("insert into the_room_events(event_number) values(2) returning seating_mode, minimum_attendees")).rows[0]
  assert.deepEqual(legacy, { seating_mode: "planned", minimum_attendees: 20 })
})

test("empty fixed events can change dimensions atomically, including with a waiting guest", async t => {
  const f = await fixture(t)
  const waiting = await f.arrive("female", [])
  await f.db.query("select configure_the_room_fixed_event($1,4,5,1)", [f.event.id])
  const changed = await f.snapshot()
  assert.equal(changed.event.table_count, 4)
  assert.equal(changed.event.round_count, 5)
  assert.equal(changed.event.route_revision, 2)
  assert.equal(changed.runs[0].table_count, 4)
  assert.equal(changed.runs[0].round_count, 5)
  assert.equal(changed.attendees[0].id, waiting.attendee.id)
  await assert.rejects(f.db.query("select configure_the_room_fixed_event($1,1,1,1)", [f.event.id]), code("40001"))
  assert.deepEqual(await f.snapshot(), changed)
  await assert.rejects(f.db.query("select configure_the_room_fixed_event($1,0,1,2)", [f.event.id]), code("22023"))
  assert.deepEqual(await f.snapshot(), changed)
})

test("arrivals append complete routes without moving issued seats or resetting the running timer", async t => {
  const f = await fixture(t)
  const firstId = randomUUID(), secondId = randomUUID(), lateId = randomUUID()
  await f.arrive("male", route(firstId, [1, 2, 1]))
  await f.db.query("select control_the_room_timer($1,1,0,'start')", [f.event.id])
  const issued = await f.snapshot()
  await f.arrive("female", route(secondId, [1, 1, 2], 2))
  const extended = await f.snapshot()
  assert.deepEqual(extended.seats.filter(row => row.attendee_id === firstId), issued.seats)
  assert.equal(extended.runs[0].id, issued.runs[0].id)
  assert.equal(extended.runs[0].participant_count, 2)
  assert.equal(extended.event.timer_ends_at, issued.event.timer_ends_at)
  assert.equal(extended.event.timer_revision, issued.event.timer_revision)
  assert.equal(extended.event.active_round, 1)
  await f.db.query("update the_room_events set active_round=2 where id=$1", [f.event.id])
  await f.arrive("male", route(lateId, [1, 2], 3, 2))
  const late = await f.snapshot()
  assert.equal(late.event.active_round, 2)
  assert.equal(late.event.timer_remaining_seconds, 1800)
  assert.equal(late.seats.filter(row => row.attendee_id === lateId).length, 2)
  assert.equal(late.seats.some(row => row.attendee_id === lateId && row.round_number === 1), false)
})

test("stable arrival identities are idempotent and stale route or round writes roll back", async t => {
  const f = await fixture(t)
  const id = randomUUID(), rows = route(id, [1, 1, 1])
  const first = await f.arrive("male", rows, { revision: 0 })
  const saved = await f.snapshot()
  const retry = await f.arrive("male", rows, { revision: 0, round: 1 })
  assert.equal(retry.idempotent, true)
  assert.equal(retry.attendee.id, first.attendee.id)
  assert.deepEqual(await f.snapshot(), saved)
  await assert.rejects(f.arrive("female", rows, { id }), code("22023"))
  await assert.rejects(f.arrive("female", route(randomUUID(), [2, 2, 2]), { revision: 0 }), code("40001"))
  assert.deepEqual(await f.snapshot(), saved)
  await f.db.query("update the_room_events set active_round=2 where id=$1", [f.event.id])
  const advanced = await f.snapshot()
  await assert.rejects(f.arrive("female", route(randomUUID(), [2, 2, 2]), { round: 1 }), code("40001"))
  assert.deepEqual(await f.snapshot(), advanced)
  assert.equal((await f.arrive("male", rows, { revision: 0, round: 1 })).idempotent, true)
})

test("capacity is validated in every remaining round and a failure leaves no partial guest or route", async t => {
  const f = await fixture(t)
  await f.arrive("male", route(randomUUID(), [1, 1, 1]))
  await f.arrive("male", route(randomUUID(), [2, 1, 2], 2))
  const before = await f.snapshot()
  await assert.rejects(f.arrive("male", route(randomUUID(), [2, 1, 2], 3)), code("22023"))
  assert.deepEqual(await f.snapshot(), before)
  const female = await f.arrive("female", route(randomUUID(), [1, 1, 1], 3))
  assert.equal(female.status, "confirmed")
  await f.arrive("female", route(randomUUID(), [1, 1, 1], 4))
  const full = await f.snapshot()
  await assert.rejects(f.arrive("female", route(randomUUID(), [1, 1, 1], 2)), code("22023"))
  assert.deepEqual(await f.snapshot(), full)
  const waiting = await f.arrive("male", [])
  assert.equal(waiting.status, "waitlist")
  assert.equal(waiting.attendee.checked_in, true)
  assert.equal(waiting.attendee.included_in_schedule, false)
  assert.equal((await f.snapshot()).runs[0].participant_count, 4)
})

test("waiting guests promote with the same number and only receive remaining-round assignments", async t => {
  const f = await fixture(t)
  const waiting = await f.arrive("female", [])
  await f.db.query("update the_room_events set active_round=2 where id=$1", [f.event.id])
  const promoted = await f.arrive("female", route(waiting.attendee.id, [1, 2], 1, 2))
  assert.equal(promoted.attendee.id, waiting.attendee.id)
  assert.equal(promoted.attendee.attendee_number, waiting.attendee.attendee_number)
  assert.equal(promoted.status, "confirmed")
  const saved = await f.snapshot()
  assert.equal(saved.attendees.length, 1)
  assert.deepEqual(saved.seats.map(row => row.round_number), [2, 3])
})

test("invalid routes, legacy walk-ins, and attempts to change issued routes are rejected", async t => {
  const f = await fixture(t)
  const id = randomUUID(), rows = route(id, [1, 2, 1])
  for (const invalid of [rows.slice(1), [...rows.slice(0, 2), rows[1]], route(id, [1, 3, 1]), route(id, [1, 1, 1], 5), route(randomUUID(), [1, 1, 1])]) {
    await assert.rejects(f.arrive("male", invalid, { id }), code("22023"))
  }
  await assert.rejects(f.db.query("select create_the_room_walk_in($1,'male')", [f.event.id]), code("22023"))
  assert.equal((await f.snapshot()).attendees.length, 0)
  await f.arrive("male", rows)
  const issued = await f.snapshot()
  const statements = [
    ["update the_room_seats set table_number=2 where event_id=$1 and round_number=1", [f.event.id]],
    ["delete from the_room_seats where event_id=$1", [f.event.id]],
    ["update the_room_schedule_runs set is_active=false where event_id=$1", [f.event.id]],
    ["delete from the_room_schedule_runs where event_id=$1", [f.event.id]],
    ["update the_room_events set table_count=3 where id=$1", [f.event.id]],
    ["update the_room_events set round_count=4 where id=$1", [f.event.id]],
    ["update the_room_events set seating_mode='planned' where id=$1", [f.event.id]],
    ["update the_room_events set status='draft' where id=$1", [f.event.id]],
    ["update the_room_attendees set gender='female' where id=$1", [id]],
    ["update the_room_attendees set included_in_schedule=false where id=$1", [id]],
    ["update the_room_attendees set checked_in=false where id=$1", [id]],
    ["select configure_the_room_fixed_event($1,3,3,1)", [f.event.id]],
  ]
  for (const [sql, args] of statements) {
    await assert.rejects(f.db.query(sql, args), code("55000"))
    assert.deepEqual(await f.snapshot(), issued)
  }
  await f.db.query("select record_the_room_payment($1,$2,'paid',50)", [f.event.id, id])
  assert.equal((await f.snapshot()).attendees[0].payment_status, "paid")
})

test("repeat metrics describe actual shared tables and ignore supplied repeat counts", async t => {
  const f = await fixture(t)
  await f.arrive("male", route(randomUUID(), [1, 1, 1]))
  const added = await f.arrive("female", route(randomUUID(), [1, 1, 1], 2), { repeatPairCount: 0 })
  assert.equal(added.repeat_pair_count, 2)
  const saved = await f.snapshot()
  assert.equal(saved.runs[0].metrics.repeatPairCount, 2)
  assert.equal(saved.runs[0].metrics.uniquePairCount, 1)
})

test("explicit event deletion still removes the fixed schedule and its protected child rows", async t => {
  const f = await fixture(t)
  await f.arrive("male", route(randomUUID(), [1, 2, 1]))
  await f.db.query("delete from the_room_events where id=$1", [f.event.id])
  assert.deepEqual(await f.snapshot(), { event: undefined, attendees: [], runs: [], seats: [] })
})

test("fixed-route functions are available only to the server service role", async t => {
  const f = await fixture(t)
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`)
    await assert.rejects(f.db.query("select create_fixed_the_room_event(2,2,3)"), code("42501"))
    await assert.rejects(f.db.query("select configure_the_room_fixed_event($1,2,3,0)", [f.event.id]), code("42501"))
    await assert.rejects(f.db.query("select commit_the_room_fixed_arrival($1,$2,'male',0,1,'[]'::jsonb)", [f.event.id, randomUUID()]), code("42501"))
    await f.db.exec("reset role")
  }
  await f.db.exec("set role service_role")
  const created = await f.db.query("select create_fixed_the_room_event(2,2,3) as event")
  assert.equal(created.rows[0].event.minimum_attendees, 0)
  await f.arrive("female", route(randomUUID(), [1, 2, 1]))
  await f.db.exec("reset role")
})
