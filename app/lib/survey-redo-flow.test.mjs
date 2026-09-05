import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isSurveyRedoRequest,
  shouldShowFilledSurveyPrompt,
} from './survey-redo-flow.mjs'

test('recognizes every supported survey redo URL', () => {
  assert.equal(isSurveyRedoRequest({ redo: '1' }), true)
  assert.equal(isSurveyRedoRequest({ redo: 'true' }), true)
  assert.equal(isSurveyRedoRequest({ flow: 'redo' }), true)
  assert.equal(isSurveyRedoRequest({ redo: '0' }), false)
})

test('redo links bypass the generic already-filled prompt', () => {
  assert.equal(shouldShowFilledSurveyPrompt({
    hasFilledForm: true,
    eventPhase: 'form',
    isJustCreatedUser: false,
    isRedoRequest: true,
  }), false)
})

test('ordinary returning visits still show the already-filled prompt', () => {
  assert.equal(shouldShowFilledSurveyPrompt({
    hasFilledForm: true,
    eventPhase: 'form',
    isJustCreatedUser: false,
    isRedoRequest: false,
  }), true)
})
