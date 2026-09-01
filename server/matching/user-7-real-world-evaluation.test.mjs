import assert from 'node:assert/strict'
import test from 'node:test'

/*
 * A small, offline evaluation harness for the real-world labels supplied by
 * participant #7. Keep this fixture numeric and pseudonymous: unresolved names
 * are counted below, but are not written into source control.
 *
 * This is deliberately a diagnostic rather than a pass/fail quality gate. The
 * examples are selected acquaintances, not a random candidate sample, so they
 * can measure labelled-pair separation but cannot honestly estimate precision,
 * recall, calibration, or population-wide match quality.
 */

function frozenNumbers(numbers) {
  return Object.freeze([...numbers])
}

export const USER_7_REAL_WORLD_LABELS = Object.freeze({
  subjectNumber: 7,
  romantic: frozenNumbers([975, 1470, 1524, 1566, 1586, 1623]),
  friendly: frozenNumbers([16, 23, 122, 223, 287, 325, 539, 567, 1372, 1381, 1414, 1688, 1775]),
  stableNegative: frozenNumbers([1101, 312, 1853]),
  temporalReversalNegative: frozenNumbers([277]),
  ambiguous: frozenNumbers([70]),
  ignored: frozenNumbers([1778]),
  unresolvedAliasCounts: Object.freeze({ romantic: 1, friendly: 0 }),
  otherSubjects: Object.freeze([
    Object.freeze({ subjectNumber: 78, targetNumber: 1803, label: 'negative' }),
  ]),
})

export const USER_7_SCORE_FIXTURE_METADATA = Object.freeze({
  modelVersion: '2026-08-25-v7-balanced-100',
  capturedOn: '2026-09-01',
  staleAfterProfileChange: frozenNumbers([23, 312, 325, 1778]),
})

// Latest score available for each labelled pair at capture time. The metadata
// above identifies rows whose participant profile changed after that score was
// cached; callers can exclude those rows when exact-current provenance matters.
export const USER_7_LATEST_AVAILABLE_SCORE_FIXTURE = Object.freeze([
  Object.freeze({ participantNumber: 975, score: 80.86 }),
  Object.freeze({ participantNumber: 1470, score: 78.39 }),
  Object.freeze({ participantNumber: 1524, score: 77.70 }),
  Object.freeze({ participantNumber: 1566, score: 71.06 }),
  Object.freeze({ participantNumber: 1586, score: 77.99 }),
  Object.freeze({ participantNumber: 1623, score: 71.81 }),
  Object.freeze({ participantNumber: 16, score: 72.65 }),
  Object.freeze({ participantNumber: 23, score: 78.99 }),
  Object.freeze({ participantNumber: 122, score: 76.99 }),
  Object.freeze({ participantNumber: 223, score: 80.45 }),
  Object.freeze({ participantNumber: 287, score: 78.87 }),
  Object.freeze({ participantNumber: 325, score: 80.64 }),
  Object.freeze({ participantNumber: 539, score: 72.61 }),
  Object.freeze({ participantNumber: 567, score: 77.63 }),
  Object.freeze({ participantNumber: 1372, score: 81.42 }),
  Object.freeze({ participantNumber: 1381, score: 78.24 }),
  Object.freeze({ participantNumber: 1414, score: 75.33 }),
  Object.freeze({ participantNumber: 1688, score: 73.82 }),
  Object.freeze({ participantNumber: 1775, score: 73.84 }),
  Object.freeze({ participantNumber: 312, score: 71.61 }),
  Object.freeze({ participantNumber: 1101, score: 74.84 }),
  Object.freeze({ participantNumber: 1778, score: 77.22 }),
  Object.freeze({ participantNumber: 1853, score: null }),
  Object.freeze({ participantNumber: 277, score: 71.86 }),
  Object.freeze({ participantNumber: 70, score: 77.23 }),
])

function labelledGroups(labels) {
  return {
    romantic: labels.romantic,
    friendly: labels.friendly,
    stableNegative: labels.stableNegative,
    temporalReversalNegative: labels.temporalReversalNegative,
    ambiguous: labels.ambiguous,
    ignored: labels.ignored,
  }
}

function validateLabels(labels) {
  assert.ok(Number.isInteger(labels.subjectNumber) && labels.subjectNumber > 0)

  const seen = new Map()
  for (const [group, numbers] of Object.entries(labelledGroups(labels))) {
    for (const number of numbers) {
      assert.ok(Number.isInteger(number) && number > 0, `${group} contains an invalid participant number`)
      assert.notEqual(number, labels.subjectNumber, `${group} contains the subject`)
      assert.equal(seen.has(number), false, `participant #${number} appears in both ${seen.get(number)} and ${group}`)
      seen.set(number, group)
    }
  }
}

