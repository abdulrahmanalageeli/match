import { supabaseAdmin } from "../server/security/supabase-admin.mjs"
import { generateTheRoomSchedule, TheRoomScheduleError } from "../server/the-room/scheduler.mjs"
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
const ATTENDEE_FIELDS = "id,event_id,attendee_number,full_name,phone_e164,gender,attendance_status,included_in_schedule,checked_in,payment_status,amount_due,amount_paid,paid_at,notes,created_at,updated_at"

class TheRoomInputError extends Error {}

function cleanText(value, maxLength, fallback = null) {
  const text = String(value ?? "").trim()
  return text ? text.slice(0, maxLength) : fallback
}

function numberInRange(value, minimum, maximum, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback
}

function normalizeDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new TheRoomInputError("Use a valid event date and time")
  return date.toISOString()
}

function normalizePhone(value) {
  const raw = String(value || "").replace(/[^\d+]/g, "")
  if (!raw) return null
  const normalized = raw.startsWith("05") ? `+966${raw.slice(1)}` : raw.startsWith("966") ? `+${raw}` : raw
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new TheRoomInputError("Use an international phone number, for example +9665XXXXXXXX")
  return normalized
}

function sendDatabaseError(res, error) {
  const conflict = error?.code === "23505"
  const message = conflict ? "That event number, attendee number, or phone already exists in this event" : (error?.message || "Database request failed")
  return res.status(conflict ? 409 : 500).json({ error: message })
}

