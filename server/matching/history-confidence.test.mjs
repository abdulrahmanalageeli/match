import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSurveyProfileSimilarity,
  createHistoricalMatchAnalyzer,
} from './history-confidence.mjs'

const participant = (assigned_number, answers) => ({
  assigned_number,
  survey_data: { answers },
  mbti_personality_type: answers.mbti || 'ENFP',
  attachment_style: answers.attachment || 'secure',
  communication_style: answers.communication || 'assertive',
})

const warm = {
  conversational_role: 'A', conversation_depth_pref: 'A', social_battery: 'A',
  humor_subtype: 'B', curiosity_style: 'A', silence_comfort: 'A',
  match_disagreement_style: 'B', match_similarity_preference: 'A',
  lifestyle_1: 'A', lifestyle_2: 'B', core_values_1: 'A', core_values_2: 'B',
}
const reserved = {
  conversational_role: 'C', conversation_depth_pref: 'B', social_battery: 'B',
  humor_subtype: 'D', curiosity_style: 'C', silence_comfort: 'C',
  match_disagreement_style: 'D', match_similarity_preference: 'D',
  lifestyle_1: 'D', lifestyle_2: 'D', core_values_1: 'C', core_values_2: 'D',
}

test('survey similarity uses shared structured answers and ignores identity fields', () => {
  const a = participant(1, { ...warm, name: 'A', phone_number: '111' })
  const b = participant(2, { ...warm, name: 'B', phone_number: '999' })
  const c = participant(3, reserved)
  assert.ok(calculateSurveyProfileSimilarity(a, b).score > 0.85)
  assert.ok(calculateSurveyProfileSimilarity(a, c).score < 0.35)
})

test('mutual first-place history raises priority and is labelled', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm), participant(3, reserved)],
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
      { event_id: 24, ranker_number: 2, ranked_number: 1, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 2, ranked_number: 3, rank: 2, auto_saved: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.ok(result.historical_outcome_score > 90)
  assert.ok(result.history_priority_adjustment > 0)
  assert.equal(result.never_pair_recommended, false)
  assert.ok(result.history_badges.some(badge => badge.code === 'mutual_like'))
})

test('one last-place ranking warns and penalizes without becoming a hard ban', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, reserved), participant(3, warm)],
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 2, auto_saved: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.never_pair_recommended, false)
  assert.ok(result.history_priority_adjustment < 0)
  assert.ok(result.history_badges.some(badge => badge.code === 'least_ranked'))
})

test('a last-place ranking corroborated by explicit rejection becomes do-not-pair', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, reserved), participant(3, warm)],
    rankingRows: [
      { event_id: 23, ranker_number: 1, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 23, ranker_number: 1, ranked_number: 2, rank: 2, auto_saved: false },
    ],
    matchFeedbackRows: [{
      event_id: 23,
      participant_number: 1,
      phase2_partner: 2,
      phase2_feedback: { wantConnect: false, compatibilityRate: 18, conversationQuality: 1, personalConnection: 1 },
    }],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.never_pair_recommended, true)
  assert.equal(result.history_priority_adjustment, -16)
  assert.ok(result.history_badges.some(badge => badge.code === 'never_pair'))
})

test('the structured one-to-one feedback dimensions contribute without reading free text', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm)],
    matchFeedbackRows: [{
      event_id: 24,
      participant_number: 1,
      phase2_partner: 2,
      phase2_feedback: {
        compatibilityRate: 50,
        sliderMoved: false,
        conversationQuality: 5,
        personalConnection: 5,
        sharedInterests: 5,
        comfortLevel: 5,
        communicationStyle: 5,
        wouldMeetAgain: 5,
        overallExperience: 5,
        recommendations: 'free text must not be analyzed',
      },
    }],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.ok(result.historical_outcome_score > 90)
  assert.ok(result.history_priority_adjustment > 0)
})

test('new mutual positive feedback can recover from old mutual last-place rankings', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm), participant(3, reserved)],
    rankingRows: [
      { event_id: 21, ranker_number: 1, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 21, ranker_number: 1, ranked_number: 2, rank: 2, auto_saved: false },
      { event_id: 21, ranker_number: 2, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 21, ranker_number: 2, ranked_number: 1, rank: 2, auto_saved: false },
    ],
    matchFeedbackRows: [
      { event_id: 24, participant_number: 1, phase2_partner: 2, phase2_feedback: { wantConnect: true, compatibilityRate: 95, conversationQuality: 5, personalConnection: 5 } },
      { event_id: 24, participant_number: 2, phase2_partner: 1, phase2_feedback: { wantConnect: true, compatibilityRate: 95, conversationQuality: 5, personalConnection: 5 } },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.never_pair_recommended, false)
  assert.ok(result.history_priority_adjustment > 0)
})

test('auto-saved rankings never affect historical confidence', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm), participant(3, reserved)],
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: true },
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: true },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.historical_outcome_score, null)
  assert.equal(result.history_priority_adjustment, 0)
})

test('survey-neighbour prediction works for a pair with no direct encounter', () => {
  const people = [
    participant(1, warm),
    participant(2, { ...warm, lifestyle_2: 'A' }),
    participant(3, { ...warm, lifestyle_1: 'B' }),
    participant(4, reserved),
  ]
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: people,
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 4, rank: 2, auto_saved: false },
    ],
    groupFeedbackRows: [
      { event_id: 24, reviewer_number: 3, member_number: 1, experience: 'great', tags: ['comfortable'], is_test_mode: false },
      { event_id: 24, reviewer_number: 4, member_number: 1, experience: 'uncomfortable', tags: ['hard_to_connect'], is_test_mode: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.historical_outcome_score, null)
  assert.ok(result.predictive_outcome_score > 60)
  assert.ok(result.predictive_confidence > 0)
  assert.ok(result.history_priority_adjustment > 0)
  assert.ok(result.historical_evidence.predictor_neighbors > 0)
})

test('events 20 and below and future/current events are excluded', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, reserved), participant(3, warm)],
    rankingRows: [
      { event_id: 20, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 20, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
      { event_id: 25, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 25, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.historical_outcome_score, null)
})
