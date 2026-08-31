import { supabaseAdmin } from "../server/security/supabase-admin.mjs"
import { TheRoomScheduleError } from "../server/the-room/scheduler.mjs"
import { prepareTheRoomSetup, INCREMENTAL_ALGORITHM_VERSION } from "../server/the-room/setup.mjs"
import { extendTheRoomSchedule, TheRoomExtensionError } from "../server/the-room/incremental-scheduler.mjs"
import { analyzeTheRoomMove, TheRoomMoveError } from "../server/the-room/manual-move.mjs"
import { normalizeTheRoomActiveRound, resolveTheRoomRoundAdvance, TheRoomLiveStateError } from "../server/the-room/live-state.mjs"
import { chooseTheRoomBadgeCandidate } from "../server/the-room/badge-claim.mjs"
import { planFixedRoute, TheRoomFixedRouteError } from "../app/lib/the-room-fixed-routes.mjs"
import {
  buildNumberedRosterRows,
  buildRosterForGenderCounts,
  rosterGenderCounts,
  ROSTER_GENDERS,
} from "../server/the-room/numbered-roster.mjs"
import {
  enforceTheRoomRateLimit,
  hasTheRoomSession,
  loginTheRoom,
  logoutTheRoom,
  theRoomAuthConfigured,
} from "../server/the-room/auth.mjs"

const supabase = supabaseAdmin
const EVENT_FIELDS = "id,event_number,name,starts_at,venue,status,seating_mode,route_revision,minimum_attendees,table_count,round_count,active_round,timer_duration_seconds,timer_remaining_seconds,timer_ends_at,timer_revision,ticket_price,currency,notes,created_at,updated_at"
const ATTENDEE_FIELDS = "id,event_id,attendee_number,full_name,gender,attendance_status,included_in_schedule,checked_in,created_at,updated_at"

class TheRoomInputError extends Error {}

function numberInRange(value, minimum, maximum, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback
}

function attendeeMinimum(value, fallback = 20) {
  return Math.round(numberInRange(value, 2, 500, fallback))
}

function sendDatabaseError(res, error) {
  if (error?.code === "40001") {
    return res.status(409).json({ error: "The event changed on another device. Refresh and try again.", code: "EVENT_CHANGED_RETRY" })
  }
  if (error?.code === "55000") return res.status(409).json({ error: error.message, code: "FIXED_ROUTES_LOCKED" })
  if (error?.code === "22023") return res.status(422).json({ error: error.message, code: "FIXED_ROUTE_CONSTRAINT" })
  const conflict = error?.code === "23505"
  const message = conflict ? "That event number or guest number already exists" : (error?.message || "Database request failed")
  return res.status(conflict ? 409 : 500).json({ error: message })
}

async function ensureMinimumRoster(event) {
  const { data: attendees, error } = await supabase
    .from("the_room_attendees")
    .select("attendee_number,gender,attendance_status,included_in_schedule")
    .eq("event_id", event.id)
    .order("attendee_number", { ascending: true })
  if (error) throw error

  const allAttendees = attendees || []
  const activeAttendees = allAttendees.filter(attendee =>
    attendee.included_in_schedule && ["registered", "confirmed"].includes(attendee.attendance_status)
  )
  const missing = Math.max(0, Number(event.minimum_attendees) - activeAttendees.length)
  if (!missing) return 0

  const lastNumber = allAttendees.reduce((maximum, attendee) => Math.max(maximum, Number(attendee.attendee_number) || 0), 0)
  const counts = rosterGenderCounts(activeAttendees)
  const rows = buildNumberedRosterRows({
    eventId: event.id,
    count: missing,
    startNumber: lastNumber + 1,
    maleCount: counts.male,
    femaleCount: counts.female,
  })
  const { error: insertError } = await supabase.from("the_room_attendees").insert(rows)
  if (insertError) throw insertError
  return missing
}

async function readAllRoomRows(buildQuery) {
  const rows = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if ((data || []).length < pageSize) return { data: rows, error: null }
  }
}

