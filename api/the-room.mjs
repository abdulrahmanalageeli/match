import { supabaseAdmin } from "../server/security/supabase-admin.mjs"
import { generateTheRoomSchedule, TheRoomScheduleError } from "../server/the-room/scheduler.mjs"
import { extendTheRoomSchedule, TheRoomExtensionError } from "../server/the-room/incremental-scheduler.mjs"
import {
  buildNumberedRosterRows,
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
const ALGORITHM_VERSION = "the-room-social-table-v1"
const EVENT_FIELDS = "id,event_number,name,starts_at,venue,status,minimum_attendees,table_count,round_count,ticket_price,currency,notes,created_at,updated_at"
const ATTENDEE_FIELDS = "id,event_id,attendee_number,full_name,gender,attendance_status,included_in_schedule,checked_in,created_at,updated_at"

class TheRoomInputError extends Error {}

function numberInRange(value, minimum, maximum, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback
}

function evenMinimum(value, fallback = 20) {
  const minimum = Math.round(numberInRange(value, 2, 500, fallback))
  if (minimum % 2 !== 0) throw new TheRoomInputError("Minimum guests must be an even number so the starting roster is half men and half women")
  return minimum
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

  if (action === "reset-event") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    await invalidateSchedule(eventId)
    const { data, error } = await supabase
      .from("the_room_events")
      .update({ status: "draft", updated_at: new Date().toISOString() })
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

  if (action === "create-event") {
    const eventNumber = numberInRange(req.body?.event_number, 1, Number.MAX_SAFE_INTEGER)
    if (!Number.isInteger(eventNumber)) return res.status(400).json({ error: "A positive whole event number is required" })
    const minimumAttendees = evenMinimum(req.body?.minimum_attendees)
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
      await ensureMinimumRoster(data, { invalidate: false })
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
      minimum_attendees: evenMinimum(req.body?.minimum_attendees, existingEvent.minimum_attendees),
      table_count: Math.round(numberInRange(req.body?.table_count, 1, 50, existingEvent.table_count)),
      round_count: Math.round(numberInRange(req.body?.round_count, 1, 20, existingEvent.round_count)),
      updated_at: new Date().toISOString(),
    }
    const dimensionsChanged = Number(existingEvent.table_count) !== Number(payload.table_count)
      || Number(existingEvent.round_count) !== Number(payload.round_count)
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
        })
        const { error: replaceError } = await supabase.rpc("replace_the_room_schedule", {
          p_event_id: eventId,
          p_seed: `the-room-event-${existingEvent.event_number}-extended-${(attendees || []).length}`,
          p_algorithm_version: `${ALGORITHM_VERSION}-incremental`,
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
    const { data: last, error: lastError } = await supabase
      .from("the_room_attendees")
      .select("attendee_number")
      .eq("event_id", eventId)
      .order("attendee_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastError) return sendDatabaseError(res, lastError)
    const attendeeNumber = Number(last?.attendee_number || 0) + 1
    const { error } = await supabase.from("the_room_attendees").insert({
      event_id: eventId,
      attendee_number: attendeeNumber,
      full_name: `Guest ${attendeeNumber}`,
      gender,
      attendance_status: "confirmed",
      included_in_schedule: true,
      amount_due: 0,
    })
    if (error) return sendDatabaseError(res, error)
    await invalidateSchedule(eventId)
    return res.status(200).json(await loadEventBundle({ eventId }))
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
    await invalidateSchedule(eventId)
    return res.status(200).json(await loadEventBundle({ eventId }))
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
        p_algorithm_version: ALGORITHM_VERSION,
        p_metrics: schedule.metrics,
        p_rows: rows,
      })
      if (error) return sendDatabaseError(res, error)
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
  if (!enforceTheRoomRateLimit(req, res)) return
  if (action === "login" && !enforceTheRoomRateLimit(req, res, { limit: 8, windowMs: 15 * 60_000, scope: "login" })) return
  try {
    return await handleAction(req, res, action)
  } catch (error) {
    if (error instanceof TheRoomInputError) return res.status(400).json({ error: error.message })
    console.error("The Room API error:", error?.message || "unknown error")
    return res.status(500).json({ error: "The Room request could not be completed" })
  }
}
