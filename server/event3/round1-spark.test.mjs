import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { calculateBalancedCompatibility } from "../matching/balanced-compatibility.mjs"
import { buildChoiceOnlySeatingPlan, choiceOnlySeatingMetrics } from "./choice-only-seating.mjs"
import {
  calculateRound1SparkPairBreakdown,
  calculateRound1SparkPairScore,
  event3SparkPairKey,
  optimizeRound1SparkGroups,
  scoreRound1SparkGroup,
} from "./round1-spark.mjs"

const participants = Array.from({ length: 42 }, (_, index) => index + 1)

function profile(number, overrides = {}) {
  return {
    assigned_number: number,
    age: 25,
    gender: "male",
    survey_data: {
      answers: {
        humor_banter_style: "B",
        conversational_role: "A",
        conversation_depth_pref: "A",
        curiosity_style: "C",
        ...overrides,
      },
    },
  }
}

function cohort(number) {
  return Math.floor((number - 1) / 7)
}

function cohortProfile(number) {
  const group = cohort(number)
  const offset = (number - 1) % 7
  const style = ["A", "B", "C", "D", "B", "C"][group]
  const role = ["A", "B", "C", "B", "A", "C", "B"][offset]
  const curiosity = ["A", "B", "C", "B", "A", "C", "B"][offset]
  return profile(number, {
    humor_banter_style: style,
    early_openness_comfort: style,
    conversational_role: role,
    conversation_depth_pref: group < 3 ? "A" : "B",
    curiosity_style: curiosity,
    match_disagreement_style: style,
    current_focus: style,
    similarity_preference: style,
    attachment_1: style,
    attachment_3: style,
    attachment_4: style,
    lifestyle_1: style,
    lifestyle_2: style,
    lifestyle_3: style,
    lifestyle_4: style,
    lifestyle_5: style,
    core_values_1: style,
    core_values_2: style,
    core_values_3: style,
    core_values_4: style,
    core_values_5: style,
  })
}

test("reweights the pure survey scorer with the historical Spark weights and neutral vibe", () => {
  const left = cohortProfile(1)
  const right = cohortProfile(2)
  const balanced = calculateBalancedCompatibility(left, right, { vibeScore: 6 })
  const questions = balanced.questionScores
  const expected = balanced.scoreBreakdown.interactionRhythm * (37 / 20)
    + balanced.scoreBreakdown.humorOpenness * (27 / 10)
    + 6
    + (questions.disagreement + questions.currentFocus + questions.similarityPreference) * (14 / 11)
    + balanced.scoreBreakdown.attachmentComfort * (3 / 8)
    + balanced.scoreBreakdown.lifestyleSustainability * (3 / 12)
    + 10 * (4 / 10)

  const result = calculateRound1SparkPairBreakdown(left, right)
  assert.equal(result.components.vibe, 6)
  assert.equal(result.weighted.vibe, 6)
  assert.equal(result.components.coreValues, 10)
  assert.ok(Math.abs(result.score - expected) < 1e-9)
  assert.equal(calculateRound1SparkPairScore(left, right), result.score)
  assert.equal(calculateRound1SparkPairScore(right, left), result.score)
})

test("group scoring is survey-only and ignores supplied cache-derived pair scores", () => {
  const group = [1, 2, 3, 4, 5, 6, 7]
  const profileMap = new Map(group.map(number => [number, cohortProfile(number)]))
  const poisoned = new Map()
  for (let left = 1; left <= 7; left++) {
    for (let right = left + 1; right <= 7; right++) poisoned.set(event3SparkPairKey(left, right), -999)
  }
  const direct = scoreRound1SparkGroup(group, { profileMap })
  const withExternalScores = scoreRound1SparkGroup(group, { profileMap, pairScoreMap: poisoned })
  assert.equal(withExternalScores.basePairScore, direct.basePairScore)
  assert.equal(withExternalScores.score, direct.score)
})

test("applies old humor, canonical role, curiosity, and age table rules", () => {
  const profileMap = new Map([
    [1, profile(1, { humor_banter_style: "A", conversational_role: "INITIATOR", curiosity_style: "A" })],
    [2, profile(2, { humor_banter_style: "B", conversational_role: "المتفاعل", curiosity_style: "B" })],
    [3, profile(3, { humor_banter_style: "A", conversational_role: "LISTENER", curiosity_style: "C" })],
    ...[4, 5, 6, 7].map(number => [number, profile(number, { humor_banter_style: "B", conversational_role: "RESPONDER", curiosity_style: "C" })]),
  ])
  const compatible = scoreRound1SparkGroup([1, 2, 3, 4, 5, 6, 7], { profileMap })
  assert.ok(Math.abs(compatible.score - compatible.basePairScore - 30) < 1e-9)
  assert.equal(compatible.humorClash, false)
  assert.equal(compatible.roleCount, 3)
  assert.equal(compatible.initiatorMissing, false)

  profileMap.set(7, profile(7, { humor_banter_style: "D", conversational_role: "RESPONDER", curiosity_style: "C" }))
  const clash = scoreRound1SparkGroup([1, 2, 3, 4, 5, 6, 7], { profileMap })
  assert.ok(Math.abs(clash.score - clash.basePairScore - 22) < 1e-9)
  assert.equal(clash.humorClash, true)
})

