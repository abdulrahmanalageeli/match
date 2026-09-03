import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSurveyChangeSummaries } from './survey-change-summary.mjs'

test('survey change summaries retain edit counts and highest percentage independently of row order', () => {
  const summaries = buildSurveyChangeSummaries([
    {
      participant_number: 20,
      change_percentage: 12,
      changed_at: '2026-09-02T08:00:00Z',
      changed_fields: ['age', 'gender'],
      suspicious_flags: [{ code: 'gender_change' }],
    },
    {
      participant_number: 20,
      change_percentage: 4,
      changed_at: '2026-09-03T08:00:00Z',
      changed_fields: ['vibe_2'],
      suspicious_flags: [],
    },
    {
      participant_number: 21,
      change_percentage: 40,
      changed_at: '2026-09-01T08:00:00Z',
      changed_fields: ['age'],
      suspicious_flags: null,
    },
  ])

  assert.deepEqual(summaries[20], {
    count: 2,
    hasSuspicious: true,
    maxPercentage: 12,
    latestPercentage: 4,
    totalFieldsChanged: 3,
    lastChangedAt: '2026-09-03T08:00:00Z',
  })
  assert.equal(summaries[21].maxPercentage, 40)
})
