import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BALANCED_COMPATIBILITY_VERSION,
  BALANCED_VIBE_MAX,
  BALANCED_VIBE_MODEL,
  BALANCED_VIBE_MODEL_TAG,
  BALANCED_VIBE_VERSION,
  BALANCED_WEIGHTS,
  buildBalancedCacheIdentity,
  buildBalancedScoreSnapshot,
  buildBalancedVibeProfile,
  calculateAiChemistryAdjustment,
  calculateBalancedCompatibility,
  calculateBalancedVibeScore,
  canonicalBalancedVibePair,
  createNeutralVibeAxes,
  decodeBalancedVibeModelUsed,
  encodeBalancedVibeModelUsed,
  getBalancedAnswer,
  getBalancedCacheBreakdown,
  getBalancedCacheContent,
  hydrateBalancedCompatibilityFromCacheRow,
  isBalancedVibeModelUsed,
  isCurrentBalancedScoreSnapshot,
  isReusableBalancedVibeRow,
  normalizeBalancedChoice,
  normalizeBalancedVibeAxes,
} from './balanced-compatibility.mjs'

const baseAnswers = {
  match_disagreement_style: 'A',
  match_similarity_preference: 'A',
  match_current_curiosity: 'تصميم تجارب اجتماعية أكثر إنسانية ووضوحاً',
  match_current_focus: ['career', 'creative'],
  humor_banter_style: 'B',
  early_openness_comfort: '2',
  conversation_initiative_preference: 'A',
  expression_language: '3',
  minimum_partner_religious_commitment: '2',
  social_relationship_style: '2',
  attachment_1: 'A',
  attachment_3: 'A',
  attachment_4: 'A',
  lifestyle_1: 'A',
  lifestyle_2: 'A',
  lifestyle_3: 'A',
  lifestyle_4: 'A',
  lifestyle_5: 'A',
  core_values_1: 'A',
  core_values_2: 'A',
  core_values_3: 'A',
  core_values_4: 'A',
  core_values_5: 'A',
  communication_1: 'A',
  communication_2: 'A',
  communication_3: 'A',
  communication_4: 'A',
  communication_5: 'A',
  conversational_role: 'C',
  conversation_depth_pref: 'A',
  social_battery: 'A',
  humor_subtype: 'C',
  curiosity_style: 'A',
  intent_goal: 'A',
  silence_comfort: 'A',
  vibe_2: 'القراءة والتصوير والمشي',
  vibe_3: 'جاز وروك بديل',
  vibe_4: 'نعم',
  vibe_5: 'مستمع فضولي وهادئ',
}

const participant = (overrides = {}, topLevel = {}) => ({
  ...topLevel,
  survey_data: { answers: { ...baseAnswers, ...overrides } },
})

test('balanced weights are immutable, explicit, and total exactly 100', () => {
  assert.equal(Object.values(BALANCED_WEIGHTS).reduce((total, weight) => total + weight, 0), 100)
  assert.equal(Object.isFrozen(BALANCED_WEIGHTS), true)
  assert.match(BALANCED_COMPATIBILITY_VERSION, /-100$/)
  assert.equal(BALANCED_WEIGHTS.vibe, 12)
  assert.equal(BALANCED_WEIGHTS.core3, 0)
  assert.equal(BALANCED_WEIGHTS.expressionLanguage, 4)
  assert.equal(BALANCED_WEIGHTS.religion, 4)
  assert.equal(BALANCED_WEIGHTS.socialStyle, 4)
  assert.equal(BALANCED_WEIGHTS.curiosityStyle, 4)
})

