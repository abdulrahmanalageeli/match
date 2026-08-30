import { GROUP_EXPERIENCES, GROUP_FEEDBACK_TAGS } from "./group-member-feedback.mjs"

const HISTORY_LIMIT = 30
const ROW_LIMIT = 1000
const PRIVATE_NUMBER = 7
const groupTags = new Set(GROUP_FEEDBACK_TAGS)
const groupExperiences = new Set(GROUP_EXPERIENCES)
const number = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) !== 9999 ? Number(value) : null
const visibleNumber = value => number(value) && Number(value) !== PRIVATE_NUMBER
const pairNumbers = row => [...new Set(["a", "b", "c", "d", "e", "f"].map(letter => number(row[`participant_${letter}_number`])).filter(Boolean))]
const eventNumber = row => number(row.event_id)

export function redactCohostHistoryNote(value) {
  if (typeof value !== "string") return null
  const text = value.slice(0, 5000)
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[رابط محذوف]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محذوف]")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|app|me|sa|co|dev|xyz|info|online)(?:\/\S*)?/gi, "[رابط محذوف]")
    .replace(/(^|\s)@[a-z0-9_.]{2,}/gi, "$1[حساب محذوف]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[بيانات محذوفة]")
    .replace(/(?:\+?[0-9٠-٩۰-۹][\s().-]*){8,}/g, "[رقم محذوف]")
    .replace(/\b[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]+)*\b/g, "[بيانات محذوفة]")
    .replace(/\b(?:token|password|secret|api[_ -]?key)\s*[:=]\s*\S+/gi, "[بيانات محذوفة]")
    .trim()
  return text ? text.slice(0, 1000) : null
}

function rating(raw, legacy = false) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const safe = (value, max) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : null
  const result = {
    compatibility: safe(raw[legacy ? "compatibility_rate" : "compatibilityRate"], 100),
    conversation: safe(raw[legacy ? "conversation_quality" : "conversationQuality"], 5),
    connection: safe(raw[legacy ? "personal_connection" : "personalConnection"], 5),
  }
  return Object.values(result).some(value => value !== null) ? result : null
}

