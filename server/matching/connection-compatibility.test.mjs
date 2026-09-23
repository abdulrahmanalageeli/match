import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import fixtures from './fixtures/connection-python-parity.json' with { type: 'json' }
import {
  CONNECTION_COMPATIBILITY_VERSION,
  CONNECTION_MODEL_ARTIFACT_SHA256,
  CONNECTION_MODEL_INFO,
  connectionPairFeatures,
  connectionProfileFingerprint,
  normalizeConnectionAnswer,
  prepareConnectionParticipants,
  rawConnectionScore,
  scoreConnectionPair,
} from './connection-compatibility.mjs'

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-11,
  `${label}: ${actual} != ${expected}`)

test('runtime artifact is the immutable original JSON without refitting or coefficient changes', () => {
  const bytes = readFileSync(new URL('./connection-model-config.json', import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CONNECTION_MODEL_ARTIFACT_SHA256)
  assert.equal(fixtures.artifact_sha256, CONNECTION_MODEL_ARTIFACT_SHA256)
  assert.equal(CONNECTION_MODEL_INFO.featureCount, 910)
  assert.equal(fixtures.nonzero_model_features_covered, 910)
  const artifact = JSON.parse(bytes.toString('utf8'))
  const exercised = new Set(fixtures.cases.flatMap(fixture => Object.entries(fixture.features)
    .filter(([, value]) => value !== 0).map(([name]) => name)))
  assert.equal(artifact.feature_names.filter(name => exercised.has(name)).length, 910)
  assert.equal(CONNECTION_MODEL_INFO.trainingCounts.feedback_responses, 256)
  assert.equal(CONNECTION_MODEL_INFO.trainingCounts.ranking_directions, 1966)
})

test('all Python synthetic encoder features and both directed utilities match', () => {
  for (const [index, fixture] of fixtures.cases.entries()) {
    const a = fixtures.profiles[fixture.source]
    const b = fixtures.profiles[fixture.target]
    const features = connectionPairFeatures(a, b)
    assert.deepEqual(Object.keys(features).sort(), Object.keys(fixture.features).sort(), `feature keys case ${index}`)
    for (const [name, value] of Object.entries(fixture.features)) close(features[name], value, `${index} ${name}`)
    const result = scoreConnectionPair(a, b)
    close(result.rawAToB, fixture.rawAToB, `${index} forward`)
    close(result.rawBToA, fixture.rawBToA, `${index} reverse`)
    close(result.rawMutual, fixture.rawMutual, `${index} minimum`)
    close(rawConnectionScore(a, b), fixture.rawAToB, `${index} direct API`)
    assert.equal(result.version, CONNECTION_COMPATIBILITY_VERSION)
    assert.equal(result.scoreType, 'uncalibrated-utility')
    assert.equal(result.rawMutual, Math.min(result.rawAToB, result.rawBToA))
  }
})

test('all runtime survey containers and structured fallbacks preserve canonical features', () => {
  const canonical = {
    answers: {
      humor_banter_style: 'B', expression_language: 3, early_openness_comfort: 0,
      match_current_focus: ['CAREER', 'STUDY'], lifestyle_1: 'A', lifestyle_2: 'B',
      lifestyle_3: 'C', lifestyle_4: 'A', lifestyle_5: 'B', core_values_1: 'B',
      core_values_2: 'C', core_values_3: 'A', core_values_4: 'D', core_values_5: 'A',
    },
    mbti_personality_type: 'INTJ',
  }
  const target = fixtures.profiles[1]
  const { answers, mbti_personality_type } = canonical
  const shapes = [
    { survey_data: { answers }, mbti_personality_type },
    { survey_data: JSON.stringify({ answers }), mbti_personality_type },
    { survey_data: { ...answers, mbtiType: mbti_personality_type } },
    { ...answers, mbti_personality_type },
    { survey_data: {
      humor_banter_style: 'B', expression_language: 3, early_openness_comfort: 0,
      match_current_focus: 'CAREER,STUDY', lifestylePreferences: 'A,B,C,A,B',
      coreValues: 'B,C,A,D,A', mbtiType: 'INTJ',
    } },
  ]
  for (const profile of shapes) {
    assert.deepEqual(connectionPairFeatures(profile, target), connectionPairFeatures(canonical, target))
    assert.equal(connectionProfileFingerprint(profile), connectionProfileFingerprint(canonical))
  }
  const precedence = { answers: { humor_banter_style: 'C' }, humor_banter_style: 'D',
    survey_data: { humor_banter_style: 'B', answers: { humor_banter_style: 'A' } } }
  assert.equal(connectionPairFeatures(precedence, target)['source|humor_banter_style|A'], 1)
})

test('normalization, empty surveys, and MBTI fallback follow the Python rules', () => {
  for (const [value, expected] of [['أ', 'A'], ['ا', 'A'], ['ب', 'B'], ['ج', 'C'], ['د', 'D'],
    [' b ', 'B'], [0, '0'], [5, '5'], [null, 'MISSING'], [true, 'MISSING'], [1.25, 'MISSING'], ['INTJ', 'MISSING'], [['A'], 'MISSING'], [[0], 'MISSING']]) {
    assert.equal(normalizeConnectionAnswer(value), expected)
  }
  const empty = scoreConnectionPair({ survey_data: '{bad json' }, {})
  assert.equal(empty.evidence.aAnswered, 0)
  assert.equal(empty.evidence.bAnswered, 0)
  assert.equal(empty.evidence.bothAnswered, 0)
  assert.ok(Number.isFinite(empty.rawMutual))
  const fallback = scoreConnectionPair({ mbti_personality_type: 'INTJ' }, {})
  assert.equal(fallback.evidence.aAnswered, 4)
  const partial = scoreConnectionPair({ answers: { mbti_1: 'A' }, mbti_personality_type: 'INTJ' }, {})
  assert.equal(partial.evidence.aAnswered, 1)
})

test('participant identity is irrelevant, mutual utility is symmetric, and evidence is directed', () => {
  const a = { answers: { humor_banter_style: 'A', mbti_1: 'A', match_current_focus: ['CAREER', 'STUDY'] } }
  const b = { answers: { humor_banter_style: 'B', match_current_focus: ['CAREER'] } }
  const result = scoreConnectionPair(a, b)
  const renamed = scoreConnectionPair({ ...a, id: 'changed', assigned_number: 77, event_id: 29 },
    { ...b, id: 'unrelated', assigned_number: 88, event_id: 99 })
  assert.deepEqual(result, renamed)
  const reversed = scoreConnectionPair(b, a)
  assert.equal(result.rawAToB, reversed.rawBToA)
  assert.equal(result.rawBToA, reversed.rawAToB)
  assert.equal(result.rawMutual, reversed.rawMutual)
  assert.equal(result.evidence.aAnswered, 2)
  assert.equal(result.evidence.bAnswered, 1)
  assert.equal(result.evidence.bothAnswered, 1)
  assert.equal(result.evidence.sharedFocusCount, 1)
})

test('prepared participants and fingerprints refresh for all effective answer changes', () => {
  const participant = { answers: { mbti_1: 'A', match_current_focus: ['CAREER', 'STUDY'] } }
  const target = fixtures.profiles[1]
  assert.equal(prepareConnectionParticipants([participant, target])[0], participant)
  const before = connectionProfileFingerprint(participant)
  participant.answers.mbti_1 = 'B'
  assert.notEqual(connectionProfileFingerprint(participant), before)
  assert.deepEqual(scoreConnectionPair(participant, target), scoreConnectionPair(structuredClone(participant), target))
  const reordered = { answers: { ...participant.answers, match_current_focus: ['STUDY', 'CAREER', 'CAREER'] } }
  assert.equal(connectionProfileFingerprint(participant), connectionProfileFingerprint(reordered))
  const stored = { mbti_personality_type: 'INTJ' }
  const storedBefore = connectionProfileFingerprint(stored)
  stored.mbti_personality_type = 'ENFP'
  assert.notEqual(connectionProfileFingerprint(stored), storedBefore)
})
