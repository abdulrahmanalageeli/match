// Only the guest's own history enters a welcome. Never load reciprocal feedback,
// partner identities, private organizer notes, rankings, or compatibility scores.
export function buildWelcomeHistory({ participantNumber, currentEventId, attendance = [], roster = [], matches = [], groupFeedback = [], legacyFeedback = [] }) {
  const past = row => Number(row.event_id) > 0 && Number(row.event_id) < Number(currentEventId)
  const own = row => Number(row.participant_number) === Number(participantNumber) && past(row)
  const known = new Map(attendance.filter(own).map(row => [Number(row.event_id), row.attended === true]))
  const attended = new Set([...known].filter(([, yes]) => yes).map(([id]) => id))
  const experiences = new Map()
  const event = id => {
    id = Number(id)
    if (known.get(id) === false) return null
    attended.add(id)
    if (!experiences.has(id)) experiences.set(id, { eventId: id, conversationRatings: [], comfortRatings: [], groupExperiences: {} })
    return experiences.get(id)
  }
  const rating = value => value != null && value !== '' && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null
  const addPair = (row, feedback, legacy = false) => {
    if (!feedback || typeof feedback !== 'object' || (feedback.meetingStatus && feedback.meetingStatus !== 'met')) return
    const conversation = rating(feedback[legacy ? 'conversation_quality' : 'conversationQuality'])
    const comfort = rating(feedback[legacy ? 'personal_connection' : 'personalConnection'])
    if (conversation === null && comfort === null) return
    const summary = event(row.event_id)
    if (!summary) return
    if (conversation !== null) summary.conversationRatings.push(conversation)
    if (comfort !== null) summary.comfortRatings.push(comfort)
  }
  for (const row of matches.filter(own)) for (const phase of ['phase2', 'phase3', 'phase4']) addPair(row, row[`${phase}_feedback`])
  for (const row of legacyFeedback.filter(own)) {
    // Legacy copies of Event3 rounds must not double-count the same meeting.
    if ([20, 30, 40].includes(Number(row.round)) && matches.some(match => own(match) && Number(match.event_id) === Number(row.event_id))) continue
    addPair(row, row, true)
  }
  for (const row of groupFeedback) {
    if (!past(row) || row.is_test_mode !== false || Number(row.reviewer_number) !== Number(participantNumber)) continue
    if (!['great', 'good', 'neutral', 'uncomfortable'].includes(row.experience)) continue
    const summary = event(row.event_id)
    if (summary) summary.groupExperiences[row.experience] = (summary.groupExperiences[row.experience] || 0) + 1
  }
  const unconfirmed = new Set(roster.filter(own).map(row => Number(row.event_id)).filter(id => !known.has(id) && !attended.has(id)))
  return {
    recordedPastAttendanceCount: attended.size,
    unconfirmedPastRegistrations: unconfirmed.size,
    recentExperiences: [...experiences.values()].sort((a, b) => b.eventId - a.eventId).slice(0, 3),
  }
}

export async function loadWelcomeHistories(supabase, { participantNumbers, currentEventId, profileMatchId, event3MatchId }) {
  const numbers = [...new Set(participantNumbers.map(Number))]
  // Page reads so batch generation doesn't silently undercount at the API row cap.
  const read = async makeQuery => {
    const rows = []
    for (let start = 0; ; start += 500) {
      const { data, error } = await makeQuery().order('id').range(start, start + 499)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < 500) return rows
    }
  }
  const scoped = (table, columns, matchId, owner = 'participant_number') => () => supabase.from(table).select(columns).eq('match_id', matchId).in(owner, numbers).lt('event_id', currentEventId)
  const [attendance, roster, matches, groupFeedback, legacyFeedback] = await Promise.all([
    read(scoped('event_attendance', 'participant_number,event_id,attended', profileMatchId)),
    read(scoped('event3_participants', 'participant_number,event_id', event3MatchId)),
    read(scoped('event3_matches', 'participant_number,event_id,phase2_feedback,phase3_feedback,phase4_feedback', event3MatchId)),
    read(() => scoped('event3_group_member_feedback', 'reviewer_number,event_id,experience,is_test_mode', event3MatchId, 'reviewer_number')().eq('is_test_mode', false)),
    read(scoped('match_feedback', 'participant_number,event_id,round,conversation_quality,personal_connection', profileMatchId)),
  ])
  return new Map(numbers.map(participantNumber => [participantNumber, buildWelcomeHistory({ participantNumber, currentEventId, attendance, roster, matches, groupFeedback, legacyFeedback })]))
}
