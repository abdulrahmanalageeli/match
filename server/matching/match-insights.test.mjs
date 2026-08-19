import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVibeDescription,
  calculateAttachmentPaceScore,
  calculateCurrentFocusScore,
  calculateDisagreementStyleScore,
  calculatePersistedMatchInsightScores,
  calculateSimilarityPreferenceScore,
  getMatchInsightsCacheContent,
  getMatchInsightsCompletion,
  getPairMatchInsightsCoverage,
  validateMatchInsights,
} from './match-insights.mjs'

const participant = (answers = {}) => ({ survey_data: { answers } })

test('disagreement scoring is symmetric and legacy-safe', () => {
  const debate = participant({ match_disagreement_style: 'A' })
  const redirect = participant({ match_disagreement_style: 'D' })
  const understand = participant({ match_disagreement_style: 'B' })
  assert.equal(calculateDisagreementStyleScore(debate, redirect), 0)
  assert.equal(calculateDisagreementStyleScore(redirect, debate), 0)
  assert.equal(calculateDisagreementStyleScore(debate, understand), 3)
  assert.equal(calculateDisagreementStyleScore(debate, participant()), 2.5)
})

test('current focus rewards concrete overlap and falls back neutrally', () => {
  const a = participant({ match_current_focus: ['career', 'creative'] })
  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['creative', 'career'] })), 5)
  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['creative', 'health_fitness'] })), 3)
  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['study', 'business'] })), 1)
  assert.equal(calculateCurrentFocusScore(a, participant()), 2.5)
})

test('similarity preference uses observed similarity and remains symmetric', () => {
  const similar = participant({ match_similarity_preference: 'A' })
  const novelty = participant({ match_similarity_preference: 'B' })
  assert.equal(calculateSimilarityPreferenceScore(similar, similar, 1), 5)
  assert.equal(calculateSimilarityPreferenceScore(novelty, novelty, 0), 5)
  assert.equal(calculateSimilarityPreferenceScore(similar, novelty, 0.8), calculateSimilarityPreferenceScore(novelty, similar, 0.8))
  assert.equal(calculateSimilarityPreferenceScore(participant(), participant(), 0.2), 3)
})

test('attachment pace compares needs with partner behavior symmetrically', () => {
  const reassuranceSeeking = participant({
    attachment_1: 'ب', attachment_3: 'ب', attachment_4: 'ب',
    early_openness_comfort: '2', conversation_depth_pref: 'A', conversational_role: 'B', curiosity_style: 'B',
  })
  const responsivePartner = participant({
    attachment_1: 'أ', attachment_3: 'أ', attachment_4: 'أ',
    early_openness_comfort: '3', conversation_depth_pref: 'A', conversational_role: 'A', curiosity_style: 'B',
  })
  const lowPressurePartner = participant({
    attachment_1: 'أ', attachment_3: 'أ', attachment_4: 'أ',
    early_openness_comfort: '0', conversation_depth_pref: 'B', conversational_role: 'C', curiosity_style: 'A',
  })

  const responsiveScore = calculateAttachmentPaceScore(reassuranceSeeking, responsivePartner)
  const lowPressureScore = calculateAttachmentPaceScore(reassuranceSeeking, lowPressurePartner)
  assert.ok(responsiveScore > lowPressureScore)
  assert.equal(responsiveScore, calculateAttachmentPaceScore(responsivePartner, reassuranceSeeking))
  assert.ok(responsiveScore >= 0 && responsiveScore <= 3)
})

test('attachment pace is neutral when the relevant answers are unavailable', () => {
  assert.equal(calculateAttachmentPaceScore(participant(), participant()), 1.5)
})

test('attachment pace supports legacy flat survey records', () => {
  const flat = {
    survey_data: {
      attachment_1: 'ب', attachment_3: 'ب', attachment_4: 'ب',
      early_openness_comfort: '3', conversation_depth_pref: 'A', conversational_role: 'A', curiosity_style: 'B',
    },
  }
  assert.ok(calculateAttachmentPaceScore(flat, flat) > 2.5)
})

