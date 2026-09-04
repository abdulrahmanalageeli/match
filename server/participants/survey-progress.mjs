export const SURVEY_PROGRESS_PRESENCE_TTL_MS = 20_000
export const SURVEY_COMPLETION_ALERT_TTL_MS = 60_000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
}

function normalizeGender(value) {
  return value === "male" || value === "female" ? value : null
}

function normalizeAge(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 18 && parsed <= 65 ? parsed : null
}

export function isSurveyProgressSchemaMissing(error) {
  return Boolean(error && (
    ["42P01", "PGRST202", "PGRST205"].includes(error.code)
    || String(error.message || "").includes("survey_progress_presence")
  ))
}

export function normalizeSurveyProgressHeartbeat(payload = {}) {
  const sessionId = String(payload.session_id || "").trim()
  if (!UUID_PATTERN.test(sessionId)) {
    return { error: "A valid survey session is required" }
  }

  const totalPages = boundedInteger(payload.total_pages, 1, 30, 1)
  const currentPage = boundedInteger(payload.current_page, 0, totalPages - 1, 0)
  const totalQuestions = boundedInteger(payload.total_questions, 1, 200, 1)
  const answeredQuestions = boundedInteger(payload.answered_questions, 0, totalQuestions, 0)
  const gender = normalizeGender(payload.gender)
  const genderRevealed = payload.gender_revealed === true && gender !== null
  const age = normalizeAge(payload.age)
  const ageRevealed = payload.age_revealed === true && age !== null

  return {
    sessionId,
    active: payload.active !== false,
    currentPage,
    totalPages,
    answeredQuestions,
    totalQuestions,
    progressPercent: Math.round((answeredQuestions / totalQuestions) * 100),
    gender,
    genderRevealed,
    age,
    ageRevealed,
  }
}

export function buildSurveyProgressPresenceRow(participant, heartbeat, now = new Date()) {
  const row = {
    participant_id: participant.id,
    match_id: participant.match_id,
    event_id: Number(participant.event_id) || 1,
    assigned_number: Number(participant.assigned_number),
    session_id: heartbeat.sessionId,
    current_page: heartbeat.currentPage,
    total_pages: heartbeat.totalPages,
    answered_questions: heartbeat.answeredQuestions,
    total_questions: heartbeat.totalQuestions,
    progress_percent: heartbeat.progressPercent,
    is_active: true,
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
  }

  const storedGender = normalizeGender(participant.gender)
  const visibleGender = heartbeat.genderRevealed ? heartbeat.gender : storedGender
  if (visibleGender) {
    row.gender = visibleGender
    row.gender_revealed = true
  }

  const storedAge = normalizeAge(participant.age)
  const visibleAge = heartbeat.ageRevealed ? heartbeat.age : storedAge
  if (visibleAge !== null) {
    row.age = visibleAge
    row.age_revealed = true
  }

  return row
}

export function buildRecentSurveyCompletions(rows = [], participants = [], nowMs = Date.now()) {
  const participantById = new Map(participants.map(participant => [participant.id, participant]))
  const cutoff = nowMs - SURVEY_COMPLETION_ALERT_TTL_MS

  return rows
    .filter(row => {
      const completedAt = Date.parse(row?.completed_at)
      return Number.isFinite(completedAt) && completedAt >= cutoff && completedAt <= nowMs + 5_000
    })
    .map(row => {
      const participant = participantById.get(row.participant_id) || {}
      return {
        completion_key: `${row.participant_id}:${row.completed_at}`,
        participant_id: row.participant_id,
        assigned_number: Number(row.assigned_number || participant.assigned_number),
        name: participant.name || participant?.survey_data?.name || participant?.survey_data?.answers?.name || null,
        event_id: Number(row.event_id || participant.event_id) || null,
        completed_at: row.completed_at,
      }
    })
    .sort((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at))
}

export function buildLiveSurveyProgress(rows = [], participants = [], nowMs = Date.now()) {
  const participantById = new Map(participants.map(participant => [participant.id, participant]))
  const cutoff = nowMs - SURVEY_PROGRESS_PRESENCE_TTL_MS

  return rows
    .filter(row => row?.is_active === true && Date.parse(row.last_seen_at) >= cutoff)
    .map(row => {
      const participant = participantById.get(row.participant_id) || {}
      const progressPercent = boundedInteger(row.progress_percent, 0, 100, 0)
      const gender = row.gender_revealed === true ? normalizeGender(row.gender) : null
      const age = row.age_revealed === true ? normalizeAge(row.age) : null
      return {
        participant_id: row.participant_id,
        assigned_number: Number(row.assigned_number || participant.assigned_number),
        name: participant.name || participant?.survey_data?.name || participant?.survey_data?.answers?.name || null,
        event_id: Number(row.event_id || participant.event_id) || null,
        current_page: boundedInteger(row.current_page, 0, 30, 0),
        total_pages: boundedInteger(row.total_pages, 1, 30, 1),
        answered_questions: boundedInteger(row.answered_questions, 0, 200, 0),
        total_questions: boundedInteger(row.total_questions, 1, 200, 1),
        progress_percent: progressPercent,
        gender,
        gender_revealed: gender !== null,
        age,
        age_revealed: age !== null,
        started_at: row.started_at,
        last_seen_at: row.last_seen_at,
      }
    })
    .sort((left, right) => (
      right.progress_percent - left.progress_percent
      || Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at)
      || left.assigned_number - right.assigned_number
    ))
}
