import { createHash } from 'node:crypto'
import {
  PERSONALIZED_COMPATIBILITY_VERSION,
  calculatePersonalizedCompatibility,
  isPersonalizedCompatibilityPayload,
} from './personalized-compatibility.mjs'

// v11 uses Event 26 ranking evidence to score each direction through the
// chooser's inferred taste archetype. The legacy 100-point components remain
// in the payload as explainable diagnostics, not as the final percentage.
export const BALANCED_COMPATIBILITY_VERSION = PERSONALIZED_COMPATIBILITY_VERSION
export const OPPOSITES_COMPATIBILITY_VERSION = `${BALANCED_COMPATIBILITY_VERSION}|opposites-flip-v1`
export const BALANCED_VIBE_VERSION = 'balanced-vibe12-v1'
export const BALANCED_VIBE_MODEL = 'gpt-5.4-mini'
export const BALANCED_VIBE_MODEL_TAG = `${BALANCED_VIBE_MODEL}|${BALANCED_VIBE_VERSION}`
export const BALANCED_VIBE_MAX = 12

const sha256 = value => createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex')

function deepFreezeJson(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreezeJson)
  return Object.freeze(value)
}

export const BALANCED_WEIGHTS = Object.freeze({
  disagreement: 5,
  similarityPreference: 2,
  currentFocus: 4,
  humorBanter: 6,
  earlyOpenness: 4,
  initiative: 6,
  expressionLanguage: 4,
  religion: 4,
  socialStyle: 4,
  attachment1: 2,
  attachment3: 3,
  attachment4: 3,
  lifestyle1: 2,
  lifestyle2: 3,
  lifestyle3: 3,
  lifestyle4: 2,
  lifestyle5: 2,
  core1: 1,
  core2: 1,
  core3: 0,
  core4: 2,
  core5: 1,
  communication1: 1,
  communication2: 1,
  communication3: 1,
  communication4: 1,
  communication5: 1,
  conversationDepth: 3,
  socialBattery: 2,
  humorSubtype: 3,
  curiosityStyle: 4,
  intent: 5,
  silence: 2,
  vibe: BALANCED_VIBE_MAX,
})

export const BALANCED_VIBE_AXES = Object.freeze({
  current_curiosity: Object.freeze({ maximum: 5, neutral: 2.5 }),
  hobbies: Object.freeze({ maximum: 3, neutral: 1.5 }),
  music: Object.freeze({ maximum: 1, neutral: 0.5 }),
  friend_description: Object.freeze({ maximum: 3, neutral: 1.5 }),
})

