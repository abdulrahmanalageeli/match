import {
  BALANCED_WEIGHTS,
  calculateBalancedCompatibility,
  getBalancedAnswer,
  normalizeBalancedChoice,
} from "../matching/balanced-compatibility.mjs"
import { calculateRound1SparkPairScore, event3SparkPairKey } from "./round1-spark.mjs"

const NEUTRAL_PAIR_SCORE = 50

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

function mapValue(source, key) {
  if (source instanceof Map) return source.get(key)
  return source?.[key]
}

function profileFor(profileMap, number) {
  return mapValue(profileMap, Number(number)) || null
}

function answer(profile, key, aliases = []) {
  for (const candidate of [key, ...aliases]) {
    const value = getBalancedAnswer(profile, candidate)
    if (value !== null && value !== undefined && String(value).trim() !== "") return value
  }
  return null
}

function choice(value) {
  return normalizeBalancedChoice(value)
}

function hasAnswer(profile, key, aliases = []) {
  return answer(profile, key, aliases) !== null
}

function withCurrentFocusAlias(profile = {}) {
  if (hasAnswer(profile, "match_current_focus")) return profile
  const currentFocus = answer(profile, "current_focus")
  return currentFocus === null ? profile : { ...profile, match_current_focus: currentFocus }
}

export const ROUND_LENS_REQUIRED_FIELDS = Object.freeze([
  "match_current_focus",
  "intent_goal",
  "core_values_1",
  "core_values_2",
  "core_values_3",
  "core_values_4",
  "core_values_5",
  "conversation_depth_pref",
  "match_disagreement_style",
  "communication_1",
  "communication_2",
  "communication_3",
  "communication_4",
  "communication_5",
  "lifestyle_1",
  "lifestyle_2",
  "lifestyle_3",
  "lifestyle_4",
  "lifestyle_5",
  "conversational_role",
  "curiosity_style",
  "social_battery",
  "humor_banter_style",
  "early_openness_comfort",
  "silence_comfort",
])

export function getRoundLensProfileMissingFields(profile = {}) {
  return ROUND_LENS_REQUIRED_FIELDS.filter(key => !hasAnswer(
    profile,
    key,
    key === "match_current_focus"
      ? ["current_focus"]
      : key === "conversation_depth_pref" ? ["vibe_4"] : [],
  ))
}

function canonicalRole(profile) {
  const role = choice(answer(profile, "conversational_role"))
  if (["A", "INITIATOR", "INITIATE", "LEADER", "مبادر", "المبادر"].includes(role)) return "A"
  if (["B", "REACTOR", "RESPONDER", "RESPONSE", "متفاعل", "المتفاعل"].includes(role)) return "B"
  if (["C", "OBSERVER", "LISTENER", "BALANCER", "مستمع", "المستمع", "مراقب", "المراقب"].includes(role)) return "C"
  return null
}

function depthPreference(profile) {
  const current = choice(answer(profile, "conversation_depth_pref"))
  if (["A", "DEEP", "DEPTH", "عميق"].includes(current)) return "deep"
  if (["B", "LIGHT", "خفيف"].includes(current)) return "light"
  if (["C", "FLEX", "FLEXIBLE", "MIX", "مرن"].includes(current)) return "flexible"

  const legacy = String(answer(profile, "vibe_4") ?? "").trim().toUpperCase()
  if (["نعم", "نَعَم", "YES", "Y", "TRUE", "1"].includes(legacy)) return "deep"
  if (["لا", "لَا", "NO", "N", "FALSE", "0"].includes(legacy)) return "light"
  if (["أحياناً", "أحيانا", "SOMETIMES", "FLEXIBLE"].includes(legacy)) return "flexible"
  return null
}

function normalizedFocus(profile) {
  const value = answer(profile, "match_current_focus", ["current_focus"])
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  return [...new Set(values.map(item => String(item).trim().toLowerCase()).filter(item => item && item !== "other"))]
}

function pairAverage(group, scorePair) {
  const scores = []
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) scores.push(scorePair(group[left], group[right]))
  }
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : NEUTRAL_PAIR_SCORE
}

function lockedPairCount(group, lockedPairsSet) {
  let count = 0
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      if (lockedPairsSet?.has(event3SparkPairKey(group[left], group[right]))) count++
    }
  }
  return count
}

/**
 * The five original values scenarios use an exact/adjacent/opposite rubric.
 * Missing answers contribute no evidence, matching the historical rubric used
 * by the Spark group scorer.
 */
