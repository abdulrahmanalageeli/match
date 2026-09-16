// Session lists and initial responses must not include the full pair report.
export const ADMIN_RESULT_SUMMARY_COLUMNS = 'session_id,event_id,match_type,generation_type,created_at,total_matches,total_participants,skip_ai,generation_duration_ms,cache_hit_rate,ai_calls_made,is_active,is_pinned,notes'

export function deferredAdminResultSession(session) {
  return { ...session, calculated_pairs: [], calculated_pairs_deferred: true }
}

export function generatedPairReport(calculatedPairs, sessionId) {
  return sessionId
    ? { calculatedPairs: [], calculatedPairsDeferred: true, sessionId }
    : { calculatedPairs, calculatedPairsDeferred: false, sessionId: null }
}