const WEIGHT_TOTAL = Object.values(BALANCED_WEIGHTS).reduce((sum, value) => sum + value, 0)
if (WEIGHT_TOTAL !== 100) {
  throw new Error(`Balanced compatibility weights must total 100; received ${WEIGHT_TOTAL}`)
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const finite = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const round = (value, places = 6) => {
  const multiplier = 10 ** places
  return Math.round((finite(value) + Number.EPSILON) * multiplier) / multiplier
}

function parseSurveyData(participant) {
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

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function legacySequenceAnswer(surveyData, key) {
  const lifestyleMatch = /^lifestyle_([1-5])$/.exec(key)
  if (lifestyleMatch && hasValue(surveyData?.lifestylePreferences)) {
    return String(surveyData.lifestylePreferences).split(',')[Number(lifestyleMatch[1]) - 1]
  }
  const coreMatch = /^core_values_([1-5])$/.exec(key)
  if (coreMatch && hasValue(surveyData?.coreValues)) {
    return String(surveyData.coreValues).split(',')[Number(coreMatch[1]) - 1]
  }
  return undefined
}

export function getBalancedAnswer(participant, key) {
  const surveyData = parseSurveyData(participant)
  const candidates = [
    surveyData?.answers?.[key],
    surveyData?.[key],
    participant?.[key],
    legacySequenceAnswer(surveyData, key),
  ]
  return candidates.find(hasValue) ?? null
}

const ARABIC_TO_LATIN = Object.freeze({
  'أ': 'A',
  'ا': 'A',
  'ب': 'B',
  'ج': 'C',
  'د': 'D',
})

export function normalizeBalancedChoice(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return ARABIC_TO_LATIN[normalized] || normalized
}

function matrixFit(participantA, participantB, key, matrix, neutral = 0.5) {
  const a = normalizeBalancedChoice(getBalancedAnswer(participantA, key))
  const b = normalizeBalancedChoice(getBalancedAnswer(participantB, key))
  return matrix[a]?.[b] ?? neutral
}

function weightedFit(fit, weight) {
  return round(clamp(finite(fit, 0.5), 0, 1) * weight)
}

const DISAGREEMENT_MATRIX = Object.freeze({
  A: Object.freeze({ A: 1, B: 0.75, C: 0.5, D: 0 }),
  B: Object.freeze({ A: 0.75, B: 1, C: 0.75, D: 0.75 }),
  C: Object.freeze({ A: 0.5, B: 0.75, C: 1, D: 0.75 }),
  D: Object.freeze({ A: 0, B: 0.75, C: 0.75, D: 1 }),
})

const HUMOR_BANTER_MATRIX = Object.freeze({
  A: Object.freeze({ A: 1, B: 0.8, C: 0.55, D: 0.25 }),
  B: Object.freeze({ A: 0.8, B: 1, C: 0.8, D: 0.6 }),
  C: Object.freeze({ A: 0.55, B: 0.8, C: 1, D: 0.8 }),
  D: Object.freeze({ A: 0.25, B: 0.6, C: 0.8, D: 1 }),
})

const INITIATIVE_MATRIX = Object.freeze({
  A: Object.freeze({ A: 0.25, B: 0.75, C: 1, D: 0.9 }),
  B: Object.freeze({ A: 0.75, B: 1, C: 0.75, D: 0.9 }),
  C: Object.freeze({ A: 1, B: 0.75, C: 0.45, D: 0.9 }),
  D: Object.freeze({ A: 0.9, B: 0.9, C: 0.9, D: 0.85 }),
})

const ROLE_FALLBACK_MATRIX = Object.freeze({
  A: Object.freeze({ A: 0.75, B: 1, C: 1 }),
  B: Object.freeze({ A: 1, B: 0.75, C: 0.65 }),
  C: Object.freeze({ A: 1, B: 0.65, C: 0.4 }),
})

const LANGUAGE_MATRIX = Object.freeze({
  1: Object.freeze({ 1: 1, 2: 0.9, 3: 0.75, 4: 0.45, 5: 0 }),
  2: Object.freeze({ 1: 0.9, 2: 1, 3: 0.9, 4: 0.7, 5: 0.35 }),
  3: Object.freeze({ 1: 0.75, 2: 0.9, 3: 1, 4: 0.9, 5: 0.75 }),
  4: Object.freeze({ 1: 0.45, 2: 0.7, 3: 0.9, 4: 1, 5: 0.9 }),
  5: Object.freeze({ 1: 0, 2: 0.35, 3: 0.75, 4: 0.9, 5: 1 }),
})

const RELIGION_MATRIX = Object.freeze({
  1: Object.freeze({ 1: 1, 2: 0.7, 3: 0.25, 4: 0.1 }),
  2: Object.freeze({ 1: 0.7, 2: 1, 3: 0.65, 4: 0.4 }),
  3: Object.freeze({ 1: 0.25, 2: 0.65, 3: 1, 4: 0.8 }),
  4: Object.freeze({ 1: 0.1, 2: 0.4, 3: 0.8, 4: 1 }),
})

const ATTACHMENT_MATRIX = Object.freeze({
  A: Object.freeze({ A: 1, B: 0.85, C: 0.85, D: 0.75 }),
  B: Object.freeze({ A: 0.85, B: 0.65, C: 0.2, D: 0.45 }),
  C: Object.freeze({ A: 0.85, B: 0.2, C: 0.85, D: 0.55 }),
  D: Object.freeze({ A: 0.75, B: 0.45, C: 0.55, D: 0.4 }),
})

const COMMUNICATION_MATRIX = Object.freeze({
  A: Object.freeze({ A: 1, B: 0.75, C: 0.35, D: 0.55 }),
  B: Object.freeze({ A: 0.75, B: 0.6, C: 0.25, D: 0.45 }),
  C: Object.freeze({ A: 0.35, B: 0.25, C: 0.1, D: 0.15 }),
  D: Object.freeze({ A: 0.55, B: 0.45, C: 0.15, D: 0.3 }),
})

const CURIOSITY_MATRIX = Object.freeze({
  A: Object.freeze({ A: 0.6, B: 1, C: 0.55 }),
  B: Object.freeze({ A: 1, B: 0.6, C: 0.55 }),
  C: Object.freeze({ A: 0.55, B: 0.55, C: 1 }),
})

const INTENT_MATRIX = Object.freeze({
  A: Object.freeze({ A: 1, B: 0.75, C: 0.65 }),
  B: Object.freeze({ A: 0.75, B: 1, C: 0.45 }),
  C: Object.freeze({ A: 0.65, B: 0.45, C: 1 }),
})

const LIFESTYLE_MATRICES = Object.freeze({
  lifestyle_1: Object.freeze({ same: 1, adjacent: 0.65, opposite: 0.25 }),
  lifestyle_2: Object.freeze({ same: 1, adjacent: 0.55, opposite: 0 }),
  lifestyle_3: Object.freeze({
    A: Object.freeze({ A: 1, B: 0.85, C: 0.25 }),
    B: Object.freeze({ A: 0.85, B: 1, C: 0.35 }),
    C: Object.freeze({ A: 0.25, B: 0.35, C: 1 }),
  }),
  lifestyle_4: Object.freeze({ same: 1, adjacent: 0.65, opposite: 0.2 }),
  lifestyle_5: Object.freeze({ same: 1, adjacent: 0.65, opposite: 0.25 }),
})

const CORE_MATRICES = Object.freeze({
  core_values_1: Object.freeze({ same: 1, adjacent: 0.65, opposite: 0.25 }),
  core_values_2: Object.freeze({ same: 1, adjacent: 0.7, opposite: 0.35 }),
  core_values_4: Object.freeze({ same: 1, adjacent: 0.55, opposite: 0.1 }),
  core_values_5: Object.freeze({ same: 1, adjacent: 0.55, opposite: 0.1 }),
})

function ordinalFit(participantA, participantB, key, { same, adjacent, opposite }, neutral = 0.5) {
  const order = { A: 1, B: 2, C: 3 }
  const a = order[normalizeBalancedChoice(getBalancedAnswer(participantA, key))]
  const b = order[normalizeBalancedChoice(getBalancedAnswer(participantB, key))]
  if (!a || !b) return neutral
  const distance = Math.abs(a - b)
  return distance === 0 ? same : distance === 1 ? adjacent : opposite
}

function socialStyleFit(participantA, participantB) {
  const a = Number(getBalancedAnswer(participantA, 'social_relationship_style'))
  const b = Number(getBalancedAnswer(participantB, 'social_relationship_style'))
  if (![1, 2, 3, 4].includes(a) || ![1, 2, 3, 4].includes(b)) return 0.5
  const distance = Math.abs(a - b)
  return [1, 0.75, 0.35, 0.1][distance]
}

function opennessFit(participantA, participantB) {
  const rawA = getBalancedAnswer(participantA, 'early_openness_comfort')
  const rawB = getBalancedAnswer(participantB, 'early_openness_comfort')
  const a = rawA === null ? Number.NaN : Number(rawA)
  const b = rawB === null ? Number.NaN : Number(rawB)
  if (![0, 1, 2, 3].includes(a) || ![0, 1, 2, 3].includes(b)) return 0.5
  return [1, 0.75, 0.4, 0.15][Math.abs(a - b)]
}

function normalizeFocus(value) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(source.map(item => String(item).trim()).filter(Boolean))].slice(0, 2)
}

function focusFit(participantA, participantB) {
  const a = normalizeFocus(getBalancedAnswer(participantA, 'match_current_focus'))
  const b = normalizeFocus(getBalancedAnswer(participantB, 'match_current_focus'))
  if (!a.length || !b.length) return 0.5
  // A generic "other" selection is not shared subject matter without matching text.
  const meaningfulA = a.filter(value => value !== 'other')
  const meaningfulB = b.filter(value => value !== 'other')
  const overlap = meaningfulA.filter(value => meaningfulB.includes(value)).length
  return overlap >= 2 ? 1 : overlap === 1 ? 0.75 : 0.35
}

function focusSimilarity(participantA, participantB) {
  const a = normalizeFocus(getBalancedAnswer(participantA, 'match_current_focus')).filter(value => value !== 'other')
  const b = normalizeFocus(getBalancedAnswer(participantB, 'match_current_focus')).filter(value => value !== 'other')
  if (!a.length || !b.length) return 0.5
  const union = new Set([...a, ...b])
  const intersection = a.filter(value => b.includes(value)).length
  return union.size ? intersection / union.size : 0.5
}

function depthAnswer(participant) {
  const current = normalizeBalancedChoice(getBalancedAnswer(participant, 'conversation_depth_pref'))
  if (['A', 'B'].includes(current)) return current
  const legacy = String(getBalancedAnswer(participant, 'vibe_4') ?? '').trim().toLowerCase()
  if (['نعم', 'yes', 'true'].includes(legacy)) return 'A'
  if (['لا', 'no', 'false'].includes(legacy)) return 'B'
  if (legacy) return 'FLEX'
  return ''
}

