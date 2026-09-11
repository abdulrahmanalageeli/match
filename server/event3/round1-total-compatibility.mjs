import { calculateBalancedCompatibility } from "../matching/balanced-compatibility.mjs"
import { normalizedGender } from "./round2-age-optimizer.mjs"

export const ROUND1_COMPATIBILITY_OPTIMIZATION_PASSES = 40

const NEUTRAL_PAIR_SCORE = 50
const INTERNAL_PAIR_SCORE_CACHE = Symbol("round1TotalCompatibilityPairScoreCache")

function mapValue(source, key) {
  return source instanceof Map ? source.get(key) : source?.[key]
}

function finiteScore(value) {
  const candidate = value && typeof value === "object"
    ? value.totalScore ?? value.total_compatibility_score ?? value.score
    : value
  if (candidate === null || candidate === undefined || (typeof candidate === "string" && candidate.trim() === "")) return null
  const parsed = Number(candidate)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null
}

export function event3CompatibilityPairKey(left, right) {
  const a = Number(left)
  const b = Number(right)
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/**
 * Event3 Round 1 uses the same total score as the main matching engine. The AI
 * chemistry adjustment is intentionally omitted here: group seating requires
 * every pair, while AI/cache rows only exist for a subset of one-to-one-eligible
 * pairs. One deterministic formula for all pairs keeps the partition fair.
 */
export function calculateRound1TotalCompatibilityPairScore(participantA = {}, participantB = {}) {
  return finiteScore(calculateBalancedCompatibility(participantA, participantB).totalScore)
    ?? NEUTRAL_PAIR_SCORE
}

function pairScore(options, left, right) {
  const cache = options[INTERNAL_PAIR_SCORE_CACHE]
  const key = event3CompatibilityPairKey(left, right)
  if (cache.has(key)) return cache.get(key)

  const supplied = finiteScore(mapValue(options.pairScoreMap, key))
  const profileA = mapValue(options.profileMap, Number(left))
  const profileB = mapValue(options.profileMap, Number(right))
  const complete = Boolean(profileA && profileB)
  const score = supplied ?? (complete
    ? calculateRound1TotalCompatibilityPairScore(profileA, profileB)
    : NEUTRAL_PAIR_SCORE)
  const result = { score, complete: supplied !== null || complete }
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

export function scoreRound1TotalCompatibilityGroup(group, options = {}) {
  const scoreOptions = options[INTERNAL_PAIR_SCORE_CACHE]
    ? options
    : { ...options, [INTERNAL_PAIR_SCORE_CACHE]: new Map() }
  const scores = []
  let scoredPairCount = 0
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      const pair = pairScore(scoreOptions, group[left], group[right])
      scores.push(pair.score)
      if (pair.complete) scoredPairCount++
    }
  }
  const totalPairScore = scores.reduce((sum, score) => sum + score, 0)
  const pairCount = scores.length
  return {
    score: pairCount ? totalPairScore / pairCount : NEUTRAL_PAIR_SCORE,
    qualityScore: pairCount ? totalPairScore / pairCount : NEUTRAL_PAIR_SCORE,
    totalPairScore,
    pairCount,
    scoredPairCount,
    neutralPairCount: pairCount - scoredPairCount,
    compatibilityCoverageIncomplete: scoredPairCount < pairCount,
    minimumPairScore: scores.length ? Math.min(...scores) : NEUTRAL_PAIR_SCORE,
    maximumPairScore: scores.length ? Math.max(...scores) : NEUTRAL_PAIR_SCORE,
    lockedPairs: lockedPairCount(group, scoreOptions.lockedPairsSet),
  }
}

export function createRound1TotalCompatibilityScorer(options = {}) {
  const scoreOptions = {
    ...options,
    profileMap: options.compatibilityProfileMap || options.profileMap || new Map(),
    [INTERNAL_PAIR_SCORE_CACHE]: new Map(),
  }
  return {
    groupScore: group => scoreRound1TotalCompatibilityGroup(group, scoreOptions),
    pairScore: (left, right) => pairScore(scoreOptions, left, right).score,
  }
}

