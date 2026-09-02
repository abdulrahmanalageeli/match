import assert from "node:assert/strict"
import test from "node:test"

process.env.SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"
process.env.OPENAI_API_KEY ||= "test-openai-key"
process.env.MATCH_LOG_LEVEL = "debug"

const {
  calculateFullCompatibilityWithCache,
  calculateConversationInitiativePreferenceScore,
  calculateInteractionSynergyScore,
  calculateLifestyleCompatibility,
  buildManualPairGateReport,
  buildPersistedMatchInsightFields,
  buildPersistedScoreProvenance,
  computeOppositesBreakdown,
  canAdvanceGlobalCacheMetadata,
  checkAgeRangeHardGate,
  checkGenderCompatibility,
  checkInteractionStyleCompatibility,
  getAgeTolerance,
  getDeltaCacheReasonCounts,
  getCacheMetadataScope,
  getParticipantDeltaCacheReason,
  getOneYearAgeFlexDecision,
  hasHumorStyleClash,
  isParticipantCacheEligible,
  isParticipantComplete,
  isCurrentVibeModel,
  isDurableCurrentBalancedCacheRow,
  formatBalancedScoreReason,
} = await import("../../api/admin/trigger-match.mjs")
const {
  BALANCED_COMPATIBILITY_VERSION,
  BALANCED_VIBE_MODEL_TAG,
  isCurrentOppositesScoreSnapshot,
} = await import("./balanced-compatibility.mjs")

test("cache eligibility requires the submitted-survey name marker", () => {
  assert.equal(isParticipantCacheEligible({
    assigned_number: 1537,
    survey_data: { answers: { gender_preference: "opposite_gender" } },
  }), false)
  assert.equal(isParticipantCacheEligible({
    assigned_number: 100,
    name: "Submitted participant",
    survey_data: { answers: { gender_preference: "opposite_gender" } },
  }), true)
  assert.equal(isParticipantCacheEligible({
    assigned_number: 101,
    survey_data: JSON.stringify({ name: "Legacy submitted participant", answers: {} }),
  }), true)
})

test("generated match rows map all match-insight scores to persisted columns", () => {
  assert.deepEqual(buildPersistedMatchInsightFields({
    disagreementScore: 5,
    currentFocusScore: 4,
    similarityPreferenceScore: 2,
    attachmentPaceScore: 8,
  }), {
    disagreement_style_score: 5,
    current_life_overlap_score: 4,
    similarity_preference_score: 2,
    attachment_pace_score: 8,
  })
})

test("generated match rows recalculate insight scores when an old cache has zero placeholders", () => {
  const participantA = { survey_data: { answers: {
    match_disagreement_style: "A",
    match_current_focus: ["career", "self_growth"],
    match_similarity_preference: "A",
  } } }
  const participantB = { survey_data: { answers: {
    match_disagreement_style: "A",
    match_current_focus: ["career", "self_growth"],
    match_similarity_preference: "A",
  } } }

  assert.deepEqual(buildPersistedMatchInsightFields({
    disagreementScore: 0,
    currentFocusScore: 0,
    similarityPreferenceScore: 0,
    attachmentPaceScore: 0,
  }, participantA, participantB, 25), {
    disagreement_style_score: 4,
    current_life_overlap_score: 4,
    similarity_preference_score: 0.75,
    attachment_pace_score: 4.5,
  })
})

test("generated match rows replace explicit nulls and give organizer rows safe defaults", () => {
  const participantA = { survey_data: { answers: {
    match_disagreement_style: "B",
    match_current_focus: ["career", "business"],
    match_similarity_preference: "D",
  } } }
  const participantB = { survey_data: { answers: {
    match_disagreement_style: "B",
    match_current_focus: ["career", "travel_experiences"],
    match_similarity_preference: "D",
  } } }

  const generated = buildPersistedMatchInsightFields({
    disagreementScore: null,
    currentFocusScore: 3,
    similarityPreferenceScore: null,
    attachmentPaceScore: null,
  }, participantA, participantB, 20)
  assert.equal(generated.disagreement_style_score, 4)
  assert.equal(generated.current_life_overlap_score, 3)
  assert.equal(generated.similarity_preference_score, 0.5)
  assert.equal(generated.attachment_pace_score, 4.5)
  assert.deepEqual(buildPersistedMatchInsightFields(), {
    disagreement_style_score: 0,
    current_life_overlap_score: 0,
    similarity_preference_score: 0,
    attachment_pace_score: 0,
  })
})

