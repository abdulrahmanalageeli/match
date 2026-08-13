import assert from "node:assert/strict"
import test from "node:test"

import {
  buildTestAdminSession,
  isReadOnlyMatchRequest,
  normalizeTestMatchRow,
  shouldBlockRealMatchGeneration,
  testMatchToLockedMatch,
} from "./test-match-results.mjs"

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

test("test matches are canonicalized and marked as isolated test data", () => {
  const row = normalizeTestMatchRow({ participant_a_number: 9, participant_b_number: 4, compatibility_score: "81" })
  assert.equal(row.participant_a_number, 4)
  assert.equal(row.participant_b_number, 9)
  assert.equal(row.compatibility_score, 81)
  assert.equal(row.round, 30)
  assert.equal(row.is_test_mode, true)
})

test("temporary results look locked to admin clients without using real lock ids", () => {
  const lock = testMatchToLockedMatch({ id: "abc", event_id: 20, participant_a_number: 4, participant_b_number: 9, compatibility_score: 81 }, STATIC_MATCH_ID)
  assert.equal(lock.id, "test:abc")
  assert.equal(lock.match_id, STATIC_MATCH_ID)
  assert.equal(lock.original_match_round, 30)
  assert.equal(lock.is_test_mode, true)
})

test("synthetic admin sessions count unique participants and carry no real history", () => {
  const session = buildTestAdminSession([
    { id: "a", event_id: 20, participant_a_number: 1, participant_b_number: 2, compatibility_score: 70 },
    { id: "b", event_id: 20, participant_a_number: 3, participant_b_number: 4, compatibility_score: 80 },
  ], 20, STATIC_MATCH_ID)
  assert.equal(session.total_matches, 2)
  assert.equal(session.total_participants, 4)
  assert.equal(session.is_test_mode, true)
  assert.equal(session.session_id, "event3-test-20")
})

test("Event3 test mode blocks real generation but permits strict read-only analysis", () => {
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, eventId: 20 }), true)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, action: "pre-cache" }), true)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, manualMatch: { participant1: 1, participant2: 2 } }), true)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, preview: true }), false)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, manualMatch: { testModeOnly: true } }), false)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: true, manualMatch: { debugPair: true } }), false)
  assert.equal(shouldBlockRealMatchGeneration({ testModeActive: false }), false)
})

test("only cache status actions are classified as read-only", () => {
  assert.equal(isReadOnlyMatchRequest({ action: "cache-status-by-gender" }), true)
  assert.equal(isReadOnlyMatchRequest({ action: "cache-status-by-gender-batched" }), true)
  assert.equal(isReadOnlyMatchRequest({ action: "cache-pairs-batched" }), false)
  assert.equal(isReadOnlyMatchRequest({ action: "finalize-groups-arrangement" }), false)
})
