import assert from 'node:assert/strict'
import test from 'node:test'

import modelConfig from './personalized-model-config.json' with { type: 'json' }
import {
  PERSONALIZED_ARCHETYPES,
  PERSONALIZED_COMPATIBILITY_VERSION,
  calculateDirectionalPersonalizedCompatibility,
  calculatePersonalizedCompatibility,
  inferPersonalizedArchetype,
  isPersonalizedCompatibilityPayload,
  preparePersonalizedParticipants,
} from './personalized-compatibility.mjs'

const answers = {
  match_disagreement_style: 'A',
  match_similarity_preference: 'B',
  match_current_focus: ['career', 'creative'],
  humor_banter_style: 'B',
  early_openness_comfort: '2',
  conversation_initiative_preference: 'A',
  expression_language: '3',
  minimum_partner_religious_commitment: '2',
  social_relationship_style: '2',
  attachment_1: 'A', attachment_3: 'B', attachment_4: 'A',
  lifestyle_1: 'A', lifestyle_2: 'B', lifestyle_3: 'A', lifestyle_4: 'B', lifestyle_5: 'A',
  core_values_1: 'A', core_values_2: 'B', core_values_3: 'C', core_values_4: 'A', core_values_5: 'B',
  communication_1: 'A', communication_2: 'B', communication_3: 'A', communication_4: 'C', communication_5: 'B',
  conversational_role: 'A', conversation_depth_pref: 'A', social_battery: 'B',
  humor_subtype: 'C', curiosity_style: 'A', intent_goal: 'A', silence_comfort: 'B',
}

const participant = (answerOverrides = {}, rowOverrides = {}) => ({
  assigned_number: 1,
  age: 29,
  gender: 'male',
  nationality: 'Saudi',
  ...rowOverrides,
  survey_data: { answers: { ...answers, ...answerOverrides } },
})

test('personalized scorer is directional and its mutual score is symmetric', () => {
  const a = participant({}, { assigned_number: 11 })
  const b = participant({
    humor_banter_style: 'D',
    expression_language: '5',
    conversational_role: 'C',
    curiosity_style: 'B',
  }, { assigned_number: 22 })
  const forward = calculatePersonalizedCompatibility(a, b)
  const reverse = calculatePersonalizedCompatibility(b, a)

  assert.equal(forward.totalScore, reverse.totalScore)
  assert.equal(forward.aToB.score, reverse.bToA.score)
  assert.equal(forward.bToA.score, reverse.aToB.score)
  assert.equal(forward.totalScore, Math.round(Math.sqrt(forward.aToB.score * forward.bToA.score) * 1e6) / 1e6)
  assert.equal(forward.totalScore, 60.510593)
  assert.equal(forward.aToB.score, 51.794258)
  assert.equal(forward.bToA.score, 70.69378)
  assert.equal(isPersonalizedCompatibilityPayload(forward), true)
  assert.equal(forward.calibration, 'events26-27-archetype-ranking-percentile')
})

test('archetype inference is soft, deterministic, and questionnaire-only', () => {
  const original = participant()
  const changedEligibility = participant({}, {
    age: 61,
    gender: 'female',
    nationality: 'Canadian',
    preferred_age_min: 50,
    preferred_age_max: 70,
  })
  const originalArchetype = inferPersonalizedArchetype(original)
  const changedArchetype = inferPersonalizedArchetype(changedEligibility)

  assert.equal(PERSONALIZED_ARCHETYPES.length, 2)
  assert.deepEqual(originalArchetype, changedArchetype)
  assert.equal(
    Math.round(originalArchetype.memberships.reduce((sum, item) => sum + item.probability, 0) * 1e6) / 1e6,
    1,
  )

  const target = participant({ curiosity_style: 'C' }, { assigned_number: 2 })
  assert.deepEqual(
    calculateDirectionalPersonalizedCompatibility(original, target),
    calculateDirectionalPersonalizedCompatibility(changedEligibility, target),
  )
})

test('missing questionnaires remain bounded and report their coverage', () => {
  const direction = calculateDirectionalPersonalizedCompatibility({}, {})
  assert.ok(direction.score >= 0 && direction.score <= 100)
  assert.equal(direction.questionnaireCoverage, 0)
  assert.equal(Number.isFinite(direction.rawUtility), true)
})

test('request-level participant preparation reuses one archetype without changing scores', () => {
  const preparedA = participant({}, { assigned_number: 101 })
  const preparedB = participant({ humor_subtype: 'D' }, { assigned_number: 102 })
  const expected = calculatePersonalizedCompatibility(
    structuredClone(preparedA),
    structuredClone(preparedB),
  )

  preparePersonalizedParticipants([preparedA, preparedB])
  const firstArchetype = inferPersonalizedArchetype(preparedA)
  const secondArchetype = inferPersonalizedArchetype(preparedA)

  assert.strictEqual(firstArchetype, secondArchetype)
  assert.deepEqual(calculatePersonalizedCompatibility(preparedA, preparedB), expected)
})

test('checked-in model artifact records the deterministic Events 26+27 retrain', () => {
  assert.equal(PERSONALIZED_COMPATIBILITY_VERSION, modelConfig.version)
  assert.deepEqual(modelConfig.trainedEventIds, [26, 27])
  assert.equal(modelConfig.training.uniqueParticipants, 74)
  assert.equal(modelConfig.training.trainingRankers, 61)
  assert.equal(modelConfig.training.directionalRankings, 967)
  assert.equal(modelConfig.training.reciprocalPairs, 391)
  assert.equal(modelConfig.training.autoSavedDirectionsExcluded, 225)
  assert.equal(modelConfig.training.validation.heldOutPeopleRemovedAsRankersAndTargets, true)
  assert.ok(modelConfig.training.validation.combinedEvent27.ndcg3 > modelConfig.training.validation.incumbentEvent27.ndcg3)
  assert.ok(modelConfig.training.validation.combinedEvent27.top3_auc > modelConfig.training.validation.incumbentEvent27.top3_auc)
  assert.equal(modelConfig.training.validation.participantImpact.improved, 23)
  assert.equal(modelConfig.training.validation.event26Reproduction.numericallyEquivalentAtEightDecimals, true)
})