export function calculateRound2CoreValuesScore(participantA = {}, participantB = {}) {
  let rawScore = 0
  for (let index = 1; index <= 5; index++) {
    const left = choice(answer(participantA, `core_values_${index}`))
    const right = choice(answer(participantB, `core_values_${index}`))
    if (left && left === right) rawScore += 4
    else if ((left === "B" && ["A", "C"].includes(right)) || (right === "B" && ["A", "C"].includes(left))) rawScore += 2
  }
  return clamp(rawScore * 0.5, 0, 10)
}

/**
 * Round 2 is intentionally different from Spark: common focus/intent, values,
 * depth, emotional safety, and sustainable lifestyle carry the full score.
 * Age is deliberately absent and is used only as a final schedule tie-break.
 */
export function calculateRound2DepthPairBreakdown(participantA = {}, participantB = {}) {
  const balanced = calculateBalancedCompatibility(
    withCurrentFocusAlias(participantA),
    withCurrentFocusAlias(participantB),
    { vibeScore: 6 },
  )
  const questions = balanced.questionScores || {}
  const breakdown = balanced.scoreBreakdown || {}
  const raw = {
    commonGround: (Number(questions.currentFocus) || 0) + (Number(questions.intent) || 0),
    coreValues: calculateRound2CoreValuesScore(participantA, participantB),
    conversationDepth: Number(questions.conversationDepth) || 0,
    emotionalSafety: Number(breakdown.communicationDisagreement) || 0,
    lifestyle: Number(breakdown.lifestyleSustainability) || 0,
  }
  const weighted = {
    commonGround: raw.commonGround * (30 / (BALANCED_WEIGHTS.currentFocus + BALANCED_WEIGHTS.intent)),
    coreValues: raw.coreValues * (25 / 10),
    conversationDepth: raw.conversationDepth * (20 / BALANCED_WEIGHTS.conversationDepth),
    emotionalSafety: raw.emotionalSafety * (15 / (BALANCED_WEIGHTS.disagreement + BALANCED_WEIGHTS.communication1 + BALANCED_WEIGHTS.communication2 + BALANCED_WEIGHTS.communication3 + BALANCED_WEIGHTS.communication4 + BALANCED_WEIGHTS.communication5)),
    lifestyle: raw.lifestyle * (10 / (BALANCED_WEIGHTS.lifestyle1 + BALANCED_WEIGHTS.lifestyle2 + BALANCED_WEIGHTS.lifestyle3 + BALANCED_WEIGHTS.lifestyle4 + BALANCED_WEIGHTS.lifestyle5)),
  }
  const score = clamp(Object.values(weighted).reduce((sum, value) => sum + value, 0), 0, 100)
  return { score, raw, weighted, balanced }
}

export function calculateRound2DepthPairScore(participantA = {}, participantB = {}) {
  return calculateRound2DepthPairBreakdown(participantA, participantB).score
}

/**
 * Round 3 rewards complementary conversation mechanics and safe humor rather
 * than repeating the common-ground logic used by Round 2.
 */
export function calculateRound3RhythmPairBreakdown(participantA = {}, participantB = {}) {
  const balanced = calculateBalancedCompatibility(participantA, participantB, { vibeScore: 6 })
  const questions = balanced.questionScores || {}
  const raw = {
    roleComplement: Number(questions.initiative) || 0,
    curiosity: Number(questions.curiosityStyle) || 0,
    socialBattery: Number(questions.socialBattery) || 0,
    humorOpenness: (Number(questions.humorBanter) || 0) + (Number(questions.earlyOpenness) || 0),
    silenceComfort: Number(questions.silence) || 0,
  }
  const weighted = {
    roleComplement: raw.roleComplement * (30 / BALANCED_WEIGHTS.initiative),
    curiosity: raw.curiosity * (25 / BALANCED_WEIGHTS.curiosityStyle),
    socialBattery: raw.socialBattery * (20 / BALANCED_WEIGHTS.socialBattery),
    humorOpenness: raw.humorOpenness * (15 / (BALANCED_WEIGHTS.humorBanter + BALANCED_WEIGHTS.earlyOpenness)),
    silenceComfort: raw.silenceComfort * (10 / BALANCED_WEIGHTS.silence),
  }
  const score = clamp(Object.values(weighted).reduce((sum, value) => sum + value, 0), 0, 100)
  return { score, raw, weighted, balanced }
}

export function calculateRound3RhythmPairScore(participantA = {}, participantB = {}) {
  return calculateRound3RhythmPairBreakdown(participantA, participantB).score
}

