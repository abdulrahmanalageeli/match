export const PERSONALITY_FIT_MODEL_VERSION = "event-fit-v1"

export type PersonalityFitDimensionKey = "communication" | "disagreement" | "curiosity" | "intent" | "completion"
export type PersonalityFitStatus = "pass" | "review" | "careful_review" | "insufficient"
export type PersonalityFitConfidence = "high" | "medium" | "low"
export type PersonalityFitSignal = "strength" | "neutral" | "caution" | "missing"
export type PersonalityFitReviewStatus = "unreviewed" | "approved" | "needs_review" | "not_suitable"
export type PersonalityFitDimensionReview = "unreviewed" | "ok" | "concern"

export interface PersonalityFitItem {
  id: string
  question: string
  answer: string
  points: number
  maxPoints: number
  signal: PersonalityFitSignal
  rationale: string
}

export interface PersonalityFitDimension {
  key: PersonalityFitDimensionKey
  label: string
  score: number
  maxScore: number
  summary: string
  items: PersonalityFitItem[]
}

export interface ParticipantPersonalityFitAssessment {
  modelVersion: string
  score: number
  maxScore: 100
  status: PersonalityFitStatus
  statusLabel: string
  confidence: PersonalityFitConfidence
  provisional: boolean
  cautionCount: number
  dimensions: PersonalityFitDimension[]
  strengths: string[]
  cautions: string[]
  missingEvidence: string[]
}

export interface ParticipantPersonalityFitReview {
  participant_number: number
  review_status: PersonalityFitReviewStatus
  dimension_reviews: Partial<Record<PersonalityFitDimensionKey, PersonalityFitDimensionReview>>
  review_notes: string | null
  fit_model_version: string
  fit_score_snapshot: number | null
  reviewed_at: string | null
  updated_at: string | null
}

type ChoiceDefinition = {
  label: string
  points: number
  signal: PersonalityFitSignal
  rationale: string
}

type CommunicationDefinition = {
  id: string
  question: string
  choices: Record<string, ChoiceDefinition>
}

const directChoice = (label: string): ChoiceDefinition => ({
  label,
  points: 12,
  signal: "strength",
  rationale: "Direct, clear communication while leaving room for the other person.",
})

const avoidantChoice = (label: string): ChoiceDefinition => ({
  label,
  points: 7,
  signal: "neutral",
  rationale: "Conflict is contained, but the need or disagreement may remain unspoken.",
})

const indirectChoice = (label: string): ChoiceDefinition => ({
  label,
  points: 4,
  signal: "caution",
  rationale: "Discomfort is expressed indirectly, which can make a fast social setting harder to navigate.",
})

const forcefulChoice = (label: string): ChoiceDefinition => ({
  label,
  points: 0,
  signal: "caution",
  rationale: "The answer suggests a sharper or more forceful response under stress; it is a review signal, not an automatic rejection.",
})

