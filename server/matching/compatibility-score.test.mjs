import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateFinalCompatibilityScore } from './compatibility-score.mjs'

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