async function loadEventBundle({ eventId, eventNumber, snapshotAttempt = 0 }) {
  let eventQuery = supabase.from("the_room_events").select(EVENT_FIELDS)
  eventQuery = eventId ? eventQuery.eq("id", eventId) : eventQuery.eq("event_number", Number(eventNumber))
  const { data: event, error: eventError } = await eventQuery.maybeSingle()
  if (eventError) throw eventError
  if (!event) return null

  const attendeeQuery = () => supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", event.id).order("attendee_number", { ascending: true })
  const [{ data: attendees, error: attendeesError }, { data: schedule, error: scheduleError }] = await Promise.all([
    event.seating_mode === "fixed_routes" ? readAllRoomRows(attendeeQuery) : attendeeQuery(),
    supabase.from("the_room_schedule_runs").select("*").eq("event_id", event.id).eq("is_active", true).maybeSingle(),
  ])
  if (attendeesError) throw attendeesError
  if (scheduleError) throw scheduleError

  let seats = []
  if (schedule?.id) {
    const seatQuery = () => supabase.from("the_room_seats").select("id,schedule_run_id,event_id,round_number,table_number,seat_number,attendee_id").eq("schedule_run_id", schedule.id).order("round_number").order("table_number").order("seat_number")
    const { data, error } = await (event.seating_mode === "fixed_routes" ? readAllRoomRows(seatQuery) : seatQuery())
    if (error) throw error
    seats = data || []
  }

  if (event.seating_mode === "fixed_routes") {
    const { data: latest, error } = await supabase.from("the_room_events").select("route_revision,active_round").eq("id", event.id).maybeSingle()
    if (error) throw error
    if (!latest) return null
    if (latest.route_revision !== event.route_revision || latest.active_round !== event.active_round) {
      if (snapshotAttempt < 3) return loadEventBundle({ eventId: event.id, snapshotAttempt: snapshotAttempt + 1 })
      throw Object.assign(new Error("The event changed while loading its routes"), { code: "40001" })
    }
  }
  return { event, attendees: attendees || [], schedule: schedule || null, seats, server_now: new Date().toISOString() }
}

async function invalidateSchedule(eventId) {
  const { error } = await supabase.from("the_room_schedule_runs").update({ is_active: false }).eq("event_id", eventId).eq("is_active", true)
  if (error) throw error
}

const isUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function fixedArrivalResponse(bundle, attendee) {
  const seats = bundle.seats.filter(seat => seat.attendee_id === attendee.id)
  const meetings = new Map()
  for (const seat of seats) {
    for (const companion of bundle.seats) {
      if (companion.attendee_id !== attendee.id && companion.round_number === seat.round_number && companion.table_number === seat.table_number) {
        meetings.set(companion.attendee_id, (meetings.get(companion.attendee_id) || 0) + 1)
      }
    }
  }
  return {
    ...bundle,
    added_attendee_id: attendee.id,
    added_attendee_number: attendee.attendee_number,
    added_gender: attendee.gender,
    waitlisted: attendee.attendance_status === "waitlist",
    placement_tables: seats.map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })),
    repeat_pair_count: [...meetings.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    schedule_change: seats.length ? "extended" : "unchanged",
  }
}

async function admitFixedArrival(req, res, { retryWaiting = false } = {}) {
  const eventId = req.body?.event_id
  const attendeeId = retryWaiting ? req.body?.attendee_id : req.body?.request_id
  if (!isUuid(attendeeId)) return res.status(400).json({ error: "A stable guest request ID is required", code: "INVALID_REQUEST_ID" })
  const requestedGender = String(req.body?.gender || "")
  if (!retryWaiting && !ROSTER_GENDERS.has(requestedGender)) return res.status(400).json({ error: "Choose the arriving guest's gender" })

  // Planning happens outside the transaction. The revision and round check in
  // the commit RPC makes concurrent arrivals retry against the new capacity.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const bundle = await loadEventBundle({ eventId })
    if (!bundle) return res.status(404).json({ error: "The Room event was not found" })
    if (bundle.event.seating_mode !== "fixed_routes") return res.status(422).json({ error: "This action requires a fixed-route event", code: "FIXED_ROUTE_CONSTRAINT" })
    const existing = bundle.attendees.find(person => person.id === attendeeId)
    if (retryWaiting && !existing) return res.status(404).json({ error: "The waiting guest was not found" })
    if (existing && !retryWaiting && existing.gender !== requestedGender) {
      return res.status(409).json({ error: "This request ID was already used for another guest", code: "REQUEST_ID_CONFLICT" })
    }
    // Retries reuse the same identity. Guests left waiting by the old limit
    // receive their route instead of remaining stuck on the waiting list.
    if (existing?.attendance_status === "confirmed") {
      return res.status(200).json(fixedArrivalResponse(bundle, existing))
    }
    if (!["ready", "live", "registration"].includes(bundle.event.status)) {
      return res.status(409).json({ error: "This event is not open for arrivals", code: "EVENT_NOT_OPEN" })
    }
    if (existing && existing.attendance_status !== "waitlist") return res.status(422).json({ error: "Only waiting guests can receive a route", code: "FIXED_ROUTE_CONSTRAINT" })
    const gender = existing?.gender || requestedGender
    const plan = planFixedRoute({
      attendee: { id: attendeeId, gender },
      participants: bundle.attendees.filter(person => person.included_in_schedule && person.attendance_status === "confirmed"),
      existingSeats: bundle.seats,
      tableCount: bundle.event.table_count,
      roundCount: bundle.event.round_count,
      activeRound: bundle.event.active_round,
    })
    // Table size, gender balance, and repeats never reject an arrival.
    const { data, error } = await supabase.rpc("commit_the_room_fixed_arrival", {
      p_event_id: eventId,
      p_attendee_id: attendeeId,
      p_gender: gender,
      p_expected_revision: bundle.event.route_revision,
      p_expected_active_round: bundle.event.active_round,
      p_rows: plan.rows,
      p_repeat_pair_count: plan.repeatPairCount,
    })
    if (error?.code === "40001") continue
    if (error) return sendDatabaseError(res, error)
    const latest = await loadEventBundle({ eventId })
    if (!latest) return res.status(404).json({ error: "The Room event was not found" })
    return res.status(200).json(fixedArrivalResponse(latest, latest.attendees.find(person => person.id === attendeeId) || data.attendee))
  }
  return res.status(409).json({ error: "Another reception device is assigning seats. Retry this same guest.", code: "EVENT_CHANGED_RETRY" })
}

