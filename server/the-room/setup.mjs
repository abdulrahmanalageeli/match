import { randomUUID } from "node:crypto"
import { generateTheRoomSchedule } from "./scheduler.mjs"
import { extendTheRoomSchedule } from "./incremental-scheduler.mjs"
import { buildNumberedRosterRows, rosterGenderCounts } from "./numbered-roster.mjs"

export const FULL_SCHEDULE_ALGORITHM_VERSION = "the-room-social-table-v3-gender-fair"
export const INCREMENTAL_ALGORITHM_VERSION = "the-room-social-table-v2-incremental"

// Prepare everything without changing the database. The caller commits the
// settings, roster additions and validated schedule in one transaction.
export function prepareTheRoomSetup(bundle, settings, { regenerate = false } = {}) {
  const { event, attendees, schedule, seats } = bundle
  const participants = attendees.filter(person => person.included_in_schedule
    && ["registered", "confirmed"].includes(person.attendance_status))
  const counts = rosterGenderCounts(participants)
  const additions = buildNumberedRosterRows({
    eventId: event.id,
    count: Math.max(0, settings.minimum_attendees - participants.length),
    startNumber: Math.max(0, ...attendees.map(person => Number(person.attendee_number))) + 1,
    maleCount: counts.male,
    femaleCount: counts.female,
  }).map(person => ({ ...person, id: randomUUID() }))
  const nextParticipants = [...participants, ...additions]
  const rebuild = regenerate || !schedule || settings.table_count !== event.table_count
    || settings.round_count !== event.round_count
  const activeRound = rebuild ? 1 : event.active_round
  const seed = `the-room-event-${event.event_number}`
  let rows, metrics
  let scheduleChange = "regenerated"
  if (rebuild) {
    const result = generateTheRoomSchedule({
      participants: nextParticipants,
      tableCount: settings.table_count,
      roundCount: settings.round_count,
      minimumAttendees: settings.minimum_attendees,
      seed,
    })
    rows = result.rounds.flatMap(round => round.tables.flatMap(table => table.attendeeIds.map((id, index) => ({
      attendee_id: id, round_number: round.roundNumber, table_number: table.tableNumber, seat_number: index + 1,
    }))))
    metrics = result.metrics
  } else {
    const seatedIds = new Set(seats.map(seat => seat.attendee_id))
    const newcomerIds = nextParticipants.filter(person => !seatedIds.has(person.id)).map(person => person.id)
    const result = extendTheRoomSchedule({
      participants: nextParticipants, existingSeats: seats, newAttendeeIds: newcomerIds,
      tableCount: settings.table_count, roundCount: settings.round_count, activeRound,
    })
    rows = result.rows
    metrics = result.metrics
    scheduleChange = newcomerIds.length ? "extended" : "unchanged"
  }
  return {
    scheduleChange,
    addedGuestCount: additions.length,
    rpcArgs: {
      p_event_id: event.id,
      p_expected_event_updated_at: event.updated_at,
      p_expected_schedule_run_id: schedule?.id || null,
      p_expected_active_round: event.active_round,
      p_minimum_attendees: settings.minimum_attendees,
      p_table_count: settings.table_count,
      p_round_count: settings.round_count,
      p_active_round: activeRound,
      p_new_attendees: additions,
      p_seed: seed,
      p_algorithm_version: rebuild ? FULL_SCHEDULE_ALGORITHM_VERSION : INCREMENTAL_ALGORITHM_VERSION,
      p_metrics: metrics,
      p_rows: rows,
    },
  }
}
