import modelConfig from './personalized-model-config.json' with { type: 'json' }

export const PERSONALIZED_COMPATIBILITY_VERSION = modelConfig.version
export const PERSONALIZED_ARCHETYPES = Object.freeze(
  modelConfig.archetypes.map(archetype => Object.freeze({ ...archetype })),
)

const QUESTION_SET = new Set(modelConfig.schema.questions)
const EXPERT_QUESTION_SET = new Set(modelConfig.schema.expertQuestions)
const ARABIC_TO_LATIN = Object.freeze({ 'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' })
const PREPARED_PARTICIPANTS = new WeakMap()

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const round = (value, places = 6) => {
  const multiplier = 10 ** places
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier
}

function parseSurveyDataUncached(participant) {
  const source = participant?.survey_data
  if (!source) return {}
  if (typeof source !== 'string') return source
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getPreparedParticipant(participant) {
  return (participant && typeof participant === 'object' && PREPARED_PARTICIPANTS.get(participant)) || {
    survey: parseSurveyDataUncached(participant),
    rawAnswers: new Map(),
    answers: new Map(),
    focus: null,
    profileFeatures: null,
    archetype: null,
  }
}

function parseSurveyData(participant) {
  return getPreparedParticipant(participant).survey
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function legacySequenceAnswer(surveyData, key) {
  const lifestyle = /^lifestyle_([1-5])$/.exec(key)
  if (lifestyle && hasValue(surveyData?.lifestylePreferences)) {
    return String(surveyData.lifestylePreferences).split(',')[Number(lifestyle[1]) - 1]
  }
  const core = /^core_values_([1-5])$/.exec(key)
  if (core && hasValue(surveyData?.coreValues)) {
    return String(surveyData.coreValues).split(',')[Number(core[1]) - 1]
  }
  return undefined
}

function rawAnswer(participant, key) {
  const prepared = getPreparedParticipant(participant)
  if (prepared.rawAnswers.has(key)) return prepared.rawAnswers.get(key)
  const survey = prepared.survey
  const candidates = [
    survey?.answers?.[key],
    survey?.[key],
    participant?.answers?.[key],
    participant?.[key],
    legacySequenceAnswer(survey, key),
  ]
  const value = candidates.find(hasValue) ?? null
  prepared.rawAnswers.set(key, value)
  return value
}

export function normalizePersonalizedAnswer(value) {
  if (value === null || value === undefined || value === '') return 'MISSING'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  const text = String(value).trim()
  return ARABIC_TO_LATIN[text] || text.toUpperCase()
}

function answer(participant, key) {
  const prepared = getPreparedParticipant(participant)
  if (!prepared.answers.has(key)) {
    prepared.answers.set(key, normalizePersonalizedAnswer(rawAnswer(participant, key)))
  }
  return prepared.answers.get(key)
}

function focusValues(participant) {
  const prepared = getPreparedParticipant(participant)
  if (prepared.focus) return prepared.focus
  let value = rawAnswer(participant, modelConfig.schema.focusKey)
  if (typeof value === 'string') value = value.split(',').map(item => item.trim()).filter(Boolean)
  prepared.focus = new Set(Array.isArray(value) ? value.map(normalizePersonalizedAnswer) : [])
  return prepared.focus
}

function profileFeatures(participant) {
  const prepared = getPreparedParticipant(participant)
  if (prepared.profileFeatures) return prepared.profileFeatures
  const features = {}
  for (const key of modelConfig.schema.archetypeQuestions) {
    features[`${key}=${answer(participant, key)}`] = 1
  }
  for (const value of focusValues(participant)) features[`focus=${value}`] = 1
  prepared.profileFeatures = Object.freeze(features)
  return prepared.profileFeatures
}

/** Prime all normalized answers, focus values, features, and archetype once. */
export function preparePersonalizedParticipant(participant) {
  if (participant && typeof participant === 'object' && !PREPARED_PARTICIPANTS.has(participant)) {
    PREPARED_PARTICIPANTS.set(participant, {
      survey: parseSurveyDataUncached(participant),
      rawAnswers: new Map(),
      answers: new Map(),
      focus: null,
      profileFeatures: null,
      archetype: null,
    })
  }
  for (const key of QUESTION_SET) answer(participant, key)
  for (const key of modelConfig.schema.archetypeQuestions) answer(participant, key)
  focusValues(participant)
  profileFeatures(participant)
  inferPersonalizedArchetype(participant)
  return participant
}

export function preparePersonalizedParticipants(participants) {
  for (const participant of participants || []) preparePersonalizedParticipant(participant)
  return participants
}

function dot(coefficients, features) {
  let total = 0
  for (const [key, value] of Object.entries(features)) {
    const coefficient = coefficients[key]
    if (coefficient !== undefined) total += Number(coefficient) * Number(value)
  }
  return total
}

function sigmoid(value) {
  if (value >= 0) {
    const exponent = Math.exp(-value)
    return 1 / (1 + exponent)
  }
  const exponent = Math.exp(value)
  return exponent / (1 + exponent)
}

export function inferPersonalizedArchetype(participant) {
  const prepared = getPreparedParticipant(participant)
  if (prepared.archetype) return prepared.archetype
  const features = profileFeatures(participant)
  const classes = modelConfig.gate.classes
  let probabilities

  if (classes.length === 1) {
    probabilities = [1]
  } else if (classes.length === 2 && modelConfig.gate.coefficients.length === 1) {
    const logit = Number(modelConfig.gate.intercepts[0] || 0)
      + dot(modelConfig.gate.coefficients[0], features)
    const positive = sigmoid(logit)
    probabilities = [1 - positive, positive]
  } else {
    const logits = modelConfig.gate.coefficients.map((coefficients, index) => (
      Number(modelConfig.gate.intercepts[index] || 0) + dot(coefficients, features)
    ))
    const maximum = Math.max(...logits)
    const exponents = logits.map(value => Math.exp(value - maximum))
    const denominator = exponents.reduce((sum, value) => sum + value, 0)
    probabilities = exponents.map(value => value / denominator)
  }

  const memberships = modelConfig.archetypes.map((archetype, index) => ({
    ...archetype,
    probability: round(probabilities[index] || 0),
  }))
  const primary = memberships.reduce((best, current) => (
    current.probability > best.probability ? current : best
  ), memberships[0])

  prepared.archetype = Object.freeze({
    primary: Object.freeze({ ...primary }),
    memberships: Object.freeze(memberships.map(item => Object.freeze(item))),
  })
  return prepared.archetype
}

function basePairFeatures(participantA, participantB) {
  const result = {}
  for (const key of modelConfig.schema.questions) {
    const a = answer(participantA, key)
    const b = answer(participantB, key)
    result[`pair:${key}:${a}>${b}`] = 1
    result[`target:${key}:${b}`] = 0.35
    result[`same:${key}`] = a === b ? 1 : 0
    if (['expression_language', 'minimum_partner_religious_commitment', 'social_relationship_style', 'early_openness_comfort'].includes(key)) {
      const left = Number(a)
      const right = Number(b)
      if (Number.isFinite(left) && Number.isFinite(right)) {
        result[`distance:${key}`] = Math.abs(left - right) / 4
      }
    }
  }

  const focusA = focusValues(participantA)
  const focusB = focusValues(participantB)
  const union = new Set([...focusA, ...focusB])
  const intersection = new Set([...focusA].filter(value => focusB.has(value)))
  result['focus:jaccard'] = union.size ? intersection.size / union.size : 0.5
  for (const value of focusB) result[`target_focus:${value}`] = 0.35
  for (const value of intersection) result[`shared_focus:${value}`] = 1
  return result
}

function questionForFeature(key) {
  for (const question of QUESTION_SET) {
    if (key.includes(`:${question}:`)
      || key === `same:${question}`
      || key === `distance:${question}`) return question
  }
  return null
}

function isExpertFeature(key) {
  if (key.startsWith('focus:') || key.startsWith('shared_focus:') || key.startsWith('target_focus:')) return true
  const question = questionForFeature(key)
  return question ? EXPERT_QUESTION_SET.has(question) : false
}

function scoreFeatures(participantA, participantB, probabilities) {
  const base = basePairFeatures(participantA, participantB)
  const result = { ...base }
  for (let archetype = 0; archetype < probabilities.length; archetype += 1) {
    const membership = Number(probabilities[archetype] || 0)
    if (membership <= 1e-8) continue
    for (const [key, value] of Object.entries(base)) {
      if (value && isExpertFeature(key)) result[`archetype:${archetype}|${key}`] = membership * value
    }
  }
  return result
}

function percentile(value, orderedReference) {
  let low = 0
  let high = orderedReference.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (Number(orderedReference[middle]) <= value) low = middle + 1
    else high = middle
  }
  return clamp((low - 0.5) / Math.max(orderedReference.length, 1), 0.01, 0.99)
}

function contributionSummary(features) {
  const byQuestion = new Map()
  for (const [key, featureValue] of Object.entries(features)) {
    const coefficient = modelConfig.score.coefficients[key]
    if (coefficient === undefined) continue
    const contribution = Number(coefficient) * Number(featureValue)
    const plainKey = key.replace(/^archetype:\d+\|/, '')
    const question = questionForFeature(plainKey) || (plainKey.includes('focus') ? 'match_current_focus' : null)
    if (!question) continue
    byQuestion.set(question, (byQuestion.get(question) || 0) + contribution)
  }
  return [...byQuestion.entries()]
    .map(([question, contribution]) => ({ question, contribution: round(contribution) }))
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
}

export function calculateDirectionalPersonalizedCompatibility(participantA, participantB) {
  const archetype = inferPersonalizedArchetype(participantA)
  const probabilities = archetype.memberships.map(item => item.probability)
  const features = scoreFeatures(participantA, participantB, probabilities)
  const rawUtility = Number(modelConfig.score.intercept) + dot(modelConfig.score.coefficients, features)
  const reference = modelConfig.calibration[String(archetype.primary.id)] || []
  const score = round(percentile(rawUtility, reference) * 100)
  const answered = modelConfig.schema.questions.filter(key => (
    answer(participantA, key) !== 'MISSING' && answer(participantB, key) !== 'MISSING'
  )).length
  const contributions = contributionSummary(features)

  return Object.freeze({
    sourceParticipantNumber: Number.isFinite(Number(participantA?.assigned_number))
      ? Number(participantA.assigned_number)
      : null,
    targetParticipantNumber: Number.isFinite(Number(participantB?.assigned_number))
      ? Number(participantB.assigned_number)
      : null,
    score,
    rawUtility: round(rawUtility),
    archetype: archetype.primary,
    archetypeMemberships: archetype.memberships,
    questionnaireCoverage: round(answered / modelConfig.schema.questions.length),
    strongestDrivers: Object.freeze(contributions.slice(0, 6).map(item => Object.freeze(item))),
  })
}

export function calculatePersonalizedCompatibility(participantA, participantB) {
  const aToB = calculateDirectionalPersonalizedCompatibility(participantA, participantB)
  const bToA = calculateDirectionalPersonalizedCompatibility(participantB, participantA)
  const totalScore = round(Math.sqrt(aToB.score * bToA.score))
  return Object.freeze({
    scoreModelVersion: PERSONALIZED_COMPATIBILITY_VERSION,
    totalScore,
    priorityScore: totalScore,
    aToB,
    bToA,
    calibration: 'event26-archetype-ranking-percentile',
    mutualFormula: 'geometric_mean',
  })
}

export function isPersonalizedCompatibilityPayload(value) {
  if (!value || value.scoreModelVersion !== PERSONALIZED_COMPATIBILITY_VERSION) return false
  const total = Number(value.totalScore)
  const a = Number(value.aToB?.score)
  const b = Number(value.bToA?.score)
  return Number.isFinite(total)
    && Number.isFinite(a)
    && Number.isFinite(b)
    && a >= 0 && a <= 100
    && b >= 0 && b <= 100
    && Math.abs(total - round(Math.sqrt(a * b))) <= 1e-6
}
