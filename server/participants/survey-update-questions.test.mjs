import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROFILE_DATA_COLLECTION_IDS,
  getMissingSurveyUpdateIds,
} from '../../app/lib/survey-update-questions.js'

const earlierUpdateAnswers = {
  age_flex_one_year: 'accept',
  match_disagreement_style: 'B',
  match_similarity_preference: 'C',
  match_current_curiosity: 'موضوع طويل بما يكفي لاجتياز التحقق المطلوب',
  match_current_focus: ['career', 'creative'],
  conversation_initiative_preference: 'A',
}

test('people who completed the earlier update are prompted for the later profile trio', () => {
  assert.deepEqual(getMissingSurveyUpdateIds(earlierUpdateAnswers), [...PROFILE_DATA_COLLECTION_IDS])
})

test('the update prompt includes only profile questions that are actually missing', () => {
  const answers = {
    ...earlierUpdateAnswers,
    expression_language: '3',
    social_relationship_style: '2',
  }

  assert.deepEqual(getMissingSurveyUpdateIds(answers), ['minimum_partner_religious_commitment'])
})

test('the update prompt is complete after all three later questions are answered', () => {
  const answers = {
    ...earlierUpdateAnswers,
    expression_language: '3',
    minimum_partner_religious_commitment: '2',
    social_relationship_style: '2',
  }

  assert.deepEqual(getMissingSurveyUpdateIds(answers), [])
})