async function handleAction(req, res, action) {
  if (action === "session") return res.status(200).json({ authenticated: hasTheRoomSession(req), configured: theRoomAuthConfigured() })
  if (action === "login") {
    const result = loginTheRoom(req, res, req.body?.key)
    return result.ok ? res.status(200).json({ authenticated: true }) : res.status(result.status).json({ error: result.error })
  }
  if (action === "logout") {
    logoutTheRoom(req, res)
    return res.status(200).json({ authenticated: false })
  }
  if (!hasTheRoomSession(req)) return res.status(401).json({ error: "Your The Room session has expired" })

  // These legacy operations can invalidate a photographed route or reuse an
  // issued badge. Fixed-route events deliberately never expose that behavior.
  if (["reset-event", "reset-check-ins", "set-attendee-check-in", "set-attendee-gender", "move-attendee", "check-in-next"].includes(action)) {
    const { data: event, error } = await supabase.from("the_room_events").select("seating_mode").eq("id", req.body?.event_id).maybeSingle()
    if (error) return sendDatabaseError(res, error)
    if (event?.seating_mode === "fixed_routes") return res.status(409).json({ error: "Issued routes and guest badges stay fixed. Add arriving guests at reception.", code: "FIXED_ROUTES_LOCKED" })
  }

  if (action === "seat-waiting-attendee") {
    if (!req.body?.event_id) return res.status(400).json({ error: "Event ID is required" })
    return admitFixedArrival(req, res, { retryWaiting: true })
  }

  if (action === "list-events") {
    const { data, error } = await supabase.from("the_room_events").select(EVENT_FIELDS).order("event_number", { ascending: false })
    if (error) return sendDatabaseError(res, error)
    return res.status(200).json({ events: data || [] })
  }

  if (action === "get-event") {
    const bundle = await loadEventBundle({ eventId: req.body?.event_id, eventNumber: req.body?.event_number })
    return bundle ? res.status(200).json(bundle) : res.status(404).json({ error: "The Room event was not found" })
  }

  if (action === "control-timer") {
    const body = req.body || {}
    if (!body.event_id || !["start", "pause", "reset", "set-duration"].includes(body.command)
      || !Number.isInteger(body.expected_active_round) || body.expected_active_round < 1
      || !Number.isInteger(body.expected_timer_revision) || body.expected_timer_revision < 0
      || (body.command === "set-duration" && (!Number.isInteger(body.duration_seconds) || body.duration_seconds < 60 || body.duration_seconds > 7200))) {
      return res.status(400).json({ error: "A valid event, timer command, round and revision are required", code: "INVALID_TIMER_CONTROL" })
    }
    const { error } = await supabase.rpc("control_the_room_timer", {
      p_event_id: body.event_id,
      p_expected_active_round: body.expected_active_round,
      p_expected_revision: body.expected_timer_revision,
      p_command: body.command,
      p_duration_seconds: body.command === "set-duration" ? body.duration_seconds : null,
    })
    if (error?.code === "22023") return res.status(422).json({ error: error.message, code: "INVALID_TIMER_CONTROL" })
    if (error) return sendDatabaseError(res, error)
    return res.status(200).json(await loadEventBundle({ eventId: body.event_id }))
  }

  if (action === "set-active-round") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { data: event, error: eventError } = await supabase
      .from("the_room_events")
      .select("id,round_count,active_round")
      .eq("id", eventId)
      .maybeSingle()
    if (eventError) return sendDatabaseError(res, eventError)
    if (!event) return res.status(404).json({ error: "The Room event was not found" })

    try {
      const activeRound = normalizeTheRoomActiveRound(req.body?.active_round, event.round_count)
      const transition = resolveTheRoomRoundAdvance({
        expectedRound: req.body?.expected_active_round,
        requestedRound: activeRound,
        currentRound: event.active_round,
        roundCount: event.round_count,
      })
      if (transition.changed) {
        const { data: updated, error: updateError } = await supabase
          .from("the_room_events")
          .update({ active_round: activeRound, updated_at: new Date().toISOString() })
          .eq("id", eventId)
          .eq("active_round", Number(req.body?.expected_active_round))
          .select("id")
          .maybeSingle()
        if (updateError) return sendDatabaseError(res, updateError)
        if (!updated) {
          const latest = await loadEventBundle({ eventId })
          if (!latest) return res.status(404).json({ error: "The Room event was not found" })
          if (Number(latest.event.active_round) >= activeRound) return res.status(200).json(latest)
          return res.status(409).json({ error: "The active round changed on another device", code: "ROUND_STATE_CHANGED" })
        }
      }
      return res.status(200).json(await loadEventBundle({ eventId }))
    } catch (roundError) {
      if (roundError instanceof TheRoomLiveStateError) {
        const status = roundError.code === "ROUND_STATE_CHANGED" ? 409 : 422
        return res.status(status).json({ error: roundError.message, code: roundError.code, details: roundError.details })
      }
      throw roundError
    }
  }

  if (action === "reset-event") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    await invalidateSchedule(eventId)
    const { data, error } = await supabase
      .from("the_room_events")
      .update({ status: "draft", active_round: 1, updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .select("id")
      .maybeSingle()
    if (error) return sendDatabaseError(res, error)
    if (!data) return res.status(404).json({ error: "The Room event was not found" })
    return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "reset" })
  }

  if (action === "delete-event") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { data: event, error: eventError } = await supabase.from("the_room_events").select("seating_mode").eq("id", eventId).maybeSingle()
    if (eventError) return sendDatabaseError(res, eventError)
    if (!event) return res.status(404).json({ error: "The Room event was not found" })
    // Fixed routes can only be removed by deleting their entire parent event.
    // Its deferred seat FK lets that deletion cascade as a single transaction.
    if (event.seating_mode !== "fixed_routes") {
      const { error: seatsError } = await supabase.from("the_room_seats").delete().eq("event_id", eventId)
      if (seatsError) return sendDatabaseError(res, seatsError)
    }
    const { data, error } = await supabase
      .from("the_room_events")
      .delete()
      .eq("id", eventId)
      .select("id")
      .maybeSingle()
    if (error) return sendDatabaseError(res, error)
    if (!data) return res.status(404).json({ error: "The Room event was not found" })
    return res.status(200).json({ deleted: true, event_id: eventId })
  }

  if (action === "check-in-next") {
    const eventId = req.body?.event_id
    const gender = String(req.body?.gender || "")
    if (!eventId || !ROSTER_GENDERS.has(gender)) {
      return res.status(400).json({ error: "A valid event and guest gender are required" })
    }

    // The checked_in=false filter on the update is the final guard against two
    // organizer devices handing out the same numbered badge at the same time.
    // When the requested gender's prepared pool is empty, reuse the available
    // badge whose existing journey is least disrupted instead of blocking the
    // reception desk even though unused badges remain.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: availableAttendees, error: nextError } = await supabase
        .from("the_room_attendees")
        .select(ATTENDEE_FIELDS)
        .eq("event_id", eventId)
        .eq("included_in_schedule", true)
        .in("attendance_status", ["registered", "confirmed"])
        .eq("checked_in", false)
        .order("attendee_number", { ascending: true })
      if (nextError) return sendDatabaseError(res, nextError)
      if (!availableAttendees?.length) {
        return res.status(409).json({ error: "All badges for this group have already been assigned", code: "NO_BADGES_LEFT" })
      }

      const choiceBundle = availableAttendees.some(attendee => attendee.gender === gender)
        ? null
        : await loadEventBundle({ eventId })
      const choice = chooseTheRoomBadgeCandidate({
        attendees: choiceBundle?.attendees || availableAttendees,
        seats: choiceBundle?.seats || [],
        requestedGender: gender,
        tableCount: choiceBundle?.event?.table_count || 1,
        roundCount: choiceBundle?.event?.round_count || 1,
        activeRound: choiceBundle?.event?.active_round || 1,
      })
      if (!choice) {
        return res.status(409).json({ error: "All badges have already been assigned", code: "NO_BADGES_LEFT" })
      }

      const { data: claimed, error: claimError } = await supabase
        .from("the_room_attendees")
        .update({ checked_in: true, gender, updated_at: new Date().toISOString() })
        .eq("id", choice.attendee.id)
        .eq("event_id", eventId)
        .eq("checked_in", false)
        .eq("gender", choice.attendee.gender)
        .select("id,attendee_number,gender")
        .maybeSingle()
      if (claimError) return sendDatabaseError(res, claimError)
      if (!claimed) continue

      return res.status(200).json({
        ...(await loadEventBundle({ eventId })),
        assigned_attendee_number: claimed.attendee_number,
        assigned_gender: claimed.gender,
        badge_gender_reassigned: choice.reassigned,
      })
    }

    return res.status(409).json({ error: "A badge was just assigned from another device. Try again.", code: "BADGE_ALREADY_ASSIGNED" })
  }

  if (action === "set-attendee-check-in") {
    const eventId = req.body?.event_id
    const attendeeId = req.body?.attendee_id
    const checkedIn = req.body?.checked_in
    if (!eventId || !attendeeId || typeof checkedIn !== "boolean") {
      return res.status(400).json({ error: "A valid event, guest, and check-in state are required" })
    }
    const { data, error } = await supabase
      .from("the_room_attendees")
      .update({ checked_in: checkedIn, updated_at: new Date().toISOString() })
      .eq("id", attendeeId)
      .eq("event_id", eventId)
      .select("id")
      .maybeSingle()
    if (error) return sendDatabaseError(res, error)
    if (!data) return res.status(404).json({ error: "The Room guest was not found" })
    return res.status(200).json(await loadEventBundle({ eventId }))
  }

  if (action === "reset-check-ins") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { error } = await supabase
      .from("the_room_attendees")
      .update({ checked_in: false, updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("checked_in", true)
    if (error) return sendDatabaseError(res, error)
    return res.status(200).json(await loadEventBundle({ eventId }))
  }

  if (action === "create-event") {
    const eventNumber = numberInRange(req.body?.event_number, 1, Number.MAX_SAFE_INTEGER)
    if (!Number.isInteger(eventNumber)) return res.status(400).json({ error: "A positive whole event number is required" })
    if (req.body?.seating_mode !== undefined && !["planned", "fixed_routes"].includes(req.body.seating_mode)) return res.status(400).json({ error: "Invalid seating mode" })
    if (req.body?.seating_mode !== "planned") {
      const tableCount = req.body?.table_count ?? 5
      const roundCount = req.body?.round_count ?? 3
      if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 50 || !Number.isInteger(roundCount) || roundCount < 1 || roundCount > 20) {
        return res.status(400).json({ error: "Choose 1–50 tables and 1–20 rounds" })
      }
      const { data, error } = await supabase.rpc("create_fixed_the_room_event", { p_event_number: eventNumber, p_table_count: tableCount, p_round_count: roundCount })
      if (error) return sendDatabaseError(res, error)
      return res.status(201).json(await loadEventBundle({ eventId: data.id }))
    }
    const requestedWomen = Number(req.body?.female_attendees)
    const requestedMen = Number(req.body?.male_attendees)
    const hasExplicitGenderCounts = Number.isInteger(requestedWomen) && requestedWomen >= 0 && Number.isInteger(requestedMen) && requestedMen >= 0
    const explicitTotal = hasExplicitGenderCounts ? requestedWomen + requestedMen : 0
    if (hasExplicitGenderCounts && (explicitTotal < 2 || explicitTotal > 500)) {
      return res.status(400).json({ error: "The total guest count must be between 2 and 500" })
    }
    const minimumAttendees = hasExplicitGenderCounts ? explicitTotal : attendeeMinimum(req.body?.minimum_attendees)
    const payload = {
      event_number: eventNumber,
      name: "The Room",
      minimum_attendees: minimumAttendees,
      table_count: Math.round(numberInRange(req.body?.table_count, 1, 50, 5)),
      round_count: Math.round(numberInRange(req.body?.round_count, 1, 20, 3)),
      status: "draft",
    }
    const { data, error } = await supabase.from("the_room_events").insert(payload).select(EVENT_FIELDS).single()
    if (error) return sendDatabaseError(res, error)
    try {
      if (hasExplicitGenderCounts) {
        const rows = buildRosterForGenderCounts({ eventId: data.id, femaleCount: requestedWomen, maleCount: requestedMen })
        const { error: rosterError } = await supabase.from("the_room_attendees").insert(rows)
        if (rosterError) throw rosterError
      } else {
        await ensureMinimumRoster(data)
      }
      return res.status(201).json(await loadEventBundle({ eventId: data.id }))
    } catch (rosterError) {
      await supabase.from("the_room_events").delete().eq("id", data.id)
      throw rosterError
    }
  }

  if (action === "update-event" || action === "generate-schedule") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const bundle = await loadEventBundle({ eventId })
    if (!bundle) return res.status(404).json({ error: "The Room event was not found" })
    const existingEvent = bundle.event
    if (existingEvent.seating_mode === "fixed_routes") {
      if (action === "generate-schedule") return res.status(200).json({ ...bundle, schedule_change: "unchanged" })
      const tableCount = req.body?.table_count ?? existingEvent.table_count
      const roundCount = req.body?.round_count ?? existingEvent.round_count
      if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 50 || !Number.isInteger(roundCount) || roundCount < 1 || roundCount > 20
        || !Number.isInteger(req.body?.expected_route_revision) || req.body.expected_route_revision < 0) {
        return res.status(400).json({ error: "Valid dimensions and the current route revision are required", code: "FIXED_ROUTE_CONSTRAINT" })
      }
      if (req.body?.seating_mode && req.body.seating_mode !== "fixed_routes") return res.status(409).json({ error: "The seating mode is fixed for this event", code: "FIXED_ROUTES_LOCKED" })
      const { error } = await supabase.rpc("configure_the_room_fixed_event", {
        p_event_id: eventId, p_table_count: tableCount, p_round_count: roundCount, p_expected_revision: req.body.expected_route_revision,
      })
      if (error) return sendDatabaseError(res, error)
      return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "unchanged" })
    }
    const input = action === "generate-schedule" ? {} : req.body
    const payload = {
      minimum_attendees: attendeeMinimum(input?.minimum_attendees, existingEvent.minimum_attendees),
      table_count: Math.round(numberInRange(input?.table_count, 1, 50, existingEvent.table_count)),
      round_count: Math.round(numberInRange(input?.round_count, 1, 20, existingEvent.round_count)),
    }
    const plan = prepareTheRoomSetup(bundle, payload, { regenerate: action === "generate-schedule" })
    const { error } = await supabase.rpc("save_the_room_setup_if_current", plan.rpcArgs)
    if (error) return sendDatabaseError(res, error)
    return res.status(200).json({
      ...(await loadEventBundle({ eventId })),
      schedule_change: plan.scheduleChange,
      added_guest_count: plan.addedGuestCount,
    })
  }

  if (action === "add-attendee") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { data: arrivalEvent, error: arrivalError } = await supabase.from("the_room_events").select("seating_mode").eq("id", eventId).maybeSingle()
    if (arrivalError) return sendDatabaseError(res, arrivalError)
    if (!arrivalEvent) return res.status(404).json({ error: "The Room event was not found" })
    if (arrivalEvent.seating_mode === "fixed_routes") return admitFixedArrival(req, res)
    const gender = String(req.body?.gender || "")
    if (!ROSTER_GENDERS.has(gender)) return res.status(400).json({ error: "Choose whether the new guest is a man or woman" })

    const { data: addedAttendee, error: createError } = await supabase.rpc("create_the_room_walk_in", {
      p_event_id: eventId,
      p_gender: gender,
    })
    if (createError) return sendDatabaseError(res, createError)
    if (!addedAttendee?.id) return res.status(500).json({ error: "The walk-in guest could not be created" })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const [eventResult, scheduleResult, attendeeResult] = await Promise.all([
        supabase.from("the_room_events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle(),
        supabase.from("the_room_schedule_runs").select("*").eq("event_id", eventId).eq("is_active", true).maybeSingle(),
        supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", eventId).eq("included_in_schedule", true).in("attendance_status", ["registered", "confirmed"]).order("attendee_number"),
      ])
      if (eventResult.error) return sendDatabaseError(res, eventResult.error)
      if (!eventResult.data) return res.status(404).json({ error: "The Room event was not found" })
      if (scheduleResult.error) return sendDatabaseError(res, scheduleResult.error)
      if (attendeeResult.error) return sendDatabaseError(res, attendeeResult.error)

      const activeSchedule = scheduleResult.data || null
      if (!activeSchedule) {
        return res.status(200).json({
          ...(await loadEventBundle({ eventId })),
          added_attendee_id: addedAttendee.id,
          added_attendee_number: addedAttendee.attendee_number,
          added_gender: addedAttendee.gender,
          schedule_change: "unchanged",
        })
      }

      const { data: activeSeats, error: seatsError } = await supabase
        .from("the_room_seats")
        .select("round_number,table_number,seat_number,attendee_id")
        .eq("schedule_run_id", activeSchedule.id)
        .order("round_number")
        .order("table_number")
        .order("seat_number")
      if (seatsError) return sendDatabaseError(res, seatsError)
      if (!activeSeats?.length) return res.status(409).json({ error: "The active schedule has no seats", code: "INCOMPLETE_ACTIVE_SCHEDULE" })

      const existingIds = new Set(activeSeats.map(seat => seat.attendee_id))
      if (existingIds.has(addedAttendee.id)) {
        const bundle = await loadEventBundle({ eventId })
        const placementTables = bundle?.seats
          .filter(seat => seat.attendee_id === addedAttendee.id)
          .map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })) || []
        return res.status(200).json({
          ...bundle,
          added_attendee_id: addedAttendee.id,
          added_attendee_number: addedAttendee.attendee_number,
          added_gender: addedAttendee.gender,
          schedule_change: "extended",
          placement_tables: placementTables,
        })
      }

      const newcomers = (attendeeResult.data || []).filter(attendee => !existingIds.has(attendee.id))
      try {
        const extension = extendTheRoomSchedule({
          participants: attendeeResult.data || [],
          existingSeats: activeSeats,
          newAttendeeIds: newcomers.map(attendee => attendee.id),
          tableCount: eventResult.data.table_count,
          roundCount: eventResult.data.round_count,
          activeRound: eventResult.data.active_round,
        })
        const { error: replaceError } = await supabase.rpc("replace_the_room_schedule_if_current", {
          p_event_id: eventId,
          p_expected_schedule_run_id: activeSchedule.id,
          p_expected_active_round: eventResult.data.active_round,
          p_seed: `the-room-event-${eventResult.data.event_number}-walk-ins-${(attendeeResult.data || []).length}`,
          p_algorithm_version: INCREMENTAL_ALGORITHM_VERSION,
          p_metrics: extension.metrics,
          p_rows: extension.rows,
        })
        if (replaceError?.code === "40001") continue
        if (replaceError) return sendDatabaseError(res, replaceError)
        const placement = extension.placements?.find(item => item.attendeeId === addedAttendee.id)
        return res.status(200).json({
          ...(await loadEventBundle({ eventId })),
          added_attendee_id: addedAttendee.id,
          added_attendee_number: addedAttendee.attendee_number,
          added_gender: addedAttendee.gender,
          schedule_change: "extended",
          placement_reason: placement?.reason || "gender_balance_first",
          placement_tables: placement?.tables || [],
          placement_metrics: extension.metrics,
        })
      } catch (extensionError) {
        if (extensionError instanceof TheRoomExtensionError && extensionError.code === "UNSEATED_PARTICIPANT") continue
        if (extensionError instanceof TheRoomExtensionError) {
          return res.status(422).json({ error: extensionError.message, code: extensionError.code, details: extensionError.details })
        }
        return sendDatabaseError(res, extensionError)
      }
    }

    const latest = await loadEventBundle({ eventId })
    if (latest?.seats.some(seat => seat.attendee_id === addedAttendee.id)) {
      return res.status(200).json({
        ...latest,
        added_attendee_id: addedAttendee.id,
        added_attendee_number: addedAttendee.attendee_number,
        added_gender: addedAttendee.gender,
        schedule_change: "extended",
        placement_tables: latest.seats.filter(seat => seat.attendee_id === addedAttendee.id).map(seat => ({ roundNumber: seat.round_number, tableNumber: seat.table_number })),
      })
    }
    return res.status(409).json({ error: "The guest was saved, but the schedule is changing on another device. Refresh once.", code: "SCHEDULE_CHANGED_RETRY" })
  }

  if (action === "set-attendee-gender") {
    const eventId = req.body?.event_id
    const attendeeId = req.body?.attendee_id
    const gender = String(req.body?.gender || "")
    if (!eventId || !attendeeId || !ROSTER_GENDERS.has(gender)) return res.status(400).json({ error: "A valid guest and gender are required" })
    const { data, error } = await supabase
      .from("the_room_attendees")
      .update({ gender, updated_at: new Date().toISOString() })
      .eq("id", attendeeId)
      .eq("event_id", eventId)
      .select("id")
      .maybeSingle()
    if (error) return sendDatabaseError(res, error)
    if (!data) return res.status(404).json({ error: "The Room guest was not found" })
    return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "unchanged" })
  }

  if (action === "move-attendee") {
    const eventId = req.body?.event_id
    const attendeeId = req.body?.attendee_id
    const roundNumber = Number(req.body?.round_number)
    const targetTable = Number(req.body?.table_number)
    const force = req.body?.force === true
    if (!eventId || !attendeeId) return res.status(400).json({ error: "A valid event and guest are required" })

    const [eventResult, scheduleResult, attendeeResult] = await Promise.all([
      supabase.from("the_room_events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle(),
      supabase.from("the_room_schedule_runs").select("id").eq("event_id", eventId).eq("is_active", true).maybeSingle(),
      supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", eventId).order("attendee_number"),
    ])
    if (eventResult.error) return sendDatabaseError(res, eventResult.error)
    if (scheduleResult.error) return sendDatabaseError(res, scheduleResult.error)
    if (attendeeResult.error) return sendDatabaseError(res, attendeeResult.error)
    if (!eventResult.data || !scheduleResult.data) return res.status(404).json({ error: "The active schedule was not found" })

    const { data: seats, error: seatsError } = await supabase
      .from("the_room_seats")
      .select("id,round_number,table_number,seat_number,attendee_id")
      .eq("schedule_run_id", scheduleResult.data.id)
      .order("round_number")
      .order("table_number")
      .order("seat_number")
    if (seatsError) return sendDatabaseError(res, seatsError)

    try {
      const move = analyzeTheRoomMove({
        seats: seats || [],
        attendees: attendeeResult.data || [],
        attendeeId,
        roundNumber,
        targetTable,
        tableCount: eventResult.data.table_count,
      })
      if (move.repeatedWithIds.length && !force) {
        return res.status(409).json({
          error: "This move repeats a prior meeting",
          code: "MOVE_REPEATS_MEETING",
          details: { repeated_attendee_numbers: move.repeatedWithNumbers },
        })
      }
      // A move must rotate the schedule ID, just like a walk-in. Otherwise a
      // walk-in prepared before this move can overwrite it with stale seats.
      const movedSeats = seats.map(seat => seat.id === move.seatId
        ? { ...seat, table_number: move.toTable, seat_number: move.nextSeatNumber }
        : seat)
      const replacement = extendTheRoomSchedule({
        participants: attendeeResult.data.filter(person => person.included_in_schedule
          && ["registered", "confirmed"].includes(person.attendance_status)),
        existingSeats: movedSeats,
        newAttendeeIds: [],
        tableCount: eventResult.data.table_count,
        roundCount: eventResult.data.round_count,
        activeRound: eventResult.data.active_round,
      })
      const { error: updateError } = await supabase.rpc("replace_the_room_schedule_if_current", {
        p_event_id: eventId,
        p_expected_schedule_run_id: scheduleResult.data.id,
        p_expected_active_round: eventResult.data.active_round,
        p_seed: `the-room-event-${eventResult.data.event_number}-manual-move`,
        p_algorithm_version: "the-room-manual-move-v1",
        p_metrics: replacement.metrics,
        p_rows: replacement.rows,
      })
      if (updateError) return sendDatabaseError(res, updateError)
      return res.status(200).json({
        ...(await loadEventBundle({ eventId })),
        moved_attendee_id: attendeeId,
        moved_round_number: move.roundNumber,
        moved_from_table: move.fromTable,
        moved_to_table: move.toTable,
        repeated_meeting_forced: move.repeatedWithIds.length > 0,
      })
    } catch (moveError) {
      if (moveError instanceof TheRoomMoveError) {
        return res.status(422).json({ error: moveError.message, code: moveError.code, details: moveError.details })
      }
      throw moveError
    }
  }

  return res.status(400).json({ error: "Unknown The Room action" })
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  const action = String(req.body?.action || "")
  const liveSyncRequest = action === "get-event"
  if (!enforceTheRoomRateLimit(req, res, {
    limit: liveSyncRequest ? 300 : 90,
    windowMs: 60_000,
    scope: liveSyncRequest ? "live-sync" : "api",
  })) return
  if (action === "login" && !enforceTheRoomRateLimit(req, res, { limit: 8, windowMs: 15 * 60_000, scope: "login" })) return
  try {
    return await handleAction(req, res, action)
  } catch (error) {
    if (["40001", "55000", "22023"].includes(error?.code)) return sendDatabaseError(res, error)
    if (error instanceof TheRoomScheduleError || error instanceof TheRoomExtensionError || error instanceof TheRoomFixedRouteError) {
      return res.status(422).json({ error: error.message, code: error.code, details: error.details })
    }
    if (error instanceof TheRoomInputError) return res.status(400).json({ error: error.message })
    console.error("The Room API error:", error?.message || "unknown error")
    return res.status(500).json({ error: "The Room request could not be completed" })
  }
}
