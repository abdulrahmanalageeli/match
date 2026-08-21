import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRaterReliabilityProfiles,
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
  assert.equal(result.mutual_interest, true)
  assert.equal(result.history_review_recommendation, 'lock')
  assert.ok(result.history_badges.some(badge => badge.code === 'mutual_interest'))
  assert.equal(result.history_verdict.code, 'mutual')
  assert.equal(result.history_timeline.length, 2)
  assert.deepEqual(result.history_timeline.map(item => item.rank), [1, 1])
})

test('one-sided interest is exposed for organizer review without an automatic lock', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm), participant(3, reserved)],
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.one_sided_interest, true)
  assert.equal(result.mutual_interest, false)
  assert.equal(result.history_review_recommendation, 'review')
  assert.ok(result.history_badges.some(badge => badge.code === 'one_sided_interest'))
})

test('opposite directional signals are labelled as conflicting interest', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm), participant(3, reserved)],
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
      { event_id: 24, ranker_number: 2, ranked_number: 3, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 2, ranked_number: 1, rank: 2, auto_saved: false },
    ],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.conflicting_interest, true)
  assert.equal(result.history_review_recommendation, 'review')
  assert.equal(result.never_pair_recommended, false)
  assert.ok(result.history_badges.some(badge => badge.code === 'conflicting_interest'))
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
  assert.equal(result.history_review_recommendation, 'exclude')
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

test('rater reliability rewards complete consistent input and discounts defaults', () => {
  const profiles = buildRaterReliabilityProfiles({
    currentEventId: 25,
    rankingRows: [
      { event_id: 24, ranker_number: 1, ranked_number: 2, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 3, rank: 2, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 4, rank: 3, auto_saved: false },
      { event_id: 24, ranker_number: 1, ranked_number: 5, rank: 4, auto_saved: false },
      { event_id: 24, ranker_number: 6, ranked_number: 7, rank: 1, auto_saved: false },
      { event_id: 24, ranker_number: 6, ranked_number: 8, rank: 2, auto_saved: false },
    ],
    matchFeedbackRows: [
      { event_id: 24, participant_number: 1, phase2_partner: 2, phase2_feedback: { wantConnect: true, compatibilityRate: 95, sliderMoved: true, conversationQuality: 5, personalConnection: 5 } },
      { event_id: 24, participant_number: 6, phase2_partner: 7, phase2_feedback: { compatibilityRate: 50, sliderMoved: false, conversationQuality: 3, personalConnection: 3, sharedInterests: 3, comfortLevel: 3, communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3 } },
    ],
  })
  assert.ok(profiles.get(1).score > profiles.get(6).score)
  assert.equal(profiles.get(1).ballot_completeness, 1)
  assert.equal(profiles.get(6).ballot_completeness, 0.5)
  assert.equal(profiles.get(6).non_default_feedback_rate, 0)
})

test('repeated extreme feedback reduces rater influence', () => {
  const extremeFeedback = { compatibilityRate: 100, sliderMoved: true, conversationQuality: 5, personalConnection: 5, sharedInterests: 5, comfortLevel: 5, communicationStyle: 5, wouldMeetAgain: 5, overallExperience: 5 }
  const moderateFeedback = { compatibilityRate: 65, sliderMoved: true, conversationQuality: 4, personalConnection: 4, sharedInterests: 4, comfortLevel: 4, communicationStyle: 4, wouldMeetAgain: 4, overallExperience: 4 }
  const profiles = buildRaterReliabilityProfiles({
    currentEventId: 25,
    matchFeedbackRows: [
      ...[2, 3, 4, 5].map(target => ({ event_id: 24, participant_number: 9, phase2_partner: target, phase2_feedback: extremeFeedback })),
      ...[2, 3, 4, 5].map(target => ({ event_id: 24, participant_number: 10, phase2_partner: target, phase2_feedback: moderateFeedback })),
    ],
  })
  assert.equal(profiles.get(9).extreme_rating_rate, 1)
  assert.equal(profiles.get(10).extreme_rating_rate, 0)
  assert.ok(profiles.get(9).score < profiles.get(10).score)
})

test('untouched default feedback does not create historical evidence', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm)],
    matchFeedbackRows: [{
      event_id: 24,
      participant_number: 1,
      phase2_partner: 2,
      phase2_feedback: { compatibilityRate: 50, sliderMoved: false, conversationQuality: 3, personalConnection: 3, sharedInterests: 3, comfortLevel: 3, communicationStyle: 3, wouldMeetAgain: 3, overallExperience: 3 },
    }],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.historical_outcome_score, null)
  assert.equal(result.history_review_recommendation, null)
})

test('a direct encounter without submitted feedback remains visible in the timeline without affecting the score', () => {
  const analyzer = createHistoricalMatchAnalyzer({
    currentEventId: 25,
    participants: [participant(1, warm), participant(2, warm)],
    matchFeedbackRows: [{ event_id: 24, participant_number: 1, phase2_partner: 2, phase2_feedback: null }],
  })
  const result = analyzer.analyzePair(1, 2)
  assert.equal(result.historical_outcome_score, null)
  assert.equal(result.history_timeline.length, 1)
  assert.equal(result.history_timeline[0].source, 'pair_feedback')
  assert.equal(result.history_timeline[0].met, true)
  assert.equal(result.history_timeline[0].feedback.submitted, false)
  assert.equal(result.history_timeline[0].contributed_to_score, false)
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

test('indirect predictions are calibrated against raters who score everyone positively', () => {
  const people = [1, 2, 10, 11, 20, 21, 22, 23].map(number => participant(number, warm))
  const groupFeedbackRows = [10, 11].flatMap(reviewer => [20, 21, 22, 23].map(member => ({
    event_id: 24,
    reviewer_number: reviewer,
    member_number: member,
    experience: 'great',
    tags: ['comfortable', 'respectful'],
    is_test_mode: false,
  })))
  const analyzer = createHistoricalMatchAnalyzer({ currentEventId: 25, participants: people, groupFeedbackRows })
  const result = analyzer.analyzePair(1, 2)
  assert.ok(result.predictive_confidence > 0)
  assert.ok(Math.abs(result.predictive_outcome_score - 50) < 0.1)
  assert.equal(result.history_prediction_details.baseline_calibrated, true)
  assert.ok(!result.history_badges.some(badge => badge.code === 'predicted_good'))
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
