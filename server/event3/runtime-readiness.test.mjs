import test from "node:test"
import assert from "node:assert/strict"
import { buildEvent3ClassicRuntimeReadiness, buildEvent3RuntimeReadiness } from "./runtime-readiness.mjs"

function completeRuntime(count) {
  const participantNumbers = Array.from({ length: count }, (_, index) => index + 1)
  const assignments = [1, 2, 3].flatMap(round => participantNumbers.map((participant_id, index) => ({
    round,
    participant_id,
    table_number: Math.floor(index / 6) + 1,
  })))
  const matches = participantNumbers.map(participant_number => ({
    participant_number,
    phase2_partner: participant_number % 2 ? participant_number + 1 : participant_number - 1,
    phase3_partner: participant_number <= count / 2 ? participant_number + count / 2 : participant_number - count / 2,
    phase4_partner: participant_number % 2 ? participant_number + 1 : participant_number - 1,
  }))
  assignments.push(...participantNumbers.flatMap(participantId => [
    { round: 20, participant_id: participantId, table_number: Math.ceil(participantId / 2) },
    { round: 30, participant_id: participantId, table_number: participantId <= count / 2 ? participantId : participantId - count / 2 },
    { round: 40, participant_id: participantId, table_number: Math.ceil(participantId / 2) },
  ]))
  return { participantNumbers, assignments, matches }
}

for (const count of [16, 30, 42]) {
  test(`requires full seating and reciprocal match coverage for ${count} participants`, () => {
    const readiness = buildEvent3RuntimeReadiness({ ...completeRuntime(count), includePhase4: true })
    assert.equal(readiness.seating.complete, true)
    assert.equal(readiness.phase2.complete, true)
    assert.equal(readiness.phase3.complete, true)
    assert.equal(readiness.phase4.complete, true)
    assert.equal(readiness.phase4.pairs, count / 2)
  })
}

test("partial and one-way rows never report ready", () => {
  const runtime = completeRuntime(16)
  runtime.assignments = runtime.assignments.filter(row => !(row.round === 3 && row.participant_id === 16))
  runtime.matches[0].phase2_partner = 3
  const readiness = buildEvent3RuntimeReadiness({ ...runtime, includePhase4: true })
  assert.equal(readiness.seating.complete, false)
  assert.equal(readiness.phase2.complete, false)
  assert.equal(readiness.phase2.covered, 14)
})

test("choice matches stay unready until every reciprocal pair has one shared reveal table", () => {
  const runtime = completeRuntime(16)
  runtime.assignments = runtime.assignments.filter(row => !(row.round === 20 && row.participant_id === 1))
  let readiness = buildEvent3RuntimeReadiness({ ...runtime, includePhase4: true })
  assert.equal(readiness.phase2.complete, false)
  assert.equal(readiness.phase2.assignments.missing_assignments, 1)

  runtime.assignments.push({ round: 20, participant_id: 1, table_number: 99 })
  readiness = buildEvent3RuntimeReadiness({ ...runtime, includePhase4: true })
  assert.equal(readiness.phase2.complete, false)
  assert.equal(readiness.phase2.assignments.mismatched_pair_tables, 1)
})

function classicRuntime() {
  const participantNumbers = [1, 2, 3, 4, 5, 6]
  const assignments = [1, 2].flatMap(round => participantNumbers.map((participant_id, index) => ({
    round,
    participant_id,
    table_number: Math.floor(index / 3) + 1,
  })))
  assignments.push(
    { round: 20, participant_id: 1, table_number: 1 },
    { round: 20, participant_id: 2, table_number: 1 },
    { round: 20, participant_id: 3, table_number: 2 },
    { round: 20, participant_id: 4, table_number: 2 },
    { round: 30, participant_id: 1, table_number: 2 },
    { round: 30, participant_id: 2, table_number: 2 },
    { round: 30, participant_id: 3, table_number: 1 },
    { round: 30, participant_id: 4, table_number: 1 },
  )
  const matches = [
    { participant_number: 1, phase2_partner: 2, phase3_partner: 2 },
    { participant_number: 2, phase2_partner: 1, phase3_partner: 1 },
    { participant_number: 3, phase2_partner: 4, phase3_partner: 4 },
    { participant_number: 4, phase2_partner: 3, phase3_partner: 3 },
    { participant_number: 5, phase2_partner: null, phase3_partner: null },
    { participant_number: 6, phase2_partner: null, phase3_partner: null },
  ]
  return { participantNumbers, assignments, matches }
}

test("classic readiness accepts intentionally unmatched participants with complete reciprocal pair tables", () => {
  const readiness = buildEvent3ClassicRuntimeReadiness(classicRuntime())

  assert.equal(readiness.seating.complete, true)
  assert.deepEqual(readiness.seating.rounds.map(round => round.round), [1, 2])
  assert.equal(readiness.phase2.complete, true)
  assert.equal(readiness.phase2.matched, 4)
  assert.equal(readiness.phase2.unmatched, 2)
  assert.equal(readiness.phase2.assignments.complete, true)
  assert.equal(readiness.phase3.complete, true)
  assert.equal(readiness.phase4.complete, false)
})

test("classic readiness rejects a populated one-way partner", () => {
  const runtime = classicRuntime()
  runtime.matches[0].phase2_partner = 3
  const readiness = buildEvent3ClassicRuntimeReadiness(runtime)

  assert.equal(readiness.phase2.complete, false)
  assert.equal(readiness.phase2.nonreciprocal_partners, 2)
})

test("classic readiness rejects missing or duplicate assignments for matched participants", () => {
  const missingRuntime = classicRuntime()
  missingRuntime.assignments = missingRuntime.assignments.filter(row => !(row.round === 20 && row.participant_id === 1))
  const missing = buildEvent3ClassicRuntimeReadiness(missingRuntime)
  assert.equal(missing.phase2.complete, false)
  assert.equal(missing.phase2.assignments.missing_assignments, 1)

  const duplicateRuntime = classicRuntime()
  duplicateRuntime.assignments.push({ round: 20, participant_id: 1, table_number: 1 })
  const duplicate = buildEvent3ClassicRuntimeReadiness(duplicateRuntime)
  assert.equal(duplicate.phase2.complete, false)
  assert.equal(duplicate.phase2.assignments.duplicate_assignments, 1)
})

test("classic readiness rejects stale unmatched assignments and split pair tables", () => {
  const staleRuntime = classicRuntime()
  staleRuntime.assignments.push({ round: 20, participant_id: 5, table_number: 3 })
  const stale = buildEvent3ClassicRuntimeReadiness(staleRuntime)
  assert.equal(stale.phase2.complete, false)
  assert.equal(stale.phase2.assignments.unmatched_assignments, 1)

  const splitRuntime = classicRuntime()
  const participantTwo = splitRuntime.assignments.find(row => row.round === 20 && row.participant_id === 2)
  participantTwo.table_number = 3
  const split = buildEvent3ClassicRuntimeReadiness(splitRuntime)
  assert.equal(split.phase2.complete, false)
  assert.equal(split.phase2.assignments.mismatched_pair_tables, 1)
})

test("classic readiness requires at least one assigned reciprocal pair", () => {
  const runtime = classicRuntime()
  runtime.matches = runtime.matches.map(row => ({ ...row, phase2_partner: null }))
  runtime.assignments = runtime.assignments.filter(row => row.round !== 20)
  const readiness = buildEvent3ClassicRuntimeReadiness(runtime)

  assert.equal(readiness.phase2.complete, false)
  assert.equal(readiness.phase2.unmatched, 6)
})