const COMMUNICATION_QUESTIONS: CommunicationDefinition[] = [
  {
    id: "communication_1",
    question: "When someone close crosses a boundary, what do they do?",
    choices: {
      A: directChoice("Explain directly what was upsetting and how"),
      B: avoidantChoice("Keep the discomfort to themselves"),
      C: forcefulChoice("Show objection with a strong or sharp tone"),
      D: indirectChoice("Do not discuss it directly, but change their behavior"),
    },
  },
  {
    id: "communication_2",
    question: "How do they communicate an important need?",
    choices: {
      A: directChoice("State the request clearly and explain why it matters"),
      B: avoidantChoice("Wait for the other person to notice the need"),
      C: forcefulChoice("Repeat or press the request until they receive a response"),
      D: indirectChoice("Say it is fine, then show frustration later"),
    },
  },
  {
    id: "communication_3",
    question: "How do they respond to disagreement in a group?",
    choices: {
      A: directChoice("State the disagreement and explain their perspective"),
      B: avoidantChoice("Go along with the group despite privately disagreeing"),
      C: forcefulChoice("Respond strongly and focus on weaknesses in the other view"),
      D: indirectChoice("Stay quiet, then express disagreement indirectly later"),
    },
  },
  {
    id: "communication_4",
    question: "What becomes visible when tension rises during conflict?",
    choices: {
      A: directChoice("Name the tension and explain what is upsetting"),
      B: avoidantChoice("Become quiet or withdraw from the conversation"),
      C: forcefulChoice("Their voice or wording becomes sharper than usual"),
      D: indirectChoice("Act normal, then become colder or less communicative"),
    },
  },
  {
    id: "communication_5",
    question: "How do they handle an important disagreement?",
    choices: {
      A: directChoice("State their position clearly and try to understand the other person"),
      B: avoidantChoice("Stay quiet to prevent the disagreement becoming a problem"),
      C: forcefulChoice("Hold their position and try to prove it is stronger"),
      D: indirectChoice("Use jokes or hints instead of discussing it directly"),
    },
  },
]

const DISAGREEMENT_CHOICES: Record<string, ChoiceDefinition> = {
  A: { label: "Continue debating and test each other's arguments", points: 10, signal: "neutral", rationale: "Comfortable with direct intellectual disagreement." },
  B: { label: "Understand the experiences and reasons behind each view", points: 15, signal: "strength", rationale: "Prioritizes understanding without requiring agreement." },
  C: { label: "Lighten it with humor and move to another topic", points: 8, signal: "neutral", rationale: "Can de-escalate, although the underlying disagreement may remain unresolved." },
  D: { label: "Stop and move to a topic where both can build together", points: 14, signal: "strength", rationale: "Recognizes limits and redirects constructively." },
}

const CURIOSITY_CHOICES: Record<string, ChoiceDefinition> = {
  A: { label: "Enjoy being asked about personal motivations and experiences", points: 8, signal: "neutral", rationale: "Comfortable sharing when the other person leads with curiosity." },
  B: { label: "Ask and explore the other person's stories", points: 10, signal: "strength", rationale: "Shows an outward, reciprocal curiosity useful in structured introductions." },
  C: { label: "Prefer quick comments and banter over longer questions", points: 7, signal: "neutral", rationale: "A valid social style, though it provides less evidence of exploratory conversation." },
}

const INTENT_CHOICES: Record<string, ChoiceDefinition> = {
  A: { label: "Expand their social circle and make new friends", points: 10, signal: "strength", rationale: "Directly aligned with a social matching event." },
  B: { label: "Find a deeper intellectual connection", points: 9, signal: "strength", rationale: "Aligned with deeper matching, with potentially narrower expectations." },
  C: { label: "Try a new social experience and change the routine", points: 8, signal: "neutral", rationale: "A valid event goal, with less evidence of longer-term intent." },
}

function normalizeChoice(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase()
  if (normalized === "أ" || normalized === "ا") return "A"
  if (normalized === "ب") return "B"
  if (normalized === "ج") return "C"
  if (normalized === "د") return "D"
  return normalized
}

function getAnswer(participant: any, key: string): unknown {
  const surveyData = typeof participant?.survey_data === "string"
    ? (() => { try { return JSON.parse(participant.survey_data) } catch { return {} } })()
    : (participant?.survey_data || {})
  return participant?.[key] ?? surveyData?.answers?.[key] ?? surveyData?.[key] ?? null
}

function missingItem(id: string, question: string, maxPoints: number, fallbackPoints = 0): PersonalityFitItem {
  return {
    id,
    question,
    answer: "Not answered",
    points: fallbackPoints,
    maxPoints,
    signal: "missing",
    rationale: fallbackPoints > 0
      ? "No answer is available, so the pilot uses a neutral midpoint and lowers confidence."
      : "There is not enough evidence for points in this element.",
  }
}