test('a fully aligned complementary pair retains a 100-point diagnostic budget while v12 supplies the learned total', () => {
  const a = participant({ conversation_initiative_preference: 'A', curiosity_style: 'A' })
  const b = participant({ conversation_initiative_preference: 'C', curiosity_style: 'B' })
  const result = calculateBalancedCompatibility(a, b, { vibeScore: 12 })

  assert.equal(result.componentTotal, 100)
  assert.equal(result.diagnosticComponentTotal, 100)
  assert.equal(result.totalScore, result.scoreBreakdown.personalized.totalScore)
  assert.equal(result.priorityScore, result.totalScore)
  assert.ok(result.totalScore >= 0 && result.totalScore <= 100)
  const {
    personalized,
    personalizedBase,
    aiChemistryScore,
    aiChemistryAdjustment,
    aiChemistryBand,
    aiChemistryReady,
    finalScore,
    ...diagnostics
  } = result.scoreBreakdown
  assert.deepEqual(diagnostics, {
    semanticCommonGround: 18,
    aiSemantic: 12,
    sharedContext: 6,
    interactionRhythm: 20,
    humorOpenness: 10,
    attachmentComfort: 8,
    lifestyleSustainability: 12,
    valuesBoundaries: 13,
    language: 4,
    communicationDisagreement: 10,
    intent: 5,
  })
  assert.equal(personalizedBase, personalized.totalScore)
  assert.equal(aiChemistryScore, null)
  assert.equal(aiChemistryAdjustment, 0)
  assert.equal(aiChemistryBand, 'pending')
  assert.equal(aiChemistryReady, false)
  assert.equal(finalScore, result.totalScore)
  assert.deepEqual(result.compositeRules, [])
  assert.equal(result.compositeAdjustment, 0)
})

test('missing answers fall back neutrally without invoking legacy bonuses, penalties, or vetoes', () => {
  const result = calculateBalancedCompatibility({}, {}, { vibeScore: 6 })

  assert.ok(result.totalScore >= 0 && result.totalScore <= 100)
  assert.equal(result.componentTotal, 50)
  assert.equal(result.personalizedCompatibility.aToB.questionnaireCoverage, 0)
  assert.equal(result.personalizedCompatibility.bToA.questionnaireCoverage, 0)
  assert.equal(result.humorMultiplier, 1)
  assert.equal(result.opennessPenalty, 0)
  assert.equal(result.deadAirVetoApplied, false)
  assert.equal(result.humorClashVetoApplied, false)
  assert.equal(result.attachmentPenaltyApplied, false)
  assert.equal(result.intentBoostApplied, false)
  assert.equal(result.maxScoreCapApplied, false)
})

test('the score is symmetric and exposes deliberately low-fit matrix cells', () => {
  const a = participant({
    humor_banter_style: 'A',
    early_openness_comfort: '0',
    expression_language: '1',
    minimum_partner_religious_commitment: '1',
    social_relationship_style: '1',
    attachment_1: 'B', attachment_3: 'B', attachment_4: 'B',
    lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
    communication_1: 'C', communication_2: 'C', communication_3: 'C', communication_4: 'C', communication_5: 'C',
    conversation_depth_pref: 'A', social_battery: 'A', humor_subtype: 'A', curiosity_style: 'A', intent_goal: 'B', silence_comfort: 'A',
  })
  const b = participant({
    humor_banter_style: 'D',
    early_openness_comfort: '3',
    expression_language: '5',
    minimum_partner_religious_commitment: '4',
    social_relationship_style: '4',
    attachment_1: 'C', attachment_3: 'C', attachment_4: 'C',
    lifestyle_1: 'C', lifestyle_2: 'C', lifestyle_3: 'C', lifestyle_4: 'C', lifestyle_5: 'C',
    communication_1: 'C', communication_2: 'C', communication_3: 'C', communication_4: 'C', communication_5: 'C',
    conversation_depth_pref: 'B', social_battery: 'B', humor_subtype: 'B', curiosity_style: 'B', intent_goal: 'C', silence_comfort: 'B',
  })

  const ab = calculateBalancedCompatibility(a, b, { vibeScore: 6 })
  const ba = calculateBalancedCompatibility(b, a, { vibeScore: 6 })
  assert.equal(ab.totalScore, ba.totalScore)
  assert.deepEqual(ab.questionScores, ba.questionScores)
  assert.equal(ab.questionScores.humorBanter, 1.5)
  assert.equal(ab.questionScores.earlyOpenness, 0.6)
  assert.equal(ab.questionScores.expressionLanguage, 0)
  assert.equal(ab.questionScores.religion, 0.4)
  assert.equal(ab.questionScores.socialStyle, 0.4)
  assert.equal(ab.scoreBreakdown.attachmentComfort, 1.6)
  assert.equal(ab.scoreBreakdown.lifestyleSustainability, 2.15)
  assert.equal(ab.questionScores.conversationDepth, 1.05)
  assert.equal(ab.questionScores.socialBattery, 1.5)
  assert.equal(ab.questionScores.humorSubtype, 2.25)
  assert.equal(ab.questionScores.curiosityStyle, 4)
  assert.equal(ab.questionScores.intent, 2.25)
  assert.equal(ab.questionScores.silence, 1.2)
  assert.equal(ab.scoreBreakdown.communicationDisagreement, 5.5)
})

