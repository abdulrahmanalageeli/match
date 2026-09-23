import assert from 'node:assert/strict'
import test from 'node:test'
import scale from './connection-score-scale.json' with { type: 'json' }
import fixtures from './fixtures/connection-python-parity.json' with { type: 'json' }
import {
  CONNECTION_COMPATIBILITY_VERSION,
  CONNECTION_FOCUS_COUNT,
  CONNECTION_QUESTION_COUNT,
  scoreConnectionPair,
} from './connection-compatibility.mjs'
import {
  CONNECTION_CALIBRATION,
  CONNECTION_SCORE_MEANING,
  calculateConnectionCompatibility,
  connectionUtilityToIndex,
  isConnectionCompatibilityPayload,
} from './connection-score.mjs'
import {
  BALANCED_COMPATIBILITY_VERSION,
  BALANCED_VIBE_VERSION,
  buildBalancedCacheIdentity,
  buildBalancedScoreSnapshot,
  calculateBalancedCompatibility,
  calculateBalancedVibeScore,
  createNeutralVibeAxes,
  encodeBalancedVibeModelUsed,
  hydrateBalancedCompatibilityFromCacheRow,
  isCurrentBalancedScoreSnapshot,
  prepareBalancedParticipants,
} from './balanced-compatibility.mjs'