test("delta cache detects only survey edits and dedicated event enrollment timestamps", () => {
  const baseline = "2026-08-16T10:00:00.000Z"
  assert.equal(getParticipantDeltaCacheReason({
    survey_data_updated_at: "2026-08-16T10:01:00.000Z",
  }, baseline, 22), "survey_updated")
  assert.equal(getParticipantDeltaCacheReason({
    signup_for_next_event: true,
    next_event_signup_timestamp: "2026-08-16T10:02:00.000Z",
  }, baseline, 22), "newly_enrolled")
  assert.equal(getParticipantDeltaCacheReason({
    event_id: 22,
    event_enrolled_at: "2026-08-16T10:03:00.000Z",
  }, baseline, 22), "newly_enrolled")
  assert.equal(getParticipantDeltaCacheReason({
    event_id: 22,
    created_at: "2026-08-16T10:04:00.000Z",
  }, baseline, 22), "newly_enrolled")
  assert.equal(getParticipantDeltaCacheReason({
    signup_for_next_event: true,
    next_event_signup_timestamp: "2026-08-16T09:59:00.000Z",
  }, baseline, 22), null)

})

test("operational participant updates do not invalidate delta cache", () => {
  const baseline = "2026-08-16T10:00:00.000Z"
  const operationalUpdate = "2026-08-16T10:05:00.000Z"

  assert.equal(getParticipantDeltaCacheReason({
    event_id: 22,
    event_enrolled_at: "2026-08-16T09:00:00.000Z",
    created_at: "2026-08-15T09:00:00.000Z",
    updated_at: operationalUpdate,
    last_twilio_action: "receipt",
    last_twilio_action_at: operationalUpdate,
  }, baseline, 22), null)

  assert.equal(getParticipantDeltaCacheReason({
    auto_signup_next_event: true,
    next_event_signup_timestamp: "2026-08-16T09:30:00.000Z",
    updated_at: operationalUpdate,
  }, baseline, 22), null)
})

test("delta cache reports survey changes and enrollments separately", () => {
  const baseline = "2026-08-16T10:00:00.000Z"
  assert.deepEqual(getDeltaCacheReasonCounts([
    { survey_data_updated_at: "2026-08-16T10:01:00.000Z" },
    { event_id: 22, event_enrolled_at: "2026-08-16T10:02:00.000Z" },
    { signup_for_next_event: true, next_event_signup_timestamp: "2026-08-16T10:03:00.000Z" },
    { event_id: 22, event_enrolled_at: "2026-08-16T09:00:00.000Z", updated_at: "2026-08-16T10:04:00.000Z" },
  ], baseline, 22), {
    survey_changes: 1,
    new_enrollments: 2,
    score_model_changes: 0,
  })
})

test("delta cache invalidates every participant when the scorer version changes", () => {
  const baseline = "2026-08-16T10:00:00.000Z"
  const participants = [
    { assigned_number: 1, survey_data_updated_at: "2026-08-16T09:00:00.000Z" },
    { assigned_number: 2, survey_data_updated_at: "2026-08-16T09:00:00.000Z" },
  ]
  assert.equal(
    getParticipantDeltaCacheReason(participants[0], baseline, 22, "legacy-model"),
    "score_model_changed",
  )
  assert.equal(
    getParticipantDeltaCacheReason(participants[0], baseline, 22, BALANCED_COMPATIBILITY_VERSION),
    null,
  )
  assert.deepEqual(getDeltaCacheReasonCounts(participants, baseline, 22, "legacy-model"), {
    survey_changes: 0,
    new_enrollments: 0,
    score_model_changes: 2,
  })
})

test("only a standing mutual-preference cache sweep can advance global metadata", () => {
  assert.equal(canAdvanceGlobalCacheMetadata(null), true)
  assert.equal(canAdvanceGlobalCacheMetadata("individual"), true)
  assert.equal(canAdvanceGlobalCacheMetadata(null, "preference"), true)
  assert.equal(canAdvanceGlobalCacheMetadata("same_gender"), false)
  assert.equal(canAdvanceGlobalCacheMetadata("opposite_gender"), false)
  assert.equal(canAdvanceGlobalCacheMetadata(null, "same"), false)
  assert.equal(canAdvanceGlobalCacheMetadata(null, "opposite"), false)
  assert.equal(canAdvanceGlobalCacheMetadata("group", "preference"), false)

  assert.equal(getCacheMetadataScope(null, "preference"), "standing_mutual_preferences")
  assert.equal(getCacheMetadataScope("same_gender", "preference"), "forced_round_rows_only")
  assert.equal(getCacheMetadataScope(null, "same"), "gender_specific_rows_only")
  assert.equal(getCacheMetadataScope("group", "preference"), "non_individual_rows_only")
})

