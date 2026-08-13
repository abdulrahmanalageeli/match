const finiteNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Applies every whole-score adjustment shown by the admin compatibility UI.
 * Keeping this separate from component calculation makes cached and fresh scores
 * follow the exact same bonus, penalty, veto, and cap order.
 */
export function calculateFinalCompatibilityScore({
  componentTotal,
  opennessPenalty = 0,
  humorMultiplier = 1,
  intentScore = 0,
  deadAirVeto = false,
}) {
  const baseScore = finiteNumber(componentTotal, 0)
  const penalty = finiteNumber(opennessPenalty, 0)
  const multiplier = Math.max(0, finiteNumber(humorMultiplier, 1))
  const intentBonus = finiteNumber(intentScore, 0)

  const afterOpenness = Math.max(0, baseScore + penalty)
  const afterBonuses = (afterOpenness * multiplier) + intentBonus

  let totalScore = afterBonuses
  let capApplied = null
  let deadAirVetoApplied = false

  if (deadAirVeto && totalScore > 40) {
    totalScore = 40
    capApplied = 40
    deadAirVetoApplied = true
  }

  const maxScoreCapApplied = totalScore > 100
  totalScore = Math.max(0, Math.min(100, totalScore))

  return {
    totalScore,
    afterOpenness,
    afterBonuses,
    deadAirVetoApplied,
    maxScoreCapApplied,
    capApplied,
  }
}
