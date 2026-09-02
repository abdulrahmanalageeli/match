import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBalancedVibeProfile,
  getBalancedCacheContent,
} from './balanced-compatibility.mjs'
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

test('disagreement scoring uses the balanced four-point matrix symmetrically', () => {
  const debate = participant({ match_disagreement_style: 'A' })
  const redirect = participant({ match_disagreement_style: 'D' })
  const understand = participant({ match_disagreement_style: 'B' })

  assert.equal(calculateDisagreementStyleScore(debate, redirect), 0)
  assert.equal(calculateDisagreementStyleScore(redirect, debate), 0)
  assert.equal(calculateDisagreementStyleScore(debate, understand), 3)
  assert.equal(calculateDisagreementStyleScore(debate, participant()), 2)
})

test('current focus uses the balanced four-point overlap budget and neutral fallback', () => {
  const a = participant({ match_current_focus: ['career', 'creative'] })

  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['creative', 'career'] })), 4)
  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['creative', 'health_fitness'] })), 3)
  assert.equal(calculateCurrentFocusScore(a, participant({ match_current_focus: ['study', 'business'] })), 1.4)
  assert.equal(calculateCurrentFocusScore(a, participant()), 2)
})

test('similarity preference is derived from structured context and ignores the legacy injected similarity value', () => {
  const similarA = participant({
    match_similarity_preference: 'A',
    match_current_focus: ['career', 'creative'],
    lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
  })
  const similarB = participant({
    match_similarity_preference: 'A',
    match_current_focus: ['career', 'creative'],
    lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
  })
  const noveltyA = participant({ ...similarA.survey_data.answers, match_similarity_preference: 'B' })
  const noveltyB = participant({ ...similarB.survey_data.answers, match_similarity_preference: 'B' })

  assert.equal(calculateSimilarityPreferenceScore(similarA, similarB, 0), 1)
  assert.equal(calculateSimilarityPreferenceScore(noveltyA, noveltyB, 1), 0)
  assert.equal(
    calculateSimilarityPreferenceScore(similarA, noveltyB, 0.1),
    calculateSimilarityPreferenceScore(noveltyB, similarA, 0.9),
  )
  assert.equal(calculateSimilarityPreferenceScore(participant(), participant(), 0.2), 0.5)
})

test('attachment pace is based only on the three attachment scenarios, not duplicate behavioral proxies', () => {
  const reassuranceSeeking = participant({
    attachment_1: 'B', attachment_3: 'B', attachment_4: 'B',
    early_openness_comfort: '2', conversation_depth_pref: 'A', conversational_role: 'B', curiosity_style: 'B',
  })
  const responsivePartner = participant({
    attachment_1: 'A', attachment_3: 'A', attachment_4: 'A',
    early_openness_comfort: '3', conversation_depth_pref: 'A', conversational_role: 'A', curiosity_style: 'B',
  })
  const lowPressurePartner = participant({
    attachment_1: 'A', attachment_3: 'A', attachment_4: 'A',
    early_openness_comfort: '0', conversation_depth_pref: 'B', conversational_role: 'C', curiosity_style: 'A',
  })

  const responsiveScore = calculateAttachmentPaceScore(reassuranceSeeking, responsivePartner)
  const lowPressureScore = calculateAttachmentPaceScore(reassuranceSeeking, lowPressurePartner)
  assert.equal(responsiveScore, 7.65)
  assert.equal(lowPressureScore, 7.65)
  assert.equal(responsiveScore, calculateAttachmentPaceScore(responsivePartner, reassuranceSeeking))
})

test('attachment pace is neutral when the relevant answers are unavailable', () => {
  assert.equal(calculateAttachmentPaceScore(participant(), participant()), 4.5)
})

test('attachment pace supports legacy flat survey records without duplicate behavior scoring', () => {
  const flat = {
    survey_data: {
      attachment_1: 'ب', attachment_3: 'ب', attachment_4: 'ب',
      early_openness_comfort: '3', conversation_depth_pref: 'A', conversational_role: 'A', curiosity_style: 'B',
    },
  }
  assert.equal(calculateAttachmentPaceScore(flat, flat), 5.85)
})

test('persisted scores rebuild balanced match-insight columns from participant data', () => {
  const a = participant({
    match_disagreement_style: 'B',
    match_similarity_preference: 'A',
    match_current_focus: ['career', 'creative'],
    attachment_1: 'A', attachment_3: 'A', attachment_4: 'A',
    lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
  })
  const b = participant({
    match_disagreement_style: 'C',
    match_similarity_preference: 'C',
    match_current_focus: ['career', 'self_growth'],
    attachment_1: 'B', attachment_3: 'A', attachment_4: 'B',
    lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
  })

  const scores = calculatePersistedMatchInsightScores(a, b, 12, 12)
  assert.equal(scores.disagreement_style_score, 3)
  assert.equal(scores.current_life_overlap_score, 3)
  assert.ok(scores.similarity_preference_score >= 0 && scores.similarity_preference_score <= 1)
  assert.equal(scores.attachment_pace_score, 8.1)
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

test('legacy vibe description remains descriptive while the balanced AI profile excludes duplicate fields', () => {
  const answers = {
    match_current_curiosity: 'الذكاء الاصطناعي في التعليم',
    match_current_focus: ['study', 'creative'],
    conversation_initiative_preference: 'A',
    vibe_2: ['قراءة', 'تصوير'],
    vibe_3: 'Rock',
    vibe_4: 'نعم',
    vibe_5: 'هادئ وفضولي',
  }
  const description = buildVibeDescription(answers)
  assert.match(description, /الذكاء الاصطناعي/)
  assert.match(description, /study, creative/)
  assert.match(getMatchInsightsCacheContent(participant(answers)), /match_current_curiosity/)
  assert.deepEqual(buildBalancedVibeProfile(participant(answers)), {
    current_curiosity: 'الذكاء الاصطناعي في التعليم',
    hobbies: 'قراءة, تصوير',
    music: 'Rock',
    friend_description: 'هادئ وفضولي',
  })
})

test('profile alignment answers invalidate balanced cache content', () => {
  const base = participant({
    match_disagreement_style: 'B',
    match_similarity_preference: 'C',
    match_current_curiosity: 'تصميم تجارب اجتماعية أفضل وأكثر إنسانية',
    match_current_focus: ['creative', 'self_growth'],
    conversation_initiative_preference: 'A',
    expression_language: '3',
    minimum_partner_religious_commitment: '2',
    social_relationship_style: '2',
  })
  const changed = participant({
    ...base.survey_data.answers,
    expression_language: '5',
    minimum_partner_religious_commitment: '4',
    social_relationship_style: '4',
  })

  assert.notEqual(getBalancedCacheContent(changed), getBalancedCacheContent(base))
  assert.match(getBalancedCacheContent(changed), /expression_language:5/)
  assert.match(getBalancedCacheContent(changed), /minimum_partner_religious_commitment:4/)
  assert.match(getBalancedCacheContent(changed), /social_relationship_style:4/)
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