test('an unmatched custom focus option is not treated as shared context', () => {
  const a = participant({ match_current_focus: ['career', 'other'], match_current_focus_other: 'كتابة رواية' })
  const b = participant({ match_current_focus: ['health_fitness', 'other'], match_current_focus_other: 'تعلم النجارة' })
  const result = calculateBalancedCompatibility(a, b)

  assert.equal(result.questionScores.currentFocus, 1.4)
})

test('replacement questions prevent duplicate initiative, depth, and attachment scoring', () => {
  const a = participant({
    conversation_initiative_preference: 'A',
    conversational_role: 'A',
    conversation_depth_pref: 'A',
    vibe_4: 'لا',
    attachment_1: 'B', attachment_3: 'B', attachment_4: 'B',
    early_openness_comfort: '0', curiosity_style: 'C',
  })
  const b = participant({
    conversation_initiative_preference: 'C',
    conversational_role: 'C',
    conversation_depth_pref: 'A',
    vibe_4: 'نعم',
    attachment_1: 'C', attachment_3: 'C', attachment_4: 'C',
    early_openness_comfort: '3', curiosity_style: 'A',
  })
  const changedDuplicatesA = participant({
    ...a.survey_data.answers,
    conversational_role: 'C',
    vibe_4: 'نعم',
    early_openness_comfort: '3',
    curiosity_style: 'A',
  })
  const changedDuplicatesB = participant({
    ...b.survey_data.answers,
    conversational_role: 'A',
    vibe_4: 'لا',
    early_openness_comfort: '0',
    curiosity_style: 'C',
  })

  const original = calculateBalancedCompatibility(a, b)
  const changed = calculateBalancedCompatibility(changedDuplicatesA, changedDuplicatesB)
  assert.equal(original.questionScores.initiative, 6)
  assert.equal(changed.questionScores.initiative, 6)
  assert.equal(original.questionScores.conversationDepth, 3)
  assert.equal(changed.questionScores.conversationDepth, 3)
  assert.equal(original.scoreBreakdown.attachmentComfort, 1.6)
  assert.equal(changed.scoreBreakdown.attachmentComfort, 1.6)
})

test('legacy conversational role is used only as a deterministic initiative fallback', () => {
  const a = participant({ conversation_initiative_preference: null, conversational_role: 'A' })
  const b = participant({ conversation_initiative_preference: null, conversational_role: 'C' })
  const fallback = calculateBalancedCompatibility(a, b)
  const explicit = calculateBalancedCompatibility(
    participant({ conversation_initiative_preference: 'A', conversational_role: 'C' }),
    participant({ conversation_initiative_preference: 'C', conversational_role: 'A' }),
  )

  assert.equal(fallback.initiativeSource, 'conversational_role_fallback')
  assert.equal(fallback.questionScores.initiative, 6)
  assert.equal(explicit.initiativeSource, 'conversation_initiative_preference')
  assert.equal(explicit.questionScores.initiative, 6)
})

test('the learned archetype base can use formerly zero-weight answers while ignoring derived legacy fields', () => {
  const a = participant({ core_values_3: 'A', communication_style: 'direct' })
  const b = participant({ core_values_3: 'A', communication_style: 'direct' })
  const changedA = participant({ core_values_3: 'D', communication_style: 'avoidant' })
  const changedB = participant({ core_values_3: 'B', communication_style: 'emotional' })

  const original = calculateBalancedCompatibility(a, b)
  const changed = calculateBalancedCompatibility(changedA, changedB)
  assert.equal(original.componentTotal, changed.componentTotal)
  assert.notEqual(original.totalScore, changed.totalScore)
  assert.equal(
    original.totalScore,
    calculateBalancedCompatibility(
      participant({ core_values_3: 'A', communication_style: 'avoidant' }),
      participant({ core_values_3: 'A', communication_style: 'emotional' }),
    ).totalScore,
  )
})

