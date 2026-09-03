export const DELTA_REVIEW_TIME_ZONE = 'Asia/Riyadh'

const RIYADH_UTC_OFFSET = '+03:00'

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function maxTimestamp(values) {
  const valid = values.filter(Number.isFinite)
  return valid.length > 0 ? Math.max(...valid) : null
}

export function getRiyadhDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELTA_REVIEW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = type => parts.find(part => part.type === type)?.value
  const date = `${value('year')}-${value('month')}-${value('day')}`
  const startMs = Date.parse(`${date}T00:00:00${RIYADH_UTC_OFFSET}`)
  return {
    date,
    startMs,
    endMs: startMs + 24 * 60 * 60 * 1000,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  }
}

export function getParticipantDeltaReviewActivity(participant, bounds = getRiyadhDayBounds()) {
  const withinDay = value => {
    const parsed = parseTimestamp(value)
    return parsed != null && parsed >= bounds.startMs && parsed < bounds.endMs ? parsed : null
  }

  const surveyAt = withinDay(participant?.survey_data_updated_at)
  const enrollmentAt = maxTimestamp([
    withinDay(participant?.next_event_signup_timestamp),
    withinDay(participant?.event_enrolled_at),
    withinDay(participant?.created_at),
  ])
  const latestAt = maxTimestamp([surveyAt, enrollmentAt])
  if (latestAt == null) return null

  const reasons = []
  if (surveyAt != null) reasons.push('survey_updated')
  if (enrollmentAt != null) reasons.push('newly_enrolled')

  return {
    activityAt: new Date(latestAt).toISOString(),
    surveyActivityAt: surveyAt == null ? null : new Date(surveyAt).toISOString(),
    enrollmentActivityAt: enrollmentAt == null ? null : new Date(enrollmentAt).toISOString(),
    reasons,
  }
}

export function getDeltaReviewReasonCounts(items) {
  return (items || []).reduce((counts, item) => {
    const reasons = item?.activity_reasons || item?.reasons || []
    if (reasons.includes('survey_updated')) counts.survey_changes += 1
    if (reasons.includes('newly_enrolled')) counts.new_enrollments += 1
    return counts
  }, { survey_changes: 0, new_enrollments: 0 })
}

function getSubmittedParticipantName(participant, surveyData) {
  const assignedNumber = String(participant?.assigned_number ?? '').trim()
  const candidates = [
    participant?.name,
    surveyData?.name,
    surveyData?.answers?.name,
  ]

  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const name = value.trim()
    if (!name) continue

    // Registration-only rows sometimes use the assigned number as a temporary
    // name. They are not submitted profiles and should never enter Delta.
    const numberOnlyName = name.replace(/^#\s*/, '')
    if (/^\d+$/.test(numberOnlyName)) continue
    if (assignedNumber && numberOnlyName === assignedNumber) continue

    return name
  }

  return null
}

export function buildDeltaReviewParticipants(reviewRows, participantRows, eventId) {
  const participantsById = new Map(
    (participantRows || []).map(participant => [participant.id, participant]),
  )

  return (reviewRows || [])
    .map(item => {
      const participant = participantsById.get(item.participant_id)
      if (!participant) return null

      let surveyData = participant.survey_data || {}
      if (typeof surveyData === 'string') {
        try {
          surveyData = JSON.parse(surveyData)
        } catch {
          surveyData = {}
        }
      }

      const hasSubmittedSurvey = surveyData
        && typeof surveyData === 'object'
        && !Array.isArray(surveyData)
        && Object.keys(surveyData).length > 0
      const submittedName = getSubmittedParticipantName(participant, surveyData)
      if (!hasSubmittedSurvey || !submittedName) return null

      const currentEvent = Number(participant.event_id) === Number(eventId)
      const signedUp = participant.signup_for_next_event === true || participant.auto_signup_next_event === true
      const activityReasons = [
        ...(item.survey_updated ? ['survey_updated'] : []),
        ...(item.newly_enrolled ? ['newly_enrolled'] : []),
      ]

      return {
        assigned_number: participant.assigned_number,
        name: submittedName,
        survey_data_updated_at: participant.survey_data_updated_at,
        next_event_signup_timestamp: participant.next_event_signup_timestamp,
        event_enrolled_at: participant.event_enrolled_at,
        delta_changed_at: item.activity_at,
        delta_reason: item.survey_updated ? 'survey_updated' : 'newly_enrolled',
        activity_reasons: activityReasons,
        eligibility_reason: currentEvent
          ? 'Current Event'
          : signedUp
            ? 'Signed Up'
            : 'Not Signed Up',
      }
    })
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.delta_changed_at) - Date.parse(left.delta_changed_at))
}
