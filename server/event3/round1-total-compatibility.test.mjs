import assert from "node:assert/strict"
import test from "node:test"

import { calculateBalancedCompatibility } from "../matching/balanced-compatibility.mjs"
import {
  calculateRound1TotalCompatibilityPairScore,
  event3CompatibilityPairKey,
  optimizeRound1TotalCompatibilityGroups,
  scoreRound1TotalCompatibilityGroup,
} from "./round1-total-compatibility.mjs"

function profile(number, choice) {
  return {
    assigned_number: number,
    gender: "female",
    age: 25 + number,
    survey_data: { answers: {
      match_disagreement_style: choice,
      similarity_preference: choice,
      match_current_focus: [choice],
      humor_banter_style: choice,
      early_openness_comfort: choice === "A" ? 0 : 3,
      conversational_role: choice,
      expression_language: choice === "A" ? 1 : 4,
      minimum_partner_religious_commitment: choice === "A" ? 1 : 4,
      social_relationship_style: choice === "A" ? 1 : 4,
      attachment_1: choice,
      attachment_3: choice,
      attachment_4: choice,
      lifestyle_1: choice,
      lifestyle_2: choice,
      lifestyle_3: choice,
      lifestyle_4: choice,
      lifestyle_5: choice,
      core_values_1: choice,
      core_values_2: choice,
      core_values_4: choice,
      core_values_5: choice,
      communication_1: choice,
      communication_2: choice,
      communication_3: choice,
      communication_4: choice,
      communication_5: choice,
      conversation_depth_pref: choice,
      social_battery: choice,
      curiosity_style: choice,
      intent_goal: choice,
      silence_comfort: choice,
    } },
  }
}

test("Round 1 pair score is the matching engine's total compatibility score", () => {
  const left = profile(1, "A")
  const right = profile(2, "B")
  assert.equal(
    calculateRound1TotalCompatibilityPairScore(left, right),
    calculateBalancedCompatibility(left, right).totalScore,
  )
  assert.equal(
    calculateRound1TotalCompatibilityPairScore(right, left),
    calculateRound1TotalCompatibilityPairScore(left, right),
  )
})

test("Round 1 group score averages every member pair", () => {
  const profileMap = new Map([
    [1, profile(1, "A")],
    [2, profile(2, "A")],
    [3, profile(3, "B")],
  ])
  const pairScores = [
    calculateRound1TotalCompatibilityPairScore(profileMap.get(1), profileMap.get(2)),
    calculateRound1TotalCompatibilityPairScore(profileMap.get(1), profileMap.get(3)),
    calculateRound1TotalCompatibilityPairScore(profileMap.get(2), profileMap.get(3)),
  ]
  const group = scoreRound1TotalCompatibilityGroup([1, 2, 3], { profileMap })
  assert.equal(group.pairCount, 3)
  assert.equal(group.totalPairScore, pairScores.reduce((sum, score) => sum + score, 0))
  assert.equal(group.score, group.totalPairScore / 3)
})

test("Round 1 optimizer maximizes total pair compatibility and preserves gender slots", () => {
  const baseline = [[1, 4, 2], [5, 3, 6]]
  const preferredCluster = number => number <= 3 ? "first" : "second"
  const pairScoreMap = new Map()
  for (let left = 1; left <= 6; left++) {
    for (let right = left + 1; right <= 6; right++) {
      pairScoreMap.set(
        event3CompatibilityPairKey(left, right),
        preferredCluster(left) === preferredCluster(right) ? 95 : 10,
      )
    }
  }
  const result = optimizeRound1TotalCompatibilityGroups(baseline, {
    genderMap: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, "female"])),
    pairScoreMap,
  })
  assert.ok(result.metrics.after.totalPairScore > result.metrics.before.totalPairScore)
  assert.deepEqual([...result.groups.flat()].sort((left, right) => left - right), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(
    result.groups.map(group => group.map(preferredCluster).sort()),
    [["first", "first", "first"], ["second", "second", "second"]],
  )
})
