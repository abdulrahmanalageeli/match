import assert from "node:assert/strict"
import test from "node:test"

import { calculateBalancedCompatibility } from "../matching/balanced-compatibility.mjs"
import {
  calculateRound2CoreValuesScore,
  calculateRound2DepthPairBreakdown,
  calculateRound2DepthPairScore,
  calculateRound3RhythmPairBreakdown,
  calculateRound3RhythmPairScore,
  createRoundLensScorer,
  getRoundLensProfileMissingFields,
} from "./round23-lenses.mjs"

function profile(number, overrides = {}) {
  return {
    assigned_number: number,
    survey_data: {
      answers: {
        match_current_focus: ["career", "learning"],
        intent_goal: "B",
        core_values_1: "B",
        core_values_2: "B",
        core_values_3: "B",
        core_values_4: "B",
        core_values_5: "B",
        conversation_depth_pref: "A",
        match_disagreement_style: "B",
        communication_1: "A",
        communication_2: "A",
        communication_3: "A",
        communication_4: "A",
        communication_5: "A",
        lifestyle_1: "B",
        lifestyle_2: "B",
        lifestyle_3: "B",
        lifestyle_4: "B",
        lifestyle_5: "B",
        conversational_role: "A",
        curiosity_style: "A",
        social_battery: "A",
        humor_banter_style: "B",
        early_openness_comfort: 2,
        silence_comfort: "A",
        ...overrides,
      },
    },
  }
}

test("Round 2 uses the announced 30/25/20/15/10 survey-only Depth formula", () => {
  const perfect = calculateRound2DepthPairBreakdown(profile(10), profile(11))
  assert.deepEqual(perfect.weighted, {
    commonGround: 30,
    coreValues: 25,
    conversationDepth: 20,
    emotionalSafety: 15,
    lifestyle: 10,
  })
  assert.equal(perfect.score, 100)

  const left = profile(1)
  const right = profile(2, {
    match_current_focus: ["career", "family"],
    intent_goal: "C",
    core_values_1: "A",
    core_values_2: "B",
    core_values_3: "C",
    core_values_4: "B",
    core_values_5: "A",
    conversation_depth_pref: "B",
    match_disagreement_style: "D",
    communication_1: "C",
    communication_2: "C",
    communication_3: "C",
    communication_4: "C",
    communication_5: "C",
    lifestyle_1: "C",
    lifestyle_2: "C",
    lifestyle_3: "C",
    lifestyle_4: "C",
    lifestyle_5: "C",
  })
  const balanced = calculateBalancedCompatibility(left, right, { vibeScore: 6 })
  const coreValues = calculateRound2CoreValuesScore(left, right)
  const expected = ((balanced.questionScores.currentFocus + balanced.questionScores.intent) * (30 / 9))
    + (coreValues * (25 / 10))
    + (balanced.questionScores.conversationDepth * (20 / 3))
    + (balanced.scoreBreakdown.communicationDisagreement * (15 / 10))
    + (balanced.scoreBreakdown.lifestyleSustainability * (10 / 12))

  const result = calculateRound2DepthPairBreakdown(left, right)
  assert.ok(Math.abs(result.score - expected) < 1e-9)
  assert.equal(calculateRound2DepthPairScore(right, left), result.score)
  assert.equal(Object.values(result.weighted).reduce((sum, value) => sum + value, 0), result.score)
})

test("Round 2 includes all five values scenarios and never matches two missing answers", () => {
  const aligned = profile(1, { core_values_3: "A" })
  const exactPeer = profile(3, { core_values_3: "A" })
  const changedThird = profile(2, { core_values_3: "C" })
  const exact = calculateRound2DepthPairBreakdown(aligned, exactPeer)
  const changed = calculateRound2DepthPairBreakdown(aligned, changedThird)

  assert.equal(calculateRound2CoreValuesScore({}, {}), 0)
  assert.equal(calculateRound2CoreValuesScore(aligned, exactPeer), 10)
  assert.equal(calculateRound2CoreValuesScore(aligned, changedThird), 8)
  assert.ok(Math.abs(exact.score - changed.score - 5) < 1e-9)
})