test('AI vibe profiles use exactly the four non-duplicative semantic fields', () => {
  const source = participant({
    match_current_curiosity: 'موضوع فضولي',
    vibe_2: ['تصوير', 'قراءة'],
    vibe_3: 'جاز',
    vibe_4: 'نعم',
    vibe_5: 'هادئ وفضولي',
    match_current_focus: ['career', 'creative'],
    conversation_initiative_preference: 'D',
  })
  assert.deepEqual(buildBalancedVibeProfile(source), {
    current_curiosity: 'موضوع فضولي',
    hobbies: 'تصوير, قراءة',
    music: 'جاز',
    friend_description: 'هادئ وفضولي',
  })

  const left = participant({ vibe_2: ['تصوير', 'قراءة'] })
  const right = participant({ vibe_2: ['مشي', 'موسيقى'] })
  assert.deepEqual(canonicalBalancedVibePair(left, right), canonicalBalancedVibePair(right, left))
})

test('AI vibe normalization confidence-shrinks every axis toward neutral and rejects malformed output', () => {
  const axes = normalizeBalancedVibeAxes({
    current_curiosity: { score: 5, confidence: 0.5, evidence: 'shared topic' },
    hobbies: { score: 0, confidence: 1, evidence: 'none' },
    music: { score: 1, confidence: 0, evidence: '' },
    friend_description: { score: 3, confidence: 0.25, evidence: 'similar energy' },
  })

  assert.equal(axes.current_curiosity.score, 3.75)
  assert.equal(axes.hobbies.score, 0)
  assert.equal(axes.music.score, 0.5)
  assert.equal(axes.friend_description.score, 1.875)
  assert.equal(calculateBalancedVibeScore(axes), 6.125)
  assert.equal(calculateBalancedVibeScore(createNeutralVibeAxes()), 6)
  assert.throws(() => normalizeBalancedVibeAxes({}), /missing or unexpected axes/)
  assert.throws(() => normalizeBalancedVibeAxes({
    current_curiosity: { score: 6, confidence: 1 },
    hobbies: { score: 1, confidence: 1 },
    music: { score: 1, confidence: 1 },
    friend_description: { score: 1, confidence: 1 },
  }), /Invalid current_curiosity score/)
})

test('v12 applies only the validated AI chemistry bands to the archetype base', () => {
  const high = normalizeBalancedVibeAxes({
    current_curiosity: { score: 5, confidence: 1, evidence: 'shared curiosity' },
    hobbies: { score: 3, confidence: 1, evidence: 'shared hobbies' },
    music: { score: 0, confidence: 1, evidence: '' },
    friend_description: { score: 0, confidence: 1, evidence: '' },
  })
  const low = normalizeBalancedVibeAxes({
    current_curiosity: { score: 0, confidence: 1, evidence: 'different curiosity' },
    hobbies: { score: 0, confidence: 1, evidence: 'different hobbies' },
    music: { score: 1, confidence: 1, evidence: '' },
    friend_description: { score: 3, confidence: 1, evidence: '' },
  })
  assert.deepEqual(calculateAiChemistryAdjustment(high), { ready: true, score: 1, adjustment: 12, band: 'high' })
  assert.deepEqual(calculateAiChemistryAdjustment(low), { ready: true, score: 0, adjustment: -8, band: 'low' })
  assert.deepEqual(calculateAiChemistryAdjustment(createNeutralVibeAxes('deferred_ai')), {
    ready: false, score: null, adjustment: 0, band: 'pending',
  })

  const base = calculateBalancedCompatibility(participant(), participant())
  const boosted = calculateBalancedCompatibility(participant(), participant(), {
    vibeScore: calculateBalancedVibeScore(high), vibeAxes: high,
  })
  const penalized = calculateBalancedCompatibility(participant(), participant(), {
    vibeScore: calculateBalancedVibeScore(low), vibeAxes: low,
  })
  assert.equal(boosted.totalScore, Math.min(100, base.totalScore + 12))
  assert.equal(penalized.totalScore, Math.max(0, base.totalScore - 8))
})

