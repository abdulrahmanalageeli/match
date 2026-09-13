import { createRound1CompatibilityGroupScorer, event3CompatibilityPairKey } from "./round1-compatibility.mjs"
import { createRound2AgeGroupScorer } from "./round2-age-lens.mjs"
import { createRoundLensScorer, getRound3RhythmProfileMissingFields } from "./round23-lenses.mjs"

const ROUND_CRITERIA = Object.freeze({
  1: "compatibility",
  2: "age",
  3: "rhythm",
})

function parseSurveyData(value) {
  if (!value) return {}
  if (typeof value === "object") return value
  try { return JSON.parse(value) || {} } catch { return {} }
}

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

function pairNumbers(value) {
  if (Array.isArray(value)) return value
  return [
    value?.participant1_number ?? value?.participant_a_number,
    value?.participant2_number ?? value?.participant_b_number,
  ]
}

/**
 * Re-scores the currently stored choice-only group assignments. This is kept
 * separate from the immutable approval report so manual swaps update the live
 * table map without rewriting the original decision audit.
 */
export function buildEvent3LiveSeatingScores({
  assignments = [],
  profiles = [],
  protectedPairs = [],
  compatibilityScoreMap = new Map(),
} = {}) {
  const groupAssignments = assignments.filter(row => [1, 2, 3].includes(Number(row.round)))
  const participantNumbers = [...new Set(groupAssignments.map(row => Number(row.participant_id)).filter(Number.isInteger))]
  if (!participantNumbers.length) return null

  const fullProfileMap = new Map(profiles.map(profile => [Number(profile.assigned_number), {
    ...profile,
    survey_data: parseSurveyData(profile.survey_data),
  }]))
  const incompleteProfiles = new Set(participantNumbers.filter(number => {
    const profile = fullProfileMap.get(number)
    return !profile || getRound3RhythmProfileMissingFields(profile).length > 0
  }))
  const scoreProfileMap = new Map([...fullProfileMap].filter(([number]) => !incompleteProfiles.has(number)))
  const ageMap = new Map(participantNumbers.map(number => {
    const profile = fullProfileMap.get(number) || {}
    const survey = profile.survey_data || {}
    return [number, profile.age || survey?.answers?.age || survey?.age || null]
  }))
  const lockedPairsSet = new Set(protectedPairs.map(pairNumbers).map(([left, right]) =>
    event3CompatibilityPairKey(Number(left), Number(right))))
  const compatibilityGroup = createRound1CompatibilityGroupScorer({
    profileMap: fullProfileMap,
    compatibilityScoreMap,
    lockedPairsSet,
  })
  const ageGroup = createRound2AgeGroupScorer({ profileMap: fullProfileMap, ageMap, lockedPairsSet })
  const lenses = createRoundLensScorer({ profileMap: scoreProfileMap, lockedPairsSet })
  const scorerByRound = {
    1: group => compatibilityGroup(group),
    2: group => ageGroup(group),
    3: group => lenses.rhythmGroup(group),
  }

  const result = {}
  for (const round of [1, 2, 3]) {
    const tables = new Map()
    for (const row of groupAssignments.filter(item => Number(item.round) === round)) {
      const tableNumber = Number(row.table_number)
      if (!tables.has(tableNumber)) tables.set(tableNumber, [])
      tables.get(tableNumber).push(Number(row.participant_id))
    }
    const scoredTables = {}
    const tableMetrics = []
    for (const [tableNumber, members] of [...tables].sort(([left], [right]) => left - right)) {
      const metrics = scorerByRound[round](members)
      tableMetrics.push(metrics)
      const score = round === 3
        ? metrics.qualityScore ?? metrics.score
        : round === 2 ? metrics.averageAgeGap : metrics.score
      scoredTables[tableNumber] = {
        score: rounded(score),
        ...(round === 2 ? {
          average_age_gap: rounded(metrics.averageAgeGap),
          rms_age_gap: rounded(metrics.rmsAgeGap),
          missing_age_pairs: Number(metrics.missingAgePairs || 0),
        } : {}),
      }
    }
    const scores = Object.values(scoredTables).map(table => table.score).filter(Number.isFinite)
    const scoredPairs = tableMetrics.reduce((sum, metrics) => sum + Number(metrics.scoredPairs || 0), 0)
    const knownAgePairs = tableMetrics.reduce((sum, metrics) => sum + Number(metrics.knownAgePairs || 0), 0)
    const weightedScore = round === 1 && scoredPairs
      ? tableMetrics.reduce((sum, metrics) => sum + Number(metrics.pairScoreTotal || 0), 0) / scoredPairs
      : round === 2 && knownAgePairs
        ? tableMetrics.reduce((sum, metrics) => sum + (Number(metrics.averageAgeGap || 0) * Number(metrics.knownAgePairs || 0)), 0) / knownAgePairs
        : scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null
    result[round] = {
      criterion: ROUND_CRITERIA[round],
      score: rounded(weightedScore),
      unit: round === 2 ? "years" : "percent",
      lower_is_better: round === 2,
      tables: scoredTables,
    }
  }
  return result
}