async function loadEventBundle({ eventId, eventNumber }) {
  let eventQuery = supabase.from("the_room_events").select(EVENT_FIELDS)
  eventQuery = eventId ? eventQuery.eq("id", eventId) : eventQuery.eq("event_number", Number(eventNumber))
  const { data: event, error: eventError } = await eventQuery.maybeSingle()
  if (eventError) throw eventError
  if (!event) return null

  const [{ data: attendees, error: attendeesError }, { data: schedule, error: scheduleError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabase.from("the_room_attendees").select(ATTENDEE_FIELDS).eq("event_id", event.id).order("attendee_number", { ascending: true }),
    supabase.from("the_room_schedule_runs").select("*").eq("event_id", event.id).eq("is_active", true).maybeSingle(),
    supabase.from("the_room_payment_ledger").select("id,event_id,attendee_id,payment_status,amount_paid,note,recorded_at").eq("event_id", event.id).order("recorded_at", { ascending: false }).limit(100),
  ])
  if (attendeesError) throw attendeesError
  if (scheduleError) throw scheduleError
  if (paymentsError) throw paymentsError

  let seats = []
  if (schedule?.id) {
    const { data, error } = await supabase.from("the_room_seats").select("id,schedule_run_id,event_id,round_number,table_number,seat_number,attendee_id").eq("schedule_run_id", schedule.id).order("round_number").order("table_number").order("seat_number")
    if (error) throw error
    seats = data || []
  }

  return { event, attendees: attendees || [], schedule: schedule || null, seats, payments: payments || [] }
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

  if (action === "create-event") {
    const eventNumber = numberInRange(req.body?.event_number, 1, Number.MAX_SAFE_INTEGER)
    if (!Number.isInteger(eventNumber)) return res.status(400).json({ error: "A positive whole event number is required" })
    const payload = {
      event_number: eventNumber,
      name: cleanText(req.body?.name, 120, "The Room"),
      starts_at: normalizeDate(req.body?.starts_at),
      venue: cleanText(req.body?.venue, 240),
      minimum_attendees: Math.round(numberInRange(req.body?.minimum_attendees, 2, 500, 20)),
      table_count: Math.round(numberInRange(req.body?.table_count, 1, 50, 5)),
      round_count: Math.round(numberInRange(req.body?.round_count, 1, 20, 3)),
      ticket_price: numberInRange(req.body?.ticket_price, 0, 99999999, 0),
      currency: cleanText(req.body?.currency, 3, "SAR")?.toUpperCase(),
      status: "draft",
    }
    const { data, error } = await supabase.from("the_room_events").insert(payload).select(EVENT_FIELDS).single()
    if (error) return sendDatabaseError(res, error)
    return res.status(201).json(await loadEventBundle({ eventId: data.id }))
  }

  if (action === "update-event") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const { data: existingEvent, error: existingEventError } = await supabase
      .from("the_room_events")
      .select("minimum_attendees,table_count,round_count")
      .eq("id", eventId)
      .maybeSingle()
    if (existingEventError) return sendDatabaseError(res, existingEventError)
    if (!existingEvent) return res.status(404).json({ error: "The Room event was not found" })
    const allowedStatuses = new Set(["draft", "registration", "ready", "live", "completed", "cancelled"])
    const payload = {
      name: cleanText(req.body?.name, 120, "The Room"),
      starts_at: normalizeDate(req.body?.starts_at),
      venue: cleanText(req.body?.venue, 240),
      minimum_attendees: Math.round(numberInRange(req.body?.minimum_attendees, 2, 500, 20)),
      table_count: Math.round(numberInRange(req.body?.table_count, 1, 50, 5)),
      round_count: Math.round(numberInRange(req.body?.round_count, 1, 20, 3)),
      ticket_price: numberInRange(req.body?.ticket_price, 0, 99999999, 0),
      currency: cleanText(req.body?.currency, 3, "SAR")?.toUpperCase(),
      status: allowedStatuses.has(req.body?.status) ? req.body.status : "draft",
      notes: cleanText(req.body?.notes, 4000),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from("the_room_events").update(payload).eq("id", eventId)
    if (error) return sendDatabaseError(res, error)
    const scheduleShapeChanged = ["minimum_attendees", "table_count", "round_count"]
      .some(key => Number(existingEvent[key]) !== Number(payload[key]))
    if (scheduleShapeChanged) await invalidateSchedule(eventId)
    return res.status(200).json(await loadEventBundle({ eventId }))
  }

  if (action === "save-attendee") {
    const eventId = req.body?.event_id
    if (!eventId) return res.status(400).json({ error: "Event ID is required" })
    const attendeeId = req.body?.attendee_id || null
    const genders = new Set(["male", "female", "nonbinary", "unspecified"])
    const attendanceStatuses = new Set(["registered", "confirmed", "waitlist", "cancelled"])
    const payload = {
      full_name: cleanText(req.body?.full_name, 160),
      phone_e164: normalizePhone(req.body?.phone_e164),
      gender: genders.has(req.body?.gender) ? req.body.gender : "unspecified",
      attendance_status: attendanceStatuses.has(req.body?.attendance_status) ? req.body.attendance_status : "registered",
      included_in_schedule: req.body?.included_in_schedule !== false,
      checked_in: req.body?.checked_in === true,
      amount_due: numberInRange(req.body?.amount_due, 0, 99999999, 0),
      notes: cleanText(req.body?.notes, 2000),
      updated_at: new Date().toISOString(),
    }
    if (!payload.full_name) return res.status(400).json({ error: "Guest name is required" })

    let error
    const isScheduled = attendee => attendee.included_in_schedule
      && ["registered", "confirmed"].includes(attendee.attendance_status)
    let scheduleMembershipChanged = !attendeeId && isScheduled(payload)
    if (attendeeId) {
      const { data: existingAttendee, error: existingAttendeeError } = await supabase
        .from("the_room_attendees")
        .select("gender,attendance_status,included_in_schedule")
        .eq("id", attendeeId)
        .eq("event_id", eventId)
        .maybeSingle()
      if (existingAttendeeError) return sendDatabaseError(res, existingAttendeeError)
      if (!existingAttendee) return res.status(404).json({ error: "The Room guest was not found" })
      const wasScheduled = isScheduled(existingAttendee)
      const willBeScheduled = isScheduled(payload)
      scheduleMembershipChanged = wasScheduled !== willBeScheduled
        || (wasScheduled && willBeScheduled && existingAttendee.gender !== payload.gender)
      ;({ error } = await supabase.from("the_room_attendees").update(payload).eq("id", attendeeId).eq("event_id", eventId))
    } else {
      const { data: last } = await supabase.from("the_room_attendees").select("attendee_number").eq("event_id", eventId).order("attendee_number", { ascending: false }).limit(1).maybeSingle()
      ;({ error } = await supabase.from("the_room_attendees").insert({ ...payload, event_id: eventId, attendee_number: Number(last?.attendee_number || 0) + 1 }))
    }
    if (error) return sendDatabaseError(res, error)
    if (scheduleMembershipChanged) await invalidateSchedule(eventId)
    return res.status(200).json(await loadEventBundle({ eventId }))
  }

  if (action === "record-payment") {
    const eventId = req.body?.event_id
    const attendeeId = req.body?.attendee_id
    const amount = numberInRange(req.body?.amount_paid, 0, 99999999, 0)
    const statuses = new Set(["pending", "partial", "paid", "waived", "refunded"])
    if (!eventId || !attendeeId || !statuses.has(req.body?.payment_status)) return res.status(400).json({ error: "A valid attendee and payment status are required" })
    const { error } = await supabase.rpc("record_the_room_payment", {
      p_event_id: eventId,
      p_attendee_id: attendeeId,
      p_payment_status: req.body.payment_status,
      p_amount_paid: amount,
      p_note: cleanText(req.body?.note, 1000),
    })
    if (error) return sendDatabaseError(res, error)
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