test("vibe model detection requires the exact balanced model tag and accepts its axis metadata", () => {
  assert.equal(isCurrentVibeModel(BALANCED_VIBE_MODEL_TAG), true)
  assert.equal(isCurrentVibeModel(`${BALANCED_VIBE_MODEL_TAG}|c=2.5,h=1.5,m=0.5,f=1.5`), true)
  assert.equal(isCurrentVibeModel("gpt-5.4-mini"), false)
  assert.equal(isCurrentVibeModel("gpt-5.4-mini|vibe25"), false)
  assert.equal(isCurrentVibeModel("gpt-4o-mini"), false)
  assert.equal(isCurrentVibeModel(null), false)
})

test("preference gender mode honors both participants and supports same or opposite gender", () => {
  const maleOpposite = gateParticipant(1, { gender: "male", same_gender_preference: false, any_gender_preference: false })
  const femaleOpposite = gateParticipant(2, { gender: "female", same_gender_preference: false, any_gender_preference: false })
  const maleSameA = gateParticipant(3, { gender: "male", same_gender_preference: true, any_gender_preference: false })
  const maleSameB = gateParticipant(5, { gender: "male", same_gender_preference: true, any_gender_preference: false })
  const femaleAny = gateParticipant(4, { gender: "female", same_gender_preference: false, any_gender_preference: true })

  assert.equal(checkGenderCompatibility(maleOpposite, femaleOpposite, "preference"), true)
  assert.equal(checkGenderCompatibility(maleSameA, maleSameB, "preference"), true)
  assert.equal(checkGenderCompatibility(maleSameA, femaleOpposite, "preference"), false)
  assert.equal(checkGenderCompatibility(maleSameA, femaleAny, "preference"), false)
})

function gateParticipant(number, overrides = {}) {
  return {
    assigned_number: number,
    age: 30,
    gender: number % 2 ? "male" : "female",
    nationality: "Saudi",
    preferred_age_min: 20,
    preferred_age_max: 40,
    signup_for_next_event: true,
    event_id: 21,
    attachment_style: "Secure",
    communication_style: "Direct",
    humor_banter_style: "B",
    early_openness_comfort: 2,
    survey_data: {
      answers: {
        lifestyle_1: "A", lifestyle_2: "A", lifestyle_3: "A", lifestyle_4: "A", lifestyle_5: "A",
        core_values_1: "A", core_values_2: "A", core_values_3: "A", core_values_4: "A", core_values_5: "A",
        conversational_role: "A", conversation_depth_pref: "A", social_battery: "A",
        humor_subtype: "A", curiosity_style: "A", silence_comfort: "A", intent_goal: "A",
      },
    },
    ...overrides,
  }
}

function participant(number, age, answers = {}) {
  return {
    assigned_number: number,
    age,
    survey_data: { answers },
  }
}

function synergyParticipant(number, preference) {
  const answers = {
    conversational_role: "B",
    conversation_depth_pref: "A",
    social_battery: "A",
    humor_subtype: "A",
    curiosity_style: "C",
    silence_comfort: "A",
    humor_banter_style: "B",
    early_openness_comfort: "2",
  }
  if (preference) answers.conversation_initiative_preference = preference
  return participant(number, 30, answers)
}

test("conversation initiative scoring is symmetric, capped at four, and falls back to Q35", () => {
  const wantsPartnerToLead = synergyParticipant(1, "A")
  const wantsToLead = synergyParticipant(2, "C")
  const missing = synergyParticipant(3)

  assert.equal(calculateConversationInitiativePreferenceScore(wantsPartnerToLead, wantsToLead), 4)
  assert.equal(calculateConversationInitiativePreferenceScore(wantsToLead, wantsPartnerToLead), 4)
  assert.equal(calculateConversationInitiativePreferenceScore(wantsPartnerToLead, missing), 3)
})

