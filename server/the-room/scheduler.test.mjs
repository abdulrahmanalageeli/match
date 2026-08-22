import test from "node:test"
import assert from "node:assert/strict"
import { generateTheRoomSchedule, TheRoomScheduleError, validateTheRoomSchedule } from "./scheduler.mjs"

function attendees(count, femaleCount = Math.floor(count / 2)) {
  return Array.from({ length: count }, (_, index) => ({
    id: `guest-${index + 1}`,
    name: `Guest ${index + 1}`,
    gender: index < femaleCount ? "female" : "male",
  }))
}

test("creates repeat-free rounds with every attendee seated exactly once", () => {
  const schedule = generateTheRoomSchedule({
    participants: attendees(24),
    tableCount: 6,
    roundCount: 3,
    minimumAttendees: 20,
    seed: "room-12",
  })

  assert.equal(schedule.rounds.length, 3)
  assert.equal(schedule.metrics.repeatPairCount, 0)
  assert.equal(validateTheRoomSchedule(schedule).valid, true)
  for (const round of schedule.rounds) {
    assert.equal(new Set(round.tables.flatMap(table => table.attendeeIds)).size, 24)
    assert.deepEqual(round.tables.map(table => table.attendeeIds.length), [4, 4, 4, 4, 4, 4])
  }
})

test("balances each gender across tables even when totals are uneven", () => {
  const schedule = generateTheRoomSchedule({
    participants: attendees(25, 13),
    tableCount: 5,
    roundCount: 2,
    seed: "room-balanced",
  })

  for (const round of schedule.rounds) {
    for (const gender of ["female", "male"]) {
      const counts = round.tables.map(table => table.genderCounts[gender] || 0)
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
    }
  }
})

test("is deterministic for the same event seed", () => {
  const input = { participants: attendees(20, 9), tableCount: 5, roundCount: 2, seed: "event-204" }
  const first = generateTheRoomSchedule(input)
  const second = generateTheRoomSchedule(input)
  assert.deepEqual(first.rounds, second.rounds)
})

test("supports nonbinary and unspecified attendees without weakening repeat checks", () => {
  const people = attendees(20, 8)
  people[16].gender = "nonbinary"
  people[17].gender = "nonbinary"
  people[18].gender = "unspecified"
  people[19].gender = "unspecified"
  const schedule = generateTheRoomSchedule({ participants: people, tableCount: 5, roundCount: 2, seed: 88 })
  assert.equal(validateTheRoomSchedule(schedule).valid, true)
  assert.ok(schedule.metrics.genderSpreadMax <= 1)
})

test("rejects configurations that mathematically require repeat meetings", () => {
  assert.throws(
    () => generateTheRoomSchedule({ participants: attendees(8), tableCount: 2, roundCount: 3 }),
    error => error instanceof TheRoomScheduleError && error.code === "TABLE_GEOMETRY_IMPOSSIBLE",
  )
})

test("enforces the configured minimum attendance", () => {
  assert.throws(
    () => generateTheRoomSchedule({ participants: attendees(12), tableCount: 3, roundCount: 2, minimumAttendees: 16 }),
    error => error instanceof TheRoomScheduleError && error.code === "MINIMUM_NOT_MET",
  )
})

test("rejects rounds that exceed the total pool of unique pairs", () => {
  assert.throws(
    () => generateTheRoomSchedule({
      participants: attendees(10),
      tableCount: 5,
      roundCount: 10,
      minimumAttendees: 10,
    }),
    error => error instanceof TheRoomScheduleError && error.code === "PAIR_CAPACITY_EXCEEDED",
  )
})

test("uses a balanced finite-field layout for dense prime table plans", () => {
  const schedule = generateTheRoomSchedule({
    participants: attendees(25, 13),
    tableCount: 5,
    roundCount: 4,
    minimumAttendees: 25,
    seed: "dense-five-table-room",
  })
  assert.equal(validateTheRoomSchedule(schedule).valid, true)
  assert.equal(schedule.metrics.repeatPairCount, 0)
  assert.ok(schedule.metrics.genderSpreadMax <= 1)
})
