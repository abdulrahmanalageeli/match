import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import { PGlite } from "@electric-sql/pglite"
import ts from "typescript"
import * as scheduler from "./scheduler.mjs"
import * as incremental from "./incremental-scheduler.mjs"
import * as moves from "./manual-move.mjs"
import * as live from "./live-state.mjs"
import * as badges from "./badge-claim.mjs"
import * as roster from "./numbered-roster.mjs"
import * as setup from "./setup.mjs"
import * as fixed from "../../app/lib/the-room-fixed-routes.mjs"
import { roomTimerRemaining, formatRoomTimer } from "../../app/lib/the-room-timer.mjs"

const migrations = [
  "20260822122616_create_the_room_event_system.sql",
  "20260822122850_harden_the_room_access_and_indexes.sql",
  "20260824004240_persist_the_room_active_round.sql",
  "20260824130627_make_the_room_walk_ins_concurrency_safe.sql",
  "20260831123042_the_room_atomic_setup.sql",
  "20260831124115_the_room_round_timer.sql",
  "20260831131002_the_room_fixed_routes.sql",
]

const identifier = name => {
  assert.match(name, /^[a-z_]+$/)
  return `"${name}"`
}

// Exercise the actual API handler and actual PostgreSQL functions locally.
// Only the PostgREST transport and signed-session boundary are substituted.
function localClient(db) {
  const writes = []
  const client = {
    writes,
    async rpc(name, args) {
      writes.push(name)
      try {
        const entries = Object.entries(args)
        const values = entries.map(([, value]) => value !== null && typeof value === "object" ? JSON.stringify(value) : value)
        const result = await db.query(`select ${identifier(name)}(${entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(",")}) as value`, values)
        return { data: result.rows[0].value, error: null }
      } catch (error) { return { data: null, error } }
    },
    from(table) {
      let fields = "*", operation = "select", payload, single = false
      const filters = [], orders = []
      const query = {
        select(value) { fields = value; return query },
        eq(key, value) { filters.push([key, [value]]); return query },
        in(key, values) { filters.push([key, values]); return query },
        order(key, options = {}) { orders.push(`${identifier(key)} ${options.ascending === false ? "desc" : "asc"}`); return query },
        update(value) { operation = "update"; payload = value; return query },
        insert(value) { operation = "insert"; payload = value; return query },
        delete() { operation = "delete"; return query },
        maybeSingle() { single = true; return query },
        single() { single = true; return query },
        async then(resolve) {
          try {
            const values = []
            const param = value => { values.push(value); return `$${values.length}` }
            const selected = fields === "*" ? "*" : fields.split(",").map(identifier).join(",")
            let sql
            if (operation === "select") sql = `select ${selected} from ${identifier(table)}`
            if (operation === "update") sql = `update ${identifier(table)} set ${Object.entries(payload).map(([key, value]) => `${identifier(key)}=${param(value)}`).join(",")}`
            if (operation === "delete") sql = `delete from ${identifier(table)}`
            if (operation === "insert") {
              const rows = Array.isArray(payload) ? payload : [payload]
              const keys = Object.keys(rows[0])
              sql = `insert into ${identifier(table)} (${keys.map(identifier)}) values ${rows.map(row => `(${keys.map(key => param(row[key])).join(",")})`).join(",")}`
            }
            if (filters.length) sql += " where " + filters.map(([key, items]) => `${identifier(key)} in (${items.map(param).join(",")})`).join(" and ")
            if (operation === "select" && orders.length) sql += " order by " + orders.join(",")
            if (operation !== "select") { writes.push(`${operation}:${table}`); sql += ` returning ${selected}` }
            // JSON preserves PostgreSQL timestamp precision for optimistic checks.
            const result = await db.query(operation === "select"
              ? `select to_jsonb(result) as value from (${sql}) result`
              : `with result as (${sql}) select to_jsonb(result) as value from result`, values)
            const rows = result.rows.map(row => row.value)
            return resolve({ data: single ? rows[0] || null : rows, error: null })
          } catch (error) { return resolve({ data: null, error }) }
        },
      }
      return query
    },
  }
  return client
}