function depthFit(participantA, participantB) {
  const a = depthAnswer(participantA)
  const b = depthAnswer(participantB)
  if (!a || !b) return 0.5
  if (a === b) return 1
  if (a === 'FLEX' || b === 'FLEX') return 0.75
  return 0.35
}

function batteryFit(participantA, participantB) {
  const a = normalizeBalancedChoice(getBalancedAnswer(participantA, 'social_battery'))
  const b = normalizeBalancedChoice(getBalancedAnswer(participantB, 'social_battery'))
  if (!['A', 'B'].includes(a) || !['A', 'B'].includes(b)) return 0.5
  return a === b ? 1 : 0.75
}

function humorSubtypeFit(participantA, participantB) {
  const a = normalizeBalancedChoice(getBalancedAnswer(participantA, 'humor_subtype'))
  const b = normalizeBalancedChoice(getBalancedAnswer(participantB, 'humor_subtype'))
  if (!['A', 'B', 'C'].includes(a) || !['A', 'B', 'C'].includes(b)) return 0.5
  if (a === b) return 1
  return new Set([a, b]).has('C') ? 0.55 : 0.75
}

function silenceFit(participantA, participantB) {
  const a = normalizeBalancedChoice(getBalancedAnswer(participantA, 'silence_comfort'))
  const b = normalizeBalancedChoice(getBalancedAnswer(participantB, 'silence_comfort'))
  if (!['A', 'B'].includes(a) || !['A', 'B'].includes(b)) return 0.5
  return a === b ? 1 : 0.6
}

function initiativeFit(participantA, participantB) {
  const a = normalizeBalancedChoice(getBalancedAnswer(participantA, 'conversation_initiative_preference'))
  const b = normalizeBalancedChoice(getBalancedAnswer(participantB, 'conversation_initiative_preference'))
  if (INITIATIVE_MATRIX[a]?.[b] !== undefined) {
    return { fit: INITIATIVE_MATRIX[a][b], source: 'conversation_initiative_preference' }
  }
  return {
    fit: matrixFit(participantA, participantB, 'conversational_role', ROLE_FALLBACK_MATRIX),
    source: 'conversational_role_fallback',
  }
}

function average(values, fallback = 0.5) {
  const valid = values.filter(value => Number.isFinite(Number(value))).map(Number)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : fallback
}

function similarityPreferenceFit(participantA, participantB) {
  const interestSimilarity = focusSimilarity(participantA, participantB)
  const lifestyleSimilarity = average([
    ordinalFit(participantA, participantB, 'lifestyle_1', LIFESTYLE_MATRICES.lifestyle_1),
    ordinalFit(participantA, participantB, 'lifestyle_2', LIFESTYLE_MATRICES.lifestyle_2),
    matrixFit(participantA, participantB, 'lifestyle_3', LIFESTYLE_MATRICES.lifestyle_3),
    ordinalFit(participantA, participantB, 'lifestyle_4', LIFESTYLE_MATRICES.lifestyle_4),
    ordinalFit(participantA, participantB, 'lifestyle_5', LIFESTYLE_MATRICES.lifestyle_5),
  ])
  const valuesSimilarity = average([
    matrixFit(participantA, participantB, 'minimum_partner_religious_commitment', RELIGION_MATRIX),
    socialStyleFit(participantA, participantB),
    ordinalFit(participantA, participantB, 'core_values_1', CORE_MATRICES.core_values_1),
    ordinalFit(participantA, participantB, 'core_values_2', CORE_MATRICES.core_values_2),
    ordinalFit(participantA, participantB, 'core_values_4', CORE_MATRICES.core_values_4),
    ordinalFit(participantA, participantB, 'core_values_5', CORE_MATRICES.core_values_5),
  ])
  const interactionRhythm = average([
    depthFit(participantA, participantB),
    batteryFit(participantA, participantB),
    humorSubtypeFit(participantA, participantB),
    silenceFit(participantA, participantB),
  ])
  const subjectAndLifestyleSimilarity = average([interestSimilarity, lifestyleSimilarity])
  const satisfaction = (participant) => {
    switch (normalizeBalancedChoice(getBalancedAnswer(participant, 'match_similarity_preference'))) {
      case 'A': return subjectAndLifestyleSimilarity
      case 'B': return 1 - subjectAndLifestyleSimilarity
      case 'C': return (0.7 * valuesSimilarity) + (0.3 * (1 - lifestyleSimilarity))
      case 'D': return interactionRhythm
      default: return 0.5
    }
  }
  return {
    fit: average([satisfaction(participantA), satisfaction(participantB)], 0.5),
    observed: {
      interestSimilarity: round(interestSimilarity),
      lifestyleSimilarity: round(lifestyleSimilarity),
      valuesSimilarity: round(valuesSimilarity),
      interactionRhythm: round(interactionRhythm),
    },
  }
}

function labeledLegacyVibe(participant) {
  const surveyData = parseSurveyData(participant)
  const description = String(surveyData?.vibeDescription ?? '').trim()
  if (!description) return {}
  const parsed = {}
  for (const part of description.split('|')) {
    const separator = part.indexOf(':')
    if (separator < 0) continue
    parsed[part.slice(0, separator).trim().toLowerCase()] = part.slice(separator + 1).trim()
  }
  return parsed
}

function normalizedText(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).join(', ')
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function buildBalancedVibeProfile(participant) {
  const legacy = labeledLegacyVibe(participant)
  const value = (key, fallbackLabel) => {
    const direct = normalizedText(getBalancedAnswer(participant, key))
    return direct || normalizedText(legacy[fallbackLabel])
  }
  return Object.freeze({
    current_curiosity: value('match_current_curiosity', 'current curiosity'),
    hobbies: value('vibe_2', 'hobbies'),
    music: value('vibe_3', 'music'),
    friend_description: value('vibe_5', 'friends describe me'),
  })
}

export function canonicalBalancedVibePair(participantA, participantB) {
  const profiles = [buildBalancedVibeProfile(participantA), buildBalancedVibeProfile(participantB)]
    .map(profile => JSON.stringify(profile))
    .sort()
  return profiles.map(profile => JSON.parse(profile))
}

export function createNeutralVibeAxes(reason = null) {
  return Object.fromEntries(Object.entries(BALANCED_VIBE_AXES).map(([key, config]) => [key, {
    rawScore: config.neutral,
    confidence: 0,
    score: config.neutral,
    evidence: '',
    ...(reason ? { reason } : {}),
  }]))
}

