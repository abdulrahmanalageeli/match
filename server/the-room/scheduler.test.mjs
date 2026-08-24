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

function oppositeGenderExposure(schedule, attendeeGender, companionGender) {
  const people = new Map(schedule.participants.map(person => [person.id, person]))
  const exposure = new Map(schedule.participants
    .filter(person => person.gender === attendeeGender)
    .map(person => [person.id, 0]))
  for (const round of schedule.rounds) {
    for (const table of round.tables) {
      for (const attendeeId of table.attendeeIds) {
        if (!exposure.has(attendeeId)) continue
        const companions = table.attendeeIds
          .filter(companionId => companionId !== attendeeId && people.get(companionId)?.gender === companionGender)
        exposure.set(attendeeId, exposure.get(attendeeId) + companions.length)
      }
    }
  }
  return [...exposure.values()].sort((left, right) => left - right)
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

test("uses the certified optimal gender-exposure plan for 30 balanced guests", () => {
  const schedule = generateTheRoomSchedule({
    participants: attendees(30, 15),
    tableCount: 6,
    roundCount: 4,
    minimumAttendees: 30,
    seed: "certified-thirty-person-room",
  })

  assert.equal(validateTheRoomSchedule(schedule).valid, true)
  assert.equal(schedule.metrics.genderFairnessOptimizationApplied, 1)
  assert.equal(schedule.metrics.genderFairnessOptimalityCertified, 1)
  assert.equal(schedule.metrics.genderFairnessFallbackUsed, 0)
  assert.equal(schedule.metrics.genderExposureSpreadMax, 1)
  assert.equal(schedule.metrics.oppositeGenderExposureSpreadMax, 1)

  const expectedExposure = [...Array(6).fill(9), ...Array(9).fill(10)]
  assert.deepEqual(oppositeGenderExposure(schedule, "female", "male"), expectedExposure)
  assert.deepEqual(oppositeGenderExposure(schedule, "male", "female"), expectedExposure)
  for (const round of schedule.rounds) {
    assert.deepEqual(round.tables.map(table => table.attendeeIds.length), Array(6).fill(5))
    for (const gender of ["female", "male"]) {
      assert.deepEqual(round.tables.map(table => table.genderCounts[gender]).sort(), [2, 2, 2, 3, 3, 3])
    }
  }
})

test("keeps the certified plan deterministic and supports a legacy kill switch", () => {
  const input = {
    participants: attendees(30, 15),
    tableCount: 6,
    roundCount: 4,
    seed: "certified-plan-determinism",
  }
  const first = generateTheRoomSchedule(input)
  const second = generateTheRoomSchedule(input)
  const fallback = generateTheRoomSchedule({
    participants: attendees(25, 13),
    tableCount: 5,
    roundCount: 4,
    seed: "fast-legacy-kill-switch",
    optimizeGenderExposure: false,
  })

  assert.deepEqual(first.rounds, second.rounds)
  assert.equal(validateTheRoomSchedule(fallback).valid, true)
  assert.equal(fallback.metrics.genderFairnessOptimizationApplied, 0)
  assert.equal(fallback.metrics.genderFairnessOptimalityCertified, 0)
})

test("safely improves cumulative exposure on general schedules when a valid swap exists", () => {
  const input = {
    participants: attendees(20, 9),
    tableCount: 5,
    roundCount: 2,
    seed: "probe-1",
  }
  const legacy = generateTheRoomSchedule({ ...input, optimizeGenderExposure: false })
  const improved = generateTheRoomSchedule(input)
  const boundedFallback = generateTheRoomSchedule({ ...input, maxGenderFairnessEvaluations: 0 })

  assert.equal(validateTheRoomSchedule(improved).valid, true)
  assert.equal(legacy.metrics.genderExposureSpreadMax, 2)
  assert.equal(improved.metrics.genderExposureSpreadMax, 1)
  assert.equal(improved.metrics.genderFairnessSafeSwapCount, 1)
  assert.equal(improved.metrics.repeatPairCount, 0)
  assert.deepEqual(boundedFallback.rounds, legacy.rounds)
  assert.equal(boundedFallback.metrics.genderFairnessFallbackUsed, 1)
  for (let roundIndex = 0; roundIndex < legacy.rounds.length; roundIndex += 1) {
    assert.deepEqual(
      improved.rounds[roundIndex].tables.map(table => table.attendeeIds.length),
      legacy.rounds[roundIndex].tables.map(table => table.attendeeIds.length),
    )
    assert.deepEqual(
      improved.rounds[roundIndex].tables.map(table => table.genderCounts),
      legacy.rounds[roundIndex].tables.map(table => table.genderCounts),
    )
  }
})

test("reports finite exposure metrics for a single-gender fallback", () => {
  const schedule = generateTheRoomSchedule({
    participants: attendees(20, 0),
    tableCount: 5,
    roundCount: 2,
    seed: "single-gender-fallback",
  })

  assert.equal(validateTheRoomSchedule(schedule).valid, true)
  assert.equal(schedule.metrics.genderFairnessOptimizationApplied, 0)
  assert.equal(schedule.metrics.genderExposureSpreadMax, 0)
  assert.ok(Object.values(schedule.metrics).every(Number.isFinite))
})
