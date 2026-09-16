import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWelcomeHistory, loadWelcomeHistories } from './welcome-history.mjs'
import { buildWelcomePrompt, isCurrentWelcome, WELCOME_VERSION } from '../../api/admin/ai-welcome-prompt.mjs'

const base = { participantNumber: 10, currentEventId: 28 }
test('counts distinct past attendance; excludes no-shows, current/future events and other guests', () => {
  const attendance = [[25, true], [25, true], [26, false], [27, true], [28, true], [29, true]].map(([event_id, attended]) => ({ participant_number: 10, event_id, attended }))
  attendance.push({ participant_number: 11, event_id: 24, attended: true })
  const result = buildWelcomeHistory({ ...base, attendance, roster: [{ participant_number: 10, event_id: 24 }, { participant_number: 10, event_id: 26 }] })
  assert.equal(result.recordedPastAttendanceCount, 2)
  assert.equal(result.unconfirmedPastRegistrations, 1)
})
test('uses only own real experiences; never includes private notes, scores, or partner identity', () => {
  const matches = [
    { participant_number: 10, event_id: 27, phase2_partner: 99, phase2_score: 85, phase2_feedback: { conversationQuality: 2, personalConnection: 3, organizerImpression: 'PRIVATE', participantMessage: 'SECRET' } },
    { participant_number: 11, event_id: 26, phase2_feedback: { conversationQuality: 5 } },
    { participant_number: 10, event_id: 25, phase2_feedback: { meetingStatus: 'not_met', conversationQuality: 5 } },
  ]
  const groupFeedback = [
    { reviewer_number: 10, event_id: 27, experience: 'good', is_test_mode: false, member_number: 99 },
    { reviewer_number: 10, event_id: 26, experience: 'great', is_test_mode: true },
    { reviewer_number: 11, member_number: 10, event_id: 26, experience: 'uncomfortable', is_test_mode: false },
  ]
  const result = buildWelcomeHistory({ ...base, matches, groupFeedback })
  assert.equal(result.recordedPastAttendanceCount, 1)
  assert.deepEqual(result.recentExperiences, [{ eventId: 27, conversationRatings: [2], comfortRatings: [3], groupExperiences: { good: 1 } }])
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET|99|85|uncomfortable/)
})
test('explicit absence wins over conflicting feedback; missing feedback is not a negative experience', () => {
  const result = buildWelcomeHistory({ ...base, attendance: [{ participant_number: 10, event_id: 27, attended: false }, { participant_number: 10, event_id: 26, attended: true }], matches: [{ participant_number: 10, event_id: 27, phase2_feedback: { conversationQuality: 5 } }] })
  assert.equal(result.recordedPastAttendanceCount, 1)
  assert.deepEqual(result.recentExperiences, [])
})
test('legacy self-feedback supports attendance; keeps latest three experiences and ignores invalid ratings', () => {
  const legacyFeedback = [20, 21, 22, 23].map(event_id => ({ participant_number: 10, event_id, conversation_quality: 4, personal_connection: 0 }))
  const result = buildWelcomeHistory({ ...base, legacyFeedback })
  assert.equal(result.recordedPastAttendanceCount, 4)
  assert.deepEqual(result.recentExperiences.map(row => row.eventId), [23, 22, 21])
  assert.ok(result.recentExperiences.every(row => !row.comfortRatings.length))
})
test('prompt carries attendance and experience without treating previous welcome as attendance', () => {
  const history = buildWelcomeHistory({ ...base })
  const result = buildWelcomePrompt({ participantNum: 10, firstName: 'Sara', gender: 'female', surveyData: { answers: { vibe_2: 'hiking' } }, priorMessages: ['old welcome'], history })
  assert.ok(result.prompt.includes(JSON.stringify(history)))
  assert.ok(result.prompt.includes('40–65'))
  assert.ok(result.prompt.includes('فقرتين'))
  assert.ok(result.anchorsUsed.includes(WELCOME_VERSION))
  assert.equal(isCurrentWelcome({ welcome_message: 'old', anchor_used: 'hobbies' }), false)
  assert.equal(isCurrentWelcome({ welcome_message: 'new', anchor_used: result.anchorsUsed.join(',') }), true)
})
test('history loader scopes every query and paginates beyond API row limits', async () => {
  const calls = []
  const supabase = { from(table) {
    const filters = []
    const query = {
      select(columns) { filters.push(['select', columns]); return this },
      eq(...args) { filters.push(['eq', ...args]); return this },
      in(...args) { filters.push(['in', ...args]); return this },
      lt(...args) { filters.push(['lt', ...args]); return this },
      order(...args) { filters.push(['order', ...args]); return this },
      async range(start, end) {
        calls.push({ table, filters, start, end })
        return { data: table === 'event_attendance' ? (start === 0 ? Array.from({ length: 500 }, (_, i) => ({ participant_number: 10, event_id: i + 1, attended: true })) : [{ participant_number: 10, event_id: 501, attended: true }]) : [] }
      },
    }
    return query
  } }
  const result = await loadWelcomeHistories(supabase, { participantNumbers: [10], currentEventId: 600, profileMatchId: 'profile', event3MatchId: 'event3' })
  assert.equal(result.get(10).recordedPastAttendanceCount, 501)
  assert.equal(calls.filter(call => call.table === 'event_attendance').length, 2)
  for (const call of calls) {
    assert.ok(call.filters.some(filter => filter[0] === 'eq' && filter[1] === 'match_id'))
    assert.ok(call.filters.some(filter => filter[0] === 'in' && filter[2][0] === 10))
    assert.ok(call.filters.some(filter => filter[0] === 'lt' && filter[1] === 'event_id' && filter[2] === 600))
  }
})
test('history read failures propagate instead of inventing first-time status', async () => {
  const query = { select() { return this }, eq() { return this }, in() { return this }, lt() { return this }, order() { return this }, range() { return Promise.resolve({ error: new Error('unavailable') }) } }
  await assert.rejects(loadWelcomeHistories({ from: () => query }, { participantNumbers: [10], currentEventId: 28 }), /unavailable/)
  const fallback = buildWelcomePrompt({ participantNum: 10, firstName: 'Sara', surveyData: {}, history: null })
  assert.equal(isCurrentWelcome({ welcome_message: 'fallback', anchor_used: fallback.anchorsUsed.join(',') }), false)
})
