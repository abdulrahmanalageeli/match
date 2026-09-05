import assert from "node:assert/strict"
import test from "node:test"

import {
  BALANCED_COMPATIBILITY_VERSION,
  buildBalancedScoreSnapshot,
} from "../matching/balanced-compatibility.mjs"
import {
  choosePreparedTestPairs,
  validatePreparedTestAlgorithmRows,
} from "./prepared-test-algorithm.mjs"

const EVENT_ID = 26
const EVENT3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
const profile = (assigned_number, gender) => Object.freeze({ assigned_number, gender })
const profiles = Object.freeze([
  profile(1, "male"),
  profile(2, "male"),
  profile(3, "female"),
  profile(4, "female"),
])
const pairKey = ({ a, b }) => [a, b].sort((x, y) => x - y).join("-")

function storedRow(a, b, score = 76) {
  const scoreContentHash = `prepared-${a}-${b}`
  const personalized = {
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    totalScore: score,
    aToB: { score },
    bToA: { score },
  }
  const scoreSnapshot = buildBalancedScoreSnapshot({
    totalScore: score,
    scoreBreakdown: {
      sharedContext: 14,
      interactionRhythm: 15,
      personalized,
      personalizedBase: score,
      aiChemistryScore: null,
      aiChemistryAdjustment: 0,
      aiChemistryReady: false,
      aiChemistryBand: "pending",
      finalScore: score,
    },
    questionScores: { currentFocus: 3, similarityPreference: 1 },
    vibeAxes: {},
  }, { combinedContentHash: scoreContentHash })
  return Object.freeze({
    id: `test-${a}-${b}`,
    match_id: EVENT3_MATCH_ID,
    event_id: EVENT_ID,
    participant_a_number: a,
    participant_b_number: b,
    compatibility_score: score,
    score_model_version: BALANCED_COMPATIBILITY_VERSION,
    score_snapshot: scoreSnapshot,
    score_content_hash: scoreContentHash,
    round: 30,
    match_type: "individual",
    table_number: null,
    reason: "Prepared isolated test algorithm pair",
  })
}

const preparedRows = () => Object.freeze([storedRow(1, 3), storedRow(2, 4, 82)])
const context = (overrides = {}) => ({
  eventId: EVENT_ID,
  participantNumbers: [1, 2, 3, 4],
  ...overrides,
})

test("prepared test pairing covers every participant once without mutating the roster", () => {
  const before = JSON.stringify(profiles)
  const pairs = choosePreparedTestPairs(profiles, new Set(), () => 0.5)
  assert.equal(pairs.length, 2)
  assert.deepEqual(pairs.flatMap(({ a, b }) => [a, b]).sort((a, b) => a - b), [1, 2, 3, 4])
  const genders = new Map(profiles.map(item => [item.assigned_number, item.gender]))
  for (const { a, b } of pairs) assert.notEqual(genders.get(a), genders.get(b))
  assert.equal(JSON.stringify(profiles), before)
})

test("prepared pairing finds a complete non-greedy solution while respecting exclusions", () => {
  // Participant 2 can only take 3, so choosing 1-3 first must be reassigned.
  const exclusions = new Set(["2-4"])
  const pairs = choosePreparedTestPairs(profiles, exclusions, () => 0.999999)
  assert.deepEqual(pairs.map(pairKey).sort(), ["1-4", "2-3"])
  assert.deepEqual([...exclusions], ["2-4"])
})

test("prepared pairing fails instead of returning partial or excluded matches", () => {
  assert.throws(() => choosePreparedTestPairs(profiles, new Set(["2-3", "2-4"]), () => 0.5))
})

test("prepared pairing rejects malformed, duplicate, unknown-gender and unbalanced rosters", () => {
  for (const roster of [
    [],
    [profile(1, "male"), profile(2, "female"), profile(3, "female")],
    [profile(1, "male"), profile(2, "male"), profile(1, "female"), profile(4, "female")],
    [profile(0, "male"), profile(2, "male"), profile(3, "female"), profile(4, "female")],
    [profile(1, "male"), profile(2, "male"), profile(3, "female"), profile(4, "")],
    [profile(1, "male"), profile(2, "male"), profile(3, "male"), profile(4, "female")],
  ]) {
    assert.throws(() => choosePreparedTestPairs(roster), `Expected invalid roster to fail: ${JSON.stringify(roster)}`)
  }
})