test("manual pair test mode reports every active gate when a pair is eligible", () => {
  const report = buildManualPairGateReport({
    participantA: gateParticipant(1),
    participantB: gateParticipant(2),
    eventId: 21,
  })

  assert.equal(report.eligible, true)
  assert.equal(report.blockers.length, 0)
  assert.ok(report.gates.length >= 12)
  assert.equal(report.gates.find(gate => gate.key === "payment").applicable, false)
  assert.ok(report.gates.filter(gate => gate.blocking && gate.applicable).every(gate => gate.passed))
})

test("manual pair test mode explains all blockers instead of hiding the pair", () => {
  const a = gateParticipant(11, { signup_for_next_event: false, event_id: 20, preferred_age_min: 35, preferred_age_max: 40 })
  const b = gateParticipant(13, { signup_for_next_event: false, event_id: 20, age: 30 })
  const report = buildManualPairGateReport({
    participantA: a,
    participantB: b,
    eventId: 21,
    excludedParticipantNumbers: [11],
    pairExcluded: true,
    previousMatchEvents: [19],
  })

  assert.equal(report.eligible, false)
  assert.ok(report.blockers.includes("current_event"))
  assert.ok(report.blockers.includes("admin_participant_exclusion"))
  assert.ok(report.blockers.includes("gender"))
  assert.ok(report.blockers.includes("age"))
  assert.ok(report.blockers.includes("excluded_pair"))
  assert.ok(report.blockers.includes("previous_match"))
})

test("manual pair gate report scopes the same-gender payment gate to the active event", () => {
  const report = buildManualPairGateReport({
    participantA: gateParticipant(21, { PAID_DONE: true, payment_completed_event_id: 20, same_gender_preference: true }),
    participantB: gateParticipant(23, { PAID_DONE: true, payment_completed_event_id: 21, same_gender_preference: true }),
    eventId: 21,
    matchType: "same_gender",
    forcedGenderMode: "same_gender",
  })

  const paymentGate = report.gates.find(gate => gate.key === "payment")
  assert.equal(paymentGate.applicable, true)
  assert.equal(paymentGate.passed, false)
  assert.ok(report.blockers.includes("payment"))
})

test("A-to-D humor clash is retained as a non-blocking warning", () => {
  const a = gateParticipant(31, { humor_banter_style: "A" })
  const b = gateParticipant(32, { humor_banter_style: "D" })
  const report = buildManualPairGateReport({ participantA: a, participantB: b, eventId: 21 })
  const humorWarning = report.gates.find(gate => gate.key === "humor_clash")

  assert.equal(hasHumorStyleClash(a, b), true)
  assert.equal(checkInteractionStyleCompatibility(a, b), true)
  assert.equal(humorWarning.passed, false)
  assert.equal(humorWarning.blocking, false)
  assert.equal(report.blockers.includes("humor_clash"), false)
  assert.equal(report.eligible, true)
})

test("A-to-D humor lowers its component without capping the overall score", async () => {
  const playful = synergyParticipant(35, "A")
  const serious = synergyParticipant(36, "A")
  playful.humor_banter_style = "A"
  serious.humor_banter_style = "D"
  playful.survey_data.answers.humor_banter_style = "A"
  serious.survey_data.answers.humor_banter_style = "D"

  const alignedA = synergyParticipant(37, "A")
  const alignedB = synergyParticipant(38, "A")
  alignedA.humor_banter_style = "B"
  alignedB.humor_banter_style = "B"
  alignedA.survey_data.answers.humor_banter_style = "B"
  alignedB.survey_data.answers.humor_banter_style = "B"

  const clash = await calculateFullCompatibilityWithCache(
    playful,
    serious,
    false,
    true,
    { reusedVibeScore: 20, reusedVibeSourceMax: 25 },
  )
  const aligned = await calculateFullCompatibilityWithCache(
    alignedA,
    alignedB,
    false,
    true,
    { reusedVibeScore: 20, reusedVibeSourceMax: 25 },
  )

  assert.equal(clash.humorClashDetected, true)
  assert.equal(clash.humorClashVetoApplied, false)
  assert.notEqual(clash.capApplied, 50)
  assert.ok(clash.totalScore > 0)
  assert.ok(clash.rawCompatibilityScore > 50)
  assert.ok(clash.humorOpenScore < aligned.humorOpenScore)
  assert.ok(clash.totalScore < aligned.totalScore)
})

