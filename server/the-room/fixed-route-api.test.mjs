import assert from "node:assert/strict"
import test from "node:test"
import { readFile, readdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { localClient } from "./test-client.mjs"
import { createTestApi } from "./test-api.mjs"

async function fixture(t, dimensions = {}) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec("create role anon; create role authenticated; create role service_role;")
  const directory = new URL("../../supabase/migrations/", import.meta.url)
  const migrations = (await readdir(directory)).filter(name => name.includes("the_room") && name.endsWith(".sql")).sort()
  for (const name of migrations) await db.exec(await readFile(new URL(name, directory), "utf8"))
  const client = localClient(db)
  const api = await createTestApi(client)
  const created = await api("create-event", { event_number: 1, table_count: 5, round_count: 3, ...dimensions })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const eventId = created.body.event.id
  const request = (action, body = {}) => api(action, { event_id: eventId, ...body })
  const add = (gender, request_id = randomUUID()) => request("add-attendee", { gender, request_id })
  const bundle = async () => (await request("get-event")).body
  return { db, client, api, request, add, bundle, initial: created.body, eventId }
}

test("new events start empty, accept a timer and round advance before any guests", async t => {
  const f = await fixture(t)
  assert.equal(f.initial.event.seating_mode, "fixed_routes")
  assert.equal(f.initial.event.minimum_attendees, 0)
  assert.equal(f.initial.event.timer_duration_seconds, 1800)
  assert.equal(f.initial.attendees.length, 0)
  assert.equal(f.initial.schedule.participant_count, 0)
  assert.equal(f.initial.seats.length, 0)
  const started = await f.request("control-timer", { command: "start", expected_active_round: 1, expected_timer_revision: 0 })
  assert.equal(started.status, 200)
  assert.ok(started.body.event.timer_ends_at)
  const advanced = await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  assert.equal(advanced.status, 200)
  const arrival = await f.add("male")
  assert.equal(arrival.status, 200)
  assert.deepEqual(Array.from(arrival.body.placement_tables, row => row.roundNumber), [2, 3])
  assert.equal(arrival.body.event.active_round, 2)
  assert.equal(arrival.body.event.timer_remaining_seconds, 1800)
})

test("arrivals follow the requested table sequence and never change photographed routes or timer", async t => {
  const f = await fixture(t)
  const running = await f.request("control-timer", { command: "start", expected_active_round: 1, expected_timer_revision: 0 })
  const genders = ["male", "male", "male", "female", "male", "male", "female"]
  const expectedTables = [1, 1, 2, 1, 2, 3, 2]
  let issued = []
  for (let i = 0; i < genders.length; i++) {
    const arrival = await f.add(genders[i])
    assert.equal(arrival.status, 200, JSON.stringify(arrival.body))
    assert.equal(arrival.body.waitlisted, false)
    assert.equal(arrival.body.placement_tables[0].tableNumber, expectedTables[i])
    assert.equal(arrival.body.placement_tables.length, 3)
    for (const row of issued) assert.deepEqual(arrival.body.seats.find(seat => seat.id === row.id), row)
    issued = arrival.body.seats
    assert.equal(arrival.body.event.timer_ends_at, running.body.event.timer_ends_at)
    assert.equal(arrival.body.event.timer_revision, running.body.event.timer_revision)
  }
})

