const finiteNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeAnswer = (value) => String(value ?? '').trim().toUpperCase()

const getParticipantAnswer = (participant, key, { preferProfile = false } = {}) => {
  let surveyData = participant?.survey_data
  if (typeof surveyData === 'string') {
    try {
      surveyData = JSON.parse(surveyData)
    } catch {
      surveyData = {}
    }
  }

  const profileValue = participant?.[key]
  const surveyValue = surveyData?.answers?.[key] ?? surveyData?.[key]
  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== ''
  const orderedValues = preferProfile ? [profileValue, surveyValue] : [surveyValue, profileValue]
  return normalizeAnswer(orderedValues.find(hasValue))
}

const unorderedPairIs = (left, right, first, second) => (
  (left === first && right === second) || (left === second && right === first)
)

/**
 * Feedback-calibrated interactions that were predictive in the post-recalibration
 * events. These are deliberately composite signals rather than new weights for
 * isolated answers: a rule only fires when its entire observed pattern is present.
 */
export function calculateFeedbackCompositeAdjustment(participantA, participantB) {
  const humorA = getParticipantAnswer(participantA, 'humor_banter_style', { preferProfile: true })
  const humorB = getParticipantAnswer(participantB, 'humor_banter_style', { preferProfile: true })
  const opennessA = getParticipantAnswer(participantA, 'early_openness_comfort', { preferProfile: true })
  const opennessB = getParticipantAnswer(participantB, 'early_openness_comfort', { preferProfile: true })
  const humorSubtypeA = getParticipantAnswer(participantA, 'humor_subtype')
  const humorSubtypeB = getParticipantAnswer(participantB, 'humor_subtype')
  const intentA = getParticipantAnswer(participantA, 'intent_goal')
  const intentB = getParticipantAnswer(participantB, 'intent_goal')

  const appliedRules = []
  const apply = (id, points) => appliedRules.push({ id, points })

  if (humorA === 'A' && humorB === 'A' && opennessA === '2' && opennessB === '2') {
    apply('humor_aa_open_22', 8)
  }
  if (unorderedPairIs(humorA, humorB, 'B', 'C')) {
    apply('humor_bc', 8)
  }
  if (intentA === 'C' && intentB === 'C') {
    apply('intent_cc', 5)
  }
  if (unorderedPairIs(humorSubtypeA, humorSubtypeB, 'B', 'C') && unorderedPairIs(intentA, intentB, 'A', 'C')) {
    apply('humor_subtype_bc_intent_ac', -15)
  }
  if (unorderedPairIs(humorA, humorB, 'A', 'C') && unorderedPairIs(intentA, intentB, 'A', 'B')) {
    apply('humor_ac_intent_ab', -12)
  }

  return {
    adjustment: appliedRules.reduce((sum, rule) => sum + rule.points, 0),
    appliedRules,
  }
}

/**
 * Keeps the persisted/display score in 0..100 while preserving an uncapped upper
 * score for ranking. A semantic veto cap still wins over every feedback bonus.
 */
export function applyFeedbackCompositeAdjustment({
  baseScore,
  participantA,
  participantB,
  hardCap = null,
}) {
  const normalizedBaseScore = Math.max(0, Math.min(100, finiteNumber(baseScore, 0)))
  const { adjustment, appliedRules } = calculateFeedbackCompositeAdjustment(participantA, participantB)
  const rawPriorityScore = Math.max(0, normalizedBaseScore + adjustment)
  const parsedHardCap = Number(hardCap)
  const hasHardCap = hardCap !== null && hardCap !== undefined && hardCap !== '' && Number.isFinite(parsedHardCap)
  const priorityScore = hasHardCap
    ? Math.min(rawPriorityScore, Math.max(0, parsedHardCap))
    : rawPriorityScore
  const totalScore = Math.max(0, Math.min(100, priorityScore))

  return {
    baseCompatibilityScore: normalizedBaseScore,
    compositeAdjustment: adjustment,
    compositeRules: appliedRules,
    rawPriorityScore,
    priorityScore,
    totalScore,
    compositeDisplayCapApplied: priorityScore > 100,
    compositeHardCapApplied: hasHardCap && rawPriorityScore > parsedHardCap,
  }
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

  // Dead-Air is now handled as a category-level incompatibility mark (not
  // a total-score hard cap), so we only keep generic component-level capping here.

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
