import assert from "node:assert/strict"
import test from "node:test"

import { buildChoiceOnlySeatingPlan, choiceOnlySeatingMetrics } from "./choice-only-seating.mjs"

const participants = Array.from({ length: 42 }, (_, index) => index + 1)

function assertRound(round) {
  assert.equal(round.length, 6)
  assert.deepEqual(round.map(group => group.length), [7, 7, 7, 7, 7, 7])
  assert.deepEqual([...round.flat()].sort((a, b) => a - b), participants)
}

test("creates three complete rounds of six groups of exactly seven", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  assert.equal(plan.error, undefined)
  assertRound(plan.round1)
  assertRound(plan.round2)
  assertRound(plan.round3)
  assert.deepEqual({ T: plan.T, G: plan.G, R: plan.R }, { T: 6, G: 7, R: 0 })
  assert.equal(Object.keys(plan.positionMap).length, 42)
  for (let index = 0; index < participants.length; index++) {
    assert.equal(plan.positionMap[plan.round1.flat()[index]], index)
  }
})

test("attains the unavoidable repeat lower bound and never repeats one pair all three times", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)

  // Each new table has seven people but only six prior tables to draw from, so
  // every pair of rounds must repeat at least one pair at each of six tables.
  assert.deepEqual({
    round1Round2: metrics.round1Round2,
    round1Round3: metrics.round1Round3,
    round2Round3: metrics.round2Round3,
    total: metrics.totalRepeatedPairOccurrences,
  }, { round1Round2: 6, round1Round3: 6, round2Round3: 6, total: 18 })
  assert.equal(metrics.repeatedInAllThree, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 1)
})

test("balances a 21/21 roster in every round while retaining minimum repeats", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const plan = buildChoiceOnlySeatingPlan(participants, { genderMap })
  const femaleCounts = round => round.map(group => group.filter(number => genderMap[number] === "female").length)

  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.ok(femaleCounts(round).every(count => count === 3 || count === 4))
  }
  assert.equal(choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3).totalRepeatedPairOccurrences, 18)
})

test("is deterministic, including gender and age tie-breaking", () => {
  const genderMap = new Map(participants.map(number => [number, number % 2 ? "female" : "male"]))
  const ageMap = new Map(participants.map(number => [number, 22 + (number % 13)]))
  const first = buildChoiceOnlySeatingPlan(participants, { genderMap, ageMap })
  const second = buildChoiceOnlySeatingPlan([...participants], { genderMap, ageMap })

  assert.deepEqual(second, first)
})

test("uses age as a real tie-breaker after repeat and gender constraints", () => {
  const ageMap = Object.fromEntries(participants.map(number => [
    number,
    18 + ((number + 3 * number ** 2) % 47),
  ]))
  const ageCost = groups => groups.reduce((total, group) => total + group.reduce(
    (groupTotal, left, index) => groupTotal + group.slice(index + 1).reduce(
      (pairTotal, right) => pairTotal + (ageMap[left] - ageMap[right]) ** 2,
      0,
    ),
    0,
  ), 0)
  const baseline = buildChoiceOnlySeatingPlan(participants)
  const ageAware = buildChoiceOnlySeatingPlan(participants, { ageMap })

  assert.ok(ageCost(ageAware.round3) < ageCost(baseline.round3))
  assert.equal(choiceOnlySeatingMetrics(
    ageAware.round1,
    ageAware.round2,
    ageAware.round3,
  ).totalRepeatedPairOccurrences, 18)
})

test("accepts participant records and preserves their supplied order in the position map", () => {
  const records = [...participants].reverse().map(assigned_number => ({ assigned_number }))
  const plan = buildChoiceOnlySeatingPlan(records)
  assert.equal(plan.positionMap[42], 0)
  assert.equal(plan.positionMap[1], 41)
  assertRound(plan.round1)
})

test("returns a reviewable error for a non-42 or duplicate roster", () => {
  assert.match(buildChoiceOnlySeatingPlan(participants.slice(0, 41)).error, /exactly 42/)
  assert.match(buildChoiceOnlySeatingPlan([...participants.slice(0, 41), 41]).error, /unique/)
})