test("full gender capacity saves a waiting guest without a partial route; request retry is idempotent", async t => {
  const f = await fixture(t, { table_count: 1 })
  assert.equal((await f.add("male")).body.waitlisted, false)
  assert.equal((await f.add("male")).body.waitlisted, false)
  const token = randomUUID()
  const waiting = await f.add("male", token)
  assert.equal(waiting.status, 200)
  assert.equal(waiting.body.waitlisted, true)
  assert.equal(waiting.body.placement_tables.length, 0)
  const guest = waiting.body.attendees.find(person => person.id === token)
  assert.equal(guest.attendance_status, "waitlist")
  assert.equal(guest.checked_in, true)
  assert.equal(guest.included_in_schedule, false)
  const repeated = await f.add("male", token)
  assert.equal(repeated.status, 200)
  assert.equal(repeated.body.added_attendee_number, waiting.body.added_attendee_number)
  assert.equal(repeated.body.attendees.length, 3)
  const retrySeat = await f.request("seat-waiting-attendee", { attendee_id: token })
  assert.equal(retrySeat.status, 200)
  assert.equal(retrySeat.body.waitlisted, true)
  assert.equal(retrySeat.body.attendees.length, 3)
  assert.equal((await f.add("female")).body.waitlisted, false)
  assert.equal((await f.add("female")).body.waitlisted, false)
  assert.equal((await f.add("female")).body.waitlisted, true)
  const final = await f.bundle()
  for (let round = 1; round <= 3; round++) assert.equal(final.seats.filter(seat => seat.round_number === round).length, 4)
})

test("concurrent reception check-ins retry instead of exceeding gender capacity", async t => {
  const f = await fixture(t, { table_count: 1 })
  await f.add("male")
  const originalRpc = f.client.rpc.bind(f.client)
  let injected = false
  let other
  f.client.rpc = async (name, args) => {
    if (name === "commit_the_room_fixed_arrival" && !injected) {
      injected = true
      other = await f.add("male")
      assert.equal(other.status, 200)
    }
    return originalRpc(name, args)
  }
  const arrival = await f.add("male")
  assert.equal(arrival.status, 200)
  assert.equal(other.body.waitlisted, false)
  assert.equal(arrival.body.waitlisted, true)
  const final = await f.bundle()
  assert.equal(final.attendees.length, 3)
  assert.equal(final.schedule.participant_count, 2)
  assert.equal(final.seats.length, 6)
})

test("a round advancing during check-in produces only a route for remaining rounds", async t => {
  const f = await fixture(t)
  const originalRpc = f.client.rpc.bind(f.client)
  let injected = false
  f.client.rpc = async (name, args) => {
    if (name === "commit_the_room_fixed_arrival" && !injected) {
      injected = true
      assert.equal((await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })).status, 200)
    }
    return originalRpc(name, args)
  }
  const arrival = await f.add("female")
  assert.equal(arrival.status, 200)
  assert.deepEqual(Array.from(arrival.body.placement_tables, row => row.roundNumber), [2, 3])
  assert.equal(arrival.body.attendees.length, 1)
})

test("issued routes cannot be moved, regenerated, reset or changed by legacy actions", async t => {
  const f = await fixture(t)
  const arrival = await f.add("female")
  const before = await f.bundle()
  for (const action of ["move-attendee", "reset-event", "reset-check-ins", "set-attendee-check-in", "set-attendee-gender", "check-in-next"]) {
    const result = await f.request(action, { attendee_id: arrival.body.added_attendee_id, gender: "male", checked_in: false, round_number: 1, table_number: 2 })
    assert.equal(result.status, 409, action)
    assert.equal(result.body.code, "FIXED_ROUTES_LOCKED")
  }
  const regenerated = await f.request("generate-schedule")
  assert.equal(regenerated.status, 200)
  assert.deepEqual(regenerated.body.seats, before.seats)
  const resized = await f.request("update-event", { table_count: 6, round_count: 3, expected_route_revision: before.event.route_revision })
  assert.equal(resized.status, 409)
  assert.deepEqual((await f.bundle()).seats, before.seats)
})