export function createRound1TotalCompatibilityGroupScorer(options = {}) {
  return createRound1TotalCompatibilityScorer(options).groupScore
}

export function buildRound1TotalCompatibilityPairScoreMap(participants = [], options = {}) {
  const scorer = createRound1TotalCompatibilityScorer(options)
  const scores = new Map()
  for (let left = 0; left < participants.length; left++) {
    for (let right = left + 1; right < participants.length; right++) {
      scores.set(
        event3CompatibilityPairKey(participants[left], participants[right]),
        scorer.pairScore(participants[left], participants[right]),
      )
    }
  }
  return scores
}

export function summarizeRound1TotalCompatibilityGroups(groupScores = []) {
  const totalPairScore = groupScores.reduce((sum, group) => sum + Number(group.totalPairScore || 0), 0)
  const pairCount = groupScores.reduce((sum, group) => sum + Number(group.pairCount || 0), 0)
  const scoredPairCount = groupScores.reduce((sum, group) => sum + Number(group.scoredPairCount || 0), 0)
  return {
    score: pairCount ? totalPairScore / pairCount : NEUTRAL_PAIR_SCORE,
    qualityScore: pairCount ? totalPairScore / pairCount : NEUTRAL_PAIR_SCORE,
    totalPairScore,
    pairCount,
    scoredPairCount,
    neutralPairCount: pairCount - scoredPairCount,
    compatibilityCoverageIncomplete: scoredPairCount < pairCount,
    minimumGroupScore: groupScores.length ? Math.min(...groupScores.map(group => Number(group.score || 0))) : NEUTRAL_PAIR_SCORE,
    minimumPairScore: groupScores.length ? Math.min(...groupScores.map(group => Number(group.minimumPairScore || 0))) : NEUTRAL_PAIR_SCORE,
    lockedPairs: groupScores.reduce((sum, group) => sum + Number(group.lockedPairs || 0), 0),
    groupScores,
  }
}

function planFitness(groups, groupScore) {
  return summarizeRound1TotalCompatibilityGroups(groups.map(groupScore))
}

function fitnessWithReplacements(current, replacements) {
  return summarizeRound1TotalCompatibilityGroups(
    current.groupScores.map((score, index) => replacements.get(index) || score),
  )
}

function compareFitness(left, right) {
  if (left.lockedPairs !== right.lockedPairs) return right.lockedPairs - left.lockedPairs
  if (Math.abs(left.totalPairScore - right.totalPairScore) > 1e-9) return left.totalPairScore - right.totalPairScore
  if (Math.abs(left.minimumGroupScore - right.minimumGroupScore) > 1e-9) return left.minimumGroupScore - right.minimumGroupScore
  return left.minimumPairScore - right.minimumPairScore
}

/**
 * Improve Round 1 through same-gender swaps. This preserves every gender slot
 * in the structural seven-table grid while maximizing the sum of all pairwise
 * total-compatibility scores; weakest-table quality breaks exact ties.
 */
export function optimizeRound1TotalCompatibilityGroups(round1, options = {}) {
  if (!Array.isArray(round1) || round1.length < 2 || round1.some(group => !Array.isArray(group) || group.length < 1)) {
    throw new TypeError("Round 1 compatibility optimization requires at least two non-empty groups")
  }

  const groups = round1.map(group => [...group])
  const genderMap = options.genderMap || {}
  const scorer = createRound1TotalCompatibilityScorer(options)
  const cells = groups.flatMap((group, table) => group.map((number, index) => ({ table, index })))
  const before = planFitness(groups, scorer.groupScore)
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
          [a.table, scorer.groupScore(groups[a.table])],
          [b.table, scorer.groupScore(groups[b.table])],
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