function normalizePredictions(predictions) {
  const byNumber = new Map()

  for (const prediction of predictions ?? []) {
    const participantNumber = Number(prediction?.participantNumber)
    assert.ok(Number.isInteger(participantNumber) && participantNumber > 0, 'prediction participantNumber must be a positive integer')
    assert.equal(byNumber.has(participantNumber), false, `duplicate prediction for participant #${participantNumber}`)

    const rawScore = prediction.score
    const score = rawScore === null || rawScore === undefined || rawScore === '' ? null : Number(rawScore)
    assert.ok(score === null || (Number.isFinite(score) && score >= 0 && score <= 100), `prediction for #${participantNumber} must have a score from 0 to 100 or null`)

    byNumber.set(participantNumber, {
      participantNumber,
      score,
      eligible: typeof prediction.eligible === 'boolean' ? prediction.eligible : null,
      gateReasons: Array.isArray(prediction.gateReasons) ? [...prediction.gateReasons] : [],
    })
  }

  return byNumber
}

function groupReport(numbers, predictions) {
  const rows = numbers.map(participantNumber => predictions.get(participantNumber) ?? {
    participantNumber,
    score: null,
    eligible: null,
    gateReasons: [],
  })

  return {
    labelled: numbers.length,
    scored: rows.filter(row => row.score !== null).length,
    eligibilityKnown: rows.filter(row => row.eligible !== null).length,
    eligible: rows.filter(row => row.eligible === true).length,
    gated: rows.filter(row => row.eligible === false).length,
    eligibilityUnknown: rows.filter(row => row.eligible === null).map(row => row.participantNumber),
    gatedRows: rows
      .filter(row => row.eligible === false)
      .map(row => ({ participantNumber: row.participantNumber, gateReasons: [...row.gateReasons] })),
    missing: rows.filter(row => row.score === null).map(row => row.participantNumber),
    scores: rows.filter(row => row.score !== null).map(row => row.score),
    meanScore: mean(rows.filter(row => row.score !== null).map(row => row.score)),
    medianScore: median(rows.filter(row => row.score !== null).map(row => row.score)),
  }
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function median(values) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

/**
 * Returns the chance that a randomly selected positive labelled example scores
 * above a randomly selected negative labelled example. Ties count as one half.
 */
export function pairwiseOrdering(positiveScores, negativeScores) {
  if (!positiveScores.length || !negativeScores.length) {
    return { comparisons: 0, winRate: null, meanGap: null, medianGap: null }
  }

  const gaps = []
  let wins = 0
  for (const positive of positiveScores) {
    for (const negative of negativeScores) {
      const gap = positive - negative
      gaps.push(gap)
      wins += gap > 0 ? 1 : gap === 0 ? 0.5 : 0
    }
  }

  return {
    comparisons: gaps.length,
    winRate: wins / gaps.length,
    meanGap: mean(gaps),
    medianGap: median(gaps),
  }
}

/**
 * Evaluate score rows shaped like:
 * { participantNumber, score, eligible?, gateReasons? }.
 *
 * Score ordering and hard-gate eligibility are reported separately. This
 * matters because friendly fit and romantic eligibility can legitimately use
 * different gender/intent criteria.
 */
export function evaluateUser7Predictions(predictions, labels = USER_7_REAL_WORLD_LABELS) {
  validateLabels(labels)
  const byNumber = normalizePredictions(predictions)
  const coverage = Object.fromEntries(
    Object.entries(labelledGroups(labels)).map(([group, numbers]) => [group, groupReport(numbers, byNumber)]),
  )

  const romantic = coverage.romantic.scores
  const friendly = coverage.friendly.scores
  const stableNegative = coverage.stableNegative.scores
  const allCurrentNegative = [...stableNegative, ...coverage.temporalReversalNegative.scores]

  return {
    subjectNumber: labels.subjectNumber,
    coverage,
    ordering: {
      romanticVsStableNegative: pairwiseOrdering(romantic, stableNegative),
      romanticVsAllCurrentNegative: pairwiseOrdering(romantic, allCurrentNegative),
      friendlyVsStableNegative: pairwiseOrdering(friendly, stableNegative),
      allPositiveVsStableNegative: pairwiseOrdering([...romantic, ...friendly], stableNegative),
    },
    exclusions: {
      ambiguousParticipantNumbers: [...labels.ambiguous],
      ignoredParticipantNumbers: [...labels.ignored],
      unresolvedAliasCounts: { ...labels.unresolvedAliasCounts },
      temporalReversalParticipantNumbers: [...labels.temporalReversalNegative],
      otherSubjectLabels: labels.otherSubjects.map(label => ({ ...label })),
    },
  }
}

test('participant #7 fixture preserves resolved labels without category leakage', () => {
  validateLabels(USER_7_REAL_WORLD_LABELS)

  assert.deepEqual(USER_7_REAL_WORLD_LABELS.romantic, [975, 1470, 1524, 1566, 1586, 1623])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.friendly, [16, 23, 122, 223, 287, 325, 539, 567, 1372, 1381, 1414, 1688, 1775])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.stableNegative, [1101, 312, 1853])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.temporalReversalNegative, [277])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.ambiguous, [70])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.ignored, [1778])
  assert.deepEqual(USER_7_REAL_WORLD_LABELS.unresolvedAliasCounts, { romantic: 1, friendly: 0 })
})

