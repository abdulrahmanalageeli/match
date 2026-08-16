import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGroupReflectionLeaderboard, normalizeGroupReflectionInput } from './group-reflection.mjs'

test('accepts a private note with no ranking and normalizes whitespace', () => {
  const result = normalizeGroupReflectionInput({
    rankedNumbers: [], organizerNote: '  ملاحظة مفيدة  ', sourcePhase: 'phase2_feedback', rankerNumber: 7, allowedNumbers: new Set([8]),
  })
  assert.deepEqual(result.value, { rankedNumbers: [], organizerNote: 'ملاحظة مفيدة', sourcePhase: 'phase2_feedback' })
})

test('rejects duplicate, self, arbitrary, and oversized rankings', () => {
  const base = { organizerNote: '', sourcePhase: 'event3', rankerNumber: 7, allowedNumbers: new Set([8, 9, 10, 11]) }
  assert.match(normalizeGroupReflectionInput({ ...base, rankedNumbers: [8, 8] }).error, /invalid or duplicate/)
  assert.match(normalizeGroupReflectionInput({ ...base, rankedNumbers: [7] }).error, /invalid or duplicate/)
  assert.match(normalizeGroupReflectionInput({ ...base, rankedNumbers: [99] }).error, /only rank participants/)
  assert.match(normalizeGroupReflectionInput({ ...base, rankedNumbers: [8, 9, 10, 11] }).error, /no more than three/)
})

test('scores top-three selections 3, 2, 1 and uses deterministic tie breaks', () => {
  const result = buildGroupReflectionLeaderboard([
    { ranked_numbers: [10, 11, 12] },
    { ranked_numbers: [11, 10, 12] },
    { ranked_numbers: [10] },
  ], { 10: 'A', 11: 'B', 12: 'C' })
  assert.deepEqual(result.map(person => [person.number, person.points, person.first_place_count]), [
    [10, 8, 2],
    [11, 5, 1],
    [12, 2, 0],
  ])
})