const clone = value => structuredClone(value)
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} != ${expected}`)
const round6 = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6
const participant = (index, number) => ({ assigned_number: number, ...clone(fixtures.profiles[index]) })

function referenceIndex(raw) {
  const first = scale.knots[0]
  const last = scale.knots.at(-1)
  if (raw < first.x) return first.y * scale.tailScale / (scale.tailScale + first.x - raw)
  if (raw > last.x) return 100 - (100 - last.y) * scale.tailScale / (scale.tailScale + raw - last.x)
  for (let i = 1; i < scale.knots.length; i += 1) {
    const previous = scale.knots[i - 1]
    const current = scale.knots[i]
    if (raw <= current.x) {
      return previous.y + (current.y - previous.y) * ((raw - previous.x) / (current.x - previous.x))
    }
  }
  throw new Error('Reference interpolation failed')
}

function axesAt(fraction) {
  const axes = createNeutralVibeAxes()
  const maxima = { current_curiosity: 5, hobbies: 3, music: 1, friend_description: 3 }
  for (const [name, axis] of Object.entries(axes)) {
    axis.score = maxima[name] * fraction
    axis.rawScore = axis.score
    axis.confidence = 1
  }
  return axes
}

function cachedResult(a = participant(0, 7), b = participant(1, 16), axes = axesAt(1)) {
  const result = calculateBalancedCompatibility(a, b, { vibeScore: calculateBalancedVibeScore(axes), vibeAxes: axes })
  const dbNumeric = value => Number(Number(value).toFixed(2))
  const row = {
    model_used: encodeBalancedVibeModelUsed({ vibeAxes: axes }),
    score_model_version: BALANCED_COMPATIBILITY_VERSION,
    vibe_model_version: BALANCED_VIBE_VERSION,
    score_breakdown: clone(result.scoreBreakdown),
    question_scores: clone(result.questionScores),
    vibe_axes: clone(result.vibeAxes),
    total_compatibility_score: dbNumeric(result.totalScore),
    ai_vibe_score: dbNumeric(result.vibeScore),
    mbti_score: dbNumeric(result.sharedContextScore),
    attachment_score: dbNumeric(result.attachmentPaceScore),
    communication_score: dbNumeric(result.communicationDisagreementScore),
    lifestyle_score: dbNumeric(result.lifestyleScore),
    core_values_score: dbNumeric(result.coreValuesScore),
    interaction_synergy_score: dbNumeric(result.synergyScore),
    intent_goal_score: dbNumeric(result.intentScore),
  }
  const identity = buildBalancedCacheIdentity(a, b)
  const snapshot = buildBalancedScoreSnapshot(result, { combinedContentHash: identity.combinedContentHash })
  const payload = { modelVersion: BALANCED_COMPATIBILITY_VERSION, contentHash: identity.combinedContentHash,
    persistedTotal: snapshot.totalScore, snapshot: clone(snapshot) }
  return { result, row, payload }
}

test('relative index is monotone and continuous through every knot and both bounded tails', () => {
  const first = scale.knots[0]
  const last = scale.knots.at(-1)
  const rawValues = [first.x - 1e6, first.x - 10, first.x - 1, first.x - 1e-9]
  for (let i = 0; i < scale.knots.length; i += 1) {
    const point = scale.knots[i]
    close(connectionUtilityToIndex(point.x), point.y, `knot ${i}`)
    rawValues.push(point.x)
    if (i + 1 < scale.knots.length) rawValues.push((point.x + scale.knots[i + 1].x) / 2)
  }
  rawValues.push(last.x + 1e-9, last.x + 1, last.x + 10, last.x + 1e6)
  let previous = -Infinity
  for (const raw of rawValues) {
    const score = connectionUtilityToIndex(raw)
    close(score, referenceIndex(raw), 'independent interpolation')
    assert.ok(score > previous, `${raw} must preserve strict raw ordering`)
    assert.ok(score > 0 && score < 100)
    previous = score
  }
  assert.ok(Math.abs(connectionUtilityToIndex(first.x - 1e-9) - first.y) < 1e-7)
  assert.ok(Math.abs(connectionUtilityToIndex(last.x + 1e-9) - last.y) < 1e-7)
  for (const invalid of [NaN, Infinity, -Infinity, null, '0.5', undefined]) {
    assert.throws(() => connectionUtilityToIndex(invalid), TypeError)
  }
})

test('wrapper and balanced totals follow Python raw utilities and the weaker direction exactly', () => {
  assert.equal(BALANCED_COMPATIBILITY_VERSION, CONNECTION_COMPATIBILITY_VERSION)
  for (const fixture of fixtures.cases) {
    const a = clone(fixtures.profiles[fixture.source])
    const b = clone(fixtures.profiles[fixture.target])
    const score = calculateConnectionCompatibility(a, b)
    close(score.aToB.rawUtility, fixture.rawAToB)
    close(score.bToA.rawUtility, fixture.rawBToA)
    assert.equal(score.aToB.score, round6(referenceIndex(fixture.rawAToB)))
    assert.equal(score.bToA.score, round6(referenceIndex(fixture.rawBToA)))
    assert.equal(score.totalScore, Math.min(score.aToB.score, score.bToA.score))
    close(score.rawMutualUtility, fixture.rawMutual)
    assert.equal(score.priorityScore, score.totalScore)
    assert.equal(score.scoreMeaning, CONNECTION_SCORE_MEANING)
    assert.equal(score.calibration, CONNECTION_CALIBRATION)
    assert.equal(score.personalHistoryApplied, false)
    assert.ok(isConnectionCompatibilityPayload(score))
    const balanced = calculateBalancedCompatibility(a, b)
    assert.equal(balanced.totalScore, score.totalScore)
    assert.equal(balanced.priorityScore, score.totalScore)
    assert.equal(balanced.scoreBreakdown.scoringMethod, 'shared-connection-survey-only')
  }
})

test('serialized wrapper rejects score, lineage, evidence, coverage and direction-identity tampering', () => {
  const original = calculateConnectionCompatibility(participant(0, 7), participant(1, 16))
  const mutations = [
    ['old version', value => { value.scoreModelVersion = 'old-model' }],
    ['wrong artifact', value => { value.sourceArtifactSha256 = '0'.repeat(64) }],
    ['probability claim', value => { value.scoreMeaning = 'probability' }],
    ['wrong calibration', value => { value.calibration = 'other' }],
    ['arithmetic mean', value => { value.mutualFormula = 'mean' }],
    ['personal history claim', value => { value.personalHistoryApplied = true }],
    ['raw direction', value => { value.aToB.rawUtility += .2 }],
    ['scaled direction', value => { value.bToA.score += .2 }],
    ['raw mutual', value => { value.rawMutualUtility += .2 }],
    ['total', value => { value.totalScore += .2 }],
    ['priority', value => { value.priorityScore += .2 }],
    ['numeric string', value => { value.aToB.rawUtility = String(value.aToB.rawUtility) }],
    ['NaN', value => { value.aToB.rawUtility = NaN }],
    ['missing evidence', value => { delete value.evidence }],
    ['fractional evidence', value => { value.evidence.aAnswered = 1.5 }],
    ['too many answers', value => { value.evidence.bAnswered = CONNECTION_QUESTION_COUNT + 1 }],
    ['wrong question count', value => { value.evidence.questionCount += 1 }],
    ['too much shared evidence', value => { value.evidence.bothAnswered = CONNECTION_QUESTION_COUNT + 1 }],
    ['too many focuses', value => { value.evidence.aFocusCount = CONNECTION_FOCUS_COUNT + 1 }],
    ['invalid shared focus', value => { value.evidence.sharedFocusCount = CONNECTION_FOCUS_COUNT + 1 }],
    ['wrong coverage', value => { value.aToB.questionnaireCoverage = .25 }],
    ['missing coverage', value => { delete value.bToA.questionnaireCoverage }],
    ['wrong source identity', value => { value.aToB.sourceParticipantNumber = 9001 }],
    ['wrong target identity', value => { value.bToA.targetParticipantNumber = 9001 }],
  ]
  for (const [label, mutate] of mutations) {
    const value = clone(original)
    mutate(value)
    assert.equal(isConnectionCompatibilityPayload(value), false, label)
  }
  assert.ok(isConnectionCompatibilityPayload(calculateConnectionCompatibility({}, {})), 'unknown IDs are allowed')
})

test('current cache and event snapshots survive roundtrip but reject score or AI-application tampering', () => {
  const { result, row, payload } = cachedResult()
  assert.equal(hydrateBalancedCompatibilityFromCacheRow(row)?.totalScore, result.totalScore)
  assert.ok(isCurrentBalancedScoreSnapshot(payload))
  const changes = [
    ['raw utility', breakdown => { breakdown.personalized.aToB.rawUtility += .2 }],
    ['connection total', breakdown => { breakdown.personalized.totalScore += .2 }],
    ['evidence', breakdown => { delete breakdown.personalized.evidence }],
    ['AI marked applied', breakdown => { breakdown.aiChemistryApplied = true }],
    ['AI added', breakdown => { breakdown.aiChemistryAdjustment = 12 }],
    ['wrong AI diagnostic', breakdown => { breakdown.aiChemistrySuggestedAdjustment = -8 }],
    ['wrong final', breakdown => { breakdown.finalScore += 1 }],
  ]
  for (const [label, mutate] of changes) {
    const cache = clone(row)
    mutate(cache.score_breakdown)
    assert.equal(hydrateBalancedCompatibilityFromCacheRow(cache), null, `cache ${label}`)
    const snapshot = clone(payload)
    mutate(snapshot.snapshot.scoreBreakdown)
    assert.equal(isCurrentBalancedScoreSnapshot(snapshot), false, `snapshot ${label}`)
  }
  const wrongVersion = clone(row)
  wrongVersion.score_model_version = '2026-09-11-v13'
  assert.equal(hydrateBalancedCompatibilityFromCacheRow(wrongVersion), null)
  const wrongHash = clone(payload)
  wrongHash.contentHash = 'not-the-recorded-content'
  assert.equal(isCurrentBalancedScoreSnapshot(wrongHash), false)
})

test('MBTI, stored type, and direct answers invalidate prepared balanced cache fingerprints', () => {
  const a = participant(0, 7)
  const b = participant(1, 16)
  prepareBalancedParticipants([a, b])
  const initial = buildBalancedCacheIdentity(a, b)
  a.answers.mbti_1 = 'B'
  const changedMbti = buildBalancedCacheIdentity(a, b)
  assert.notEqual(initial.combinedContentHash, changedMbti.combinedContentHash)
  a.answers.humor_banter_style = 'C'
  const changedAnswer = buildBalancedCacheIdentity(a, b)
  assert.notEqual(changedMbti.combinedContentHash, changedAnswer.combinedContentHash)
  assert.equal(calculateBalancedCompatibility(a, b).totalScore, calculateConnectionCompatibility(clone(a), clone(b)).totalScore)
  assert.deepEqual(buildBalancedCacheIdentity(a, b), buildBalancedCacheIdentity(b, a))
  const stored = { assigned_number: 23, mbti_personality_type: 'INTJ', answers: {} }
  prepareBalancedParticipants([stored])
  const storedIdentity = buildBalancedCacheIdentity(stored, b)
  stored.mbti_personality_type = 'ENFP'
  assert.notEqual(storedIdentity.combinedContentHash, buildBalancedCacheIdentity(stored, b).combinedContentHash)
})

test('identity changes affect labels only; symmetric mutual utility and ranking are unchanged', () => {
  const a = participant(0, 7)
  const b = participant(1, 16)
  const original = calculateConnectionCompatibility(a, b)
  const changed = calculateConnectionCompatibility({ ...a, assigned_number: 999, id: 'not-used' },
    { ...b, assigned_number: 888, id: 'also-not-used' })
  assert.equal(changed.totalScore, original.totalScore)
  assert.equal(changed.aToB.rawUtility, original.aToB.rawUtility)
  assert.equal(changed.bToA.rawUtility, original.bToA.rawUtility)
  assert.equal(changed.aToB.sourceParticipantNumber, 999)
  assert.equal(changed.bToA.targetParticipantNumber, 999)
  const reversed = calculateConnectionCompatibility(b, a)
  assert.equal(reversed.totalScore, original.totalScore)
  assert.equal(reversed.aToB.rawUtility, original.bToA.rawUtility)
  assert.equal(reversed.bToA.rawUtility, original.aToB.rawUtility)
  assert.equal(scoreConnectionPair(a, b).rawMutual, scoreConnectionPair(b, a).rawMutual)
})

test('positive, negative and pending AI evidence changes diagnostics without adjusting learned totals', () => {
  const a = participant(0, 7)
  const b = participant(1, 16)
  const expected = calculateConnectionCompatibility(a, b).totalScore
  const settings = [
    { axes: axesAt(1), suggested: 12, ready: true, band: 'high' },
    { axes: axesAt(0), suggested: -8, ready: true, band: 'low' },
    { axes: createNeutralVibeAxes('deferred'), suggested: 0, ready: false, band: 'pending' },
  ]
  const diagnosticTotals = []
  for (const setting of settings) {
    const result = calculateBalancedCompatibility(a, b, {
      vibeScore: calculateBalancedVibeScore(setting.axes), vibeAxes: setting.axes,
    })
    assert.equal(result.totalScore, expected)
    assert.equal(result.priorityScore, expected)
    assert.equal(result.aiChemistryAdjustment, 0)
    assert.equal(result.compositeAdjustment, 0)
    assert.equal(result.aiChemistryReady, setting.ready)
    assert.equal(result.aiChemistryBand, setting.band)
    assert.equal(result.scoreBreakdown.aiChemistrySuggestedAdjustment, setting.suggested)
    assert.equal(result.scoreBreakdown.aiChemistryApplied, false)
    diagnosticTotals.push(result.diagnosticComponentTotal)
    const cached = cachedResult(a, b, setting.axes)
    assert.equal(hydrateBalancedCompatibilityFromCacheRow(cached.row)?.totalScore, expected)
    assert.ok(isCurrentBalancedScoreSnapshot(cached.payload))
  }
  assert.ok(new Set(diagnosticTotals).size > 1, 'AI axes remain visible in diagnostics')
})
