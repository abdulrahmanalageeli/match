import modelConfig from './connection-model-config.json' with { type: 'json' }

// Exact port of the trained Python `feature_dict(..., 'pair')` encoder. This
// module returns raw utility only; the calling product owns its display scale.
export const CONNECTION_COMPATIBILITY_VERSION = '2026-09-23-v14-shared-connection-75-25-min-100'
export const CONNECTION_MODEL_ARTIFACT_SHA256 = 'b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d'
export const CONNECTION_MODEL_INFO = Object.freeze({
  version: CONNECTION_COMPATIBILITY_VERSION,
  artifactSha256: CONNECTION_MODEL_ARTIFACT_SHA256,
  featureCount: modelConfig.feature_names.length,
  trainingCounts: Object.freeze({ ...modelConfig.training_counts }),
  scoreType: 'uncalibrated-utility',
})

const QUESTIONS = Object.freeze([
  'match_disagreement_style', 'match_similarity_preference', 'humor_banter_style',
  'early_openness_comfort', 'conversation_initiative_preference', 'expression_language',
  'minimum_partner_religious_commitment', 'social_relationship_style',
  'attachment_1', 'attachment_3', 'attachment_4',
  ...Array.from({ length: 5 }, (_, i) => `lifestyle_${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `core_values_${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `communication_${i + 1}`),
  'conversational_role', 'conversation_depth_pref', 'social_battery', 'humor_subtype',
  'curiosity_style', 'intent_goal', 'silence_comfort',
  ...Array.from({ length: 4 }, (_, i) => `mbti_${i + 1}`),
])
const ARABIC = Object.freeze({ 'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' })
const ALLOWED = new Set(['A', 'B', 'C', 'D', '0', '1', '2', '3', '4', '5'])
const FOCUS = new Set(['STUDY', 'CAREER', 'BUSINESS', 'FAMILY_SOCIAL', 'HEALTH_FITNESS',
  'CREATIVE', 'TRAVEL_EXPERIENCES', 'SELF_GROWTH', 'OTHER'])
export const CONNECTION_QUESTION_COUNT = QUESTIONS.length
export const CONNECTION_FOCUS_COUNT = FOCUS.size
const ORDINAL = Object.freeze({
  early_openness_comfort: { 0: 0, 1: 1 / 3, 2: 2 / 3, 3: 1 },
  expression_language: { 1: 0, 2: 1 / 4, 3: 1 / 2, 4: 3 / 4, 5: 1 },
  minimum_partner_religious_commitment: { 1: 0, 2: 1 / 3, 3: 2 / 3, 4: 1 },
  social_relationship_style: { 1: 0, 2: 1 / 3, 3: 2 / 3, 4: 1 },
  conversation_initiative_preference: { A: 0, B: .5, C: 1, D: .25 },
  conversational_role: { A: 1, B: .5, C: 0 },
  conversation_depth_pref: { A: 1, B: 0 },
  social_battery: { A: 1, B: 0 },
  silence_comfort: { A: 0, B: 1 },
  lifestyle_1: { A: 0, B: .5, C: 1 },
  lifestyle_2: { A: 1, B: .5, C: 0 },
  lifestyle_3: { A: 0, B: .5, C: 1 },
  lifestyle_4: { A: 1, B: .5, C: 0 },
  lifestyle_5: { A: 1, B: .5, C: 0 },
  core_values_1: { A: 0, B: .5, C: 1 },
  core_values_2: { A: 1, B: .5, C: 0 },
  core_values_3: { A: 1, B: .5, C: 0 },
  core_values_4: { A: 0, B: .5, C: 1 },
  core_values_5: { A: 1, B: .5, C: 0 },
})
const GROUPS = Object.freeze({
  lifestyle: QUESTIONS.filter(question => question.startsWith('lifestyle_')),
  values: QUESTIONS.filter(question => question.startsWith('core_values_')),
  interaction: ['humor_banter_style', 'humor_subtype', 'conversation_depth_pref',
    'social_battery', 'silence_comfort', 'curiosity_style'],
})
const PREPARED = new WeakMap()
const FEATURE_COUNT = modelConfig.feature_names.length
if (modelConfig.config?.model_config?.features !== 'pair'
  || FEATURE_COUNT !== 910
  || new Set(modelConfig.feature_names).size !== FEATURE_COUNT
  || modelConfig.scaler_scales.length !== FEATURE_COUNT
  || modelConfig.ridge_weights.length !== FEATURE_COUNT
  || !modelConfig.scaler_scales.every(value => Number.isFinite(value) && value > 0)
  || !modelConfig.ridge_weights.every(Number.isFinite)
  || !Number.isFinite(modelConfig.ridge_intercept)) {
  throw new Error('Invalid connection model artifact')
}

function surveyData(participant) {
  const value = participant?.survey_data
  if (!value) return {}
  if (typeof value !== 'string') return typeof value === 'object' ? value : {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== ''

function legacyAnswer(survey, key) {
  const lifestyle = /^lifestyle_([1-5])$/.exec(key)
  if (lifestyle && hasValue(survey?.lifestylePreferences)) {
    return String(survey.lifestylePreferences).split(',')[Number(lifestyle[1]) - 1]
  }
  const values = /^core_values_([1-5])$/.exec(key)
  if (values && hasValue(survey?.coreValues)) {
    return String(survey.coreValues).split(',')[Number(values[1]) - 1]
  }
  return undefined
}

function rawAnswer(participant, survey, key) {
  return [survey?.answers?.[key], survey?.[key], participant?.answers?.[key],
    participant?.[key], legacyAnswer(survey, key)].find(hasValue)
}

export function normalizeConnectionAnswer(value) {
  if (value === null || value === undefined || typeof value === 'object') return 'MISSING'
  const text = String(value).trim().toUpperCase()
  const normalized = ARABIC[text] || text
  return ALLOWED.has(normalized) ? normalized : 'MISSING'
}

function normalizedProfile(participant) {
  const survey = surveyData(participant)
  const answers = Object.fromEntries(QUESTIONS.map(question => [question,
    normalizeConnectionAnswer(rawAnswer(participant, survey, question))]))
  if ([1, 2, 3, 4].every(i => answers[`mbti_${i}`] === 'MISSING')) {
    const stored = String(participant?.mbti_personality_type || participant?.mbti_type
      || survey?.mbti_personality_type || survey?.mbti_type || survey?.mbtiType || '').toUpperCase()
    if (/^[EI][SN][TF][JP]$/.test(stored)) {
      for (const [index, poles] of ['EI', 'SN', 'TF', 'JP'].entries()) {
        answers[`mbti_${index + 1}`] = stored[index] === poles[0] ? 'A' : 'B'
      }
    }
  }
  let rawFocus = rawAnswer(participant, survey, 'match_current_focus') || []
  if (typeof rawFocus === 'string') rawFocus = rawFocus.split(',')
  else if (rawFocus instanceof Set) rawFocus = [...rawFocus]
  else if (!Array.isArray(rawFocus)) rawFocus = typeof rawFocus === 'object' ? Object.keys(rawFocus) : []
  const focus = [...new Set(rawFocus.map(value => String(value).trim().toUpperCase())
    .filter(value => FOCUS.has(value)))].sort()
  return { answers, focus, fingerprint: JSON.stringify([answers, focus]) }
}

/** Includes every effective encoder input, including MBTI and stored fallback. */
export function connectionProfileFingerprint(participant) {
  return normalizedProfile(participant).fingerprint
}

function dimensions(answers) {
  const result = {}
  for (const [question, mapping] of Object.entries(ORDINAL)) {
    const value = mapping[answers[question]]
    result[question] = value === undefined ? [0, 0] : [value - .5, 1]
  }
  for (const [block, indexes] of [['attachment', [1, 3, 4]], ['communication', [1, 2, 3, 4, 5]]]) {
    const observed = indexes.map(i => answers[`${block}_${i}`]).filter(value => value !== 'MISSING')
    for (const option of 'ABCD') {
      result[`${block}_fraction_${option}`] = [observed.length
        ? observed.filter(value => value === option).length / observed.length - .25 : 0,
      Number(observed.length > 0)]
    }
  }
  return result
}

function preparedParticipant(participant) {
  const profile = normalizedProfile(participant)
  const cacheable = participant && typeof participant === 'object'
  const prior = cacheable ? PREPARED.get(participant) : undefined
  if (prior?.fingerprint === profile.fingerprint) return prior
  const prepared = { ...profile, axes: dimensions(profile.answers), focusSet: new Set(profile.focus),
    answered: QUESTIONS.filter(question => profile.answers[question] !== 'MISSING').length }
  if (cacheable) PREPARED.set(participant, prepared)
  return prepared
}

export function prepareConnectionParticipant(participant) {
  preparedParticipant(participant)
  return participant
}

export function prepareConnectionParticipants(participants) {
  for (const participant of participants || []) prepareConnectionParticipant(participant)
  return participants
}
export const prepareParticipants = prepareConnectionParticipants

function pairFeatures(a, b) {
  const features = { bias: 1 }
  for (const question of QUESTIONS) {
    const av = a.answers[question]
    const bv = b.answers[question]
    const both = av !== 'MISSING' && bv !== 'MISSING'
    features[`target|${question}|${bv}`] = 1
    features[`source|${question}|${av}`] = 1
    features[`same|${question}`] = Number(both && av === bv)
    features[`known|${question}`] = Number(both)
    features[`pair|${question}|${av}>${bv}`] = 1
  }
  for (const value of b.focus) features[`target_focus|${value}`] = 1
  const common = a.focus.filter(value => b.focusSet.has(value))
  const union = new Set([...a.focus, ...b.focus])
  features.focus_jaccard = union.size ? common.length / union.size : 0
  features.focus_both_known = Number(Boolean(a.focus.length && b.focus.length))
  for (const value of common) features[`shared_focus|${value}`] = 1
  for (const value of a.focus) features[`source_focus|${value}`] = 1
  for (const key of Object.keys(a.axes)) {
    const [av, ak] = a.axes[key]
    const [bv, bk] = b.axes[key]
    features[`axis_target|${key}`] = bv
    features[`axis_source|${key}`] = av
    features[`axis_difference|${key}`] = Math.abs(av - bv) * ak * bk
    features[`axis_product|${key}`] = av * bv * ak * bk
    features[`axis_known|${key}`] = ak * bk
  }
  for (const [name, questions] of Object.entries(GROUPS)) {
    const observed = questions.filter(question => a.answers[question] !== 'MISSING' && b.answers[question] !== 'MISSING')
    const similarity = observed.length
      ? observed.filter(question => a.answers[question] === b.answers[question]).length / observed.length : 0
    features[`group_similarity|${name}`] = similarity
    for (const preference of 'ABCD') {
      features[`preference_${preference}|${name}`] = similarity * Number(a.answers.match_similarity_preference === preference)
    }
  }
  const [av, ak] = a.axes.conversation_initiative_preference
  const [bv, bk] = b.axes.conversation_initiative_preference
  features.initiative_balance = (1 - Math.abs(av + bv)) * ak * bk
  for (const [source, target] of [['core_values_4', 'lifestyle_2'], ['lifestyle_3', 'lifestyle_2'],
    ['conversation_depth_pref', 'early_openness_comfort']]) {
    const [aValue, aKnown] = a.axes[source]
    const [bValue, bKnown] = b.axes[target]
    features[`need_supply|${source}>${target}`] = (1 - Math.abs(aValue - bValue)) * aKnown * bKnown
  }
  return features
}

/** Exposed for reproducible Python feature-parity verification. */
export function connectionPairFeatures(source, target) {
  return pairFeatures(preparedParticipant(source), preparedParticipant(target))
}

function rawScore(features) {
  // Compensated accumulation matches Python math.fsum to floating precision.
  let total = 0
  let correction = 0
  for (let i = 0; i < FEATURE_COUNT; i += 1) {
    const value = (features[modelConfig.feature_names[i]] || 0)
      * modelConfig.ridge_weights[i] / modelConfig.scaler_scales[i]
    const next = total + value
    correction += Math.abs(total) >= Math.abs(value) ? (total - next) + value : (value - next) + total
    total = next
  }
  return modelConfig.ridge_intercept + (total + correction)
}

export function rawConnectionScore(source, target) {
  return rawScore(connectionPairFeatures(source, target))
}

export function scoreConnectionPair(participantA, participantB) {
  const a = preparedParticipant(participantA)
  const b = preparedParticipant(participantB)
  const rawAToB = rawScore(pairFeatures(a, b))
  const rawBToA = rawScore(pairFeatures(b, a))
  return {
    version: CONNECTION_COMPATIBILITY_VERSION,
    scoreType: 'uncalibrated-utility',
    rawAToB,
    rawBToA,
    rawMutual: Math.min(rawAToB, rawBToA),
    evidence: {
      aAnswered: a.answered,
      bAnswered: b.answered,
      bothAnswered: QUESTIONS.filter(question => a.answers[question] !== 'MISSING' && b.answers[question] !== 'MISSING').length,
      questionCount: QUESTIONS.length,
      aFocusCount: a.focus.length,
      bFocusCount: b.focus.length,
      sharedFocusCount: a.focus.filter(value => b.focusSet.has(value)).length,
    },
  }
}
