import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeltaReviewParticipants,
  getDeltaReviewReasonCounts,
  getParticipantDeltaReviewActivity,
  getRiyadhDayBounds,
} from './delta-review.mjs'

test('Riyadh review day uses local midnight rather than UTC midnight', () => {
  const bounds = getRiyadhDayBounds(new Date('2026-09-03T20:00:00.000Z'))
  assert.equal(bounds.date, '2026-09-03')
  assert.equal(bounds.startIso, '2026-09-02T21:00:00.000Z')
  assert.equal(bounds.endIso, '2026-09-03T21:00:00.000Z')
})

test('today survey activity is included without event or signup eligibility', () => {
  const bounds = getRiyadhDayBounds(new Date('2026-09-03T12:00:00.000Z'))
  const activity = getParticipantDeltaReviewActivity({
    event_id: 3,
    signup_for_next_event: false,
    auto_signup_next_event: false,
    survey_data_updated_at: '2026-09-03T08:15:00.000Z',
    created_at: '2026-08-01T08:15:00.000Z',
  }, bounds)
  assert.deepEqual(activity?.reasons, ['survey_updated'])
  assert.equal(activity?.activityAt, '2026-09-03T08:15:00.000Z')
})

test('new registrations and signups are included even without a survey', () => {
  const bounds = getRiyadhDayBounds(new Date('2026-09-03T12:00:00.000Z'))
  const activity = getParticipantDeltaReviewActivity({
    survey_data: null,
    event_enrolled_at: '2026-09-03T07:00:00.000Z',
    created_at: '2026-09-03T06:55:00.000Z',
  }, bounds)
  assert.deepEqual(activity?.reasons, ['newly_enrolled'])
  assert.equal(activity?.activityAt, '2026-09-03T07:00:00.000Z')
})

test('the latest activity wins while retaining every applicable reason', () => {
  const bounds = getRiyadhDayBounds(new Date('2026-09-03T12:00:00.000Z'))
  const activity = getParticipantDeltaReviewActivity({
    survey_data_updated_at: '2026-09-03T10:00:00.000Z',
    next_event_signup_timestamp: '2026-09-03T09:00:00.000Z',
  }, bounds)
  assert.deepEqual(activity?.reasons, ['survey_updated', 'newly_enrolled'])
  assert.equal(activity?.activityAt, '2026-09-03T10:00:00.000Z')
})

test('reason counts can include both reasons for one participant', () => {
  assert.deepEqual(getDeltaReviewReasonCounts([
    { activity_reasons: ['survey_updated'] },
    { activity_reasons: ['survey_updated', 'newly_enrolled'] },
  ]), { survey_changes: 2, new_enrollments: 1 })
})

test('review rows join to participants without relying on a PostgREST relationship', () => {
  const rows = buildDeltaReviewParticipants([
    {
      participant_id: 'participant-2',
      activity_at: '2026-09-03T11:00:00.000Z',
      survey_updated: true,
      newly_enrolled: false,
    },
    {
      participant_id: 'missing-participant',
      activity_at: '2026-09-03T12:00:00.000Z',
      survey_updated: true,
      newly_enrolled: false,
    },
    {
      participant_id: 'participant-1',
      activity_at: '2026-09-03T10:00:00.000Z',
      survey_updated: false,
      newly_enrolled: true,
    },
  ], [
    {
      id: 'participant-1',
      assigned_number: 101,
      name: 'Current',
      event_id: 3,
    },
    {
      id: 'participant-2',
      assigned_number: 202,
      survey_data: JSON.stringify({ answers: { name: 'Signed up' } }),
      event_id: 2,
      signup_for_next_event: true,
    },
  ], 3)

  assert.deepEqual(rows.map(item => ({
    number: item.assigned_number,
    name: item.name,
    reason: item.delta_reason,
    eligibility: item.eligibility_reason,
  })), [
    { number: 202, name: 'Signed up', reason: 'survey_updated', eligibility: 'Signed Up' },
    { number: 101, name: 'Current', reason: 'newly_enrolled', eligibility: 'Current Event' },
  ])
})