test("fresh balanced scoring does not apply feedback composites or dead-air overrides", async () => {
  const bonusA = synergyParticipant(44, "A")
  const bonusB = synergyParticipant(45, "A")
  bonusA.humor_banter_style = "B"
  bonusB.humor_banter_style = "C"
  bonusA.survey_data.answers.humor_banter_style = "B"
  bonusB.survey_data.answers.humor_banter_style = "C"
  const bonus = await calculateFullCompatibilityWithCache(
    bonusA,
    bonusB,
    false,
    true,
    { reusedVibeScore: 18, reusedVibeSourceMax: 25 },
  )

  assert.equal(bonus.compositeAdjustment, 0)
  assert.equal(bonus.priorityScore, bonus.baseCompatibilityScore)
  assert.equal(bonus.totalScore, bonus.priorityScore)

  const vetoA = synergyParticipant(46, "A")
  const vetoB = synergyParticipant(47, "A")
  vetoA.humor_banter_style = "B"
  vetoB.humor_banter_style = "C"
  vetoA.survey_data.answers.humor_banter_style = "B"
  vetoB.survey_data.answers.humor_banter_style = "C"
  vetoA.survey_data.answers.conversational_role = "C"
  vetoB.survey_data.answers.conversational_role = "C"
  vetoA.survey_data.answers.silence_comfort = "B"
  vetoB.survey_data.answers.silence_comfort = "B"
  const vetoed = await calculateFullCompatibilityWithCache(
    vetoA,
    vetoB,
    false,
    true,
    { reusedVibeScore: 25, reusedVibeSourceMax: 25 },
  )

  assert.equal(vetoed.compositeAdjustment, 0)
  assert.equal(vetoed.deadAirVetoApplied, false)
  assert.equal(vetoed.capApplied, null)
  assert.equal(vetoed.priorityScore, vetoed.baseCompatibilityScore)
  assert.equal(vetoed.totalScore, vetoed.priorityScore)
})

test("extreme early-openness mismatch remains a blocking interaction gate", () => {
  const a = gateParticipant(33, { humor_banter_style: "A", early_openness_comfort: 0 })
  const b = gateParticipant(34, { humor_banter_style: "D", early_openness_comfort: 3 })
  const report = buildManualPairGateReport({ participantA: a, participantB: b, eventId: 21 })

  assert.equal(checkInteractionStyleCompatibility(a, b), false)
  assert.ok(report.blockers.includes("interaction"))
  assert.equal(report.blockers.includes("humor_clash"), false)
})

test("interaction stays in its balanced 25-point range and uses Q35 until both new answers exist", () => {
  const legacyA = synergyParticipant(1)
  const legacyB = synergyParticipant(2)
  const legacyScore = calculateInteractionSynergyScore(legacyA, legacyB)

  legacyA.survey_data.answers.conversation_initiative_preference = "A"
  assert.equal(calculateInteractionSynergyScore(legacyA, legacyB), legacyScore)

  legacyB.survey_data.answers.conversation_initiative_preference = "C"
  const recalibratedScore = calculateInteractionSynergyScore(legacyA, legacyB)
  assert.equal(legacyScore, 24)
  assert.equal(recalibratedScore, 25)
  assert.ok(recalibratedScore >= 0 && recalibratedScore <= 25)
})

test("failed and transient balanced vibe rows are never treated as durable exact hits", () => {
  const base = {
    model_used: `${BALANCED_VIBE_MODEL_TAG}|c=2.5,h=1.5,m=0.5,f=1.5`,
    score_model_version: BALANCED_COMPATIBILITY_VERSION,
  }
  assert.equal(isDurableCurrentBalancedCacheRow(base), true)
  assert.equal(isDurableCurrentBalancedCacheRow({
    ...base,
    model_used: `${base.model_used}|fallback=incomplete_vibe_profile`,
  }), true)
  for (const reason of ["openai_connection_error", "openai_error", "invalid_openai_response", "skip_ai"]) {
    assert.equal(isDurableCurrentBalancedCacheRow({
      ...base,
      model_used: `${base.model_used}|fallback=${reason}`,
    }), false)
  }
})