async function fixture(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec("create role anon; create role authenticated; create role service_role;")
  for (const name of migrations) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"))
  const event = (await db.query("insert into the_room_events(event_number,minimum_attendees,table_count,round_count) values(1,20,5,3) returning id")).rows[0]
  await db.query("insert into the_room_attendees(event_id,attendee_number,full_name,gender,attendance_status) select $1,n,'Guest '||n,case when n%2=0 then 'male' else 'female' end,'confirmed' from generate_series(1,20) n", [event.id])
  const client = localClient(db)
  const source = (await readFile(new URL("../../api/the-room.mjs", import.meta.url), "utf8"))
    .replace(/import[\s\S]*?from "[^"]+"\r?\n/g, "")
    .replace("export default async function handler", "async function handler")
  const handler = runInNewContext(source + "\nhandler", {
    ...scheduler, ...incremental, ...moves, ...live, ...badges, ...roster, ...setup, ...fixed,
    supabaseAdmin: client, hasTheRoomSession: () => true, enforceTheRoomRateLimit: () => true, console,
  })
  const request = async (action, payload = {}) => {
    const response = { setHeader() {}, status(status) { this.statusCode = status; return this }, json(body) { this.body = body; return this } }
    await handler({ method: "POST", body: { action, event_id: event.id, ...payload } }, response)
    return { status: response.statusCode, body: response.body }
  }
  assert.equal((await request("generate-schedule")).status, 200)
  client.writes.length = 0
  return { db, client, request, eventId: event.id, bundle: async () => {
    const { server_now, ...bundle } = (await request("get-event")).body
    return bundle
  } }
}

const settings = (bundle, overrides = {}) => ({
  minimum_attendees: bundle.event.minimum_attendees,
  table_count: bundle.event.table_count,
  round_count: bundle.event.round_count,
  ...overrides,
})

const timerRequest = (f, state, command, duration_seconds) => f.request("control-timer", {
  command, duration_seconds, expected_active_round: state.event.active_round,
  expected_timer_revision: state.event.timer_revision,
})

test("countdown uses the saved deadline, survives missed ticks, and never becomes negative", () => {
  const deadline = "2026-08-31T12:10:00.000Z"
  const running = { timer_ends_at: deadline, timer_remaining_seconds: 600 }
  assert.equal(roomTimerRemaining(running, Date.parse(deadline) - 90500), 91)
  assert.equal(roomTimerRemaining(running, Date.parse(deadline) - 500), 1)
  assert.equal(roomTimerRemaining(running, Date.parse(deadline) + 90000), 0)
  assert.equal(roomTimerRemaining({ timer_ends_at: null, timer_remaining_seconds: 91 }, Date.parse(deadline) + 90000), 91)
  assert.equal(formatRoomTimer(91), "01:31")
  assert.equal(formatRoomTimer(7200), "120:00")
  assert.equal(formatRoomTimer(-1), "00:00")
})

test("round timer is shared across reads and supports duration, pause, resume and reset", async t => {
  const f = await fixture(t)
  const initial = await f.bundle()
  assert.equal(initial.event.timer_duration_seconds, 1800)
  const configured = await timerRequest(f, initial, "set-duration", 120)
  assert.equal(configured.status, 200)
  const started = await timerRequest(f, configured.body, "start")
  assert.equal(started.status, 200)
  assert.ok(started.body.server_now)
  assert.ok(roomTimerRemaining(started.body.event) >= 119)
  assert.equal((await f.bundle()).event.timer_ends_at, started.body.event.timer_ends_at)
  // Advance time without sleeping or depending on machine speed.
  await f.db.query("update the_room_events set timer_ends_at=clock_timestamp()+interval '40 seconds' where id=$1", [f.eventId])
  const paused = await timerRequest(f, started.body, "pause")
  assert.equal(paused.status, 200)
  assert.equal(paused.body.event.timer_ends_at, null)
  assert.ok(paused.body.event.timer_remaining_seconds >= 39 && paused.body.event.timer_remaining_seconds <= 40)
  const resumed = await timerRequest(f, paused.body, "start")
  assert.equal(resumed.status, 200)
  assert.ok(roomTimerRemaining(resumed.body.event) <= 40)
  const reset = await timerRequest(f, resumed.body, "reset")
  assert.equal(reset.status, 200)
  assert.equal(reset.body.event.timer_ends_at, null)
  assert.equal(reset.body.event.timer_remaining_seconds, 120)
})