test("blank and null ages stay unknown instead of becoming age zero", () => {
  const group = [1, 2, 3, 4, 5, 6, 7]
  const profileMap = new Map(group.map(number => [number, {
    ...profile(number),
    age: "",
    survey_data: { answers: { ...profile(number).survey_data.answers, age: "" } },
  }]))
  const ageMap = Object.fromEntries(group.map(number => [number, null]))
  const result = scoreRound1SparkGroup(group, { profileMap, ageMap })
  assert.equal(result.ageRange, null)
  assert.equal(result.ageRangeViolation, false)
})

test("Spark optimization separates an avoidable locked pair", () => {
  const baseline = Array.from({ length: 6 }, (_, table) =>
    participants.slice(table * 7, table * 7 + 7))
  const profileMap = new Map(participants.map(number => [number, profile(number)]))
  const result = optimizeRound1SparkGroups(baseline, {
    profileMap,
    genderMap: Object.fromEntries(participants.map(number => [number, "male"])),
    lockedPairsSet: new Set([event3SparkPairKey(1, 2)]),
  })

  assert.equal(result.metrics.before.lockedPairs, 1)
  assert.equal(result.metrics.after.lockedPairs, 0)
  assert.equal(result.groups.some(group => group.includes(1) && group.includes(2)), false)
})

test("Spark optimization materially improves Round 1 without changing its roster", () => {
  const scrambled = Array.from({ length: 6 }, (_, table) =>
    Array.from({ length: 7 }, (_, column) => column * 6 + table + 1))
  const profileMap = new Map(participants.map(number => {
    const value = cohortProfile(number)
    value.age = 21 + cohort(number) * 4
    return [number, value]
  }))
  const result = optimizeRound1SparkGroups(scrambled, {
    profileMap,
    genderMap: Object.fromEntries(participants.map(number => [number, "male"])),
  })

  assert.ok(result.metrics.swaps > 0)
  assert.ok(result.metrics.after.score > result.metrics.before.score)
  assert.ok(result.metrics.after.depthMismatches <= result.metrics.before.depthMismatches)
  assert.ok(result.metrics.after.ageRangeViolations <= result.metrics.before.ageRangeViolations)
  assert.deepEqual([...result.groups.flat()].sort((a, b) => a - b), participants)
})

test("Spark-optimized Round 1 preserves all three-round structural guarantees", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const profileMap = new Map(participants.map(number => [number, {
    ...profile(number),
    gender: genderMap[number],
  }]))
  const plan = buildChoiceOnlySeatingPlan(participants, { genderMap, profileMap })

  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.deepEqual(round.map(group => group.length), [7, 7, 7, 7, 7, 7])
    assert.deepEqual([...round.flat()].sort((a, b) => a - b), participants)
    assert.ok(round.every(group => {
      const females = group.filter(number => genderMap[number] === "female").length
      return females === 3 || females === 4
    }))
  }
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 18)
  assert.equal(metrics.repeatedInAllThree, 0)
})

test("choice-only live and test seating both use the survey-only three-lens path", async () => {
  const source = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
  assert.match(source, /if \(choiceOnlySeating\) \{[\s\S]*?using deterministic survey-only Spark\/Depth\/Rhythm rules[\s\S]*?\} else if \(isTestMode\)/)
  assert.match(source, /buildChoiceOnlySeatingPlan\(orderedNumbers, \{[\s\S]*?profileMap: seatingProfileMap,[\s\S]*?lockedPairsSet/)
  assert.match(source, /round2_depth: choiceOnlySeating \? plan\.round2Depth : null/)
  assert.match(source, /round3_rhythm: choiceOnlySeating \? plan\.round3Rhythm : null/)
  assert.match(source, /requireCompleteLensProfiles:\s*true/)
  assert.doesNotMatch(source, /calculateRound1SparkPairScore/)
  assert.doesNotMatch(source, /pairScoreMap: seatingPairScoreMap/)
})
