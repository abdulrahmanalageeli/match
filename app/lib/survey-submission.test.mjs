import assert from 'node:assert/strict'
import test from 'node:test'

import { submitSurveyAndClearDraft } from './survey-submission.mjs'

test('clears the recovery draft only after a confirmed survey save', async () => {
  let clears = 0
  const result = await submitSurveyAndClearDraft({
    data: { answers: { name: 'Test participant' } },
    onSubmit: async () => true,
    clearDraft: () => { clears += 1 },
  })

  assert.equal(result, true)
  assert.equal(clears, 1)
})

test('retains the recovery draft when the survey save fails', async () => {
  let clears = 0
  const result = await submitSurveyAndClearDraft({
    data: { answers: { name: 'Test participant' } },
    onSubmit: async () => false,
    clearDraft: () => { clears += 1 },
  })

  assert.equal(result, false)
  assert.equal(clears, 0)
})

test('retains the recovery draft when submission rejects', async () => {
  let clears = 0
  await assert.rejects(submitSurveyAndClearDraft({
    data: { answers: { name: 'Test participant' } },
    onSubmit: async () => { throw new Error('network unavailable') },
    clearDraft: () => { clears += 1 },
  }), /network unavailable/)

  assert.equal(clears, 0)
})