test("stale timer commands cannot overwrite another organizer or affect the next round", async t => {
  const f = await fixture(t)
  const initial = await f.bundle()
  const started = await timerRequest(f, initial, "start")
  assert.equal((await timerRequest(f, initial, "reset")).status, 409)
  assert.equal((await f.bundle()).event.timer_ends_at, started.body.event.timer_ends_at)
  const advanced = await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  assert.equal(advanced.body.event.timer_ends_at, null)
  assert.equal(advanced.body.event.timer_remaining_seconds, 1800)
  assert.equal((await timerRequest(f, started.body, "pause")).status, 409)
  assert.equal((await timerRequest(f, advanced.body, "start")).status, 200)
})

test("expiry stops at zero without advancing rounds; reset is required to start again", async t => {
  const f = await fixture(t)
  const started = await timerRequest(f, await f.bundle(), "start")
  await f.db.query("update the_room_events set timer_ends_at=clock_timestamp()-interval '10 seconds' where id=$1", [f.eventId])
  const expired = await f.bundle()
  assert.equal(roomTimerRemaining(expired.event), 0)
  assert.equal(expired.event.active_round, 1)
  assert.equal((await timerRequest(f, started.body, "start")).status, 422)
  const paused = await timerRequest(f, expired, "pause")
  assert.equal(paused.body.event.timer_remaining_seconds, 0)
  const reset = await timerRequest(f, paused.body, "reset")
  assert.equal(reset.body.event.timer_remaining_seconds, 1800)
})

test("seating changes preserve the timer while full regeneration resets it even in round one", async t => {
  const f = await fixture(t)
  const started = await timerRequest(f, await f.bundle(), "start")
  const extended = await f.request("update-event", { minimum_attendees: 22 })
  assert.equal(extended.status, 200)
  assert.equal(extended.body.event.timer_ends_at, started.body.event.timer_ends_at)
  assert.equal(extended.body.event.timer_revision, started.body.event.timer_revision)
  const seat = extended.body.seats[0]
  const moved = await f.request("move-attendee", { attendee_id: seat.attendee_id, round_number: seat.round_number, table_number: seat.table_number % 5 + 1, force: true })
  assert.equal(moved.status, 200)
  assert.equal(moved.body.event.timer_ends_at, started.body.event.timer_ends_at)
  const rebuilt = await f.request("generate-schedule")
  assert.equal(rebuilt.status, 200)
  assert.equal(rebuilt.body.event.active_round, 1)
  assert.equal(rebuilt.body.event.timer_ends_at, null)
  assert.equal(rebuilt.body.event.timer_remaining_seconds, 1800)
  assert.ok(rebuilt.body.event.timer_revision > started.body.event.timer_revision)
})

test("timer validates duration and running state, and requires a prepared schedule", async t => {
  const f = await fixture(t)
  const initial = await f.bundle()
  for (const value of [0, 59, 7201, 60.5, "600"]) assert.equal((await timerRequest(f, initial, "set-duration", value)).status, 400)
  const started = await timerRequest(f, initial, "start")
  assert.equal((await timerRequest(f, started.body, "set-duration", 120)).status, 422)
  assert.equal((await f.bundle()).event.timer_ends_at, started.body.event.timer_ends_at)
  const reset = await f.request("reset-event")
  assert.equal(reset.body.event.timer_ends_at, null)
  assert.equal((await timerRequest(f, reset.body, "start")).status, 422)
})

