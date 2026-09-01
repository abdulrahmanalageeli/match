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

test('accepts third-round feedback for the choice-only edition', () => {
  const result = normalizeGroupMemberFeedback({
    groupRound: 3,
    reviewerNumber: 7,
    allowedNumbers: new Set([8]),
    entries: [{ member_number: 8, experience: 'good', tags: ['comfortable'] }],
  })
  assert.equal(result.value.groupRound, 3)
})

test('confidence weighting prevents a single positive review from outranking a supported pattern', () => {
  const rows = [
    { member_number: 1, group_round: 1, experience: 'great', tags: ['fun'] },
    ...Array.from({ length: 8 }, () => ({ member_number: 2, group_round: 1, experience: 'great', tags: ['respectful'] })),
    ...Array.from({ length: 8 }, () => ({ member_number: 3, group_round: 1, experience: 'neutral', tags: [] })),
  ]

  const summary = buildGroupMemberFeedbackSummary(rows)
  const singleReview = summary.find(item => item.number === 1)
  const supportedPattern = summary.find(item => item.number === 2)

  assert.ok(supportedPattern.liked_score > singleReview.liked_score)
  assert.equal(singleReview.confidence_label, 'initial')
  assert.equal(supportedPattern.confidence_label, 'strong')
})

test('exposes polarization, reason buckets, and repeated round signals', () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, index) => ({
      member_number: 7,
      group_round: index < 2 ? 1 : 2,
      experience: 'great',
      tags: ['fun'],
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      member_number: 7,
      group_round: index < 2 ? 1 : 2,
      experience: 'uncomfortable',
      tags: ['interrupts'],
    })),
  ]

  const [person] = buildGroupMemberFeedbackSummary(rows, { 7: 'Polarizing participant' })

  assert.equal(person.positive_rate, 0.5)
  assert.equal(person.negative_rate, 0.5)
  assert.ok(person.polarizing_score > 40)
  assert.deepEqual(person.positive_tags, [['fun', 4]])
  assert.deepEqual(person.negative_tags, [['interrupts', 4]])
  assert.equal(person.reviewed_rounds, 2)
  assert.equal(person.negative_rounds, 2)
  assert.equal(person.positive_rounds, 0)
})
