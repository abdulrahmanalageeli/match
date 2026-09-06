import { createRound1SparkGroupScorer, event3SparkPairKey } from "./round1-spark.mjs"
import { createRoundLensScorer, getRoundLensProfileMissingFields } from "./round23-lenses.mjs"

const ROUND_LENSES = Object.freeze({
  1: "spark",
  2: "depth",
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
export function buildEvent3LiveSeatingScores({ assignments = [], profiles = [], protectedPairs = [] } = {}) {
  const groupAssignments = assignments.filter(row => [1, 2, 3].includes(Number(row.round)))
  const participantNumbers = [...new Set(groupAssignments.map(row => Number(row.participant_id)).filter(Number.isInteger))]
  if (!participantNumbers.length) return null

  const fullProfileMap = new Map(profiles.map(profile => [Number(profile.assigned_number), {
    ...profile,
    survey_data: parseSurveyData(profile.survey_data),
  }]))
  const incompleteProfiles = new Set(participantNumbers.filter(number => {
    const profile = fullProfileMap.get(number)
    return !profile || getRoundLensProfileMissingFields(profile).length > 0
  }))
  const scoreProfileMap = new Map([...fullProfileMap].filter(([number]) => !incompleteProfiles.has(number)))
  const ageMap = new Map(participantNumbers.map(number => {
    const profile = fullProfileMap.get(number) || {}
    const survey = profile.survey_data || {}
    return [number, profile.age || survey?.answers?.age || survey?.age || null]
  }))
  const lockedPairsSet = new Set(protectedPairs.map(pairNumbers).map(([left, right]) =>
    event3SparkPairKey(Number(left), Number(right))))
  const sparkGroup = createRound1SparkGroupScorer({ profileMap: scoreProfileMap, ageMap, lockedPairsSet })
  const lenses = createRoundLensScorer({ profileMap: scoreProfileMap, lockedPairsSet })
  const scorerByRound = {
    1: group => sparkGroup(group),
    2: group => lenses.depthGroup(group),
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
    for (const [tableNumber, members] of [...tables].sort(([left], [right]) => left - right)) {
      const metrics = scorerByRound[round](members)
      const score = round === 3 ? metrics.qualityScore ?? metrics.score : metrics.score
      scoredTables[tableNumber] = { score: rounded(score) }
    }
    const scores = Object.values(scoredTables).map(table => table.score).filter(Number.isFinite)
    result[round] = {
      lens: ROUND_LENSES[round],
      score: scores.length ? rounded(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      tables: scoredTables,
    }
  }
  return result
}
