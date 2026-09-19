import { buildMutualRound } from "./mutual-choice.mjs"

const MATCH = "00000000-0000-0000-0000-000000000003"
const PROFILE_MATCH = "00000000-0000-0000-0000-000000000000"

async function rpc(db, name, params) {
  const { data, error } = await db.rpc(name, params)
  if (error) throw error
  return data
}

export function mutualSessionKey(state, eventId) {
  return state?.test_mode_active
    ? (state.test_mode_snapshot?.started_at || state.test_session_started_at || "legacy-test")
    : `live:${eventId}:${Number(state?.event3_runtime_generation) || 1}`
}

export async function readMutualRuntime(db, { eventId, sessionKey, advance = true }) {
  const params = { p_event_id: Number(eventId), p_session_key: sessionKey }
  let snapshot = await rpc(db, "event3_mutual_snapshot", params)
  // One step only: after downtime everyone still receives the full next session.
  if (advance && snapshot.status === "running" && snapshot.remaining_seconds <= 0) {
    const assignments = snapshot.round_number < 6 ? buildMutualRound({
      participants: snapshot.roster,
      previousAssignments: snapshot.assignments,
      choices: Object.entries(snapshot.choices || {}).map(([participant_number, chosen_number]) => ({ participant_number: Number(participant_number), chosen_number })),
      history: snapshot.history || [],
      round: snapshot.round_number + 1,
    }) : []
    const advanced = await rpc(db, "event3_mutual_commit", {
      ...params, p_revision: snapshot.revision, p_assignments: assignments,
    })
    snapshot = advanced.stale ? await rpc(db, "event3_mutual_snapshot", params) : advanced
  }
  return snapshot
}

export async function startMutualRuntime(db, { eventId, sessionKey, durationSeconds }) {
  const { data: enrolled, error: rosterError } = await db.from("event3_participants").select("participant_number").eq("match_id", MATCH).eq("event_id", eventId)
  if (rosterError) throw rosterError
  const numbers = (enrolled || []).map(row => Number(row.participant_number))
  if (numbers.length < 6 || numbers.length > 100) throw { code: "22023", message: "Select between 6 and 100 participants before starting" }
  const [{ data: profiles, error: profilesError }, { data: seating, error: seatingError }] = await Promise.all([
    db.from("participants").select("assigned_number,name,gender,survey_data").eq("match_id", PROFILE_MATCH).in("assigned_number", numbers),
    db.from("session_assignments").select("participant_id,table_number").eq("match_id", MATCH).eq("event_id", eventId).eq("round", 1),
  ])
  if (profilesError || seatingError) throw profilesError || seatingError
  const byNumber = new Map((profiles || []).map(profile => [Number(profile.assigned_number), profile]))
  const roster = numbers.map(participant_number => {
    const profile = byNumber.get(participant_number)
    let survey = profile?.survey_data || {}
    if (typeof survey === "string") { try { survey = JSON.parse(survey) } catch { survey = {} } }
    return { participant_number, name: String(profile?.name || survey?.answers?.name || survey?.name || `#${participant_number}`).trim().split(/\s+/)[0], gender: profile?.gender || survey?.answers?.gender || survey?.gender || null }
  })
  const initialTables = new Map()
  for (const row of seating || []) initialTables.set(row.table_number, (initialTables.get(row.table_number) || 0) + 1)
  const validInitialSeating = seating?.length === numbers.length && new Set(seating.map(row => row.participant_id)).size === numbers.length
    && seating.every(row => numbers.includes(Number(row.participant_id)) && Number(row.table_number) > 0)
    && [...initialTables.values()].every(size => size >= 3 && size <= 8)
  const initialAssignments = validInitialSeating ? seating.map(row => ({ participant_number: row.participant_id, table_number: row.table_number, group_number: row.table_number, partner_number: null, kind: "group" })) : []
  const assignments = buildMutualRound({ participants: roster, round: 1, initialAssignments })
  return rpc(db, "event3_mutual_start", { p_event_id: Number(eventId), p_session_key: sessionKey, p_duration_seconds: durationSeconds, p_roster: roster, p_assignments: assignments })
}

export function projectMutualRuntime(snapshot, { participantNumber = null, admin = false, sessionKey }) {
  const session = {
    status: snapshot.status, round_number: snapshot.round_number || 0, total_rounds: 6,
    duration_seconds: snapshot.duration_seconds || 1200, remaining_seconds: snapshot.remaining_seconds || 0,
    ends_at: snapshot.ends_at || null, server_now: snapshot.server_now, revision: snapshot.revision || 0,
  }
  const assignments = snapshot.assignments || []
  if (admin) return {
    session, event3_session_key: sessionKey, assignments,
    summary: { groups: new Set(assignments.filter(row => row.kind === "group").map(row => row.group_number)).size, pairs: assignments.filter(row => row.kind === "pair").length / 2, breaks: assignments.filter(row => row.kind === "break").length, participants: (snapshot.roster || []).length },
  }
  const mine = assignments.find(row => Number(row.participant_number) === Number(participantNumber)) || null
  const choices = snapshot.choices || {}
  const submitted = Object.hasOwn(choices, String(participantNumber))
  const visibleNumbers = new Set(assignments.filter(row => mine && row.table_number === mine.table_number && mine.kind !== "break").map(row => row.participant_number))
  visibleNumbers.delete(Number(participantNumber))
  const previous = (snapshot.history || []).find(row => row.round_number === snapshot.round_number - 1 && row.participant_number === Number(participantNumber))
  const { participant_number: _number, ...assignment } = mine || {}
  return {
    session, event3_session_key: sessionKey, assignment: mine ? assignment : null,
    members: (snapshot.roster || []).filter(row => visibleNumbers.has(row.participant_number)).map(row => ({ participant_number: row.participant_number, name: row.name, gender: row.gender })),
    choice: { chosen_number: submitted ? choices[String(participantNumber)] : null, submitted },
    can_choose: snapshot.status === "running" && snapshot.remaining_seconds > 0 && snapshot.round_number < 6 && mine?.kind === "group",
    previous_outcome: previous?.kind === "group" ? (mine?.kind === "pair" ? "mutual" : "continue") : null,
  }
}

export async function saveMutualChoice(db, { eventId, sessionKey, participantNumber, roundNumber, chosenNumber }) {
  return rpc(db, "event3_mutual_choose", { p_event_id: Number(eventId), p_session_key: sessionKey, p_participant_number: Number(participantNumber), p_round_number: roundNumber, p_chosen_number: chosenNumber })
}

export async function controlMutualRuntime(db, { eventId, sessionKey, command }) {
  return rpc(db, "event3_mutual_control", { p_event_id: Number(eventId), p_session_key: sessionKey, p_command: command })
}

export function mutualRuntimeError(error) {
  const missing = ["PGRST202", "42P01", "42883"].includes(error?.code)
  return { status: missing ? 501 : error?.code === "22023" ? 400 : ["55000", "P0002", "42501"].includes(error?.code) ? 409 : 503, body: { error: missing ? "Apply the mutual-choice database migration before using this format." : error?.message || "تعذّر تحديث الجولة. حاول مجدداً.", code: missing ? "EVENT3_MIGRATION_REQUIRED" : "EVENT3_MUTUAL_UNAVAILABLE", migration_required: missing, retryable: !missing } }
}
