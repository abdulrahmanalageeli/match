import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyFeedbackCompositeAdjustment,
  calculateFeedbackCompositeAdjustment,
  calculateFinalCompatibilityScore,
} from './compatibility-score.mjs'

const participant = ({
  humor,
  openness,
  humorSubtype,
  intent,
  nestedOnly = false,
} = {}) => {
  const answers = {
    humor_banter_style: humor,
    early_openness_comfort: openness,
    humor_subtype: humorSubtype,
    intent_goal: intent,
  }
  return nestedOnly
    ? { survey_data: { answers } }
    : {
        humor_banter_style: humor,
        early_openness_comfort: openness,
        survey_data: { answers },
      }
}

test('the displayed final score directly includes multiplier and intent bonuses', () => {
  const result = calculateFinalCompatibilityScore({
    componentTotal: 70,
    opennessPenalty: -5,
    humorMultiplier: 1.05,
    intentScore: 5,
  })

  assert.equal(result.afterOpenness, 65)
  assert.equal(result.afterBonuses, 73.25)
  assert.equal(result.totalScore, 73.25)
})

test('safety vetoes and the maximum cap are applied after bonuses', () => {
  const deadAir = calculateFinalCompatibilityScore({
    componentTotal: 80,
    humorMultiplier: 1.05,
    intentScore: 5,
    deadAirVeto: true,
  })
  assert.equal(deadAir.totalScore, 40)
  assert.equal(deadAir.deadAirVetoApplied, true)
  assert.equal(deadAir.capApplied, 40)

  const capped = calculateFinalCompatibilityScore({
    componentTotal: 98,
    humorMultiplier: 1.05,
    intentScore: 5,
  })
  assert.equal(capped.totalScore, 100)
  assert.equal(capped.maxScoreCapApplied, true)
})

test('feedback composite bonuses are deterministic, stackable, and symmetric', () => {
  const aaOpenA = participant({ humor: 'a', openness: 2, intent: 'c' })
  const aaOpenB = participant({ humor: 'A', openness: '2', intent: 'C', nestedOnly: true })
  const aaResult = calculateFeedbackCompositeAdjustment(aaOpenA, aaOpenB)
  assert.equal(aaResult.adjustment, 13)
  assert.deepEqual(aaResult.appliedRules.map(rule => rule.id), ['humor_aa_open_22', 'intent_cc'])

  const b = participant({ humor: 'B' })
  const c = participant({ humor: 'C' })
  assert.equal(calculateFeedbackCompositeAdjustment(b, c).adjustment, 8)
  assert.equal(calculateFeedbackCompositeAdjustment(c, b).adjustment, 8)
})

test('feedback composite penalties only fire for their complete paired patterns', () => {
  const subtypeBIntentA = participant({ humorSubtype: 'B', intent: 'A' })
  const subtypeCIntentC = participant({ humorSubtype: 'C', intent: 'C' })
  assert.equal(calculateFeedbackCompositeAdjustment(subtypeBIntentA, subtypeCIntentC).adjustment, -15)

  const humorAIntentA = participant({ humor: 'A', intent: 'A' })
  const humorCIntentB = participant({ humor: 'C', intent: 'B' })
  assert.equal(calculateFeedbackCompositeAdjustment(humorAIntentA, humorCIntentB).adjustment, -12)

  const incomplete = participant({ humorSubtype: 'C', intent: 'B' })
  assert.equal(calculateFeedbackCompositeAdjustment(subtypeBIntentA, incomplete).adjustment, 0)
})

test('display scores stay capped while ranking retains bonus separation', () => {
  const a = participant({ humor: 'B' })
  const b = participant({ humor: 'C' })
  const result = applyFeedbackCompositeAdjustment({ baseScore: 97, participantA: a, participantB: b })

  assert.equal(result.baseCompatibilityScore, 97)
  assert.equal(result.compositeAdjustment, 8)
  assert.equal(result.totalScore, 100)
  assert.equal(result.priorityScore, 105)
  assert.equal(result.compositeDisplayCapApplied, true)
})

test('hard veto caps cannot be overridden by a composite bonus', () => {
  const a = participant({ humor: 'B' })
  const b = participant({ humor: 'C' })
  const result = applyFeedbackCompositeAdjustment({
    baseScore: 38,
    participantA: a,
    participantB: b,
    hardCap: 40,
  })

  assert.equal(result.rawPriorityScore, 46)
  assert.equal(result.priorityScore, 40)
  assert.equal(result.totalScore, 40)
  assert.equal(result.compositeHardCapApplied, true)
})