test("timer database writes are restricted to service_role", async t => {
  const f = await fixture(t)
  const initial = await f.bundle()
  const args = { p_event_id: f.eventId, p_expected_active_round: 1, p_expected_revision: initial.event.timer_revision, p_command: "start" }
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`)
    assert.equal((await f.client.rpc("control_the_room_timer", args)).error.code, "42501")
    await f.db.exec("reset role")
  }
  await f.db.exec("set role service_role")
  assert.equal((await f.client.rpc("control_the_room_timer", args)).error, null)
  await f.db.exec("reset role")
})

function extensionArgs(bundle, newAttendee) {
  const extended = incremental.extendTheRoomSchedule({
    participants: [...bundle.attendees, newAttendee], existingSeats: bundle.seats,
    newAttendeeIds: [newAttendee.id], tableCount: bundle.event.table_count,
    roundCount: bundle.event.round_count, activeRound: bundle.event.active_round,
  })
  return {
    p_event_id: bundle.event.id, p_expected_schedule_run_id: bundle.schedule.id,
    p_expected_active_round: bundle.event.active_round, p_seed: "concurrent-walk-in",
    p_algorithm_version: setup.INCREMENTAL_ALGORITHM_VERSION, p_metrics: extended.metrics, p_rows: extended.rows,
  }
}

test("impossible settings leave the live schedule, roster and round unchanged", async t => {
  const f = await fixture(t)
  await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  const before = await f.bundle()
  f.client.writes.length = 0
  const response = await f.request("update-event", { table_count: 4, minimum_attendees: 22 })
  assert.equal(response.status, 422)
  assert.equal(response.body.code, "TABLE_GEOMETRY_IMPOSSIBLE")
  assert.deepEqual(f.client.writes, [])
  assert.deepEqual(await f.bundle(), before)
})

test("a database rejection rolls back settings, roster additions and schedule retirement", async t => {
  const f = await fixture(t)
  const before = await f.bundle()
  const plan = setup.prepareTheRoomSetup(before, settings(before, { minimum_attendees: 22 }))
  plan.rpcArgs.p_rows = plan.rpcArgs.p_rows.filter(row => row.round_number !== 2)
  assert.equal((await f.client.rpc("save_the_room_setup_if_current", plan.rpcArgs)).error.code, "40001")
  assert.deepEqual(await f.bundle(), before)
  // This failure occurs after the old run is retired and the new one inserted.
  const duplicateSeat = setup.prepareTheRoomSetup(before, settings(before, { minimum_attendees: 22 })).rpcArgs
  duplicateSeat.p_rows.push(duplicateSeat.p_rows[0])
  assert.equal((await f.client.rpc("save_the_room_setup_if_current", duplicateSeat)).error.code, "23505")
  assert.deepEqual(await f.bundle(), before)
})

test("setup extension preserves a later active round and all existing seats", async t => {
  const f = await fixture(t)
  await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  const before = await f.bundle()
  const response = await f.request("update-event", { minimum_attendees: 22 })
  assert.equal(response.status, 200)
  assert.equal(response.body.schedule_change, "extended")
  assert.equal(response.body.event.active_round, 2)
  assert.equal(response.body.attendees.length, 22)
  for (const seat of before.seats) {
    const saved = response.body.seats.find(row => row.attendee_id === seat.attendee_id && row.round_number === seat.round_number)
    assert.equal(saved.table_number, seat.table_number)
    assert.equal(saved.seat_number, seat.seat_number)
  }
  const oldIds = new Set(before.attendees.map(person => person.id))
  assert.equal(response.body.seats.filter(row => !oldIds.has(row.attendee_id) && row.round_number === 1).length, 0)
})

test("valid dimension changes commit their new schedule and reset the round atomically", async t => {
  const f = await fixture(t)
  await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  const response = await f.request("update-event", { table_count: 6, round_count: 2, minimum_attendees: 24 })
  assert.equal(response.status, 200)
  assert.equal(response.body.schedule_change, "regenerated")
  assert.equal(response.body.event.active_round, 1)
  assert.equal(response.body.event.table_count, 6)
  assert.equal(response.body.seats.length, 48)
  assert.equal((await f.db.query("select count(*)::int n from the_room_schedule_runs where is_active")).rows[0].n, 1)
})

test("a walk-in prepared before a manual move cannot erase the move", async t => {
  const f = await fixture(t)
  const before = await f.bundle()
  const person = { ...before.attendees[0], id: "00000000-0000-4000-8000-000000000021", attendee_number: 21 }
  const stale = extensionArgs(before, person)
  const target = before.seats[0]
  const destination = target.table_number % 5 + 1
  const moved = await f.request("move-attendee", { attendee_id: target.attendee_id, round_number: target.round_number, table_number: destination, force: true })
  assert.equal(moved.status, 200)
  assert.notEqual(moved.body.schedule.id, before.schedule.id)
  await f.db.query("insert into the_room_attendees(id,event_id,attendee_number,full_name,gender,attendance_status) values($1,$2,21,'Guest 21',$3,'confirmed')", [person.id, f.eventId, person.gender])
  assert.equal((await f.client.rpc("replace_the_room_schedule_if_current", stale)).error.code, "40001")
  const latest = await f.bundle()
  assert.equal(latest.seats.find(row => row.attendee_id === target.attendee_id && row.round_number === target.round_number).table_number, destination)
  const refreshed = { ...latest, attendees: latest.attendees.filter(row => row.id !== person.id) }
  assert.equal((await f.client.rpc("replace_the_room_schedule_if_current", extensionArgs(refreshed, person))).error, null)
  assert.equal((await f.bundle()).seats.find(row => row.attendee_id === target.attendee_id && row.round_number === target.round_number).table_number, destination)
})

test("stale setup cannot overwrite a newer move or a round advance", async t => {
  const f = await fixture(t)
  const before = await f.bundle()
  const stale = setup.prepareTheRoomSetup(before, settings(before, { minimum_attendees: 22 })).rpcArgs
  await f.request("set-active-round", { active_round: 2, expected_active_round: 1 })
  assert.equal((await f.client.rpc("save_the_room_setup_if_current", stale)).error.code, "40001")
  const afterAdvance = await f.bundle()
  const staleAfterAdvance = setup.prepareTheRoomSetup(afterAdvance, settings(afterAdvance, { minimum_attendees: 22 })).rpcArgs
  const seat = afterAdvance.seats[0]
  assert.equal((await f.request("move-attendee", { attendee_id: seat.attendee_id, round_number: seat.round_number, table_number: seat.table_number % 5 + 1, force: true })).status, 200)
  assert.equal((await f.client.rpc("save_the_room_setup_if_current", staleAfterAdvance)).error.code, "40001")
  assert.equal((await f.bundle()).attendees.length, 20)
})

test("a manual move racing a committed walk-in returns a conflict without changing seats", async t => {
  const f = await fixture(t)
  const before = await f.bundle()
  const originalRpc = f.client.rpc.bind(f.client)
  let injected = false
  let afterWalkIn
  f.client.rpc = async (name, args) => {
    if (name === "replace_the_room_schedule_if_current" && !injected) {
      injected = true
      const added = await f.request("add-attendee", { gender: "female" })
      assert.equal(added.status, 200)
      afterWalkIn = added.body
    }
    return originalRpc(name, args)
  }
  const seat = before.seats[0]
  const response = await f.request("move-attendee", {
    attendee_id: seat.attendee_id, round_number: seat.round_number, table_number: seat.table_number % 5 + 1, force: true,
  })
  assert.equal(response.status, 409)
  assert.equal(response.body.code, "EVENT_CHANGED_RETRY")
  const latest = await f.bundle()
  assert.equal(latest.schedule.id, afterWalkIn.schedule.id)
  assert.equal(latest.attendees.length, 21)
  assert.deepEqual(latest.seats, afterWalkIn.seats)
})

test("setup RPC is service-only and rejects public callers", async t => {
  const f = await fixture(t)
  const bundle = await f.bundle()
  const args = setup.prepareTheRoomSetup(bundle, settings(bundle, { minimum_attendees: 22 })).rpcArgs
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role}`)
    assert.equal((await f.client.rpc("save_the_room_setup_if_current", args)).error.code, "42501")
    await f.db.exec("reset role")
  }
  await f.db.exec("set role service_role")
  assert.equal((await f.client.rpc("save_the_room_setup_if_current", args)).error, null)
  await f.db.exec("reset role")
})

