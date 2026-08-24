import { supabaseAdmin } from "../server/security/supabase-admin.mjs"
import { generateTheRoomSchedule, TheRoomScheduleError } from "../server/the-room/scheduler.mjs"
import { extendTheRoomSchedule, TheRoomExtensionError } from "../server/the-room/incremental-scheduler.mjs"
import { analyzeTheRoomMove, TheRoomMoveError } from "../server/the-room/manual-move.mjs"
import { normalizeTheRoomActiveRound, resolveTheRoomRoundAdvance, TheRoomLiveStateError } from "../server/the-room/live-state.mjs"
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
const FULL_SCHEDULE_ALGORITHM_VERSION = "the-room-social-table-v3-gender-fair"
const INCREMENTAL_ALGORITHM_VERSION = "the-room-social-table-v2-incremental"
const EVENT_FIELDS = "id,event_number,name,starts_at,venue,status,minimum_attendees,table_count,round_count,active_round,ticket_price,currency,notes,created_at,updated_at"
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
  const conflict = error?.code === "23505"
  const message = conflict ? "That event number or guest number already exists" : (error?.message || "Database request failed")
  return res.status(conflict ? 409 : 500).json({ error: message })
}

async function ensureMinimumRoster(event, { invalidate = true } = {}) {
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
  if (invalidate) await invalidateSchedule(event.id)
  return missing
}

async function loadEventBundle({ eventId, eventNumber }) {
  let eventQuery = supabase.from("the_room_events").select(EVENT_FIELDS)
  eventQuery = eventId ? eventQuery.eq("id", eventId) : eventQuery.eq("event_number", Number(eventNumber))
  const { data: event, error: eventError } = await eventQuery.maybeSingle()
  if (eventError) throw eventError
  if (!event) return null

  await ensureMinimumRoster(event)

  const [{ data: attendees, error: attendeesError }, { data: schedule, error: scheduleError }] = await Promise.all([
    supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", event.id).order("attendee_number", { ascending: true }),
    supabase.from("the_room_schedule_runs").select("*").eq("event_id", event.id).eq("is_active", true).maybeSingle(),
  ])
  if (attendeesError) throw attendeesError
  if (scheduleError) throw scheduleError

  let seats = []
  if (schedule?.id) {
    const { data, error } = await supabase.from("the_room_seats").select("id,schedule_run_id,event_id,round_number,table_number,seat_number,attendee_id").eq("schedule_run_id", schedule.id).order("round_number").order("table_number").order("seat_number")
    if (error) throw error
    seats = data || []
  }

  return { event, attendees: attendees || [], schedule: schedule || null, seats }
}