test('evaluation separates score ordering, hard-gate coverage, and uncertain labels', () => {
  const scores = [
    ...USER_7_REAL_WORLD_LABELS.romantic.map((participantNumber, index) => ({ participantNumber, score: 90 - index * 5 })),
    ...USER_7_REAL_WORLD_LABELS.friendly.map((participantNumber, index) => ({ participantNumber, score: 70 - index, eligible: index !== 0 })),
    ...USER_7_REAL_WORLD_LABELS.stableNegative.map((participantNumber, index) => ({ participantNumber, score: 35 + index * 5 })),
    { participantNumber: 277, score: 65 },
    { participantNumber: 70, score: 99 },
  ]

  const report = evaluateUser7Predictions(scores)

  assert.equal(report.coverage.romantic.scored, 6)
  assert.deepEqual(report.coverage.romantic.eligibilityUnknown, [975, 1470, 1524, 1566, 1586, 1623])
  assert.equal(report.coverage.friendly.gated, 1)
  assert.equal(report.ordering.romanticVsStableNegative.winRate, 1)
  assert.equal(report.ordering.romanticVsStableNegative.comparisons, 18)
  assert.equal(report.ordering.friendlyVsStableNegative.comparisons, 39)
  assert.deepEqual(report.exclusions.ambiguousParticipantNumbers, [70])
  assert.deepEqual(report.exclusions.ignoredParticipantNumbers, [1778])
  assert.deepEqual(report.exclusions.temporalReversalParticipantNumbers, [277])
})

test('pairwise ordering gives ties half credit and exposes incomplete score coverage', () => {
  assert.deepEqual(pairwiseOrdering([70], [70]), {
    comparisons: 1,
    winRate: 0.5,
    meanGap: 0,
    medianGap: 0,
  })

  const report = evaluateUser7Predictions([
    { participantNumber: 975, score: 70 },
    { participantNumber: 1101, score: null, eligible: false, gateReasons: ['age'] },
  ])
  assert.deepEqual(report.coverage.romantic.missing, [1470, 1524, 1566, 1586, 1623])
  assert.deepEqual(report.coverage.stableNegative.missing, [1101, 312, 1853])
  assert.equal(report.ordering.romanticVsStableNegative.winRate, null)
})

test('latest participant #7 scores preserve provenance and produce diagnostics without a quality gate', () => {
  assert.equal(USER_7_SCORE_FIXTURE_METADATA.modelVersion, '2026-08-25-v7-balanced-100')
  assert.deepEqual(USER_7_SCORE_FIXTURE_METADATA.staleAfterProfileChange, [23, 312, 325, 1778])

  const report = evaluateUser7Predictions(USER_7_LATEST_AVAILABLE_SCORE_FIXTURE)

  assert.equal(report.coverage.romantic.scored, 6)
  assert.equal(report.coverage.friendly.scored, 13)
  assert.equal(report.coverage.stableNegative.scored, 2)
  assert.deepEqual(report.coverage.stableNegative.missing, [1853])
  assert.equal(report.coverage.ignored.scored, 1)
  assert.equal(report.coverage.temporalReversalNegative.scored, 1)
  assert.equal(report.coverage.ambiguous.scored, 1)

  assert.deepEqual(report.ordering, {
    romanticVsStableNegative: {
      comparisons: 12,
      winRate: 9 / 12,
      meanGap: 3.0766666666666658,
      medianGap: 3.3499999999999943,
    },
    romanticVsAllCurrentNegative: {
      comparisons: 18,
      winRate: 13 / 18,
      meanGap: 3.5316666666666663,
      medianGap: 4.695,
    },
    friendlyVsStableNegative: {
      comparisons: 26,
      winRate: 22 / 26,
      meanGap: 3.8119230769230747,
      medianGap: 3.875,
    },
    allPositiveVsStableNegative: {
      comparisons: 38,
      winRate: 31 / 38,
      meanGap: 3.579736842105261,
      medianGap: 3.634999999999998,
    },
  })
})
