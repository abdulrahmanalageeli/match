// Per-edition schedules survive starting the next event. Reads fail closed.
export async function loadEvent3ResultsReleases(supabase, matchId) {
  const { data, error } = await supabase.from("event3_event_settings")
    .select("event_id,results_release_at").eq("match_id", matchId)
    .not("results_release_at", "is", null)
  if (error) throw error
  return new Map((data || []).map(row => [Number(row.event_id), row.results_release_at]))
}

export function event3ResultsReleased(eventId, state, releases, now = Date.now()) {
  const activeEventId = Number(state?.current_event_id)
  if (!activeEventId || !Number(eventId)) return false
  if (Number(eventId) === activeEventId && state?.test_mode_active === true) return false
  const releaseAt = releases.get(Number(eventId))
  if (releaseAt) return now >= Date.parse(releaseAt)
  return Number(eventId) !== activeEventId || state?.phase === "final_reveal" || state?.results_visible === true
}