export function normalizeBalancedVibeAxes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AI vibe response must be an object')
  }
  const expectedKeys = Object.keys(BALANCED_VIBE_AXES)
  const actualKeys = Object.keys(input)
  if (actualKeys.some(key => !expectedKeys.includes(key)) || expectedKeys.some(key => !(key in input))) {
    throw new Error('AI vibe response contains missing or unexpected axes')
  }
  const axes = {}
  for (const [key, config] of Object.entries(BALANCED_VIBE_AXES)) {
    const axis = input[key]
    if (!axis || typeof axis !== 'object' || Array.isArray(axis)) throw new Error(`Invalid ${key} axis`)
    const rawScore = Number(axis.score)
    const confidence = Number(axis.confidence)
    if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > config.maximum) {
      throw new Error(`Invalid ${key} score`)
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`Invalid ${key} confidence`)
    }
    const adjusted = (confidence * rawScore) + ((1 - confidence) * config.neutral)
    axes[key] = {
      rawScore: round(rawScore, 3),
      confidence: round(confidence, 3),
      score: round(adjusted, 3),
      evidence: normalizedText(axis.evidence).slice(0, 180),
    }
  }
  return axes
}

export function calculateBalancedVibeScore(vibeAxes) {
  const axes = vibeAxes || createNeutralVibeAxes()
  return round(Object.entries(BALANCED_VIBE_AXES).reduce((sum, [key, config]) => {
    return sum + clamp(finite(axes?.[key]?.score, config.neutral), 0, config.maximum)
  }, 0), 3)
}

export function encodeBalancedVibeModelUsed({ vibeAxes = null, fallbackReason = null } = {}) {
  const axes = vibeAxes || createNeutralVibeAxes(fallbackReason)
  const axisCode = [
    ['c', 'current_curiosity'],
    ['h', 'hobbies'],
    ['m', 'music'],
    ['f', 'friend_description'],
  ].map(([short, key]) => `${short}=${round(axes?.[key]?.score, 3)}`).join(',')
  return [BALANCED_VIBE_MODEL_TAG, axisCode, fallbackReason ? `fallback=${fallbackReason}` : '']
    .filter(Boolean)
    .join('|')
}

export function decodeBalancedVibeModelUsed(modelUsed) {
  const value = String(modelUsed ?? '')
  if (!isBalancedVibeModelUsed(value)) return null
  const encoded = value.split('|').find(part => /^c=/.test(part))
  if (!encoded) return null
  const values = Object.fromEntries(encoded.split(',').map(part => part.split('=')))
  const axes = createNeutralVibeAxes()
  for (const [short, key] of [['c', 'current_curiosity'], ['h', 'hobbies'], ['m', 'music'], ['f', 'friend_description']]) {
    const parsed = Number(values[short])
    if (Number.isFinite(parsed)) axes[key] = { ...axes[key], rawScore: parsed, confidence: 1, score: parsed }
  }
  return axes
}

export function isBalancedVibeModelUsed(modelUsed) {
  const value = String(modelUsed ?? '')
  return value === BALANCED_VIBE_MODEL_TAG || value.startsWith(`${BALANCED_VIBE_MODEL_TAG}|`)
}

const BALANCED_CACHE_KEYS = Object.freeze([
  'match_disagreement_style',
  'match_similarity_preference',
  'match_current_focus',
  'humor_banter_style',
  'early_openness_comfort',
  'conversation_initiative_preference',
  'expression_language',
  'minimum_partner_religious_commitment',
  'social_relationship_style',
  'attachment_1', 'attachment_3', 'attachment_4',
  'lifestyle_1', 'lifestyle_2', 'lifestyle_3', 'lifestyle_4', 'lifestyle_5',
  'core_values_1', 'core_values_2', 'core_values_3', 'core_values_4', 'core_values_5',
  'communication_1', 'communication_2', 'communication_3', 'communication_4', 'communication_5',
  'conversational_role', 'conversation_depth_pref', 'vibe_4', 'social_battery',
  'humor_subtype', 'curiosity_style', 'intent_goal', 'silence_comfort',
])

export function getBalancedCacheContent(participant) {
  const answers = BALANCED_CACHE_KEYS.map(key => {
    const value = getBalancedAnswer(participant, key)
    const canonical = Array.isArray(value)
      ? [...value].map(item => String(item)).sort().join(',')
      : normalizedText(value)
    return `${key}:${canonical}`
  })
  return [...answers, `vibe:${JSON.stringify(buildBalancedVibeProfile(participant))}`].join('|')
}

/**
 * Build the one canonical identity used for every balanced-cache read/write.
 * The participant slots are ordered by assigned number (and then content when
 * numbers are absent/equal), so swapping the arguments cannot change a hash.
 */
export function buildBalancedCacheIdentity(participantA, participantB) {
  const entries = [participantA, participantB].map(participant => {
    const parsedNumber = Number(participant?.assigned_number)
    return {
      participant,
      number: Number.isFinite(parsedNumber) ? parsedNumber : null,
      content: getBalancedCacheContent(participant),
    }
  }).sort((left, right) => {
    if (left.number !== null && right.number !== null && left.number !== right.number) {
      return left.number - right.number
    }
    if (left.number !== null && right.number === null) return -1
    if (left.number === null && right.number !== null) return 1
    return left.content.localeCompare(right.content)
  })

  const canonicalPayload = JSON.stringify({
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    vibeModelTag: BALANCED_VIBE_MODEL_TAG,
    participants: entries.map(entry => entry.content),
  })
  const vibePayload = JSON.stringify({
    vibeModelTag: BALANCED_VIBE_MODEL_TAG,
    profiles: canonicalBalancedVibePair(participantA, participantB),
  })

  return Object.freeze({
    participantANumber: entries[0].number,
    participantBNumber: entries[1].number,
    participantAContentHash: sha256(entries[0].content),
    participantBContentHash: sha256(entries[1].content),
    vibeContentHash: sha256(vibePayload),
    combinedContentHash: sha256(canonicalPayload),
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    vibeModelTag: BALANCED_VIBE_MODEL_TAG,
  })
}

/** A complete, event-time score payload. It is safe to JSON-serialize as-is. */
export function buildBalancedScoreSnapshot(result, { combinedContentHash = null } = {}) {
  const clone = value => JSON.parse(JSON.stringify(value ?? {}))
  const total = Number(result?.totalScore)
  const snapshot = {
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    scoreMaximum: 100,
    totalScore: Number.isFinite(total) ? total : null,
    scoreBreakdown: clone(result?.scoreBreakdown),
    questionScores: clone(result?.questionScores),
    vibeAxes: clone(result?.vibeAxes),
    vibeMaximum: BALANCED_VIBE_MAX,
    vibeModel: BALANCED_VIBE_MODEL,
    vibeModelVersion: BALANCED_VIBE_VERSION,
    vibeModelTag: BALANCED_VIBE_MODEL_TAG,
    aiVibeFallbackReason: result?.aiVibeFallbackReason || null,
    combinedContentHash: combinedContentHash || null,
  }
  return deepFreezeJson(snapshot)
}

