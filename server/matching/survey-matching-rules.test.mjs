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
  checkAgeRangeHardGate,
  checkGenderCompatibility,
  checkInteractionStyleCompatibility,
  getAgeTolerance,
  getParticipantDeltaCacheReason,
  getOneYearAgeFlexDecision,
  hasHumorStyleClash,
  isParticipantComplete,
  isCurrentVibeModel,
} = await import("../../api/admin/trigger-match.mjs")

test("delta cache detects survey edits and new event enrollments", () => {
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
    created_at: "2026-08-16T10:03:00.000Z",
  }, baseline, 22), "newly_enrolled")
  assert.equal(getParticipantDeltaCacheReason({
    auto_signup_next_event: true,
    updated_at: "2026-08-16T10:04:00.000Z",
  }, baseline, 22), "newly_enrolled")
  assert.equal(getParticipantDeltaCacheReason({
    signup_for_next_event: true,
    next_event_signup_timestamp: "2026-08-16T09:59:00.000Z",
  }, baseline, 22), null)

})

test("vibe model detection accepts current score variants without accepting legacy models", () => {
  assert.equal(isCurrentVibeModel("gpt-5.4-mini"), true)
  assert.equal(isCurrentVibeModel("gpt-5.4-mini|vibe25"), true)
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

test("conversation initiative scoring is symmetric and neutral when either answer is missing", () => {
  const wantsPartnerToLead = synergyParticipant(1, "A")
  const wantsToLead = synergyParticipant(2, "C")
  const missing = synergyParticipant(3)

  assert.equal(calculateConversationInitiativePreferenceScore(wantsPartnerToLead, wantsToLead), 7)
  assert.equal(calculateConversationInitiativePreferenceScore(wantsToLead, wantsPartnerToLead), 7)
  assert.equal(calculateConversationInitiativePreferenceScore(wantsPartnerToLead, missing), null)
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
  assert.ok(clash.totalScore > 50)
  assert.ok(clash.humorOpenScore < aligned.humorOpenScore)
  assert.ok(clash.totalScore < aligned.totalScore)
})

test("fresh compatibility scoring applies feedback composites once and preserves veto caps", async () => {
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

  assert.equal(bonus.compositeAdjustment, 8)
  assert.equal(bonus.priorityScore, bonus.baseCompatibilityScore + 8)
  assert.equal(bonus.totalScore, Math.min(100, bonus.priorityScore))

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

  assert.equal(vetoed.compositeAdjustment, 8)
  assert.equal(vetoed.deadAirVetoApplied, true)
  assert.equal(vetoed.capApplied, 40)
  assert.equal(vetoed.priorityScore, 40)
  assert.equal(vetoed.totalScore, 40)
})

test("extreme early-openness mismatch remains a blocking interaction gate", () => {
  const a = gateParticipant(33, { humor_banter_style: "A", early_openness_comfort: 0 })
  const b = gateParticipant(34, { humor_banter_style: "D", early_openness_comfort: 3 })
  const report = buildManualPairGateReport({ participantA: a, participantB: b, eventId: 21 })

  assert.equal(checkInteractionStyleCompatibility(a, b), false)
  assert.ok(report.blockers.includes("interaction"))
  assert.equal(report.blockers.includes("humor_clash"), false)
})

test("a one-sided new answer preserves the legacy interaction score", () => {
  const legacyA = synergyParticipant(1)
  const legacyB = synergyParticipant(2)
  const legacyScore = calculateInteractionSynergyScore(legacyA, legacyB)

  legacyA.survey_data.answers.conversation_initiative_preference = "A"
  assert.equal(calculateInteractionSynergyScore(legacyA, legacyB), legacyScore)

  legacyB.survey_data.answers.conversation_initiative_preference = "C"
  const recalibratedScore = calculateInteractionSynergyScore(legacyA, legacyB)
  assert.ok(Math.abs(recalibratedScore - (legacyScore + ((3 / 35) * 30))) < 1e-9)
})

test("lifestyle uses all five raw scores and proportionally scales 15 points to 10", () => {
  const perfect = calculateLifestyleCompatibility("أ,أ,أ,أ,أ", "أ,أ,أ,أ,أ")
  const fourOfFive = calculateLifestyleCompatibility("أ,أ,أ,أ,أ", "أ,أ,أ,أ,ج")

  assert.equal(perfect, 10)
  assert.equal(fourOfFive, 8)
})

test("a model-version cache miss can reuse an unchanged AI vibe score", async () => {
  const a = synergyParticipant(40, "A")
  const b = synergyParticipant(41, "C")
  a.survey_data.answers.match_current_focus = ["career", "creative"]
  b.survey_data.answers.match_current_focus = ["career", "health_fitness"]

  const result = await calculateFullCompatibilityWithCache(
    a,
    b,
    false,
    true,
    { reusedVibeScore: 12.75 },
  )

  assert.equal(result.vibeScore, 21.25)
  assert.equal(result.cached, false)
  assert.ok(Number.isFinite(result.totalScore))
  assert.ok(result.disagreementScore >= 0 && result.disagreementScore <= 4)
  assert.ok(result.currentFocusScore >= 0 && result.currentFocusScore <= 5)
  assert.ok(result.similarityPreferenceScore >= 0 && result.similarityPreferenceScore <= 5)
  assert.ok(result.attachmentPaceScore >= 0 && result.attachmentPaceScore <= 3)
})

test("a 25-point cached vibe score is not scaled a second time", async () => {
  const a = synergyParticipant(42, "A")
  const b = synergyParticipant(43, "C")
  const result = await calculateFullCompatibilityWithCache(
    a,
    b,
    false,
    true,
    { reusedVibeScore: 18.5, reusedVibeSourceMax: 25 },
  )

  assert.equal(result.vibeScore, 18.5)
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
