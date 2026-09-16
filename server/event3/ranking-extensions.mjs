export async function loadRankingExtensions(supabase, eventId) {
  const { data: state, error: stateError } = await supabase.from("event_state")
    .select("current_event_id,test_mode_active,test_mode_snapshot")
    .eq("match_id", "00000000-0000-0000-0000-000000000003").single()
  if (stateError) throw stateError
  if (Number(state.current_event_id) !== Number(eventId)) return {}
  const session = state.test_mode_active ? state.test_mode_snapshot?.started_at : "live"
  const { data, error } = await supabase.from("event3_ranking_extensions")
    .select("id,ranker_number,completed_rounds,expires_at,finished_at")
    .eq("event_id", eventId).eq("session_key", session).is("finished_at", null)
    .gt("expires_at", new Date().toISOString())
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.ranker_number, row]))
}
