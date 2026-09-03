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
