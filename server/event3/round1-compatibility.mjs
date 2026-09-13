import {
  BALANCED_VIBE_MAX,
  calculateBalancedCompatibility,
} from "../matching/balanced-compatibility.mjs"
import { normalizedGender } from "./round2-age-optimizer.mjs"

export const ROUND1_COMPATIBILITY_OPTIMIZATION_PASSES = 40
const NEUTRAL_PAIR_SCORE = 50
const INTERNAL_PAIR_SCORE_CACHE = Symbol("round1CompatibilityPairScoreCache")

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

function mapValue(source, key) {
  if (source instanceof Map) return source.get(key)
  return source?.[key]
}

function finiteScore(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? clamp(number, 0, 100) : null
}

export function event3CompatibilityPairKey(left, right) {
  const a = Number(left)
  const b = Number(right)
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function profileFor(profileMap, number) {
  return mapValue(profileMap, Number(number)) || null
}

function calculateFallbackScore(profileA, profileB) {
  if (!profileA || !profileB) return NEUTRAL_PAIR_SCORE
  return finiteScore(calculateBalancedCompatibility(profileA, profileB, {
    vibeScore: BALANCED_VIBE_MAX / 2,
  }).totalScore) ?? NEUTRAL_PAIR_SCORE
}

function resolvePairScore({ compatibilityScoreMap, profileMap, cache }, left, right) {
  const key = event3CompatibilityPairKey(left, right)
  if (cache.has(key)) return cache.get(key)

  const cachedScore = finiteScore(mapValue(compatibilityScoreMap, key))
  const result = cachedScore === null
    ? {
        score: calculateFallbackScore(profileFor(profileMap, left), profileFor(profileMap, right)),
        source: "questionnaire",
      }
    : { score: cachedScore, source: "cache" }
  cache.set(key, result)
  return result
}

function lockedPairCount(group, lockedPairsSet) {
  let count = 0
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      if (lockedPairsSet?.has(event3CompatibilityPairKey(group[left], group[right]))) count++
    }
  }
  return count
}

export function scoreRound1CompatibilityGroup(group, {
  compatibilityScoreMap = new Map(),
  compatibilityProfileMap,
  profileMap = new Map(),
  lockedPairsSet = new Set(),
  ...internal
} = {}) {
  const pairScoreCache = internal[INTERNAL_PAIR_SCORE_CACHE] || new Map()
  const effectiveProfileMap = compatibilityProfileMap || profileMap
  const pairs = []

  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      pairs.push(resolvePairScore({
        compatibilityScoreMap,
        profileMap: effectiveProfileMap,
        cache: pairScoreCache,
      }, group[left], group[right]))
    }
  }

  const pairScoreTotal = pairs.reduce((sum, pair) => sum + pair.score, 0)
  const score = pairs.length ? pairScoreTotal / pairs.length : NEUTRAL_PAIR_SCORE
  return {
    score,
    qualityScore: score,
    pairScoreTotal,
    minimumPairScore: pairs.length ? Math.min(...pairs.map(pair => pair.score)) : NEUTRAL_PAIR_SCORE,
    scoredPairs: pairs.length,
    cachedPairs: pairs.filter(pair => pair.source === "cache").length,
    fallbackPairs: pairs.filter(pair => pair.source === "questionnaire").length,
    lockedPairs: lockedPairCount(group, lockedPairsSet),
  }
}

export function createRound1CompatibilityGroupScorer(options = {}) {
  const scoreOptions = { ...options, [INTERNAL_PAIR_SCORE_CACHE]: new Map() }
  return group => scoreRound1CompatibilityGroup(group, scoreOptions)
}

function aggregateFitness(groupScores) {
  const pairScoreTotal = groupScores.reduce((sum, group) => sum + Number(group.pairScoreTotal || 0), 0)
  const scoredPairs = groupScores.reduce((sum, group) => sum + Number(group.scoredPairs || 0), 0)
  return {
    lockedPairs: groupScores.reduce((sum, group) => sum + Number(group.lockedPairs || 0), 0),
    pairScoreTotal,
    scoredPairs,
    cachedPairs: groupScores.reduce((sum, group) => sum + Number(group.cachedPairs || 0), 0),
    fallbackPairs: groupScores.reduce((sum, group) => sum + Number(group.fallbackPairs || 0), 0),
    score: scoredPairs ? pairScoreTotal / scoredPairs : NEUTRAL_PAIR_SCORE,
    minimumGroupScore: groupScores.length ? Math.min(...groupScores.map(group => Number(group.score || 0))) : 0,
    groupScores,
  }
}

function fitnessWithReplacements(current, replacements) {
  return aggregateFitness(current.groupScores.map((score, index) => replacements.get(index) || score))
}

function compareFitness(left, right) {
  if (left.lockedPairs !== right.lockedPairs) return right.lockedPairs - left.lockedPairs
  if (Math.abs(left.pairScoreTotal - right.pairScoreTotal) > 1e-9) return left.pairScoreTotal - right.pairScoreTotal
  if (Math.abs(left.minimumGroupScore - right.minimumGroupScore) > 1e-9) return left.minimumGroupScore - right.minimumGroupScore
  return left.score - right.score
}

/**
 * Improves total within-table compatibility through same-gender swaps. Keeping
 * each slot's gender fixed preserves the schedule's gender-balance guarantees.
 */
export function optimizeRound1CompatibilityGroups(round1, options = {}) {
  if (!Array.isArray(round1) || round1.length < 2 || round1.some(group => !Array.isArray(group) || group.length < 1)) {
    throw new TypeError("Round 1 compatibility optimization requires at least two non-empty groups")
  }

  const groups = round1.map(group => [...group])
  const genderMap = options.genderMap || {}
  const scoreOptions = { ...options, [INTERNAL_PAIR_SCORE_CACHE]: new Map() }
  const scoreGroup = group => scoreRound1CompatibilityGroup(group, scoreOptions)
  const cells = groups.flatMap((group, table) => group.map((number, index) => ({ table, index })))
  const before = aggregateFitness(groups.map(scoreGroup))
  let current = before
  let swaps = 0

  for (let pass = 0; pass < ROUND1_COMPATIBILITY_OPTIMIZATION_PASSES; pass++) {
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
        const candidate = fitnessWithReplacements(current, new Map([
          [a.table, scoreGroup(groups[a.table])],
          [b.table, scoreGroup(groups[b.table])],
        ]))
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