const BALANCED_BREAKDOWN_QUESTION_GROUPS = Object.freeze({
  sharedContext: Object.freeze(['currentFocus', 'similarityPreference']),
  interactionRhythm: Object.freeze(['initiative', 'conversationDepth', 'socialBattery', 'humorSubtype', 'curiosityStyle', 'silence']),
  humorOpenness: Object.freeze(['humorBanter', 'earlyOpenness']),
  attachmentComfort: Object.freeze(['attachment1', 'attachment3', 'attachment4']),
  lifestyleSustainability: Object.freeze(['lifestyle1', 'lifestyle2', 'lifestyle3', 'lifestyle4', 'lifestyle5']),
  valuesBoundaries: Object.freeze(['core1', 'core2', 'core3', 'core4', 'core5', 'religion', 'socialStyle']),
  communicationDisagreement: Object.freeze(['communication1', 'communication2', 'communication3', 'communication4', 'communication5', 'disagreement']),
})

function parseJsonObject(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return isPlainJsonObject(value) ? value : null
}

function nearlyEqual(left, right, tolerance = 1e-6) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= tolerance
}

/**
 * Hydrate a complete balanced result from an exact, versioned cache row.
 * Returns null when any persisted component is missing or inconsistent so the
 * caller can safely recalculate and repair that row instead.
 */
export function hydrateBalancedCompatibilityFromCacheRow(cacheRow) {
  if (cacheRow?.score_model_version !== BALANCED_COMPATIBILITY_VERSION) return null
  if (cacheRow?.vibe_model_version !== BALANCED_VIBE_VERSION) return null
  if (!isBalancedVibeModelUsed(cacheRow?.model_used)) return null

  const questionScores = parseJsonObject(cacheRow?.question_scores)
  const scoreBreakdown = parseJsonObject(cacheRow?.score_breakdown)
  const vibeAxes = parseJsonObject(cacheRow?.vibe_axes)
  if (!questionScores || !scoreBreakdown || !vibeAxes) return null

  for (const [key, maximum] of Object.entries(BALANCED_WEIGHTS)) {
    const value = Number(questionScores[key])
    if (!Number.isFinite(value) || value < 0 || value > maximum) return null
  }
  for (const [key, definition] of Object.entries(BALANCED_VIBE_AXES)) {
    const axis = vibeAxes[key]
    const score = Number(axis?.score)
    if (!isPlainJsonObject(axis) || !Number.isFinite(score) || score < 0 || score > definition.maximum) return null
  }

  const questionSum = keys => round(keys.reduce((total, key) => total + Number(questionScores[key]), 0))
  const expectedBreakdown = {
    aiSemantic: Number(questionScores.vibe),
    sharedContext: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.sharedContext),
    interactionRhythm: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.interactionRhythm),
    humorOpenness: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.humorOpenness),
    attachmentComfort: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.attachmentComfort),
    lifestyleSustainability: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.lifestyleSustainability),
    valuesBoundaries: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.valuesBoundaries),
    language: Number(questionScores.expressionLanguage),
    communicationDisagreement: questionSum(BALANCED_BREAKDOWN_QUESTION_GROUPS.communicationDisagreement),
    intent: Number(questionScores.intent),
  }
  expectedBreakdown.semanticCommonGround = round(expectedBreakdown.aiSemantic + expectedBreakdown.sharedContext)

  for (const [key, expected] of Object.entries(expectedBreakdown)) {
    if (!nearlyEqual(scoreBreakdown[key], expected)) return null
  }

  const diagnosticComponentTotal = round([
    expectedBreakdown.semanticCommonGround,
    expectedBreakdown.interactionRhythm,
    expectedBreakdown.humorOpenness,
    expectedBreakdown.attachmentComfort,
    expectedBreakdown.lifestyleSustainability,
    expectedBreakdown.valuesBoundaries,
    expectedBreakdown.communicationDisagreement,
    expectedBreakdown.intent,
    expectedBreakdown.language,
  ].reduce((total, value) => total + value, 0))
  const personalized = parseJsonObject(scoreBreakdown.personalized)
  if (!isPersonalizedCompatibilityPayload(personalized)) return null
  const totalScore = Number(personalized.totalScore)

  const persistedColumns = {
    total_compatibility_score: totalScore,
    ai_vibe_score: expectedBreakdown.aiSemantic,
    mbti_score: expectedBreakdown.sharedContext,
    attachment_score: expectedBreakdown.attachmentComfort,
    communication_score: expectedBreakdown.communicationDisagreement,
    lifestyle_score: expectedBreakdown.lifestyleSustainability,
    core_values_score: round(expectedBreakdown.valuesBoundaries + expectedBreakdown.language),
    interaction_synergy_score: expectedBreakdown.interactionRhythm,
    intent_goal_score: expectedBreakdown.intent,
  }
  for (const [column, expected] of Object.entries(persistedColumns)) {
    // The legacy numeric cache columns are numeric(5,2), while the canonical
    // JSON snapshot retains up to six decimal places.
    if (!nearlyEqual(cacheRow?.[column], expected, 0.005001)) return null
  }

  const communicationItemsScore = questionSum(['communication1', 'communication2', 'communication3', 'communication4', 'communication5'])
  const coreValuesScore = round(expectedBreakdown.valuesBoundaries + expectedBreakdown.language)
  return {
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    scoreMaximum: 100,
    componentTotal: diagnosticComponentTotal,
    diagnosticComponentTotal,
    totalScore,
    priorityScore: totalScore,
    baseCompatibilityScore: totalScore,
    questionScores: JSON.parse(JSON.stringify(questionScores)),
    scoreBreakdown: JSON.parse(JSON.stringify(scoreBreakdown)),
    personalizedCompatibility: JSON.parse(JSON.stringify(personalized)),
    similarityObserved: null,
    initiativeSource: 'cached_snapshot',
    vibeAxes: JSON.parse(JSON.stringify(vibeAxes)),
    vibeMaximum: BALANCED_VIBE_MAX,
    vibeModelVersion: BALANCED_VIBE_VERSION,
    mbtiScore: 0,
    attachmentScore: 0,
    communicationScore: communicationItemsScore,
    communicationDisagreementScore: expectedBreakdown.communicationDisagreement,
    lifestyleScore: expectedBreakdown.lifestyleSustainability,
    coreValuesScore,
    coreValuesScaled5: coreValuesScore,
    synergyScore: expectedBreakdown.interactionRhythm,
    humorOpenScore: expectedBreakdown.humorOpenness,
    intentScore: expectedBreakdown.intent,
    vibeScore: expectedBreakdown.aiSemantic,
    disagreementScore: Number(questionScores.disagreement),
    currentFocusScore: Number(questionScores.currentFocus),
    similarityPreferenceScore: Number(questionScores.similarityPreference),
    attachmentPaceScore: expectedBreakdown.attachmentComfort,
    languageScore: expectedBreakdown.language,
    valuesBoundariesScore: expectedBreakdown.valuesBoundaries,
    sharedContextScore: expectedBreakdown.sharedContext,
    compositeAdjustment: 0,
    compositeRules: [],
    compositeDisplayCapApplied: false,
    compositeHardCapApplied: false,
    humorMultiplier: 1,
    attachmentPenaltyApplied: false,
    intentBoostApplied: false,
    deadAirVetoApplied: false,
    humorClashVetoApplied: false,
    maxScoreCapApplied: false,
    capApplied: null,
    opennessZeroZeroPenaltyApplied: false,
    opennessPenalty: 0,
    opennessPenaltyType: null,
    preVetoScore: totalScore,
  }
}

function isPlainJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactSnapshotEnvelope({ modelVersion, contentHash, snapshot, persistedTotal }) {
  if (!isPlainJsonObject(snapshot) || !contentHash) return false
  if (persistedTotal === null || persistedTotal === undefined || persistedTotal === '') return false
  const snapshotTotal = Number(snapshot.totalScore)
  const rowTotal = Number(persistedTotal)
  return snapshot.scoreModelVersion === modelVersion
    && snapshot.combinedContentHash === contentHash
    && isPlainJsonObject(snapshot.scoreBreakdown)
    && isPlainJsonObject(snapshot.questionScores)
    && isPlainJsonObject(snapshot.vibeAxes)
    && snapshot.vibeModel === BALANCED_VIBE_MODEL
    && snapshot.vibeModelVersion === BALANCED_VIBE_VERSION
    && snapshot.vibeModelTag === BALANCED_VIBE_MODEL_TAG
    && Number.isFinite(snapshotTotal)
    && Number.isFinite(rowTotal)
    && snapshotTotal === rowTotal
}

/** Validate a persisted event-time snapshot without consulting today's cache. */
export function isCurrentBalancedScoreSnapshot(payload) {
  return payload?.modelVersion === BALANCED_COMPATIBILITY_VERSION
    && hasExactSnapshotEnvelope(payload)
    && isPersonalizedCompatibilityPayload(payload.snapshot.scoreBreakdown?.personalized)
}

/**
 * Opposites is an explicit transformation of the current balanced inputs. Its
 * normalized total is only valid when all transformed components reconcile.
 */
export function isCurrentOppositesScoreSnapshot(payload) {
  if (payload?.modelVersion !== OPPOSITES_COMPATIBILITY_VERSION
    || !hasExactSnapshotEnvelope(payload)) return false
  const snapshot = payload.snapshot
  const breakdown = snapshot.scoreBreakdown
  const questionScores = snapshot.questionScores
  const components = [
    'interactionSynergy',
    'coreValuesAlignment',
    'communicationAlignment',
    'lifestyleDifference',
    'vibeDifference',
    'humorDifference',
  ]
  const values = components.map(key => Number(breakdown[key]))
  const rawTotal = Number(breakdown.rawTotal)
  const rawMaximum = Number(breakdown.rawMaximum)
  const normalizedTotal = Number(breakdown.normalizedTotal)
  return snapshot.transformation === 'opposites-flipped-v1'
    && snapshot.sourceScoreModelVersion === BALANCED_COMPATIBILITY_VERSION
    && isPlainJsonObject(snapshot.sourceScoreBreakdown)
    && isPlainJsonObject(snapshot.sourceQuestionScores)
    && values.every(Number.isFinite)
    && components.every((key, index) => Number(questionScores[key]) === values[index])
    && Number.isFinite(rawTotal)
    && Number.isFinite(rawMaximum)
    && rawMaximum === 76
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - rawTotal) < 1e-6
    && normalizedTotal === Number(payload.persistedTotal)
    && Math.round((rawTotal / rawMaximum) * 100) === normalizedTotal
}

export function isSupportedCurrentScoreSnapshot(payload) {
  return isCurrentBalancedScoreSnapshot(payload) || isCurrentOppositesScoreSnapshot(payload)
}

/**
 * Reusing the narrower AI result is safe only for the exact prompt/model tag.
 * Neutral/error fallbacks deliberately never qualify for cross-version reuse.
 */
export function isReusableBalancedVibeRow(row) {
  const modelUsed = String(row?.model_used || '')
  const score = Number(row?.ai_vibe_score)
  return isBalancedVibeModelUsed(modelUsed)
    && !modelUsed.split('|').some(part => part.startsWith('fallback='))
    && typeof row?.vibe_content_hash === 'string'
    && row.vibe_content_hash.length > 0
    && Number.isFinite(score)
    && score >= 0
    && score <= BALANCED_VIBE_MAX
    && decodeBalancedVibeModelUsed(modelUsed) !== null
}

export function calculateBalancedDisagreementScore(participantA, participantB) {
  return weightedFit(matrixFit(participantA, participantB, 'match_disagreement_style', DISAGREEMENT_MATRIX), BALANCED_WEIGHTS.disagreement)
}

export function calculateBalancedCurrentFocusScore(participantA, participantB) {
  return weightedFit(focusFit(participantA, participantB), BALANCED_WEIGHTS.currentFocus)
}

export function calculateBalancedSimilarityPreferenceScore(participantA, participantB) {
  return weightedFit(similarityPreferenceFit(participantA, participantB).fit, BALANCED_WEIGHTS.similarityPreference)
}

