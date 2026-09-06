import {
  BALANCED_WEIGHTS,
  BALANCED_VIBE_MAX,
  calculateBalancedCompatibility,
  getBalancedAnswer,
  normalizeBalancedChoice,
} from "../matching/balanced-compatibility.mjs"
import { normalizedGender } from "./round2-age-optimizer.mjs"

export const ROUND1_SPARK_OPTIMIZATION_PASSES = 40
const NEUTRAL_PAIR_SCORE = 50
const NEUTRAL_VIBE_SCORE = BALANCED_VIBE_MAX / 2
const INTERNAL_PAIR_SCORE_CACHE = Symbol("round1SparkPairScoreCache")

const SPARK_MAXIMA = Object.freeze({
  interaction: BALANCED_WEIGHTS.initiative
    + BALANCED_WEIGHTS.conversationDepth
    + BALANCED_WEIGHTS.socialBattery
    + BALANCED_WEIGHTS.humorSubtype
    + BALANCED_WEIGHTS.curiosityStyle
    + BALANCED_WEIGHTS.silence,
  humorOpenness: BALANCED_WEIGHTS.humorBanter + BALANCED_WEIGHTS.earlyOpenness,
  vibe: 12,
  structured: BALANCED_WEIGHTS.disagreement + BALANCED_WEIGHTS.currentFocus + BALANCED_WEIGHTS.similarityPreference,
  attachment: BALANCED_WEIGHTS.attachment1 + BALANCED_WEIGHTS.attachment3 + BALANCED_WEIGHTS.attachment4,
  lifestyle: BALANCED_WEIGHTS.lifestyle1
    + BALANCED_WEIGHTS.lifestyle2
    + BALANCED_WEIGHTS.lifestyle3
    + BALANCED_WEIGHTS.lifestyle4
    + BALANCED_WEIGHTS.lifestyle5,
  coreValues: 10,
})

const SPARK_WEIGHTS = Object.freeze({
  interaction: 37,
  humorOpenness: 27,
  vibe: 12,
  structured: 14,
  attachment: 3,
  lifestyle: 3,
  coreValues: 4,
})

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

function finite(value) {
  if (value === null || value === undefined) return null
  if (typeof value === "string" && value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value)
    if (number !== null) return number
  }
  return null
}

