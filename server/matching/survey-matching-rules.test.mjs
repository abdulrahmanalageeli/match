import assert from "node:assert/strict"
import test from "node:test"

process.env.SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"
process.env.OPENAI_API_KEY ||= "test-openai-key"
process.env.MATCH_LOG_LEVEL = "debug"

const {
  calculateConversationInitiativePreferenceScore,
  calculateInteractionSynergyScore,
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
  assert.equal(calculateInteractionSynergyScore(legacyA, legacyB), legacyScore + 3)
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