async function invalidateSchedule(eventId) {
  const { error } = await supabase.from("the_room_schedule_runs").update({ is_active: false }).eq("event_id", eventId).eq("is_active", true)
  if (error) throw error
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

  if (action === "list-events") {
    const { data, error } = await supabase.from("the_room_events").select(EVENT_FIELDS).order("event_number", { ascending: false })
    if (error) return sendDatabaseError(res, error)
    return res.status(200).json({ events: data || [] })
  }

  if (action === "get-event") {
    const bundle = await loadEventBundle({ eventId: req.body?.event_id, eventNumber: req.body?.event_number })
    return bundle ? res.status(200).json(bundle) : res.status(404).json({ error: "The Room event was not found" })
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
    // Seats also reference attendees with ON DELETE RESTRICT, so remove them
    // first before the event cascades through attendees and schedule runs.
    const { error: seatsError } = await supabase
      .from("the_room_seats")
      .delete()
      .eq("event_id", eventId)
    if (seatsError) return sendDatabaseError(res, seatsError)
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: nextAttendee, error: nextError } = await supabase
        .from("the_room_attendees")
        .select("id,attendee_number")
        .eq("event_id", eventId)
        .eq("gender", gender)
        .eq("included_in_schedule", true)
        .in("attendance_status", ["registered", "confirmed"])
        .eq("checked_in", false)
        .order("attendee_number", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (nextError) return sendDatabaseError(res, nextError)
      if (!nextAttendee) {
        return res.status(409).json({ error: "All badges for this group have already been assigned", code: "NO_BADGES_LEFT" })
      }

      const { data: claimed, error: claimError } = await supabase
        .from("the_room_attendees")
        .update({ checked_in: true, updated_at: new Date().toISOString() })
        .eq("id", nextAttendee.id)
        .eq("event_id", eventId)
        .eq("checked_in", false)
        .select("id,attendee_number,gender")
        .maybeSingle()
      if (claimError) return sendDatabaseError(res, claimError)
      if (!claimed) continue

      return res.status(200).json({
        ...(await loadEventBundle({ eventId })),
        assigned_attendee_number: claimed.attendee_number,
        assigned_gender: claimed.gender,
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
        await ensureMinimumRoster(data, { invalidate: false })
      }
      return res.status(201).json(await loadEventBundle({ eventId: data.id }))
    } catch (rosterError) {
      await supabase.from("the_room_events").delete().eq("id", data.id)
      throw rosterError
    }
  }

  if (action === "update-event") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { data: existingEvent, error: existingEventError } = await supabase
      .from("the_room_events")
      .select(EVENT_FIELDS)
      .eq("id", eventId)
      .maybeSingle()
    if (existingEventError) return sendDatabaseError(res, existingEventError)
    if (!existingEvent) return res.status(404).json({ error: "The Room event was not found" })
    const payload = {
      minimum_attendees: attendeeMinimum(req.body?.minimum_attendees, existingEvent.minimum_attendees),
      table_count: Math.round(numberInRange(req.body?.table_count, 1, 50, existingEvent.table_count)),
      round_count: Math.round(numberInRange(req.body?.round_count, 1, 20, existingEvent.round_count)),
      updated_at: new Date().toISOString(),
    }
    const dimensionsChanged = Number(existingEvent.table_count) !== Number(payload.table_count)
      || Number(existingEvent.round_count) !== Number(payload.round_count)
    payload.active_round = dimensionsChanged
      ? 1
      : Math.min(Number(existingEvent.active_round) || 1, payload.round_count)
    const guestTargetIncreased = Number(payload.minimum_attendees) > Number(existingEvent.minimum_attendees)
    let activeSchedule = null
    let activeSeats = []
    if (guestTargetIncreased && !dimensionsChanged) {
      const { data, error } = await supabase.from("the_room_schedule_runs").select("*").eq("event_id", eventId).eq("is_active", true).maybeSingle()
      if (error) return sendDatabaseError(res, error)
      activeSchedule = data || null
      if (activeSchedule?.id) {
        const { data: seats, error: seatsError } = await supabase
          .from("the_room_seats")
          .select("round_number,table_number,seat_number,attendee_id")
          .eq("schedule_run_id", activeSchedule.id)
          .order("round_number")
          .order("table_number")
          .order("seat_number")
        if (seatsError) return sendDatabaseError(res, seatsError)
        activeSeats = seats || []
      }
    }
    const { error } = await supabase.from("the_room_events").update(payload).eq("id", eventId)
    if (error) return sendDatabaseError(res, error)
    const updatedEvent = { ...existingEvent, ...payload }
    const addedGuestCount = await ensureMinimumRoster(updatedEvent, { invalidate: false })

    if (dimensionsChanged) {
      await invalidateSchedule(eventId)
      return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "reset", added_guest_count: addedGuestCount })
    }

    if (addedGuestCount > 0 && activeSchedule && activeSeats.length) {
      const { data: attendees, error: attendeeError } = await supabase
        .from("the_room_attendees")
        .select(ATTENDEE_FIELDS)
        .eq("event_id", eventId)
        .eq("included_in_schedule", true)
        .in("attendance_status", ["registered", "confirmed"])
        .order("attendee_number")
      if (attendeeError) return sendDatabaseError(res, attendeeError)
      const seatedIds = new Set(activeSeats.map(seat => seat.attendee_id))
      const newcomerIds = (attendees || []).filter(attendee => !seatedIds.has(attendee.id)).map(attendee => attendee.id)
      try {
        const extension = extendTheRoomSchedule({
          participants: attendees || [],
          existingSeats: activeSeats,
          newAttendeeIds: newcomerIds,
          tableCount: payload.table_count,
          roundCount: payload.round_count,
          activeRound: payload.active_round,
        })
        const { error: replaceError } = await supabase.rpc("replace_the_room_schedule", {
          p_event_id: eventId,
          p_seed: `the-room-event-${existingEvent.event_number}-extended-${(attendees || []).length}`,
          p_algorithm_version: INCREMENTAL_ALGORITHM_VERSION,
          p_metrics: extension.metrics,
          p_rows: extension.rows,
        })
        if (replaceError) return sendDatabaseError(res, replaceError)
        return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "extended", added_guest_count: newcomerIds.length })
      } catch (extensionError) {
        await invalidateSchedule(eventId)
        if (extensionError instanceof TheRoomExtensionError) {
          return res.status(422).json({ error: extensionError.message, code: extensionError.code, details: extensionError.details })
        }
        throw extensionError
      }
    }

    return res.status(200).json({ ...(await loadEventBundle({ eventId })), schedule_change: "unchanged", added_guest_count: addedGuestCount })
  }

  if (action === "add-attendee") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
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
      const { data: updatedSeat, error: updateError } = await supabase
        .from("the_room_seats")
        .update({ table_number: move.toTable, seat_number: move.nextSeatNumber })
        .eq("id", move.seatId)
        .eq("schedule_run_id", scheduleResult.data.id)
        .select("id")
        .maybeSingle()
      if (updateError) return sendDatabaseError(res, updateError)
      if (!updatedSeat) return res.status(404).json({ error: "The Room seat was not found" })
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

  if (action === "generate-schedule") {
    const eventId = req.body?.event_id
    const { data: event, error: eventError } = await supabase.from("the_room_events").select(EVENT_FIELDS).eq("id", eventId).maybeSingle()
    if (eventError) return sendDatabaseError(res, eventError)
    if (!event) return res.status(404).json({ error: "The Room event was not found" })
    const { data: attendees, error: attendeeError } = await supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", eventId).eq("included_in_schedule", true).in("attendance_status", ["registered", "confirmed"]).order("attendee_number")
    if (attendeeError) return sendDatabaseError(res, attendeeError)

    try {
      const schedule = generateTheRoomSchedule({
        participants: (attendees || []).map(attendee => ({ id: attendee.id, name: attendee.full_name, gender: attendee.gender })),
        tableCount: event.table_count,
        roundCount: event.round_count,
        minimumAttendees: event.minimum_attendees,
        seed: `the-room-event-${event.event_number}`,
      })
      const rows = schedule.rounds.flatMap(round => round.tables.flatMap(table => table.attendeeIds.map((attendeeId, seatIndex) => ({
        attendee_id: attendeeId,
        round_number: round.roundNumber,
        table_number: table.tableNumber,
        seat_number: seatIndex + 1,
      }))))
      const { error } = await supabase.rpc("replace_the_room_schedule", {
        p_event_id: eventId,
        p_seed: `the-room-event-${event.event_number}`,
        p_algorithm_version: FULL_SCHEDULE_ALGORITHM_VERSION,
        p_metrics: schedule.metrics,
        p_rows: rows,
      })
      if (error) return sendDatabaseError(res, error)
      const { error: roundError } = await supabase
        .from("the_room_events")
        .update({ active_round: 1, updated_at: new Date().toISOString() })
        .eq("id", eventId)
      if (roundError) return sendDatabaseError(res, roundError)
      return res.status(200).json(await loadEventBundle({ eventId }))
    } catch (error) {
      if (error instanceof TheRoomScheduleError) return res.status(422).json({ error: error.message, code: error.code, details: error.details })
      throw error
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
    if (error instanceof TheRoomInputError) return res.status(400).json({ error: error.message })
    console.error("The Room API error:", error?.message || "unknown error")
    return res.status(500).json({ error: "The Room request could not be completed" })
  }
}
