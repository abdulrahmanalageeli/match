import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGroupMemberFeedbackSummary, normalizeGroupMemberFeedback } from './group-member-feedback.mjs'

test('accepts feedback for any subset of actual round members', () => {
  const result = normalizeGroupMemberFeedback({
    groupRound: 1,
    reviewerNumber: 7,
    allowedNumbers: new Set([8, 9, 10]),
    entries: [{ member_number: 9, experience: 'great', tags: ['fun', 'fun', 'respectful'], organizer_note: '  ممتاز  ' }],
  })
  assert.deepEqual(result.value, {
    groupRound: 1,
    entries: [{ member_number: 9, experience: 'great', tags: ['fun', 'respectful'], organizer_note: 'ممتاز' }],
  })
})

test('rejects arbitrary members, invalid ratings, and too many tags', () => {
  const base = { groupRound: 2, reviewerNumber: 7, allowedNumbers: new Set([8]) }
  assert.match(normalizeGroupMemberFeedback({ ...base, entries: [{ member_number: 99, experience: 'good' }] }).error, /only review people/)
  assert.match(normalizeGroupMemberFeedback({ ...base, entries: [{ member_number: 8, experience: 'amazing' }] }).error, /experience rating/)
  assert.match(normalizeGroupMemberFeedback({ ...base, entries: [{ member_number: 8, experience: 'good', tags: ['fun', 'comfortable', 'respectful', 'engaging'] }] }).error, /no more than three/)
})

test('summarizes absolute experiences instead of repeating rank order', () => {
  const summary = buildGroupMemberFeedbackSummary([
    { member_number: 8, experience: 'great', tags: ['fun'] },
    { member_number: 8, experience: 'good', tags: ['fun', 'respectful'] },
    { member_number: 9, experience: 'neutral', tags: [] },
  ], { 8: 'A', 9: 'B' })
  assert.deepEqual(summary.map(item => [item.number, item.average, item.reviews, item.top_tags]), [
    [8, 3.5, 2, [['fun', 2], ['respectful', 1]]],
    [9, 2, 1, []],
  ])
})