test('persisted swap scores rebuild every match-insight column from participant data', () => {
  const a = participant({
    match_disagreement_style: 'B',
    match_similarity_preference: 'A',
    match_current_focus: ['career', 'creative'],
    attachment_1: 'A', attachment_3: 'A', attachment_4: 'A',
    early_openness_comfort: '2', conversation_depth_pref: 'A', conversational_role: 'B', curiosity_style: 'B',
  })
  const b = participant({
    match_disagreement_style: 'C',
    match_similarity_preference: 'C',
    match_current_focus: ['career', 'self_growth'],
    attachment_1: 'B', attachment_3: 'A', attachment_4: 'B',
    early_openness_comfort: '3', conversation_depth_pref: 'A', conversational_role: 'A', curiosity_style: 'B',
  })

  const scores = calculatePersistedMatchInsightScores(a, b, 20)
  assert.equal(scores.disagreement_style_score, 3)
  assert.equal(scores.current_life_overlap_score, 3)
  assert.ok(scores.similarity_preference_score > 0)
  assert.ok(scores.attachment_pace_score > 0)
})

test('popup payload validation accepts the five match insights and age flexibility', () => {
  const valid = validateMatchInsights({
    age_flex_one_year: 'accept',
    match_disagreement_style: 'b',
    match_similarity_preference: 'C',
    conversation_initiative_preference: 'A',
    match_current_curiosity: 'هذا موضوع يشدني جدًا وأقدر أتكلم عنه بسهولة',
    match_current_focus: ['career', 'creative'],
    unexpected: 'ignored',
  })
  assert.equal(valid.valid, true)
  assert.deepEqual(Object.keys(valid.answers).sort(), [
    'age_flex_one_year',
    'conversation_initiative_preference',
    'match_current_curiosity',
    'match_current_focus',
    'match_disagreement_style',
    'match_similarity_preference',
  ])
  assert.equal(valid.answers.match_disagreement_style, 'B')
  assert.equal(valid.answers.conversation_initiative_preference, 'A')
  assert.equal(valid.answers.age_flex_one_year, 'accept')

  assert.equal(validateMatchInsights({ match_current_focus: ['career', 'career'] }).valid, false)
  assert.equal(validateMatchInsights({ conversation_initiative_preference: 'E' }).valid, false)
  assert.equal(validateMatchInsights({ match_current_curiosity: 'قصير' }).valid, false)
  assert.equal(validateMatchInsights({ age_flex_one_year: 'sometimes' }, { requireAll: false }).valid, false)
})

test('vibe profile and cache content include the new topical answers', () => {
  const answers = {
    match_current_curiosity: 'الذكاء الاصطناعي في التعليم',
    match_current_focus: ['study', 'creative'],
    vibe_2: ['قراءة', 'تصوير'],
    vibe_3: 'Rock',
  }
  const description = buildVibeDescription(answers)
  assert.match(description, /الذكاء الاصطناعي/)
  assert.match(description, /study, creative/)
  assert.match(getMatchInsightsCacheContent(participant(answers)), /match_current_curiosity/)
})

test('unscored profile data collection does not change matching cache content', () => {
  const base = participant({
    match_disagreement_style: 'B',
    match_similarity_preference: 'C',
    match_current_curiosity: 'تصميم تجارب اجتماعية أفضل وأكثر إنسانية',
    match_current_focus: ['creative', 'self_growth'],
    conversation_initiative_preference: 'A',
  })
  const withProfileData = participant({
    ...base.survey_data.answers,
    expression_language: '5',
    minimum_partner_religious_commitment: '4',
    social_relationship_style: '4',
  })

  assert.equal(getMatchInsightsCacheContent(withProfileData), getMatchInsightsCacheContent(base))
})

test('snapshots whether neither, one, or both participants completed the new questions', () => {
  const completeAnswers = {
    match_disagreement_style: 'B',
    match_similarity_preference: 'C',
    match_current_curiosity: 'موضوع طويل بما يكفي لاجتياز التحقق',
    match_current_focus: ['career', 'creative'],
    conversation_initiative_preference: 'A',
  }
  const complete = participant(completeAnswers)
  const partial = participant({ match_disagreement_style: 'A' })
  const legacy = participant({})

  assert.equal(getMatchInsightsCompletion(complete).answeredCount, 5)
  assert.equal(getMatchInsightsCompletion(partial).answeredCount, 1)
  assert.equal(getPairMatchInsightsCoverage(complete, complete).match_insights_status, 'both')
  assert.equal(getPairMatchInsightsCoverage(complete, legacy).match_insights_status, 'mixed')
  assert.equal(getPairMatchInsightsCoverage(partial, legacy).match_insights_status, 'neither')
})
