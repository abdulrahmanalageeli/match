import test from "node:test"
import assert from "node:assert/strict"
import {
  buildReciprocalRankingLookup,
  getCohostNoteContext,
  normalizeCohostNoteScope,
  selectCohostLockedScoreSource,
} from "./cohost-operations.mjs"

test("co-host notes stay isolated between real events and each test session", () => {
  const first = { current_event_id: 26, test_mode_active: true, test_session_started_at: "2026-08-30T01:00:00Z" }
  assert.deepEqual(getCohostNoteContext(first, 26), { testMode: true, testSessionKey: first.test_session_started_at })
  assert.deepEqual(getCohostNoteContext(first, 25), { testMode: false, testSessionKey: "" })
  assert.deepEqual(getCohostNoteContext({ ...first, test_mode_active: false }, 26), { testMode: false, testSessionKey: "" })
  assert.notEqual(getCohostNoteContext(first, 26).testSessionKey,
    getCohostNoteContext({ ...first, test_session_started_at: "2026-08-30T02:00:00Z" }, 26).testSessionKey)
})

test("co-host note scopes are canonical and pair ordering is stable", () => {
  assert.deepEqual(normalizeCohostNoteScope({ scope_type: "table", round: 2, table_number: 7 }), {
    scope_type: "table",
    scope_key: "table:2:7",
    round: 2,
    table_number: 7,
    participant_number: null,
    participant2_number: null,
  })
  assert.deepEqual(normalizeCohostNoteScope({
    scope_type: "pair",
    round: 30,
    participant_number: 1760,
    participant2_number: 412,
  }), {
    scope_type: "pair",
    scope_key: "pair:30:412-1760",
    round: 30,
    table_number: null,
    participant_number: 412,
    participant2_number: 1760,
  })
})

test("co-host note scopes reject malformed or unsafe targets", () => {
  assert.throws(() => normalizeCohostNoteScope({ scope_type: "table", round: 99, table_number: 1 }))
  assert.throws(() => normalizeCohostNoteScope({ scope_type: "participant", participant_number: "abc" }))
  assert.throws(() => normalizeCohostNoteScope({ scope_type: "pair", round: 1, participant_number: 1, participant2_number: 2 }))
  assert.throws(() => normalizeCohostNoteScope({ scope_type: "pair", round: 30, participant_number: 1, participant2_number: 1 }))
})

test("reciprocal ranking lookup reports how the other person ranked the ranker", () => {
  const reciprocalRank = buildReciprocalRankingLookup([
    { ranker_number: 10, ranked_number: 20, rank: 2 },
    { ranker_number: 20, ranked_number: 10, rank: 4 },
    { ranker_number: 30, ranked_number: 10, rank: 1 },
  ])
  assert.equal(reciprocalRank(10, 20), 4)
  assert.equal(reciprocalRank(20, 10), 2)
  assert.equal(reciprocalRank(10, 30), 1)
  assert.equal(reciprocalRank(20, 30), null)
})

test("locked score source tolerates stale original rounds and prefers matching totals", () => {
  const saved = { participant_a_number: 20, participant_b_number: 10, round: 1, compatibility_score: 86, created_at: "2026-08-20T10:00:00Z" }
  const differentScore = { participant_a_number: 10, participant_b_number: 20, round: 2, compatibility_score: 71, created_at: "2026-08-21T10:00:00Z" }
  assert.equal(selectCohostLockedScoreSource({ a: 10, b: 20, compatibility_score: 86, original_match_round: 2 }, [differentScore, saved]), saved)
  assert.equal(selectCohostLockedScoreSource({ a: 30, b: 40 }, [saved]), null)
})