test("Round 3 uses the distinct 30/25/20/15/10 Rhythm formula", () => {
  const left = profile(1, { conversational_role: "A", curiosity_style: "A", social_battery: "A", silence_comfort: "A" })
  const right = profile(2, { conversational_role: "C", curiosity_style: "B", social_battery: "A", silence_comfort: "A" })
  const balanced = calculateBalancedCompatibility(left, right, { vibeScore: 6 })
  const expected = (balanced.questionScores.initiative * (30 / 6))
    + (balanced.questionScores.curiosityStyle * (25 / 4))
    + (balanced.questionScores.socialBattery * (20 / 2))
    + ((balanced.questionScores.humorBanter + balanced.questionScores.earlyOpenness) * (15 / 10))
    + (balanced.questionScores.silence * (10 / 2))

  const result = calculateRound3RhythmPairBreakdown(left, right)
  assert.deepEqual(result.weighted, {
    roleComplement: 30,
    curiosity: 25,
    socialBattery: 20,
    humorOpenness: 15,
    silenceComfort: 10,
  })
  assert.equal(result.score, 100)
  assert.ok(Math.abs(result.score - expected) < 1e-9)
  assert.equal(calculateRound3RhythmPairScore(right, left), result.score)
})

test("Depth group rules distinguish hard depth clashes from flexible people", () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7]
  const profileMap = new Map(numbers.map(number => [number, profile(number)]))
  const scorer = createRoundLensScorer({ profileMap })

  const initial = scorer.depthGroup(numbers)
  const expectedAverage = numbers.flatMap((left, index) => numbers.slice(index + 1).map(right => scorer.depthPairScore(left, right)))
    .reduce((sum, value) => sum + value, 0) / 21
  assert.equal(initial.score, expectedAverage)
  assert.equal(initial.curiosityMixMissing, true)
  profileMap.set(7, profile(7, { curiosity_style: "B", conversation_depth_pref: "B" }))
  assert.equal(scorer.depthGroup(numbers).depthMismatch, true)
  assert.equal(scorer.depthGroup(numbers).curiosityMixMissing, false)
  profileMap.set(7, profile(7, { curiosity_style: "B", conversation_depth_pref: "C" }))
  assert.equal(scorer.depthGroup(numbers).depthMismatch, false)
})

test("a mixed Rhythm/Discovery table beats a uniform low-flow table", () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7]
  const uniformMap = new Map(numbers.map(number => [number, profile(number, {
    conversational_role: "C",
    curiosity_style: "A",
    match_current_focus: ["same-topic"],
  })]))
  const roles = ["A", "B", "C", "A", "B", "C", "B"]
  const curiosity = ["A", "B", "C", "A", "B", "C", "B"]
  const mixedMap = new Map(numbers.map((number, index) => [number, profile(number, {
    conversational_role: roles[index],
    curiosity_style: curiosity[index],
    social_battery: index % 2 ? "B" : "A",
    match_current_focus: [`topic-${number}`],
  })]))

  const uniform = createRoundLensScorer({ profileMap: uniformMap }).rhythmGroup(numbers)
  const mixed = createRoundLensScorer({ profileMap: mixedMap }).rhythmGroup(numbers)
  assert.ok(mixed.score > uniform.score)
  assert.ok(mixed.qualityScore > uniform.qualityScore)
  assert.ok(mixed.score <= 100)
  assert.ok(mixed.qualityScore <= 100)
  assert.ok(mixed.compositionBonus > 0)
  assert.equal(mixed.initiatorMissing, false)
  assert.equal(mixed.roleTrioMissing, false)
  assert.equal(mixed.curiosityFlowMissing, false)
  assert.equal(mixed.socialBatteryStyleCount, 2)
  assert.equal(mixed.focusDiversity, 7)
})