export function createRoundLensScorer({
  profileMap = new Map(),
  lockedPairsSet = new Set(),
} = {}) {
  const depthPairScores = new Map()
  const rhythmPairScores = new Map()
  const sparkPairScores = new Map()

  const cachedPairScore = (cache, calculator, left, right) => {
    const key = event3SparkPairKey(left, right)
    if (cache.has(key)) return cache.get(key)
    const profileA = profileFor(profileMap, left)
    const profileB = profileFor(profileMap, right)
    const score = profileA && profileB ? calculator(profileA, profileB) : NEUTRAL_PAIR_SCORE
    cache.set(key, score)
    return score
  }

  const depthPairScore = (left, right) => cachedPairScore(depthPairScores, calculateRound2DepthPairScore, left, right)
  const rhythmPairScore = (left, right) => cachedPairScore(rhythmPairScores, calculateRound3RhythmPairScore, left, right)
  const sparkPairScore = (left, right) => cachedPairScore(sparkPairScores, calculateRound1SparkPairScore, left, right)

  const depthGroup = group => {
    const profiles = group.map(number => profileFor(profileMap, number) || {})
    const depths = profiles.map(depthPreference).filter(Boolean)
    const roles = profiles.map(canonicalRole).filter(Boolean)
    const curiosity = profiles.map(profile => choice(answer(profile, "curiosity_style"))).filter(value => ["A", "B", "C"].includes(value))
    const depthMismatch = depths.includes("deep") && depths.includes("light")
    const depthCoverageIncomplete = depths.length < group.length
    const roleCoverageIncomplete = roles.length < group.length
    const curiosityCoverageIncomplete = curiosity.length < group.length
    const initiatorMissing = !roles.includes("A")
    const curiosityMixMissing = new Set(curiosity).size < 2
    return {
      score: pairAverage(group, depthPairScore),
      depthMismatch,
      depthCoverageIncomplete,
      roleCoverageIncomplete,
      curiosityCoverageIncomplete,
      initiatorMissing,
      curiosityMixMissing,
      lockedPairs: lockedPairCount(group, lockedPairsSet),
      depthStyleCount: new Set(depths).size,
      curiosityStyleCount: new Set(curiosity).size,
    }
  }

  const rhythmGroup = group => {
    const profiles = group.map(number => profileFor(profileMap, number) || {})
    const roles = profiles.map(canonicalRole).filter(Boolean)
    const roleSet = new Set(roles)
    const curiosity = profiles.map(profile => choice(answer(profile, "curiosity_style"))).filter(value => ["A", "B", "C"].includes(value))
    const curiositySet = new Set(curiosity)
    const batteries = profiles.map(profile => choice(answer(profile, "social_battery"))).filter(value => ["A", "B"].includes(value))
    const batterySet = new Set(batteries)
    const humor = profiles.map(profile => choice(answer(profile, "humor_banter_style"))).filter(value => ["A", "B", "C", "D"].includes(value))
    const humorSet = new Set(humor)
    const focusSet = new Set(profiles.flatMap(normalizedFocus))

    const roleCoverageIncomplete = roles.length < group.length
    const curiosityCoverageIncomplete = curiosity.length < group.length
    const initiatorMissing = !roleSet.has("A")
    const roleTrioMissing = !["A", "B", "C"].every(role => roleSet.has(role))
    const curiosityFlowMissing = !(curiositySet.has("A") && curiositySet.has("B"))
    const humorClash = humorSet.has("A") && humorSet.has("D")

    const basePairScore = pairAverage(group, rhythmPairScore)
    let compositionBonus = 0
    if (roleSet.has("A") && roleSet.has("B")) compositionBonus += 5
    if (["A", "B", "C"].every(role => roleSet.has(role))) compositionBonus += 8
    if (curiositySet.has("A") && curiositySet.has("B")) compositionBonus += 8
    if (curiositySet.has("C")) compositionBonus += 4
    if (batterySet.size === 2) compositionBonus += 4
    compositionBonus += Math.min(8, Math.max(0, focusSet.size - 1) * 2)
    if (humorClash) compositionBonus -= 5

    return {
      score: basePairScore,
      basePairScore,
      compositionBonus,
      qualityScore: clamp(basePairScore + compositionBonus, 0, 100),
      roleCoverageIncomplete,
      curiosityCoverageIncomplete,
      initiatorMissing,
      roleTrioMissing,
      curiosityFlowMissing,
      humorClash,
      lockedPairs: lockedPairCount(group, lockedPairsSet),
      roleCount: roleSet.size,
      curiosityStyleCount: curiositySet.size,
      socialBatteryStyleCount: batterySet.size,
      focusDiversity: focusSet.size,
    }
  }

  return Object.freeze({ depthPairScore, rhythmPairScore, sparkPairScore, depthGroup, rhythmGroup })
}
