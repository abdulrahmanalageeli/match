import assert from "node:assert/strict"
import test from "node:test"

import {
  BALANCED_VIBE_MAX,
  calculateBalancedCompatibility,
} from "../matching/balanced-compatibility.mjs"
import { scoreRound1CompatibilityGroup } from "./round1-compatibility.mjs"

function profile(assignedNumber, answer = "A") {
  return {
    assigned_number: assignedNumber,
    survey_data: { answers: {
      match_disagreement_style: answer,
      match_similarity_preference: answer,
      humor_banter_style: answer,
      early_openness_comfort: answer === "A" ? "3" : "1",
      conversation_initiative_preference: answer,
      expression_language: answer,
      minimum_partner_religious_commitment: answer,
      social_relationship_style: answer,
      attachment_1: answer,
      attachment_3: answer,
      attachment_4: answer,
      lifestyle_1: answer,
      lifestyle_2: answer,
      lifestyle_3: answer,
      lifestyle_4: answer,
      lifestyle_5: answer,
      core_values_1: answer,
      core_values_2: answer,
      core_values_3: answer,
      core_values_4: answer,
      core_values_5: answer,
      communication_1: answer,
      communication_2: answer,
      communication_3: answer,
      communication_4: answer,
      communication_5: answer,
      conversational_role: answer,
      conversation_depth_pref: answer,
      social_battery: answer,
      humor_subtype: answer,
      curiosity_style: answer,
      intent_goal: answer,
      silence_comfort: answer,
    } },
  }
}

test("cached compatibility wins over the questionnaire fallback", () => {
  const profileMap = new Map([
    [1, profile(1, "A")],
    [2, profile(2, "D")],
  ])
  const result = scoreRound1CompatibilityGroup([1, 2], {
    profileMap,
    compatibilityScoreMap: new Map([["1-2", 87.25]]),
  })

  assert.equal(result.score, 87.25)
  assert.equal(result.pairScoreTotal, 87.25)
  assert.equal(result.cachedPairs, 1)
  assert.equal(result.fallbackPairs, 0)
})

test("questionnaire fallback equals the current balanced total score", () => {
  const left = profile(1, "A")
  const right = profile(2, "B")
  const expected = calculateBalancedCompatibility(left, right, {
    vibeScore: BALANCED_VIBE_MAX / 2,
  }).totalScore
  const result = scoreRound1CompatibilityGroup([1, 2], {
    profileMap: new Map([[1, left], [2, right]]),
  })

  assert.equal(result.score, expected)
  assert.equal(result.pairScoreTotal, expected)
  assert.equal(result.cachedPairs, 0)
  assert.equal(result.fallbackPairs, 1)
})

test("an absent profile contributes the neutral compatibility score", () => {
  const result = scoreRound1CompatibilityGroup([1, 2], {
    profileMap: new Map([[1, profile(1)]]),
  })

  assert.equal(result.score, 50)
  assert.equal(result.pairScoreTotal, 50)
  assert.equal(result.minimumPairScore, 50)
  assert.equal(result.fallbackPairs, 1)
})

test("group totals include every unordered pair and count locked pairs", () => {
  const compatibilityScoreMap = new Map([
    ["1-2", 10],
    ["1-3", 20],
    ["1-4", 30],
    ["2-3", 40],
    ["2-4", 50],
    ["3-4", 60],
  ])
  const result = scoreRound1CompatibilityGroup([1, 2, 3, 4], {
    compatibilityScoreMap,
    lockedPairsSet: new Set(["1-3", "2-4"]),
  })

  assert.equal(result.scoredPairs, 6)
  assert.equal(result.cachedPairs, 6)
  assert.equal(result.fallbackPairs, 0)
  assert.equal(result.pairScoreTotal, 210)
  assert.equal(result.score, 35)
  assert.equal(result.minimumPairScore, 10)
  assert.equal(result.lockedPairs, 2)
})