/** Explicit projection: never return stored profile/feedback objects verbatim. */
export function buildCohostAttendeeHistory({ target, currentEventId, beforeEventId = currentEventId, profile, attendance = [], roster = [], matches = [], results = [], assignments = [], groupFeedback = [], legacyFeedback = [], notes = [], names = [], truncated = false }) {
  const targetNumber = number(target)
  const knownAttendance = new Map(attendance.map(row => [eventNumber(row), row.attended === true]))
  const previousEvents = new Set(attendance.filter(row => row.attended && eventNumber(row) < currentEventId).map(eventNumber))
  for (const row of roster) if (eventNumber(row) < currentEventId && !knownAttendance.has(eventNumber(row))) previousEvents.add(eventNumber(row))
  const participant = {
    number: targetNumber,
    name: redactCohostHistoryNote(profile?.name)?.slice(0, 120) || `#${targetNumber}`,
    age: Number(profile?.age) >= 18 && Number(profile?.age) <= 110 ? Number(profile.age) : null,
    attended: knownAttendance.get(Number(currentEventId)) === true,
    previous_event_count: previousEvents.size,
    first_time: previousEvents.size === 0,
  }
  const empty = { participant, history: [], total_events: 0, has_more: false, history_limit: HISTORY_LIMIT, next_before_event_id: null }
  if (targetNumber === PRIVATE_NUMBER) return empty
  const nameMap = new Map(names.filter(row => visibleNumber(row.assigned_number)).map(row => [Number(row.assigned_number), redactCohostHistoryNote(row.name)?.slice(0, 120) || `#${row.assigned_number}`]))
  const name = n => nameMap.get(Number(n)) || `#${n}`
  const eventIds = new Set([...previousEvents].filter(Boolean))
  for (const rows of [matches, results, assignments, groupFeedback, notes]) for (const row of rows) if (eventNumber(row) < currentEventId) eventIds.add(eventNumber(row))
  const allEvents = [...eventIds].filter(Boolean).sort((a, b) => b - a)
  const eligible = allEvents.filter(id => id < beforeEventId)
  const selected = eligible.slice(0, HISTORY_LIMIT)
  const history = selected.map(event_id => ({ event_id, matches: [], groups: [], notes: [] }))
  const eventMap = new Map(history.map(event => [event.event_id, event]))
  const addMatch = (event, phase, round, partner, score, given, received, legacy = false) => {
    if (!event || !visibleNumber(partner)) return
    if (event.matches.some(row => row.partner_number === partner && row.phase === phase && row.round === round)) return
    event.matches.push({
      phase, round, partner_number: partner, partner_name: name(partner),
      score: score != null && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 100 ? Number(score) : null,
      received_rating: rating(received, legacy), given_rating: rating(given, legacy),
      received_note: redactCohostHistoryNote(legacy ? received?.organizer_impression || received?.recommendations : received?.organizerImpression),
      given_note: redactCohostHistoryNote(legacy ? given?.organizer_impression || given?.recommendations : given?.organizerImpression), notes: [],
    })
  }
  for (const row of matches) {
    const event = eventMap.get(eventNumber(row))
    if (!event || !visibleNumber(row.participant_number)) continue
    for (const [phase, key, round] of [["choice", "phase2", 20], ["algorithm", "phase3", 30]]) {
      const owner = Number(row.participant_number)
      const partner = number(row[`${key}_partner`])
      if (!visibleNumber(partner) || (owner !== targetNumber && partner !== targetNumber)) continue
      const other = owner === targetNumber ? partner : owner
      const targetRow = matches.find(item => eventNumber(item) === event.event_id && Number(item.participant_number) === targetNumber)
      if (number(targetRow?.[`${key}_partner`]) && Number(targetRow[`${key}_partner`]) !== other) continue
      const own = matches.find(item => eventNumber(item) === event.event_id && Number(item.participant_number) === targetNumber && Number(item[`${key}_partner`]) === other)
      const reciprocal = matches.find(item => eventNumber(item) === event.event_id && Number(item.participant_number) === other && Number(item[`${key}_partner`]) === targetNumber)
      addMatch(event, phase, round, other, own?.[`${key}_score`] ?? row[`${key}_score`], own?.[`${key}_feedback`], reciprocal?.[`${key}_feedback`])
    }
  }
  const groupMap = new Map()
  const addGroup = (event, round, table, members, matchId) => {
    if (!event || !members.includes(targetNumber) || members.includes(PRIVATE_NUMBER)) return null
    const key = `${event.event_id}:${matchId}:${round}:${table}`
    if (groupMap.has(key)) return groupMap.get(key)
    const group = { round, table, members: members.filter(visibleNumber).map(n => ({ number: n, name: name(n) })), received: [], given: [], notes: [] }
    groupMap.set(key, group)
    event.groups.push(group)
    return group
  }
  for (const row of assignments.filter(row => Number(row.participant_id) === targetNumber)) {
    const event = eventMap.get(eventNumber(row))
    const members = [...new Set(assignments.filter(member => eventNumber(member) === eventNumber(row) && member.match_id === row.match_id && member.round === row.round && member.table_number === row.table_number).map(member => number(member.participant_id)).filter(Boolean))]
    addGroup(event, Number(row.round), Number(row.table_number), members, row.match_id)
  }
  for (const row of results) {
    const event = eventMap.get(eventNumber(row))
    const members = pairNumbers(row)
    if (!event || !members.includes(targetNumber) || members.includes(PRIVATE_NUMBER)) continue
    if (members.length > 2) {
      addGroup(event, Number(row.round), Number(row.table_number), members, row.match_id)
    } else if (members.length === 2) {
      const partner = members.find(n => n !== targetNumber)
      // Event3's saved algorithm score is not a second legacy meeting.
      if (event.matches.some(match => match.partner_number === partner)) continue
      const feedback = n => legacyFeedback.find(item => eventNumber(item) === event.event_id && Number(item.round) === Number(row.round) && Number(item.participant_number) === n)
      addMatch(event, "individual", Number(row.round), partner, row.compatibility_score, feedback(targetNumber), feedback(partner), true)
    }
  }
  for (const row of groupFeedback) {
    if (row.is_test_mode || !visibleNumber(row.reviewer_number) || !visibleNumber(row.member_number)) continue
    const event = eventMap.get(eventNumber(row))
    if (!event || ![Number(row.reviewer_number), Number(row.member_number)].includes(targetNumber)) continue
    const other = Number(row.reviewer_number) === targetNumber ? Number(row.member_number) : Number(row.reviewer_number)
    const group = event.groups.find(item => item.round === Number(row.group_round) && item.members.some(member => member.number === other))
    if (!group) continue
    const feedback = { experience: groupExperiences.has(row.experience) ? row.experience : null, tags: Array.isArray(row.tags) ? row.tags.filter(tag => groupTags.has(tag)).slice(0, 3) : [], organizer_note: redactCohostHistoryNote(row.organizer_note) }
    if (Number(row.member_number) === targetNumber) group.received.push({ reviewer_number: other, reviewer_name: name(other), ...feedback })
    else group.given.push({ member_number: other, member_name: name(other), ...feedback })
  }
  for (const row of notes) {
    const event = eventMap.get(eventNumber(row))
    const text = redactCohostHistoryNote(row.note)
    if (!event || !text || row.test_mode || Number(row.participant_number) === PRIVATE_NUMBER || Number(row.participant2_number) === PRIVATE_NUMBER) continue
    if (row.scope_type === "participant" && Number(row.participant_number) === targetNumber) event.notes.push(text)
    if (row.scope_type === "pair" && [Number(row.participant_number), Number(row.participant2_number)].includes(targetNumber)) {
      const other = Number(row.participant_number) === targetNumber ? Number(row.participant2_number) : Number(row.participant_number)
      event.matches.find(match => match.round === Number(row.round) && match.partner_number === other)?.notes.push(text)
    }
    if (row.scope_type === "table") event.groups.find(group => group.round === Number(row.round) && group.table === Number(row.table_number))?.notes.push(text)
  }
  return { participant, history, total_events: allEvents.length, has_more: truncated || eligible.length > HISTORY_LIMIT, history_limit: HISTORY_LIMIT, next_before_event_id: eligible.length > HISTORY_LIMIT ? selected.at(-1) : null }
}

