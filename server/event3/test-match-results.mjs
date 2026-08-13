export const EVENT3_TEST_MATCH_ID = "00000000-0000-0000-0000-000000000003"

const READ_ONLY_MATCH_ACTIONS = new Set([
  "cache-status-by-gender",
  "cache-status-by-gender-batched",
])

export function isReadOnlyMatchRequest({ preview = false, manualMatch = null, action = null } = {}) {
  return preview === true
    || manualMatch?.testModeOnly === true
    || manualMatch?.debugPair === true
    || READ_ONLY_MATCH_ACTIONS.has(action)
}

export function shouldBlockRealMatchGeneration({ testModeActive = false, ...request } = {}) {
  return testModeActive === true && !isReadOnlyMatchRequest(request)
}

export function normalizeTestMatchRow(row) {
  const first = Number(row?.participant_a_number)
  const second = Number(row?.participant_b_number)
  if (!Number.isInteger(first) || !Number.isInteger(second) || first <= 0 || second <= 0 || first === second) {
    throw new Error("Test match participants must be different positive integers")
  }

  return {
    ...row,
    participant_a_number: Math.min(first, second),
    participant_b_number: Math.max(first, second),
    compatibility_score: Number(row?.compatibility_score || 0),
    round: Number(row?.round || 30),
    match_type: row?.match_type || "individual",
    is_test_mode: true,
  }
}

export function testMatchToAdminResult(row, staticMatchId) {
  const match = normalizeTestMatchRow(row)
  return {
    ...match,
    match_id: staticMatchId,
    source_id: row.id,
    is_test_mode: true,
  }
}

export function testMatchToLockedMatch(row, staticMatchId) {
  const match = normalizeTestMatchRow(row)
  return {
    id: `test:${row.id}`,
    match_id: staticMatchId,
    participant1_number: match.participant_a_number,
    participant2_number: match.participant_b_number,
    original_compatibility_score: match.compatibility_score,
    original_match_round: match.round,
    reason: match.reason || "Test mode simulated algorithm lock",
    event_id: match.event_id,
    created_at: match.created_at,
    is_test_mode: true,
  }
}

export function buildTestAdminSession(rows, eventId, staticMatchId) {
  const results = rows.map(row => testMatchToAdminResult(row, staticMatchId))
  const locks = rows.map(row => testMatchToLockedMatch(row, staticMatchId))
  const participantNumbers = new Set(results.flatMap(row => [row.participant_a_number, row.participant_b_number]))

  return {
    id: `event3-test-${eventId}`,
    session_id: `event3-test-${eventId}`,
    event_id: Number(eventId),
    match_type: "individual",
    generation_type: "ai",
    match_results: results,
    calculated_pairs: [],
    participant_results: [],
    total_matches: results.length,
    total_participants: participantNumbers.size,
    skip_ai: false,
    excluded_pairs: [],
    excluded_participants: [],
    locked_matches: locks,
    generation_duration_ms: null,
    cache_hit_rate: 100,
    ai_calls_made: 0,
    notes: "Temporary Event3 test-mode algorithm results",
    is_active: true,
    is_pinned: false,
    is_test_mode: true,
    created_at: rows[0]?.created_at || new Date().toISOString(),
  }
}