test("empty event dimensions can change atomically, without creating placeholder attendees", async t => {
  const f = await fixture(t)
  const changed = await f.request("update-event", { table_count: 3, round_count: 4, minimum_attendees: 20, expected_route_revision: 0 })
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal(changed.body.event.table_count, 3)
  assert.equal(changed.body.event.round_count, 4)
  assert.equal(changed.body.schedule.table_count, 3)
  assert.equal(changed.body.schedule.round_count, 4)
  assert.equal(changed.body.attendees.length, 0)
  const stale = await f.request("update-event", { table_count: 4, round_count: 4, expected_route_revision: 0 })
  assert.equal(stale.status, 409)
  const arrival = await f.add("male")
  assert.equal(arrival.body.placement_tables.length, 4)
})

test("arrival request identity is validated and authenticated before any writes", async t => {
  const f = await fixture(t)
  const beforeWrites = f.client.writes.length
  assert.equal((await f.request("add-attendee", { gender: "male" })).body.code, "INVALID_REQUEST_ID")
  assert.equal(f.client.writes.length, beforeWrites)
  const token = randomUUID()
  const first = await f.add("female", token)
  assert.equal(first.status, 200)
  assert.equal((await f.add("male", token)).body.code, "REQUEST_ID_CONFLICT")
  assert.equal((await f.add("female", token)).body.attendees.length, 1)
  const unauthenticated = await createTestApi(f.client, { authenticated: false })
  assert.equal((await unauthenticated("add-attendee", { event_id: f.eventId, gender: "male", request_id: randomUUID() })).status, 401)
  assert.equal((await f.bundle()).attendees.length, 1)
})

test("repeat fallback admits four guests for twenty rounds without confirmation and waits only at capacity", async t => {
  const f = await fixture(t, { table_count: 1, round_count: 20 })
  const genders = ["male", "female", "male", "female"]
  let issued = []
  for (const [index, gender] of genders.entries()) {
    // A normal arrival request must succeed even when every remaining meeting
    // repeats. There is no force flag or second confirmation request.
    const arrival = await f.add(gender)
    assert.equal(arrival.status, 200, JSON.stringify(arrival.body))
    assert.equal(arrival.body.waitlisted, false)
    assert.equal(arrival.body.repeat_pair_count, index * 19)
    assert.deepEqual(Array.from(arrival.body.placement_tables, row => row.roundNumber), Array.from({ length: 20 }, (_, round) => round + 1))
    assert.ok(arrival.body.placement_tables.every(row => row.tableNumber === 1))
    const guest = arrival.body.attendees.find(person => person.id === arrival.body.added_attendee_id)
    assert.equal(guest.attendance_status, "confirmed")
    assert.equal(guest.included_in_schedule, true)
    assert.equal(guest.checked_in, true)
    for (const row of issued) assert.deepEqual(arrival.body.seats.find(seat => seat.id === row.id), row)
    issued = arrival.body.seats
  }
  assert.equal(issued.length, 80)
  const full = await f.bundle()
  assert.equal(full.schedule.participant_count, 4)
  assert.equal(full.schedule.metrics.repeatPairCount, 114)
  for (let round = 1; round <= 20; round++) assert.equal(issued.filter(seat => seat.round_number === round).length, 4)

  const fifth = await f.add("male")
  assert.equal(fifth.status, 200)
  assert.equal(fifth.body.waitlisted, true)
  assert.equal(fifth.body.placement_tables.length, 0)
  assert.equal(fifth.body.attendees.length, 5)
  assert.equal(fifth.body.schedule.participant_count, 4)
  assert.equal(fifth.body.schedule.metrics.repeatPairCount, 114)
  assert.deepEqual(fifth.body.seats, issued)
})