function mapValue(source, key) {
  if (source instanceof Map) return source.get(key)
  return source?.[key]
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

function canonicalRole(profile) {
  const role = choice(answer(profile, "conversational_role"))
  if (["A", "INITIATOR", "INITIATE", "LEADER", "مبادر", "المبادر"].includes(role)) return "A"
  if (["B", "REACTOR", "RESPONDER", "RESPONSE", "متفاعل", "المتفاعل"].includes(role)) return "B"
  if (["C", "OBSERVER", "LISTENER", "BALANCER", "مستمع", "المستمع", "مراقب", "المراقب"].includes(role)) return "C"
  return role || null
}

function depthPreference(profile) {
  const legacy = String(answer(profile, "vibe_4") ?? "").trim().toUpperCase()
  if (["نعم", "نَعَم", "YES", "Y", "TRUE", "1"].includes(legacy)) return "deep"
  if (["لا", "لَا", "NO", "N", "FALSE", "0"].includes(legacy)) return "light"
  if (["أحياناً", "أحيانا", "SOMETIMES", "FLEXIBLE"].includes(legacy)) return "flexible"

  const current = choice(answer(profile, "conversation_depth_pref"))
  if (["A", "DEEP", "DEPTH", "عميق"].includes(current)) return "deep"
  if (["B", "LIGHT", "خفيف"].includes(current)) return "light"
  if (["C", "FLEXIBLE", "MIX", "مرن"].includes(current)) return "flexible"
  return null
}

function participantAge(profile, ageMap, number) {
  return firstFinite(mapValue(ageMap, number), answer(profile, "age"))
}

function sumQuestionScores(questionScores, keys) {
  return keys.reduce((sum, key) => sum + (finite(questionScores?.[key]) ?? 0), 0)
}

function legacyCoreValuesScore(participantA, participantB) {
  let rawScore = 0
  for (let index = 1; index <= 5; index++) {
    const left = choice(answer(participantA, `core_values_${index}`))
    const right = choice(answer(participantB, `core_values_${index}`))
    if (left && left === right) rawScore += 4
    else if ((left === "B" && ["A", "C"].includes(right)) || (right === "B" && ["A", "C"].includes(left))) rawScore += 2
  }
  return clamp(rawScore * 0.5, 0, SPARK_MAXIMA.coreValues)
}

export function event3SparkPairKey(left, right) {
  const a = Number(left)
  const b = Number(right)
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/**
 * Calculate the old group-only Spark pair score directly from survey answers.
 * The current pure balanced scorer supplies the component fits, while a fixed
 * neutral vibe keeps this path deterministic and independent of AI/cache state.
 */
export function calculateRound1SparkPairBreakdown(participantA = {}, participantB = {}) {
  const balanced = calculateBalancedCompatibility(participantA, participantB, {
    vibeScore: NEUTRAL_VIBE_SCORE,
  })
  const questions = balanced.questionScores || {}
  const breakdown = balanced.scoreBreakdown || {}

  const components = {
    interaction: clamp(finite(breakdown.interactionRhythm) ?? 0, 0, SPARK_MAXIMA.interaction),
    humorOpenness: clamp(finite(breakdown.humorOpenness) ?? 0, 0, SPARK_MAXIMA.humorOpenness),
    vibe: clamp(finite(breakdown.aiSemantic) ?? NEUTRAL_VIBE_SCORE, 0, SPARK_MAXIMA.vibe),
    structured: clamp(sumQuestionScores(questions, ["disagreement", "currentFocus", "similarityPreference"]), 0, SPARK_MAXIMA.structured),
    attachment: clamp(finite(breakdown.attachmentComfort) ?? 0, 0, SPARK_MAXIMA.attachment),
    lifestyle: clamp(finite(breakdown.lifestyleSustainability) ?? 0, 0, SPARK_MAXIMA.lifestyle),
    // Preserve the historical five-scenario 0..10 values rubric. Religion,
    // social style, and expression language remain outside this four-point slice.
    coreValues: legacyCoreValuesScore(participantA, participantB),
  }

  const weighted = Object.fromEntries(Object.keys(components).map(key => [
    key,
    components[key] * (SPARK_WEIGHTS[key] / SPARK_MAXIMA[key]),
  ]))
  const score = clamp(Object.values(weighted).reduce((sum, value) => sum + value, 0), 0, 100)

  return { score, components, weighted, balanced }
}

export function calculateRound1SparkPairScore(participantA = {}, participantB = {}) {
  return calculateRound1SparkPairBreakdown(participantA, participantB).score
}

function profileFor(profileMap, number) {
  return mapValue(profileMap, Number(number)) || null
}

function pairScore(profileMap, cache, left, right) {
  const key = event3SparkPairKey(left, right)
  if (cache.has(key)) return cache.get(key)
  const profileA = profileFor(profileMap, left)
  const profileB = profileFor(profileMap, right)
  const score = profileA && profileB
    ? calculateRound1SparkPairScore(profileA, profileB)
    : NEUTRAL_PAIR_SCORE
  cache.set(key, score)
  return score
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

export function scoreRound1SparkGroup(group, {
  profileMap = new Map(),
  ageMap = {},
  lockedPairsSet = new Set(),
  ...internal
} = {}) {
  const profiles = group.map(number => profileFor(profileMap, number) || {})
  const scoreCache = internal[INTERNAL_PAIR_SCORE_CACHE] || new Map()
  const pairScores = []
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      pairScores.push(pairScore(profileMap, scoreCache, group[left], group[right]))
    }
  }
  const basePairScore = pairScores.length
    ? pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length
    : NEUTRAL_PAIR_SCORE
  let score = basePairScore

  const ages = group.map((number, index) => participantAge(profiles[index], ageMap, number)).filter(value => value !== null)
  const completeAges = ages.length === group.length
  const ageRange = completeAges ? Math.max(...ages) - Math.min(...ages) : null
  if (ageRange !== null && ageRange <= 3) score += 5

  const humorStyles = profiles.map(profile => choice(answer(profile, "humor_banter_style"))).filter(Boolean)
  const uniqueHumorStyles = new Set(humorStyles)
  const humorClash = uniqueHumorStyles.has("A") && uniqueHumorStyles.has("D")
  if (humorClash) score -= 5
  if (humorStyles.length >= 2 && uniqueHumorStyles.size <= 2) score += 3

  const roles = profiles.map(canonicalRole).filter(Boolean)
  const recognizedRoles = new Set(roles.filter(role => ["A", "B", "C"].includes(role)))
  const hasInitiator = recognizedRoles.has("A")
  const hasReactor = recognizedRoles.has("B")
  if (roles.length >= 2 && recognizedRoles.size >= 2) score += 3
  if (recognizedRoles.size === 3) score += 3
  if (hasInitiator && hasReactor) score += 10

  const curiosity = profiles.map(profile => choice(answer(profile, "curiosity_style"))).filter(Boolean)
  const curiosityStyles = new Set(curiosity)
  if (curiosity.length >= 2 && curiosityStyles.has("A") && curiosityStyles.has("B")) score += 4
  if (curiosity.length >= 2 && curiosityStyles.has("C")) score += 2

  const depths = profiles.map(depthPreference).filter(Boolean)
  const depthMismatch = depths.includes("deep") && depths.includes("light")
  const initiatorMissing = roles.length === group.length && !hasInitiator
  const ageRangeViolation = ageRange !== null && ageRange > 15
  const lockedPairs = lockedPairCount(group, lockedPairsSet)

  return {
    score,
    basePairScore,
    ageRange,
    ageRangeViolation,
    depthMismatch,
    initiatorMissing,
    lockedPairs,
    humorClash,
    humorStyleCount: uniqueHumorStyles.size,
    roleCount: recognizedRoles.size,
    curiosityStyleCount: curiosityStyles.size,
  }
}

export function createRound1SparkGroupScorer(options = {}) {
  const scoreOptions = { ...options, [INTERNAL_PAIR_SCORE_CACHE]: new Map() }
  return group => scoreRound1SparkGroup(group, scoreOptions)
}

function aggregateFitness(groupScores) {
  return {
    lockedPairs: groupScores.reduce((sum, group) => sum + group.lockedPairs, 0),
    depthMismatches: groupScores.filter(group => group.depthMismatch).length,
    missingInitiators: groupScores.filter(group => group.initiatorMissing).length,
    ageRangeViolations: groupScores.filter(group => group.ageRangeViolation).length,
    score: groupScores.reduce((sum, group) => sum + group.score, 0),
    groupScores,
  }
}

function planFitness(groups, options) {
  return aggregateFitness(groups.map(group => scoreRound1SparkGroup(group, options)))
}

function fitnessWithReplacements(current, replacements) {
  return aggregateFitness(current.groupScores.map((score, index) => replacements.get(index) || score))
}

function compareFitness(left, right) {
  for (const key of ["lockedPairs", "depthMismatches", "missingInitiators", "ageRangeViolations"]) {
    if (left[key] !== right[key]) return right[key] - left[key]
  }
  return left.score - right.score
}

/**
 * Improve only Round 1 by swapping people between same-gender slots. Keeping
 * every slot's gender category fixed preserves all gender guarantees when the
 * later cyclic rounds are derived from this grid.
 */
export function optimizeRound1SparkGroups(round1, options = {}) {
  if (!Array.isArray(round1) || round1.length < 2 || round1.some(group => !Array.isArray(group) || group.length < 1)) {
    throw new TypeError("Round 1 Spark optimization requires at least two non-empty groups")
  }

  const groups = round1.map(group => [...group])
  const genderMap = options.genderMap || {}
  const scoreOptions = { ...options, [INTERNAL_PAIR_SCORE_CACHE]: new Map() }
  const cells = groups.flatMap((group, table) => group.map((number, index) => ({ table, index, number })))
  const before = planFitness(groups, scoreOptions)
  let current = before
  let swaps = 0

  for (let pass = 0; pass < ROUND1_SPARK_OPTIMIZATION_PASSES; pass++) {
    let best = null
    for (let left = 0; left < cells.length; left++) {
      for (let right = left + 1; right < cells.length; right++) {
        const a = cells[left]
        const b = cells[right]
        if (a.table === b.table) continue
        const numberA = groups[a.table][a.index]
        const numberB = groups[b.table][b.index]
        if (normalizedGender(mapValue(genderMap, numberA)) !== normalizedGender(mapValue(genderMap, numberB))) continue

        groups[a.table][a.index] = numberB
        groups[b.table][b.index] = numberA
        const replacements = new Map([
          [a.table, scoreRound1SparkGroup(groups[a.table], scoreOptions)],
          [b.table, scoreRound1SparkGroup(groups[b.table], scoreOptions)],
        ])
        const candidate = fitnessWithReplacements(current, replacements)
        if (compareFitness(candidate, current) > 1e-9 && (!best || compareFitness(candidate, best.fitness) > 1e-9)) {
          best = { a, b, fitness: candidate }
        }
        groups[a.table][a.index] = numberA
        groups[b.table][b.index] = numberB
      }
    }

    if (!best) break
    const numberA = groups[best.a.table][best.a.index]
    groups[best.a.table][best.a.index] = groups[best.b.table][best.b.index]
    groups[best.b.table][best.b.index] = numberA
    current = best.fitness
    swaps++
  }

  return { groups, metrics: { before, after: current, swaps } }
}