test("prepared rows reuse exact event-time scores and snapshots on repeated reads", () => {
  const rows = preparedRows()
  const before = JSON.stringify(rows)
  const first = validatePreparedTestAlgorithmRows(rows, context())
  const second = validatePreparedTestAlgorithmRows(rows, context())
  assert.deepEqual(first, second)
  assert.equal(first.length, 2)
  for (const row of rows) {
    const match = first.find(pair => pairKey(pair) === `${row.participant_a_number}-${row.participant_b_number}`)
    assert.ok(match)
    assert.equal(match.score, row.compatibility_score)
    assert.equal(match.provenance.persistedScore, row.compatibility_score)
    assert.equal(match.provenance.scoreModelVersion, row.score_model_version)
    assert.equal(match.provenance.scoreContentHash, row.score_content_hash)
    assert.strictEqual(match.provenance.scoreSnapshot, row.score_snapshot)
    assert.strictEqual(match.testResult, row)
  }
  assert.equal(JSON.stringify(rows), before)
})

test("prepared rows reject duplicate participation, incomplete coverage and outside-roster people", () => {
  const rows = preparedRows()
  for (const invalidRows of [
    [],
    [rows[0]],
    [rows[0], rows[0]],
    [rows[0], storedRow(1, 4)],
    [rows[0], storedRow(2, 5)],
    [rows[0], storedRow(2, 2)],
  ]) {
    assert.throws(() => validatePreparedTestAlgorithmRows(invalidRows, context()))
  }
})

test("prepared rows are scoped to their event and reject changed rosters or new exclusions", () => {
  const rows = preparedRows()
  assert.throws(() => validatePreparedTestAlgorithmRows(rows, context({ eventId: EVENT_ID + 1 })))
  assert.throws(() => validatePreparedTestAlgorithmRows(rows, context({ participantNumbers: [1, 2, 3, 5] })))
  assert.throws(() => validatePreparedTestAlgorithmRows(rows, context({ exclusions: new Set(["1-3"]) })))
  assert.throws(() => validatePreparedTestAlgorithmRows(rows, context({ participantNumbers: [1, 2, 3, 3] })))
})

test("prepared rows cannot come from real history, another round or noncanonical pairs", () => {
  const rows = preparedRows()
  for (const invalidFields of [
    { match_id: "00000000-0000-0000-0000-000000000000" },
    { round: 20 },
    { match_type: "group" },
    { participant_a_number: 3, participant_b_number: 1 },
  ]) {
    assert.throws(() => validatePreparedTestAlgorithmRows([{ ...rows[0], ...invalidFields }, rows[1]], context()))
  }
})

test("prepared rows reject stale, missing or inconsistent immutable score provenance", () => {
  const rows = preparedRows()
  const first = rows[0]
  const corruptions = [
    { score_model_version: "old-model" },
    { score_snapshot: null },
    { score_content_hash: "different-profile-hash" },
    { compatibility_score: first.compatibility_score + 1 },
    { score_snapshot: { ...first.score_snapshot, scoreModelVersion: "old-model" } },
    { score_snapshot: { ...first.score_snapshot, totalScore: first.compatibility_score + 1 } },
    { score_snapshot: { ...first.score_snapshot, vibeModelTag: "stale-vibe-model" } },
    { score_snapshot: { ...first.score_snapshot, scoreBreakdown: null } },
    { score_snapshot: { ...first.score_snapshot, questionScores: null } },
    { score_snapshot: { ...first.score_snapshot, vibeAxes: null } },
  ]
  for (const corruption of corruptions) {
    assert.throws(() => validatePreparedTestAlgorithmRows([{ ...first, ...corruption }, rows[1]], context()))
  }
})

test("prepared zero scores remain valid but missing totals must not coerce to zero", () => {
  const rows = [storedRow(1, 3, 0), storedRow(2, 4)]
  assert.equal(validatePreparedTestAlgorithmRows(rows, context())[0].score, 0)
  for (const compatibility_score of [null, undefined, "", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validatePreparedTestAlgorithmRows([{ ...rows[0], compatibility_score }, rows[1]], context()))
  }
})