/** Every data fetch remains server-side and is scoped to a current roster member. */
export async function loadCohostAttendeeHistory({ supabase, target, currentEventId, beforeEventId, event3MatchId, profileMatchId }) {
  const participantNumber = number(target)
  if (!participantNumber || (beforeEventId != null && !number(beforeEventId))) return { status: 400, error: "Invalid participant or history cursor" }
  const { data: currentMember, error: memberError } = await supabase.from("event3_participants").select("participant_number").eq("match_id", event3MatchId).eq("event_id", currentEventId).eq("participant_number", participantNumber).maybeSingle()
  if (memberError) throw memberError
  if (!currentMember) return { status: 404, error: "Current attendee not found" }
  let truncated = false
  const read = async query => {
    const result = await query.limit(ROW_LIMIT)
    if (result.error) throw result.error
    if ((result.data || []).length === ROW_LIMIT) truncated = true
    return result.data || []
  }
  const [profiles, attendance, roster] = await Promise.all([
    read(supabase.from("participants").select("assigned_number,name,age").eq("match_id", profileMatchId).eq("assigned_number", participantNumber)),
    read(supabase.from("event_attendance").select("event_id,attended").eq("match_id", profileMatchId).eq("participant_number", participantNumber).lte("event_id", currentEventId).order("event_id", { ascending: false })),
    read(supabase.from("event3_participants").select("event_id").eq("match_id", event3MatchId).eq("participant_number", participantNumber).lt("event_id", currentEventId).order("event_id", { ascending: false })),
  ])
  const base = { target: participantNumber, currentEventId: Number(currentEventId), beforeEventId: Math.min(Number(beforeEventId) || Number(currentEventId), Number(currentEventId)), profile: profiles[0], attendance, roster }
  if (participantNumber === PRIVATE_NUMBER) return { data: buildCohostAttendeeHistory(base) }
  const past = query => query.lt("event_id", base.beforeEventId).order("event_id", { ascending: false })
  const [matches, results, ownAssignments, groupFeedback] = await Promise.all([
    read(past(supabase.from("event3_matches").select("event_id,participant_number,phase2_partner,phase2_score,phase2_feedback,phase3_partner,phase3_score,phase3_feedback").eq("match_id", event3MatchId).or(`participant_number.eq.${participantNumber},phase2_partner.eq.${participantNumber},phase3_partner.eq.${participantNumber}`))),
    read(past(supabase.from("match_results").select("match_id,event_id,round,table_number,participant_a_number,participant_b_number,participant_c_number,participant_d_number,participant_e_number,participant_f_number,compatibility_score").eq("match_id", profileMatchId).or(["a", "b", "c", "d", "e", "f"].map(letter => `participant_${letter}_number.eq.${participantNumber}`).join(",")))),
    read(past(supabase.from("session_assignments").select("match_id,event_id,participant_id,round,table_number").in("match_id", [event3MatchId, profileMatchId]).eq("participant_id", participantNumber).in("round", [1, 2, 3]))),
    read(past(supabase.from("event3_group_member_feedback").select("event_id,reviewer_number,member_number,experience,tags,organizer_note,group_round,is_test_mode").eq("match_id", event3MatchId).eq("is_test_mode", false).or(`reviewer_number.eq.${participantNumber},member_number.eq.${participantNumber}`))),
  ])
  const seed = buildCohostAttendeeHistory({ ...base, matches, results, assignments: ownAssignments, groupFeedback })
  const eventIds = seed.history.map(row => row.event_id)
  if (!eventIds.length) return { data: { ...seed, has_more: truncated } }
  const scopes = ownAssignments.filter(row => eventIds.includes(Number(row.event_id))).map(row => `and(match_id.eq.${row.match_id},event_id.eq.${row.event_id},round.eq.${row.round},table_number.eq.${row.table_number})`)
  const partners = [...new Set(results.filter(row => eventIds.includes(Number(row.event_id))).flatMap(pairNumbers).filter(visibleNumber))]
  const [assignments, legacyFeedback, notes] = await Promise.all([
    scopes.length ? Promise.all(Array.from({ length: Math.ceil(scopes.length / 15) }, (_, index) =>
      read(supabase.from("session_assignments").select("match_id,event_id,participant_id,round,table_number").or([...new Set(scopes.slice(index * 15, index * 15 + 15))].join(",")))
        .then(rows => { if (rows.length === ROW_LIMIT) throw new Error("Group history exceeds safe read limit"); return rows })
    )).then(batches => batches.flat()) : [],
    partners.length ? read(supabase.from("match_feedback").select("event_id,participant_number,round,compatibility_rate,conversation_quality,personal_connection,organizer_impression,recommendations").eq("match_id", profileMatchId).in("event_id", eventIds).in("participant_number", partners)) : [],
    read(supabase.from("event3_cohost_notes").select("event_id,scope_type,round,table_number,participant_number,participant2_number,note,test_mode").eq("match_id", event3MatchId).in("event_id", eventIds).eq("test_mode", false).eq("test_session_key", "").order("updated_at", { ascending: false })),
  ])
  const knownNumbers = [...new Set([
    ...matches.flatMap(row => [number(row.participant_number), number(row.phase2_partner), number(row.phase3_partner)]),
    ...results.flatMap(pairNumbers), ...assignments.map(row => number(row.participant_id)),
  ].filter(visibleNumber))]
  const names = knownNumbers.length ? await read(supabase.from("participants").select("assigned_number,name").eq("match_id", profileMatchId).in("assigned_number", knownNumbers)) : []
  return { data: buildCohostAttendeeHistory({ ...base, matches, results, assignments, groupFeedback, legacyFeedback, notes, names, truncated }) }
}