test("the real setup UI preserves the returned round and never regenerates an extension", async () => {
  const source = await readFile(new URL("../../app/routes/the-room.tsx", import.meta.url), "utf8")
  const ast = ts.createSourceFile("the-room.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "saveAndGenerate") callback = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(callback)
  for (const activeRound of [2, 3]) {
    let round = activeRound
    const actions = []
    const compiled = ts.transpileModule(`const save = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const save = runInNewContext(compiled + "\nsave", {
      validSetup: true, setupChanged: true, savingSetup: false, creating: false,
      bundle: { event: { id: "event" } }, draft: { minimum_attendees: 22 },
      setSavingSetup() {}, setRound(value) { round = value }, setTableRound() {}, setView() {},
      setCreating() {}, setAdvancedMode() {}, toast: { success() {} },
      act: async action => {
        actions.push(action)
        round = activeRound // installBundle() uses the round from the response.
        return { schedule: { id: "extended" }, schedule_change: "extended", event: { active_round: activeRound }, attendees: Array(22) }
      },
    })
    await save()
    assert.equal(round, activeRound)
    assert.deepEqual(actions, ["update-event"])
  }
})

test("the real arrival UI reuses the same request after a lost response and blocks a second arrival", async () => {
  const source = await readFile(new URL("../../app/routes/the-room.tsx", import.meta.url), "utf8")
  const ast = ts.createSourceFile("the-room.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "addFixedGuest") callback = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(callback)
  const calls = [], displayed = []
  const pendingArrivalRef = { current: null }
  let generatedIds = 0
  const compiled = ts.transpileModule(`const add = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const add = runInNewContext(compiled + "\nadd", {
    bundle: { event: { id: "event" }, schedule: { id: "schedule" } }, fixedRoutes: true, busy: false,
    refreshing: false, switchingEvent: false, savingSetup: false, preview: false,
    arrivalInFlightRef: { current: false }, mutationEpochRef: { current: 0 }, pendingArrivalRef,
    crypto: { randomUUID: () => { generatedIds++; return "stable-request" } },
    rememberArrival: pending => { pendingArrivalRef.current = pending },
    setBusy() {}, setLiveSyncFailed() {}, toast: { error() {} }, arabicError: error => error.message,
    roomApi: async (action, payload) => {
      calls.push({ action, ...payload })
      if (calls.length === 1) throw new TypeError("Connection lost after the server committed")
      return { event: { id: "event" }, attendees: [{ id: "stable-request" }], seats: [], added_attendee_id: "stable-request", waitlisted: true }
    },
    showFixedPlacement: data => displayed.push(data),
  })
  await add("male")
  assert.equal(pendingArrivalRef.current.requestId, "stable-request")
  await add("female")
  assert.equal(calls.length, 1)
  await add("male", true)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].request_id, calls[1].request_id)
  assert.equal(calls[1].gender, "male")
  assert.equal(generatedIds, 1)
  assert.equal(displayed.length, 1)
  assert.equal(pendingArrivalRef.current, null)
})
