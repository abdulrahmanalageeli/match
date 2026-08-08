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
  checkAgeRangeHardGate,
  getAgeTolerance,
  getOneYearAgeFlexDecision,
  isParticipantComplete,
} = await import("../../api/admin/trigger-match.mjs")

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