test("persisted score provenance keeps the model and snapshot total inseparable", async () => {
  const a = synergyParticipant(71, "A")
  const b = synergyParticipant(72, "C")
  const score = await calculateFullCompatibilityWithCache(a, b, false, true, {
    reusedVibeScore: 25,
    reusedVibeSourceMax: 25,
  })
  const balanced = buildPersistedScoreProvenance(score, a, b, 73)
  const transformed = computeOppositesBreakdown(score)
  const opposites = buildPersistedScoreProvenance(score, a, b, transformed.percent, { oppositesMode: true })

  assert.equal(balanced.score_model_version, BALANCED_COMPATIBILITY_VERSION)
  assert.equal(balanced.score_snapshot.totalScore, 73)
  assert.equal(balanced.score_snapshot.scoreModelVersion, balanced.score_model_version)
  assert.match(balanced.score_content_hash, /^[a-f0-9]{64}$/)
  assert.match(opposites.score_model_version, /opposites-flip-v1$/)
  assert.equal(opposites.score_snapshot.totalScore, transformed.percent)
  assert.equal(opposites.score_snapshot.sourceScoreModelVersion, BALANCED_COMPATIBILITY_VERSION)
  assert.deepEqual(opposites.score_snapshot.scoreBreakdown, {
    interactionSynergy: transformed.synergy,
    coreValuesAlignment: transformed.coreValues,
    communicationAlignment: transformed.communication,
    lifestyleDifference: transformed.flippedLifestyle,
    vibeDifference: transformed.flippedVibe,
    humorDifference: transformed.flippedHumor,
    rawTotal: transformed.rawTotal,
    rawMaximum: transformed.rawMaximum,
    normalizedTotal: transformed.percent,
  })
  assert.equal(opposites.score_snapshot.sourceScoreBreakdown.semanticCommonGround, score.scoreBreakdown.semanticCommonGround)
  assert.equal(isCurrentOppositesScoreSnapshot({
    modelVersion: opposites.score_model_version,
    contentHash: opposites.score_content_hash,
    snapshot: opposites.score_snapshot,
    persistedTotal: transformed.percent,
  }), true)
  assert.equal(isCurrentOppositesScoreSnapshot({
    modelVersion: opposites.score_model_version,
    contentHash: opposites.score_content_hash,
    snapshot: {
      ...opposites.score_snapshot,
      scoreBreakdown: { ...opposites.score_snapshot.scoreBreakdown, rawTotal: transformed.rawTotal + 1 },
    },
    persistedTotal: transformed.percent,
  }), false)
})

test("locked/current reason formatting preserves valid zero components and balanced maxima", () => {
  const reason = formatBalancedScoreReason({ scoreBreakdown: {
    semanticCommonGround: 0,
    interactionRhythm: 0,
    humorOpenness: 0,
    attachmentComfort: 0,
    lifestyleSustainability: 0,
    valuesBoundaries: 0,
    communicationDisagreement: 0,
    intent: 0,
    language: 0,
  } })
  assert.match(reason, /Common Ground: 0\/17/)
  assert.match(reason, /Attachment Comfort: 0\/9/)
  assert.doesNotMatch(reason, /Expression Language/)
  assert.doesNotMatch(reason, /\/28|\/30|15%/)
})

test("lifestyle uses all five weighted scenarios in its balanced 12-point range", () => {
  const perfect = calculateLifestyleCompatibility("أ,أ,أ,أ,أ", "أ,أ,أ,أ,أ")
  const fourOfFive = calculateLifestyleCompatibility("أ,أ,أ,أ,أ", "أ,أ,أ,أ,ج")

  assert.equal(perfect, 12)
  assert.equal(fourOfFive, 11.25)
})

test("a model-version cache miss refuses an unversioned legacy 15-point vibe", async () => {
  const a = synergyParticipant(40, "A")
  const b = synergyParticipant(41, "C")
  a.survey_data.answers.match_current_focus = ["career", "creative"]
  b.survey_data.answers.match_current_focus = ["career", "health_fitness"]

  const result = await calculateFullCompatibilityWithCache(
    a,
    b,
    false,
    true,
    { reusedVibeScore: 15, reusedVibeSourceMax: 15 },
  )

  assert.equal(result.vibeScore, 6)
  assert.equal(result.reusedCachedVibe, false)
  assert.equal(result.cached, false)
  assert.ok(Number.isFinite(result.totalScore))
  assert.ok(result.disagreementScore >= 0 && result.disagreementScore <= 5)
  assert.ok(result.currentFocusScore >= 0 && result.currentFocusScore <= 4)
  assert.ok(result.similarityPreferenceScore >= 0 && result.similarityPreferenceScore <= 2)
  assert.ok(result.attachmentPaceScore >= 0 && result.attachmentPaceScore <= 9)
})

