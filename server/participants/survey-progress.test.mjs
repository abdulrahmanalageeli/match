import assert from "node:assert/strict"
import test from "node:test"
import {
  SURVEY_COMPLETION_ALERT_TTL_MS,
  SURVEY_PROGRESS_PRESENCE_TTL_MS,
  buildLiveSurveyProgress,
  buildRecentSurveyCompletions,
  buildSurveyProgressPresenceRow,
  normalizeSurveyProgressHeartbeat,
} from "./survey-progress.mjs"

test("normalizes progress from completed units instead of trusting a client percentage", () => {
  const result = normalizeSurveyProgressHeartbeat({
    session_id: "d9428888-122b-4c19-ae60-8c6048f9ef0a",
    current_page: 3,
    total_pages: 9,
    answered_questions: 17,
    total_questions: 40,
    progress_percent: 99,
    gender: "female",
    gender_revealed: true,
    age: "29",
    age_revealed: true,
  })

  assert.equal(result.progressPercent, 43)
  assert.equal(result.gender, "female")
  assert.equal(result.genderRevealed, true)
  assert.equal(result.age, 29)
  assert.equal(result.ageRevealed, true)
})

test("does not reveal unsubmitted personal details", () => {
  const heartbeat = normalizeSurveyProgressHeartbeat({
    session_id: "d9428888-122b-4c19-ae60-8c6048f9ef0a",
    current_page: 0,
    total_pages: 9,
    answered_questions: 3,
    total_questions: 40,
    gender: "male",
    gender_revealed: false,
    age: 31,
    age_revealed: false,
  })
  const row = buildSurveyProgressPresenceRow({
    id: "participant-id",
    match_id: "match-id",
    event_id: 27,
    assigned_number: 71,
    gender: null,
    age: null,
  }, heartbeat, new Date("2026-09-04T12:00:00.000Z"))

  assert.equal("gender" in row, false)
  assert.equal("gender_revealed" in row, false)
  assert.equal("age" in row, false)
  assert.equal("age_revealed" in row, false)
})

test("rejects invalid age values even when the client marks them revealed", () => {
  const heartbeat = normalizeSurveyProgressHeartbeat({
    session_id: "d9428888-122b-4c19-ae60-8c6048f9ef0a",
    total_pages: 9,
    total_questions: 40,
    age: 99,
    age_revealed: true,
  })

  assert.equal(heartbeat.age, null)
  assert.equal(heartbeat.ageRevealed, false)
})

test("keeps only active, fresh sessions and sorts people nearest completion first", () => {
  const now = Date.parse("2026-09-04T12:00:20.000Z")
  const rows = [
    { participant_id: "a", assigned_number: 4, is_active: true, progress_percent: 40, current_page: 3, total_pages: 9, answered_questions: 16, total_questions: 40, gender: null, gender_revealed: false, started_at: "2026-09-04T12:00:00.000Z", last_seen_at: "2026-09-04T12:00:19.000Z" },
    { participant_id: "b", assigned_number: 8, is_active: true, progress_percent: 90, current_page: 8, total_pages: 9, answered_questions: 36, total_questions: 40, gender: "female", gender_revealed: true, age: 27, age_revealed: true, started_at: "2026-09-04T12:00:00.000Z", last_seen_at: "2026-09-04T12:00:18.000Z" },
    { participant_id: "c", assigned_number: 9, is_active: false, progress_percent: 95, current_page: 8, total_pages: 9, answered_questions: 38, total_questions: 40, last_seen_at: "2026-09-04T12:00:19.000Z" },
    { participant_id: "d", assigned_number: 10, is_active: true, progress_percent: 75, current_page: 7, total_pages: 9, answered_questions: 30, total_questions: 40, last_seen_at: new Date(now - SURVEY_PROGRESS_PRESENCE_TTL_MS - 1).toISOString() },
  ]

  const result = buildLiveSurveyProgress(rows, [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ], now)

  assert.deepEqual(result.map(item => item.assigned_number), [8, 4])
  assert.equal(result[0].gender, "female")
  assert.equal(result[0].age, 27)
  assert.equal(result[1].gender, null)
  assert.equal(result[1].age, null)
})

test("returns only recent survey completion events with stable notification keys", () => {
  const now = Date.parse("2026-09-04T12:02:00.000Z")
  const recentCompletedAt = new Date(now - 5_000).toISOString()
  const result = buildRecentSurveyCompletions([
    { participant_id: "a", assigned_number: 4, event_id: 27, completed_at: recentCompletedAt },
    { participant_id: "b", assigned_number: 8, event_id: 27, completed_at: new Date(now - SURVEY_COMPLETION_ALERT_TTL_MS - 1).toISOString() },
    { participant_id: "c", assigned_number: 9, event_id: 27, completed_at: null },
  ], [{ id: "a", name: "A" }], now)

  assert.equal(result.length, 1)
  assert.equal(result[0].name, "A")
  assert.equal(result[0].completion_key, `a:${recentCompletedAt}`)
})
