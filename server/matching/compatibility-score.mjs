const finiteNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clampScore = value => Math.max(0, Math.min(100, finiteNumber(value, 0)))

/**
 * Feedback-derived composite bonuses and penalties were retired by the balanced
 * model. Keep the export as a compatibility shim for older callers and reports.
 */
export function calculateFeedbackCompositeAdjustment() {
  return { adjustment: 0, appliedRules: [] }
}

/**
 * Compatibility shim: the balanced model has no uncapped ranking bonus. Display,
 * base, and priority scores therefore remain identical.
 */
export function applyFeedbackCompositeAdjustment({ baseScore, hardCap = null }) {
  const normalizedBaseScore = clampScore(baseScore)
  const parsedHardCap = Number(hardCap)
  const hasHardCap = hardCap !== null && hardCap !== undefined && hardCap !== '' && Number.isFinite(parsedHardCap)
  const totalScore = hasHardCap
    ? Math.min(normalizedBaseScore, Math.max(0, parsedHardCap))
    : normalizedBaseScore
  return {
    baseCompatibilityScore: normalizedBaseScore,
    compositeAdjustment: 0,
    compositeRules: [],
    rawPriorityScore: totalScore,
    priorityScore: totalScore,
    totalScore,
    compositeDisplayCapApplied: false,
    compositeHardCapApplied: hasHardCap && normalizedBaseScore > parsedHardCap,
  }
}

/**
 * The balanced scorer supplies an already-complete 0..100 component total.
 * Legacy penalty/multiplier/bonus arguments are deliberately ignored so no
 * duplicate influence can re-enter through a stale caller.
 */
export function calculateFinalCompatibilityScore({ componentTotal }) {
  const totalBeforeClamp = finiteNumber(componentTotal, 0)
  const totalScore = clampScore(totalBeforeClamp)
  return {
    totalScore,
    afterOpenness: totalBeforeClamp,
    afterBonuses: totalBeforeClamp,
    deadAirVetoApplied: false,
    maxScoreCapApplied: totalBeforeClamp > 100,
    capApplied: null,
  }
}