test("a late arrival with unavoidable repeats is admitted without inventing past seating", async t => {
  const f = await fixture(t, { table_count: 1, round_count: 3 })
  const first = await f.add("male")
  assert.equal(first.status, 200)
  const advanced = await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  assert.equal(advanced.status, 200)

  const late = await f.add("female")
  assert.equal(late.status, 200, JSON.stringify(late.body))
  assert.equal(late.body.waitlisted, false)
  assert.equal(late.body.repeat_pair_count, 1)
  assert.deepEqual(Array.from(late.body.placement_tables, row => row.roundNumber), [2, 3])
  assert.ok(late.body.placement_tables.every(row => row.tableNumber === 1))
  const lateSeats = late.body.seats.filter(seat => seat.attendee_id === late.body.added_attendee_id)
  assert.equal(lateSeats.length, 2)
  assert.ok(lateSeats.every(seat => seat.round_number >= 2))
  for (const row of first.body.seats) assert.deepEqual(late.body.seats.find(seat => seat.id === row.id), row)
  assert.equal(late.body.seats.filter(seat => seat.round_number === 1).length, 1)
  assert.equal(late.body.schedule.metrics.repeatPairCount, 1)
})

test("an arrival between roster and seat reads reloads a coherent bundle before planning", async t => {
  const f = await fixture(t)
  const originalFrom = f.client.from.bind(f.client)
  let injected = false
  f.client.from = table => {
    const query = originalFrom(table)
    if (table === "the_room_seats") {
      const originalThen = query.then.bind(query)
      query.then = async resolve => {
        if (!injected) {
          injected = true
          assert.equal((await f.add("male")).status, 200)
        }
        return originalThen(resolve)
      }
    }
    return query
  }
  const arrival = await f.add("female")
  assert.equal(arrival.status, 200)
  assert.equal(arrival.body.attendees.length, 2)
  assert.equal(arrival.body.seats.length, 6)
  assert.equal(arrival.body.placement_tables.length, 3)
})

test("large fixed events load every route page rather than truncating at the API row limit", async t => {
  const f = await fixture(t, { table_count: 20, round_count: 20 })
  await f.db.exec("begin")
  await f.db.query(`insert into the_room_attendees(event_id,attendee_number,full_name,gender,attendance_status,checked_in)
    select $1,n,'Guest '||n,case when n%2=0 then 'male' else 'female' end,'confirmed',true from generate_series(1,52)n`, [f.eventId])
  await f.db.query(`insert into the_room_seats(event_id,schedule_run_id,attendee_id,round_number,table_number,seat_number)
    select a.event_id,r.id,a.id,n,(a.attendee_number-1)/4+1,(a.attendee_number-1)%4+1
    from the_room_attendees a join the_room_schedule_runs r on r.event_id=a.event_id
    cross join generate_series(1,20)n where a.event_id=$1`, [f.eventId])
  await f.db.query("update the_room_schedule_runs set participant_count=52 where event_id=$1", [f.eventId])
  await f.db.query("update the_room_events set route_revision=route_revision+1 where id=$1", [f.eventId])
  await f.db.exec("commit")
  const before = await f.bundle()
  assert.equal(before.seats.length, 1040)
  assert.equal(before.seats.filter(seat => seat.round_number === 20).length, 52)
  const arrival = await f.add("female")
  assert.equal(arrival.status, 200, JSON.stringify(arrival.body))
  assert.equal(arrival.body.seats.length, 1060)
  assert.equal(arrival.body.placement_tables.length, 20)
  for (const row of before.seats) assert.deepEqual(arrival.body.seats.find(seat => seat.id === row.id), row)
})

test("explicitly deleting a populated fixed event atomically removes only that event", async t => {
  const f = await fixture(t)
  await f.add("male")
  await f.add("female")
  const other = await f.api("create-event", { event_number: 2 })
  assert.equal(other.status, 201)
  const deleted = await f.request("delete-event")
  assert.equal(deleted.status, 200)
  assert.equal((await f.request("get-event")).status, 404)
  for (const table of ["the_room_attendees", "the_room_seats", "the_room_schedule_runs"]) {
    assert.equal((await f.db.query(`select count(*)::int n from ${table} where event_id=$1`, [f.eventId])).rows[0].n, 0)
  }
  assert.equal((await f.api("get-event", { event_id: other.body.event.id })).status, 200)
})
