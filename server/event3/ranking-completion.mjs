// A ballot is complete only when it includes every distinct group tablemate.
export function rankingRoundsForPhase(phase) {
  if (["setup", "round1", "ranking1", "round2"].includes(phase)) return 1
  if (["ranking2", "round3"].includes(phase)) return 2
  return 3
}

export function buildRankingCompletion(assignments, rankings, completedRounds) {
  const tables = new Map()
  const expected = new Map()
  for (const row of assignments) {
    if (row.round < 1 || row.round > completedRounds) continue
    const key = `${row.round}:${row.table_number}`
    if (!tables.has(key)) tables.set(key, new Set())
    tables.get(key).add(Number(row.participant_id))
  }
  for (const peers of tables.values()) {
    for (const number of peers) {
      if (!expected.has(number)) expected.set(number, new Set())
      for (const peer of peers) if (peer !== number) expected.get(number).add(peer)
    }
  }
  const saved = new Map()
  for (const row of rankings) {
    const number = Number(row.ranker_number)
    if (!saved.has(number)) saved.set(number, new Set())
    saved.get(number).add(Number(row.ranked_number))
  }
  return number => {
    const peers = expected.get(Number(number)) || new Set()
    const ballot = saved.get(Number(number)) || new Set()
    const count = [...peers].filter(peer => ballot.has(peer)).length
    return { submitted: peers.size > 0 && count === peers.size, expected_count: peers.size, missing_count: peers.size - count }
  }
}

export async function loadRankingCompletion(supabase, matchId, eventId, rankings) {
  const [state, assignments] = await Promise.all([
    supabase.from("event_state").select("phase,current_event_id").eq("match_id", matchId).single(),
    supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", matchId).eq("event_id", eventId).in("round", [1, 2, 3]),
  ])
  if (state.error) throw state.error
  if (assignments.error) throw assignments.error
  const configuredRounds = assignments.data?.some(row => Number(row.round) === 3) ? 3 : 2
  const rounds = Number(state.data.current_event_id) === Number(eventId)
    ? Math.min(configuredRounds, rankingRoundsForPhase(state.data.phase))
    : configuredRounds
  return buildRankingCompletion(assignments.data || [], rankings, rounds)
}