test("a legacy 25-point cached vibe is not reused by the balanced scorer", async () => {
  const a = synergyParticipant(42, "A")
  const b = synergyParticipant(43, "C")
  const result = await calculateFullCompatibilityWithCache(
    a,
    b,
    false,
    true,
    { reusedVibeScore: 25, reusedVibeSourceMax: 25 },
  )

  assert.equal(result.vibeScore, 6)
  assert.equal(result.reusedCachedVibe, false)
})

test("a complete new survey does not require retired MBTI answers", () => {
  const answers = {
    lifestyle_1: "أ",
    lifestyle_2: "أ",
    lifestyle_3: "أ",
    lifestyle_4: "أ",
    lifestyle_5: "أ",
    core_values_1: "أ",
    core_values_2: "أ",
    core_values_3: "أ",
    core_values_4: "أ",
    core_values_5: "أ",
    conversational_role: "B",
    conversation_depth_pref: "A",
    social_battery: "A",
    humor_subtype: "A",
    curiosity_style: "C",
    silence_comfort: "A",
    humor_banter_style: "B",
    early_openness_comfort: "2",
    intent_goal: "A",
  }
  const complete = {
    ...participant(20, 30, answers),
    gender: "male",
    attachment_style: "Secure",
    communication_style: "Assertive",
  }

  assert.equal(isParticipantComplete(complete, "regular"), true)
  assert.equal(complete.survey_data.answers.mbti_1, undefined)
})

test("the one-year age expansion respects yes, no, and legacy-unanswered decisions", () => {
  const accepted = participant(10, 30, {
    preferred_age_min: "25",
    preferred_age_max: "29",
    age_flex_one_year: "accept",
  })
  const declined = participant(11, 30, {
    preferred_age_min: "25",
    preferred_age_max: "29",
    age_flex_one_year: "decline",
  })
  const unanswered = participant(12, 30, {
    preferred_age_min: "25",
    preferred_age_max: "29",
  })
  const oneYearOutside = participant(13, 24, {
    preferred_age_min: "30",
    preferred_age_max: "34",
    open_age_preference: "true",
  })

  assert.equal(getOneYearAgeFlexDecision(accepted), "accept")
  assert.equal(getOneYearAgeFlexDecision(declined), "decline")
  assert.equal(getOneYearAgeFlexDecision(unanswered), "unanswered")
  assert.equal(checkAgeRangeHardGate(accepted, oneYearOutside), true)
  assert.equal(checkAgeRangeHardGate(declined, oneYearOutside), false)
  assert.equal(checkAgeRangeHardGate(unanswered, oneYearOutside), true)

  const acceptedTolerance = getAgeTolerance(accepted.assigned_number, oneYearOutside.assigned_number)
  const unansweredTolerance = getAgeTolerance(unanswered.assigned_number, oneYearOutside.assigned_number)
  assert.equal(acceptedTolerance.requiresConfirmationA, false)
  assert.equal(unansweredTolerance.requiresConfirmationA, true)
})

test("the dedicated age-flex column takes precedence over the JSONB fallback", () => {
  const oneYearOutside = participant(33, 24, {
    preferred_age_min: "30",
    preferred_age_max: "34",
    open_age_preference: "true",
  })
  const dedicatedDecline = {
    ...participant(30, 30, {
      preferred_age_min: "25",
      preferred_age_max: "29",
      age_flex_one_year: "accept",
    }),
    age_flex_one_year: false,
  }
  const dedicatedAccept = {
    ...participant(31, 30, {
      preferred_age_min: "25",
      preferred_age_max: "29",
      age_flex_one_year: "decline",
    }),
    age_flex_one_year: true,
  }

  assert.equal(getOneYearAgeFlexDecision(dedicatedDecline), "decline")
  assert.equal(checkAgeRangeHardGate(dedicatedDecline, oneYearOutside), false)
  assert.equal(getOneYearAgeFlexDecision(dedicatedAccept), "accept")
  assert.equal(checkAgeRangeHardGate(dedicatedAccept, oneYearOutside), true)
})