test('vibe metadata round-trips axis scores and identifies only the current balanced model', () => {
  const axes = normalizeBalancedVibeAxes({
    current_curiosity: { score: 4, confidence: 1, evidence: '' },
    hobbies: { score: 2, confidence: 1, evidence: '' },
    music: { score: 0.75, confidence: 1, evidence: '' },
    friend_description: { score: 2.5, confidence: 1, evidence: '' },
  })
  const encoded = encodeBalancedVibeModelUsed({ vibeAxes: axes })
  const decoded = decodeBalancedVibeModelUsed(encoded)

  assert.equal(encoded.startsWith(BALANCED_VIBE_MODEL_TAG), true)
  assert.equal(isBalancedVibeModelUsed(encoded), true)
  assert.equal(isBalancedVibeModelUsed('gpt-4|legacy'), false)
  assert.equal(decoded.current_curiosity.score, 4)
  assert.equal(decoded.hobbies.score, 2)
  assert.equal(decoded.music.score, 0.75)
  assert.equal(decoded.friend_description.score, 2.5)
})

test('balanced cache content preserves the restored v7 identity and excludes derived style', () => {
  const source = participant({ communication_style: 'direct' })
  const cache = getBalancedCacheContent(source)

  assert.match(cache, /match_disagreement_style:A/)
  assert.match(cache, /conversation_initiative_preference:A/)
  assert.match(cache, /communication_5:A/)
  assert.match(cache, /expression_language:3/)
  assert.match(cache, /minimum_partner_religious_commitment:2/)
  assert.match(cache, /social_relationship_style:2/)
  assert.match(cache, /vibe:/)
  assert.doesNotMatch(cache, /communication_style/)
  assert.match(cache, /core_values_3:A/)
  assert.equal(cache, getBalancedCacheContent(participant({ communication_style: 'avoidant' })))
  assert.notEqual(cache, getBalancedCacheContent(participant({
    expression_language: '5',
    minimum_partner_religious_commitment: '4',
    social_relationship_style: '4',
    core_values_3: 'C',
  })))
})

test('balanced cache identity is canonical, SHA-256, and version/content sensitive', () => {
  const a = participant({}, { assigned_number: 41 })
  const b = participant({ expression_language: '4' }, { assigned_number: 12 })
  const forward = buildBalancedCacheIdentity(a, b)
  const reverse = buildBalancedCacheIdentity(b, a)

  assert.deepEqual(forward, reverse)
  assert.equal(forward.participantANumber, 12)
  assert.equal(forward.participantBNumber, 41)
  assert.match(forward.participantAContentHash, /^[a-f0-9]{64}$/)
  assert.match(forward.vibeContentHash, /^[a-f0-9]{64}$/)
  assert.match(forward.combinedContentHash, /^[a-f0-9]{64}$/)
  assert.equal(forward.scoreModelVersion, BALANCED_COMPATIBILITY_VERSION)
  assert.equal(forward.vibeModelTag, BALANCED_VIBE_MODEL_TAG)
  assert.notEqual(
    forward.combinedContentHash,
    buildBalancedCacheIdentity(a, participant({ expression_language: '5' }, { assigned_number: 12 })).combinedContentHash,
  )
})

test('profile questions remain visible diagnostics and materially affect the learned scorer', () => {
  const a = participant()
  const b = participant()
  const changedA = participant({
    expression_language: '1',
    minimum_partner_religious_commitment: '1',
    social_relationship_style: '1',
  })
  const changedB = participant({
    expression_language: '5',
    minimum_partner_religious_commitment: '4',
    social_relationship_style: '4',
  })

  const aligned = calculateBalancedCompatibility(a, b)
  const mismatched = calculateBalancedCompatibility(changedA, changedB)
  assert.ok(aligned.componentTotal - mismatched.componentTotal >= 11)
  assert.notEqual(aligned.totalScore, mismatched.totalScore)
  assert.equal(mismatched.questionScores.expressionLanguage, 0)
  assert.equal(mismatched.questionScores.religion, 0.4)
  assert.equal(mismatched.questionScores.socialStyle, 0.4)
})

