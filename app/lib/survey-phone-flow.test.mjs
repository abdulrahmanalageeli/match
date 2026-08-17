import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRunSurveyPhoneDuplicateCheck } from './survey-phone-flow.mjs'

test('survey edits never run the registration phone duplicate check', () => {
  assert.equal(shouldRunSurveyPhoneDuplicateCheck({
    isNewRegistration: false,
    currentPage: 1,
    phoneQuestionPage: 1,
  }), false)
})

test('new registrations check only when leaving the page containing the phone field', () => {
  assert.equal(shouldRunSurveyPhoneDuplicateCheck({
    isNewRegistration: true,
    currentPage: 1,
    phoneQuestionPage: 1,
  }), true)

  assert.equal(shouldRunSurveyPhoneDuplicateCheck({
    isNewRegistration: true,
    currentPage: 2,
    phoneQuestionPage: 1,
  }), false)
})