function choiceItem(id: string, question: string, rawAnswer: unknown, maxPoints: number, choices: Record<string, ChoiceDefinition>, missingPoints = 0): PersonalityFitItem {
  const normalized = normalizeChoice(rawAnswer)
  const choice = choices[normalized]
  if (!choice) return missingItem(id, question, maxPoints, missingPoints)
  return { id, question, answer: choice.label, points: choice.points, maxPoints, signal: choice.signal, rationale: choice.rationale }
}

function dimensionSummary(score: number, maxScore: number, strong: string, mixed: string, limited: string): string {
  const ratio = maxScore > 0 ? score / maxScore : 0
  if (ratio >= 0.8) return strong
  if (ratio >= 0.55) return mixed
  return limited
}

export function assessParticipantPersonalityFit(participant: any): ParticipantPersonalityFitAssessment {
  const submitted = Boolean(participant?.survey_data)
  const communicationItems = COMMUNICATION_QUESTIONS.map(definition => (
    choiceItem(definition.id, definition.question, getAnswer(participant, definition.id), 12, definition.choices)
  ))
  const communicationScore = communicationItems.reduce((total, item) => total + item.points, 0)

  const disagreementItem = choiceItem(
    "match_disagreement_style",
    "What do they prefer after a disagreement where neither opinion will change?",
    getAnswer(participant, "match_disagreement_style"),
    15,
    DISAGREEMENT_CHOICES,
    10,
  )
  const curiosityItem = choiceItem(
    "curiosity_style",
    "What kind of interaction attracts them during a first introduction?",
    getAnswer(participant, "curiosity_style"),
    10,
    CURIOSITY_CHOICES,
  )
  const intentItem = choiceItem(
    "intent_goal",
    "What is their main goal for attending?",
    getAnswer(participant, "intent_goal"),
    10,
    INTENT_CHOICES,
  )

  const curiosityText = String(getAnswer(participant, "match_current_curiosity") ?? "").trim().replace(/\s+/g, " ")
  const curiosityLength = curiosityText.length
  const completionPoints = curiosityLength >= 20 ? 5 : curiosityLength >= 10 ? 3 : curiosityLength > 0 ? 1 : 0
  const completionItem: PersonalityFitItem = {
    id: "match_current_curiosity",
    question: "Did they provide a meaningful current-curiosity answer?",
    answer: curiosityText || "Not answered",
    points: completionPoints,
    maxPoints: 5,
    signal: curiosityLength >= 20 ? "strength" : curiosityLength > 0 ? "neutral" : "missing",
    rationale: curiosityLength >= 20
      ? `${curiosityLength} characters provides enough material to show present interests and conversational effort.`
      : curiosityLength > 0
        ? `${curiosityLength} characters provides limited evidence of conversational effort.`
        : "The newer free-text answer is missing, which lowers confidence but is not treated as misconduct.",
  }

  const dimensions: PersonalityFitDimension[] = [
    {
      key: "communication",
      label: "Direct and respectful communication",
      score: communicationScore,
      maxScore: 60,
      summary: dimensionSummary(communicationScore, 60, "Mostly direct and constructive responses.", "A mix of direct and avoidant or indirect responses.", "Several responses may need a closer conversation."),
      items: communicationItems,
    },
    {
      key: "disagreement",
      label: "Disagreement handling",
      score: disagreementItem.points,
      maxScore: 15,
      summary: disagreementItem.rationale,
      items: [disagreementItem],
    },
    {
      key: "curiosity",
      label: "Curiosity and reciprocity",
      score: curiosityItem.points,
      maxScore: 10,
      summary: curiosityItem.rationale,
      items: [curiosityItem],
    },
    {
      key: "intent",
      label: "Event-intent alignment",
      score: intentItem.points,
      maxScore: 10,
      summary: intentItem.rationale,
      items: [intentItem],
    },
    {
      key: "completion",
      label: "Response completeness and effort",
      score: completionPoints,
      maxScore: 5,
      summary: completionItem.rationale,
      items: [completionItem],
    },
  ]

  const score = submitted ? dimensions.reduce((total, dimension) => total + dimension.score, 0) : 0
  const answeredCommunication = communicationItems.filter(item => item.signal !== "missing").length
  const directStrengths = communicationItems.filter(item => item.signal === "strength").length
  const forcefulResponses = communicationItems.filter(item => item.points === 0 && item.signal === "caution")
  const indirectResponses = communicationItems.filter(item => item.points === 4 && item.signal === "caution")
  const answeredEvidence = answeredCommunication
    + Number(disagreementItem.signal !== "missing")
    + Number(curiosityItem.signal !== "missing")
    + Number(intentItem.signal !== "missing")
    + Number(curiosityLength >= 20)
  const confidence: PersonalityFitConfidence = answeredEvidence >= 9 ? "high" : answeredEvidence >= 7 ? "medium" : "low"
  const missingEvidence = [
    answeredCommunication < 5 ? `${5 - answeredCommunication} communication answer${5 - answeredCommunication === 1 ? " is" : "s are"} missing` : null,
    disagreementItem.signal === "missing" ? "New disagreement-style answer is missing" : null,
    curiosityItem.signal === "missing" ? "Curiosity-style answer is missing" : null,
    intentItem.signal === "missing" ? "Event-intent answer is missing" : null,
    curiosityLength < 20 ? "Meaningful current-curiosity text is missing" : null,
  ].filter((value): value is string => Boolean(value))

  const cautions = [
    ...forcefulResponses.map(item => `${item.question}: ${item.answer}`),
    indirectResponses.length >= 2 ? `${indirectResponses.length} answers rely on indirect communication` : null,
  ].filter((value): value is string => Boolean(value))
  const strengths = [
    directStrengths >= 4 ? `${directStrengths}/5 communication answers are direct and constructive` : null,
    disagreementItem.signal === "strength" ? "Constructive disagreement preference" : null,
    curiosityItem.signal === "strength" ? "Strong outward curiosity" : null,
    intentItem.signal === "strength" ? "Clear event-aligned intent" : null,
    curiosityLength >= 20 ? "Meaningful current-interest response" : null,
  ].filter((value): value is string => Boolean(value))

  let status: PersonalityFitStatus
  if (!submitted || answeredCommunication < 3) status = "insufficient"
  else if (score < 55 || forcefulResponses.length >= 2) status = "careful_review"
  else if (score < 70) status = "review"
  else status = "pass"

  const provisional = confidence !== "high"
  const statusLabel = status === "pass"
    ? (forcefulResponses.length > 0 ? "Pass with caution" : provisional ? "Provisional pass" : "Pass")
    : status === "review"
      ? "Review"
      : status === "careful_review"
        ? "Careful review"
        : "Insufficient answers"

  return {
    modelVersion: PERSONALITY_FIT_MODEL_VERSION,
    score,
    maxScore: 100,
    status,
    statusLabel,
    confidence,
    provisional,
    cautionCount: cautions.length,
    dimensions,
    strengths,
    cautions,
    missingEvidence,
  }
}

export function personalityFitMatchesFilter(
  assessment: ParticipantPersonalityFitAssessment,
  review: ParticipantPersonalityFitReview | undefined,
  filter: string,
): boolean {
  if (filter === "all") return true
  if (filter === "pass") return assessment.status === "pass"
  if (filter === "review") return assessment.status === "review" || assessment.status === "careful_review"
  if (filter === "insufficient") return assessment.status === "insufficient"
  if (filter === "manually_approved") return review?.review_status === "approved"
  if (filter === "manual_concern") return review?.review_status === "needs_review" || review?.review_status === "not_suitable"
  if (filter === "unreviewed") return !review || review.review_status === "unreviewed"
  return true
}