test('score snapshots preserve the complete balanced event-time provenance and are immutable', () => {
  const result = calculateBalancedCompatibility(participant(), participant(), {
    vibeScore: 8,
    vibeAxes: createNeutralVibeAxes(),
  })
  result.aiVibeFallbackReason = null
  const snapshot = buildBalancedScoreSnapshot(result, { combinedContentHash: 'abc123' })

  assert.equal(snapshot.scoreModelVersion, BALANCED_COMPATIBILITY_VERSION)
  assert.equal(snapshot.scoreMaximum, 100)
  assert.equal(snapshot.vibeMaximum, BALANCED_VIBE_MAX)
  assert.equal(snapshot.vibeModel, BALANCED_VIBE_MODEL)
  assert.equal(snapshot.vibeModelTag, BALANCED_VIBE_MODEL_TAG)
  assert.equal(snapshot.combinedContentHash, 'abc123')
  assert.deepEqual(snapshot.scoreBreakdown, result.scoreBreakdown)
  assert.deepEqual(snapshot.questionScores, result.questionScores)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.scoreBreakdown), true)
  assert.throws(() => { snapshot.totalScore = 0 }, TypeError)
})

test('current balanced snapshots use the mutual personalized total and require an exact envelope', () => {
  const result = calculateBalancedCompatibility(participant(), participant(), {
    vibeScore: 8.123,
    vibeAxes: createNeutralVibeAxes(),
  })
  const exact = buildBalancedScoreSnapshot(result, { combinedContentHash: 'evidence-hash' })
  const payload = {
    modelVersion: BALANCED_COMPATIBILITY_VERSION,
    contentHash: 'evidence-hash',
    snapshot: exact,
    persistedTotal: exact.totalScore,
  }
  assert.equal(isCurrentBalancedScoreSnapshot(payload), true)

  assert.equal(exact.totalScore, result.personalizedCompatibility.totalScore)
  assert.notEqual(exact.totalScore, result.componentTotal)
  assert.equal(Object.hasOwn(exact.scoreBreakdown, 'neutralBaseline'), false)
  assert.equal(Object.hasOwn(exact.scoreBreakdown, 'evidenceTotal'), false)
  assert.equal(isCurrentBalancedScoreSnapshot({ ...payload, persistedTotal: exact.totalScore + 1 }), false)
  assert.equal(isCurrentBalancedScoreSnapshot({ ...payload, contentHash: 'wrong-hash' }), false)
})

test('exact current cache rows hydrate without recalculating and reject inconsistent snapshots', () => {
  const vibeAxes = createNeutralVibeAxes()
  const result = calculateBalancedCompatibility(participant(), participant(), {
    vibeScore: 8.123,
    vibeAxes,
  })
  const dbNumeric = value => Number(Number(value).toFixed(2))
  const row = {
    model_used: encodeBalancedVibeModelUsed({ vibeAxes }),
    score_model_version: BALANCED_COMPATIBILITY_VERSION,
    vibe_model_version: BALANCED_VIBE_VERSION,
    score_breakdown: result.scoreBreakdown,
    question_scores: result.questionScores,
    vibe_axes: result.vibeAxes,
    total_compatibility_score: dbNumeric(result.totalScore),
    ai_vibe_score: dbNumeric(result.vibeScore),
    mbti_score: dbNumeric(result.sharedContextScore),
    attachment_score: dbNumeric(result.attachmentPaceScore),
    communication_score: dbNumeric(result.communicationDisagreementScore),
    lifestyle_score: dbNumeric(result.lifestyleScore),
    core_values_score: dbNumeric(result.coreValuesScore),
    interaction_synergy_score: dbNumeric(result.synergyScore),
    intent_goal_score: dbNumeric(result.intentScore),
  }

  const hydrated = hydrateBalancedCompatibilityFromCacheRow(row)
  assert.ok(hydrated)
  assert.equal(hydrated.totalScore, result.totalScore)
  assert.deepEqual(hydrated.scoreBreakdown, result.scoreBreakdown)
  assert.deepEqual(hydrated.questionScores, result.questionScores)
  assert.deepEqual(hydrated.vibeAxes, result.vibeAxes)
  assert.equal(hydrated.communicationScore, result.communicationScore)
  assert.equal(hydrated.sharedContextScore, result.sharedContextScore)
  assert.equal(hydrated.initiativeSource, 'cached_snapshot')

  assert.equal(hydrateBalancedCompatibilityFromCacheRow({
    ...row,
    total_compatibility_score: Number(row.total_compatibility_score) + 1,
  }), null)
  assert.equal(hydrateBalancedCompatibilityFromCacheRow({
    ...row,
    question_scores: { ...row.question_scores, currentFocus: null },
  }), null)
  assert.equal(hydrateBalancedCompatibilityFromCacheRow({
    ...row,
    score_model_version: 'old-model',
  }), null)
})

