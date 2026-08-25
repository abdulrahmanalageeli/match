import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyFeedbackCompositeAdjustment,
  calculateFeedbackCompositeAdjustment,
  calculateFinalCompatibilityScore,
} from './compatibility-score.mjs'

const participant = ({ humor, openness, humorSubtype, intent } = {}) => ({
  survey_data: {
    answers: {
      humor_banter_style: humor,
      early_openness_comfort: openness,
      humor_subtype: humorSubtype,
      intent_goal: intent,
    },
  },
})

test('the final score is the additive 100-point component total with no duplicate adjustments', () => {
  const result = calculateFinalCompatibilityScore({
    componentTotal: 70,
    opennessPenalty: -5,
    humorMultiplier: 1.05,
    intentScore: 5,
    deadAirVeto: true,
    humorClashVeto: true,
  })

  assert.equal(result.afterOpenness, 70)
  assert.equal(result.afterBonuses, 70)
  assert.equal(result.totalScore, 70)
  assert.equal(result.deadAirVetoApplied, false)
  assert.equal(result.capApplied, null)
})

test('the compatibility shim clamps only to the fixed zero-to-100 score range', () => {
  const capped = calculateFinalCompatibilityScore({ componentTotal: 105 })
  assert.equal(capped.totalScore, 100)
  assert.equal(capped.maxScoreCapApplied, true)

  const negative = calculateFinalCompatibilityScore({ componentTotal: -5 })
  assert.equal(negative.totalScore, 0)
  assert.equal(negative.maxScoreCapApplied, false)

  const invalid = calculateFinalCompatibilityScore({ componentTotal: 'not-a-score' })
  assert.equal(invalid.totalScore, 0)
})

test('all legacy feedback composite patterns are disabled', () => {
  const positiveA = participant({ humor: 'A', openness: 2, intent: 'C' })
  const positiveB = participant({ humor: 'A', openness: 2, intent: 'C' })
  const negativeA = participant({ humorSubtype: 'B', intent: 'A' })
  const negativeB = participant({ humorSubtype: 'C', intent: 'C' })

  assert.deepEqual(calculateFeedbackCompositeAdjustment(positiveA, positiveB), {
    adjustment: 0,
    appliedRules: [],
  })
  assert.deepEqual(calculateFeedbackCompositeAdjustment(negativeA, negativeB), {
    adjustment: 0,
    appliedRules: [],
  })
})

test('feedback composite compatibility shim preserves display and ranking scores exactly', () => {
  const result = applyFeedbackCompositeAdjustment({
    baseScore: 97,
    participantA: participant({ humor: 'B' }),
    participantB: participant({ humor: 'C' }),
  })

  assert.equal(result.baseCompatibilityScore, 97)
  assert.equal(result.compositeAdjustment, 0)
  assert.deepEqual(result.compositeRules, [])
  assert.equal(result.rawPriorityScore, 97)
  assert.equal(result.priorityScore, 97)
  assert.equal(result.totalScore, 97)
  assert.equal(result.compositeDisplayCapApplied, false)
  assert.equal(result.compositeHardCapApplied, false)
})

test('an explicit hard cap remains available without allowing any legacy bonus', () => {
  const result = applyFeedbackCompositeAdjustment({
    baseScore: 80,
    participantA: participant({ humor: 'B' }),
    participantB: participant({ humor: 'C' }),
    hardCap: 40,
  })

  assert.equal(result.rawPriorityScore, 40)
  assert.equal(result.priorityScore, 40)
  assert.equal(result.totalScore, 40)
  assert.equal(result.compositeAdjustment, 0)
  assert.equal(result.compositeHardCapApplied, true)
})