test("Depth and Rhythm favor deliberately different table compositions", () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7]
  const depthMap = new Map(numbers.map(number => [number, profile(number, {
    conversational_role: "C",
    curiosity_style: "A",
    match_current_focus: ["shared-purpose"],
  })]))
  const roles = ["A", "B", "C", "A", "B", "C", "B"]
  const curiosity = ["A", "B", "C", "A", "B", "C", "B"]
  const choices = ["A", "B", "C", "A", "B", "C", "A"]
  const rhythmMap = new Map(numbers.map((number, index) => [number, profile(number, {
    match_current_focus: [`topic-${number}`],
    intent_goal: choices[index],
    core_values_1: choices[index],
    core_values_2: choices[index],
    core_values_3: choices[index],
    core_values_4: choices[index],
    core_values_5: choices[index],
    lifestyle_1: choices[index],
    lifestyle_2: choices[index],
    lifestyle_3: choices[index],
    lifestyle_4: choices[index],
    lifestyle_5: choices[index],
    conversational_role: roles[index],
    curiosity_style: curiosity[index],
    social_battery: index % 2 ? "B" : "A",
  })]))

  const depthScorer = createRoundLensScorer({ profileMap: depthMap })
  const rhythmScorer = createRoundLensScorer({ profileMap: rhythmMap })
  assert.ok(depthScorer.depthGroup(numbers).score > rhythmScorer.depthGroup(numbers).score)
  assert.ok(rhythmScorer.rhythmGroup(numbers).score > depthScorer.rhythmGroup(numbers).score)
})

test("age and cache-like fields cannot change either survey lens", () => {
  const survey = profile(1).survey_data
  const young = { assigned_number: 1, age: 20, survey_data: survey, total_compatibility_score: 0, ai_vibe_score: 0, summary: "poisoned" }
  const old = { assigned_number: 2, age: 80, survey_data: survey, total_compatibility_score: 100, ai_vibe_score: 12, summary: "different" }
  const clean = profile(3)

  assert.equal(calculateRound2DepthPairScore(young, clean), calculateRound2DepthPairScore(old, clean))
  assert.equal(calculateRound3RhythmPairScore(young, clean), calculateRound3RhythmPairScore(old, clean))
})

test("missing interaction answers are coverage violations instead of satisfying table rules", () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7]
  const blankMap = new Map(numbers.map(number => [number, { assigned_number: number, survey_data: { answers: {} } }]))
  const scorer = createRoundLensScorer({ profileMap: blankMap })
  const depth = scorer.depthGroup(numbers)
  const rhythm = scorer.rhythmGroup(numbers)

  assert.equal(depth.depthCoverageIncomplete, true)
  assert.equal(depth.roleCoverageIncomplete, true)
  assert.equal(depth.curiosityCoverageIncomplete, true)
  assert.equal(depth.initiatorMissing, true)
  assert.equal(depth.curiosityMixMissing, true)
  assert.equal(rhythm.roleCoverageIncomplete, true)
  assert.equal(rhythm.curiosityCoverageIncomplete, true)
  assert.equal(rhythm.initiatorMissing, true)
  assert.equal(rhythm.roleTrioMissing, true)
  assert.equal(rhythm.curiosityFlowMissing, true)
  assert.ok(getRoundLensProfileMissingFields(blankMap.get(1)).length > 20)
})

test("the supported current-focus alias scores consistently and counts as complete", () => {
  const canonical = profile(1, { match_current_focus: ["career", "learning"] })
  const alias = profile(2, { match_current_focus: null, current_focus: ["career", "learning"] })
  const peer = profile(3)

  assert.equal(calculateRound2DepthPairScore(alias, peer), calculateRound2DepthPairScore(canonical, peer))
  assert.equal(getRoundLensProfileMissingFields(alias).includes("match_current_focus"), false)
})

test("a legacy depth answer accepted by scoring also satisfies profile coverage", () => {
  const canonical = profile(1, { conversation_depth_pref: "A" })
  const legacy = profile(2, { conversation_depth_pref: null, vibe_4: "yes" })
  const peer = profile(3)

  assert.equal(calculateRound2DepthPairScore(legacy, peer), calculateRound2DepthPairScore(canonical, peer))
  assert.equal(getRoundLensProfileMissingFields(legacy).includes("conversation_depth_pref"), false)
})