test('only complete current-model AI rows can be reused across deterministic score versions', () => {
  const modelUsed = encodeBalancedVibeModelUsed({ vibeAxes: createNeutralVibeAxes() })
  assert.equal(isReusableBalancedVibeRow({
    model_used: modelUsed,
    vibe_content_hash: 'hash',
    ai_vibe_score: 6,
  }), true)
  assert.equal(isReusableBalancedVibeRow({
    model_used: `${modelUsed}|fallback=openai_error`,
    vibe_content_hash: 'hash',
    ai_vibe_score: 6,
  }), false)
  assert.equal(isReusableBalancedVibeRow({
    model_used: 'gpt-4|legacy',
    vibe_content_hash: 'hash',
    ai_vibe_score: 6,
  }), false)
})

test('answer parsing supports JSON survey data, Arabic choices, flat records, and legacy sequences', () => {
  const json = { survey_data: JSON.stringify({ answers: { humor_banter_style: 'ب' } }) }
  const flat = { survey_data: { lifestylePreferences: 'A,B,C,A,B', coreValues: 'B,C,A,D,A' } }

  assert.equal(getBalancedAnswer(json, 'humor_banter_style'), 'ب')
  assert.equal(normalizeBalancedChoice(getBalancedAnswer(json, 'humor_banter_style')), 'B')
  assert.equal(getBalancedAnswer({ expression_language: '4' }, 'expression_language'), '4')
  assert.equal(getBalancedAnswer(flat, 'lifestyle_3'), 'C')
  assert.equal(getBalancedAnswer(flat, 'core_values_4'), 'D')
})

test('vibe score is clamped to its 12-point budget and persisted cache columns reconstruct the display breakdown', () => {
  assert.equal(calculateBalancedCompatibility(participant(), participant(), { vibeScore: 99 }).questionScores.vibe, BALANCED_VIBE_MAX)
  assert.equal(calculateBalancedCompatibility(participant(), participant(), { vibeScore: -5 }).questionScores.vibe, 0)

  assert.deepEqual(getBalancedCacheBreakdown({
    total_compatibility_score: 100,
    ai_vibe_score: 12,
    mbti_score: 6,
    attachment_score: 8,
    communication_score: 10,
    lifestyle_score: 12,
    core_values_score: 17,
    interaction_synergy_score: 20,
    intent_goal_score: 5,
  }), {
    total: 100,
    semanticCommonGround: 18,
    aiSemantic: 12,
    sharedContext: 6,
    attachmentComfort: 8,
    communicationDisagreement: 10,
    lifestyleSustainability: 12,
    valuesBoundariesLanguage: 17,
    interactionRhythm: 20,
    intent: 5,
    humorOpenness: 10,
  })
})

test('cache breakdown prefers the exact stored model breakdown over legacy reconstruction', () => {
  const stored = {
    semanticCommonGround: 16.25,
    aiSemantic: 10.25,
    sharedContext: 6,
    interactionRhythm: 18,
    humorOpenness: 8.5,
    attachmentComfort: 7,
    lifestyleSustainability: 9,
    valuesBoundaries: 11.5,
    language: 3.5,
    communicationDisagreement: 8,
    intent: 4,
  }
  const result = getBalancedCacheBreakdown({
    total_compatibility_score: 85.75,
    // Deliberately contradictory retired columns prove they are not used.
    ai_vibe_score: 0,
    core_values_score: 0,
    score_breakdown: JSON.stringify(stored),
  })

  assert.equal(result.total, 85.75)
  assert.equal(result.semanticCommonGround, 16.25)
  assert.equal(result.valuesBoundaries, 11.5)
  assert.equal(result.language, 3.5)
  assert.equal(result.valuesBoundariesLanguage, 15)
  assert.equal(result.humorOpenness, 8.5)
})