export function calculateBalancedAttachmentScore(participantA, participantB) {
  return round(
    weightedFit(matrixFit(participantA, participantB, 'attachment_1', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment1)
    + weightedFit(matrixFit(participantA, participantB, 'attachment_3', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment3)
    + weightedFit(matrixFit(participantA, participantB, 'attachment_4', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment4)
  )
}

export function calculateBalancedHumorOpennessScore(participantA, participantB) {
  return round(
    weightedFit(matrixFit(participantA, participantB, 'humor_banter_style', HUMOR_BANTER_MATRIX), BALANCED_WEIGHTS.humorBanter)
    + weightedFit(opennessFit(participantA, participantB), BALANCED_WEIGHTS.earlyOpenness)
  )
}

export function calculateBalancedLifestyleScore(participantA, participantB) {
  return round(
    weightedFit(ordinalFit(participantA, participantB, 'lifestyle_1', LIFESTYLE_MATRICES.lifestyle_1), BALANCED_WEIGHTS.lifestyle1)
    + weightedFit(ordinalFit(participantA, participantB, 'lifestyle_2', LIFESTYLE_MATRICES.lifestyle_2), BALANCED_WEIGHTS.lifestyle2)
    + weightedFit(matrixFit(participantA, participantB, 'lifestyle_3', LIFESTYLE_MATRICES.lifestyle_3), BALANCED_WEIGHTS.lifestyle3)
    + weightedFit(ordinalFit(participantA, participantB, 'lifestyle_4', LIFESTYLE_MATRICES.lifestyle_4), BALANCED_WEIGHTS.lifestyle4)
    + weightedFit(ordinalFit(participantA, participantB, 'lifestyle_5', LIFESTYLE_MATRICES.lifestyle_5), BALANCED_WEIGHTS.lifestyle5)
  )
}

export function calculateBalancedInteractionScore(participantA, participantB) {
  const initiative = initiativeFit(participantA, participantB)
  return {
    score: round(
      weightedFit(initiative.fit, BALANCED_WEIGHTS.initiative)
      + weightedFit(depthFit(participantA, participantB), BALANCED_WEIGHTS.conversationDepth)
      + weightedFit(batteryFit(participantA, participantB), BALANCED_WEIGHTS.socialBattery)
      + weightedFit(humorSubtypeFit(participantA, participantB), BALANCED_WEIGHTS.humorSubtype)
      + weightedFit(matrixFit(participantA, participantB, 'curiosity_style', CURIOSITY_MATRIX), BALANCED_WEIGHTS.curiosityStyle)
      + weightedFit(silenceFit(participantA, participantB), BALANCED_WEIGHTS.silence)
    ),
    initiativeSource: initiative.source,
  }
}

export function calculateBalancedCompatibility(participantA, participantB, { vibeScore = 6, vibeAxes = null } = {}) {
  const safeVibeScore = round(clamp(finite(vibeScore, BALANCED_VIBE_MAX / 2), 0, BALANCED_VIBE_MAX), 3)
  const similarity = similarityPreferenceFit(participantA, participantB)
  const initiative = initiativeFit(participantA, participantB)

  const questionScores = {
    disagreement: calculateBalancedDisagreementScore(participantA, participantB),
    similarityPreference: weightedFit(similarity.fit, BALANCED_WEIGHTS.similarityPreference),
    currentFocus: calculateBalancedCurrentFocusScore(participantA, participantB),
    humorBanter: weightedFit(matrixFit(participantA, participantB, 'humor_banter_style', HUMOR_BANTER_MATRIX), BALANCED_WEIGHTS.humorBanter),
    earlyOpenness: weightedFit(opennessFit(participantA, participantB), BALANCED_WEIGHTS.earlyOpenness),
    initiative: weightedFit(initiative.fit, BALANCED_WEIGHTS.initiative),
    expressionLanguage: weightedFit(matrixFit(participantA, participantB, 'expression_language', LANGUAGE_MATRIX), BALANCED_WEIGHTS.expressionLanguage),
    religion: weightedFit(matrixFit(participantA, participantB, 'minimum_partner_religious_commitment', RELIGION_MATRIX), BALANCED_WEIGHTS.religion),
    socialStyle: weightedFit(socialStyleFit(participantA, participantB), BALANCED_WEIGHTS.socialStyle),
    attachment1: weightedFit(matrixFit(participantA, participantB, 'attachment_1', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment1),
    attachment3: weightedFit(matrixFit(participantA, participantB, 'attachment_3', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment3),
    attachment4: weightedFit(matrixFit(participantA, participantB, 'attachment_4', ATTACHMENT_MATRIX), BALANCED_WEIGHTS.attachment4),
    lifestyle1: weightedFit(ordinalFit(participantA, participantB, 'lifestyle_1', LIFESTYLE_MATRICES.lifestyle_1), BALANCED_WEIGHTS.lifestyle1),
    lifestyle2: weightedFit(ordinalFit(participantA, participantB, 'lifestyle_2', LIFESTYLE_MATRICES.lifestyle_2), BALANCED_WEIGHTS.lifestyle2),
    lifestyle3: weightedFit(matrixFit(participantA, participantB, 'lifestyle_3', LIFESTYLE_MATRICES.lifestyle_3), BALANCED_WEIGHTS.lifestyle3),
    lifestyle4: weightedFit(ordinalFit(participantA, participantB, 'lifestyle_4', LIFESTYLE_MATRICES.lifestyle_4), BALANCED_WEIGHTS.lifestyle4),
    lifestyle5: weightedFit(ordinalFit(participantA, participantB, 'lifestyle_5', LIFESTYLE_MATRICES.lifestyle_5), BALANCED_WEIGHTS.lifestyle5),
    core1: weightedFit(ordinalFit(participantA, participantB, 'core_values_1', CORE_MATRICES.core_values_1), BALANCED_WEIGHTS.core1),
    core2: weightedFit(ordinalFit(participantA, participantB, 'core_values_2', CORE_MATRICES.core_values_2), BALANCED_WEIGHTS.core2),
    core3: 0,
    core4: weightedFit(ordinalFit(participantA, participantB, 'core_values_4', CORE_MATRICES.core_values_4), BALANCED_WEIGHTS.core4),
    core5: weightedFit(ordinalFit(participantA, participantB, 'core_values_5', CORE_MATRICES.core_values_5), BALANCED_WEIGHTS.core5),
    communication1: weightedFit(matrixFit(participantA, participantB, 'communication_1', COMMUNICATION_MATRIX), BALANCED_WEIGHTS.communication1),
    communication2: weightedFit(matrixFit(participantA, participantB, 'communication_2', COMMUNICATION_MATRIX), BALANCED_WEIGHTS.communication2),
    communication3: weightedFit(matrixFit(participantA, participantB, 'communication_3', COMMUNICATION_MATRIX), BALANCED_WEIGHTS.communication3),
    communication4: weightedFit(matrixFit(participantA, participantB, 'communication_4', COMMUNICATION_MATRIX), BALANCED_WEIGHTS.communication4),
    communication5: weightedFit(matrixFit(participantA, participantB, 'communication_5', COMMUNICATION_MATRIX), BALANCED_WEIGHTS.communication5),
    conversationDepth: weightedFit(depthFit(participantA, participantB), BALANCED_WEIGHTS.conversationDepth),
    socialBattery: weightedFit(batteryFit(participantA, participantB), BALANCED_WEIGHTS.socialBattery),
    humorSubtype: weightedFit(humorSubtypeFit(participantA, participantB), BALANCED_WEIGHTS.humorSubtype),
    curiosityStyle: weightedFit(matrixFit(participantA, participantB, 'curiosity_style', CURIOSITY_MATRIX), BALANCED_WEIGHTS.curiosityStyle),
    intent: weightedFit(matrixFit(participantA, participantB, 'intent_goal', INTENT_MATRIX), BALANCED_WEIGHTS.intent),
    silence: weightedFit(silenceFit(participantA, participantB), BALANCED_WEIGHTS.silence),
    vibe: safeVibeScore,
  }

  const sum = keys => round(keys.reduce((total, key) => total + questionScores[key], 0))
  const sharedContextScore = sum(['currentFocus', 'similarityPreference'])
  const interactionScore = sum(['initiative', 'conversationDepth', 'socialBattery', 'humorSubtype', 'curiosityStyle', 'silence'])
  const humorOpenScore = sum(['humorBanter', 'earlyOpenness'])
  const attachmentPaceScore = sum(['attachment1', 'attachment3', 'attachment4'])
  const lifestyleScore = sum(['lifestyle1', 'lifestyle2', 'lifestyle3', 'lifestyle4', 'lifestyle5'])
  const coreScenarioScore = sum(['core1', 'core2', 'core3', 'core4', 'core5'])
  const valuesBoundariesScore = round(coreScenarioScore + questionScores.religion + questionScores.socialStyle)
  const languageScore = questionScores.expressionLanguage
  const valuesBoundariesLanguageScore = round(valuesBoundariesScore + languageScore)
  const communicationItemsScore = sum(['communication1', 'communication2', 'communication3', 'communication4', 'communication5'])
  const communicationDisagreementScore = round(communicationItemsScore + questionScores.disagreement)
  const semanticCommonGroundScore = round(safeVibeScore + sharedContextScore)
  const diagnosticComponentTotal = round(
    semanticCommonGroundScore
    + interactionScore
    + humorOpenScore
    + attachmentPaceScore
    + lifestyleScore
    + valuesBoundariesScore
    + communicationDisagreementScore
    + questionScores.intent
    + languageScore
  )
  const personalized = calculatePersonalizedCompatibility(participantA, participantB)
  const totalScore = personalized.totalScore

  return {
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    scoreMaximum: 100,
    componentTotal: diagnosticComponentTotal,
    diagnosticComponentTotal,
    totalScore,
    priorityScore: totalScore,
    baseCompatibilityScore: totalScore,
    questionScores,
    scoreBreakdown: {
      semanticCommonGround: semanticCommonGroundScore,
      aiSemantic: safeVibeScore,
      sharedContext: sharedContextScore,
      interactionRhythm: interactionScore,
      humorOpenness: humorOpenScore,
      attachmentComfort: attachmentPaceScore,
      lifestyleSustainability: lifestyleScore,
      valuesBoundaries: valuesBoundariesScore,
      language: languageScore,
      communicationDisagreement: communicationDisagreementScore,
      intent: questionScores.intent,
      personalized,
    },
    personalizedCompatibility: personalized,
    similarityObserved: similarity.observed,
    initiativeSource: initiative.source,
    vibeAxes: vibeAxes || null,
    vibeMaximum: BALANCED_VIBE_MAX,
    vibeModelVersion: BALANCED_VIBE_VERSION,

    // Compatibility aliases retained for existing persistence and UI payloads.
    mbtiScore: 0,
    attachmentScore: 0,
    communicationScore: communicationItemsScore,
    communicationDisagreementScore,
    lifestyleScore,
    coreValuesScore: valuesBoundariesLanguageScore,
    coreValuesScaled5: valuesBoundariesLanguageScore,
    synergyScore: interactionScore,
    humorOpenScore,
    intentScore: questionScores.intent,
    vibeScore: safeVibeScore,
    disagreementScore: questionScores.disagreement,
    currentFocusScore: questionScores.currentFocus,
    similarityPreferenceScore: questionScores.similarityPreference,
    attachmentPaceScore,
    languageScore,
    valuesBoundariesScore,
    sharedContextScore,

    compositeAdjustment: 0,
    compositeRules: [],
    compositeDisplayCapApplied: false,
    compositeHardCapApplied: false,
    humorMultiplier: 1,
    attachmentPenaltyApplied: false,
    intentBoostApplied: false,
    deadAirVetoApplied: false,
    humorClashVetoApplied: false,
    maxScoreCapApplied: false,
    capApplied: null,
    opennessZeroZeroPenaltyApplied: false,
    opennessPenalty: 0,
    opennessPenaltyType: null,
    preVetoScore: totalScore,
  }
}

export function getBalancedCacheBreakdown(cacheRow) {
  let stored = cacheRow?.score_breakdown
  if (typeof stored === 'string') {
    try {
      stored = JSON.parse(stored)
    } catch {
      stored = null
    }
  }
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const aiSemantic = finite(stored.aiSemantic)
    const sharedContext = finite(stored.sharedContext)
    const valuesBoundaries = finite(stored.valuesBoundaries)
    const language = finite(stored.language)
    return {
      total: finite(cacheRow?.total_compatibility_score),
      personalized: isPersonalizedCompatibilityPayload(stored.personalized)
        ? JSON.parse(JSON.stringify(stored.personalized))
        : null,
      semanticCommonGround: finite(stored.semanticCommonGround, aiSemantic + sharedContext),
      aiSemantic,
      sharedContext,
      attachmentComfort: finite(stored.attachmentComfort),
      communicationDisagreement: finite(stored.communicationDisagreement),
      lifestyleSustainability: finite(stored.lifestyleSustainability),
      valuesBoundaries,
      language,
      valuesBoundariesLanguage: round(valuesBoundaries + language),
      interactionRhythm: finite(stored.interactionRhythm),
      intent: finite(stored.intent),
      humorOpenness: finite(stored.humorOpenness),
    }
  }

  const total = finite(cacheRow?.total_compatibility_score)
  const aiSemantic = finite(cacheRow?.ai_vibe_score)
  const sharedContext = finite(cacheRow?.mbti_score)
  const attachmentComfort = finite(cacheRow?.attachment_score)
  const communicationDisagreement = finite(cacheRow?.communication_score)
  const lifestyleSustainability = finite(cacheRow?.lifestyle_score)
  const valuesBoundariesLanguage = finite(cacheRow?.core_values_score)
  const interactionRhythm = finite(cacheRow?.interaction_synergy_score)
  const intent = finite(cacheRow?.intent_goal_score)
  const humorOpenness = Math.max(0, round(total - aiSemantic - sharedContext - attachmentComfort
    - communicationDisagreement - lifestyleSustainability - valuesBoundariesLanguage
    - interactionRhythm - intent))
  return {
    total,
    semanticCommonGround: round(aiSemantic + sharedContext),
    aiSemantic,
    sharedContext,
    attachmentComfort,
    communicationDisagreement,
    lifestyleSustainability,
    valuesBoundariesLanguage,
    interactionRhythm,
    intent,
    humorOpenness,
  }
}
