export const MATCH_INSIGHTS_VERSION = '2026-08-08-v3-conversation-initiative'

export const MATCH_INSIGHT_IDS = Object.freeze([
  'match_disagreement_style',
  'match_similarity_preference',
  'match_current_curiosity',
  'match_current_focus',
  'conversation_initiative_preference',
])

export const MATCH_FOCUS_VALUES = Object.freeze([
  'study',
  'career',
  'business',
  'family_social',
  'health_fitness',
  'creative',
  'travel_experiences',
  'self_growth',
  'other',
])

const DISAGREEMENT_MATRIX = Object.freeze({
  A: { A: 4, B: 3, C: 2, D: 0 },
  B: { A: 3, B: 4, C: 3, D: 3 },
  C: { A: 2, B: 3, C: 4, D: 3 },
  D: { A: 0, B: 3, C: 3, D: 4 },
})

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

export function getMatchAnswer(participant, key) {
  return participant?.survey_data?.answers?.[key] ?? participant?.survey_data?.[key] ?? participant?.[key] ?? null
}

export function calculateDisagreementStyleScore(participantA, participantB) {
  const a = String(getMatchAnswer(participantA, 'match_disagreement_style') || '').toUpperCase()
  const b = String(getMatchAnswer(participantB, 'match_disagreement_style') || '').toUpperCase()
  return DISAGREEMENT_MATRIX[a]?.[b] ?? 2.5
}

const normalizeFocus = (value) => {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(source.map((item) => String(item).trim()).filter((item) => MATCH_FOCUS_VALUES.includes(item)))].slice(0, 2)
}

export function calculateCurrentFocusScore(participantA, participantB) {
  const a = normalizeFocus(getMatchAnswer(participantA, 'match_current_focus'))
  const b = normalizeFocus(getMatchAnswer(participantB, 'match_current_focus'))
  if (a.length === 0 || b.length === 0) return 2.5
  const overlap = a.filter((value) => b.includes(value)).length
  if (overlap >= 2) return 5
  if (overlap === 1) return 3
  return 1
}

function preferenceSatisfaction(preference, similarity) {
  switch (preference) {
    case 'A': return similarity
    case 'B': return 1 - similarity
    case 'C': return clamp(1 - (Math.abs(similarity - 0.6) / 0.6), 0, 1)
    case 'D': return 0.6
    default: return 0.6
  }
}

export function calculateSimilarityPreferenceScore(participantA, participantB, contentSimilarity = 0.6) {
  const similarity = clamp(Number.isFinite(Number(contentSimilarity)) ? Number(contentSimilarity) : 0.6, 0, 1)
  const a = String(getMatchAnswer(participantA, 'match_similarity_preference') || '').toUpperCase()
  const b = String(getMatchAnswer(participantB, 'match_similarity_preference') || '').toUpperCase()
  return ((preferenceSatisfaction(a, similarity) + preferenceSatisfaction(b, similarity)) / 2) * 5
}

const attachmentNeed = {
  attachment_1: { A: 2, B: 3, C: 0.5, D: 2.25 },
  attachment_3: { A: 2, B: 3, C: 0, D: 1.5 },
  attachment_4: { A: 2, B: 3, C: 0.5, D: 1.5 },
}

const answerLetter = (participant, key) => {
  const raw = String(getMatchAnswer(participant, key) || '').trim().toUpperCase()
  return ({ 'أ': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' })[raw] || raw
}

function depthOffering(participant) {
  const depth = answerLetter(participant, 'conversation_depth_pref')
  if (depth === 'A') return 3
  if (depth === 'B') return 1.5
  const legacyDepth = String(getMatchAnswer(participant, 'vibe_4') || '').trim().toLowerCase()
  if (['نعم', 'yes', 'true'].includes(legacyDepth)) return 3
  if (['لا', 'no', 'false'].includes(legacyDepth)) return 0.75
  if (legacyDepth) return 1.75
  return null
}

function opennessOffering(participant) {
  const raw = getMatchAnswer(participant, 'early_openness_comfort')
  const openness = Number(raw)
  const depth = depthOffering(participant)
  const hasOpenness = raw !== null && raw !== '' && Number.isFinite(openness)
  if (!hasOpenness && depth === null) return null
  if (!hasOpenness) return depth
  if (depth === null) return clamp(openness, 0, 3)
  return (clamp(openness, 0, 3) * 0.7) + (depth * 0.3)
}

function initiativeOffering(participant) {
  const role = answerLetter(participant, 'conversational_role')
  const curiosity = answerLetter(participant, 'curiosity_style')
  const roleScore = ({ A: 3, B: 2.25, C: 1.25 })[role]
  const curiosityScore = ({ A: 1.5, B: 3, C: 2 })[curiosity]
  if (roleScore == null && curiosityScore == null) return null
  if (roleScore == null) return curiosityScore
  if (curiosityScore == null) return roleScore
  return (roleScore * 0.65) + (curiosityScore * 0.35)
}

function listeningOffering(participant) {
  const role = answerLetter(participant, 'conversational_role')
  const curiosity = answerLetter(participant, 'curiosity_style')
  const roleScore = ({ A: 1.5, B: 2.25, C: 3 })[role]
  const curiosityScore = ({ A: 1.5, B: 3, C: 2 })[curiosity]
  if (roleScore == null && curiosityScore == null) return null
  if (roleScore == null) return curiosityScore
  if (curiosityScore == null) return roleScore
  return (roleScore * 0.65) + (curiosityScore * 0.35)
}

function directionalNeedFit(participantWithNeed, attachmentKey, partnerOffering) {
  const answer = answerLetter(participantWithNeed, attachmentKey)
  const need = attachmentNeed[attachmentKey]?.[answer]
  if (need == null || partnerOffering == null) return 0.5
  // Secure/balanced answers indicate flexibility rather than a narrow demand.
  if (answer === 'A') return 0.85 + (0.15 * (1 - Math.min(1, Math.abs(partnerOffering - 2) / 2)))
  return clamp(1 - (Math.abs(need - partnerOffering) / 3), 0, 1)
}

export function calculateAttachmentPaceScore(participantA, participantB) {
  const symmetricFit = (key, offeringA, offeringB) => (
    directionalNeedFit(participantA, key, offeringB) + directionalNeedFit(participantB, key, offeringA)
  ) / 2

  const closenessFit = symmetricFit('attachment_3', opennessOffering(participantA), opennessOffering(participantB))
  const reassuranceFit = symmetricFit('attachment_1', initiativeOffering(participantA), initiativeOffering(participantB))
  const supportFit = symmetricFit('attachment_4', listeningOffering(participantA), listeningOffering(participantB))
  return clamp((closenessFit * 1.5) + reassuranceFit + (supportFit * 0.5), 0, 3)
}

export function getAttachmentPaceCacheContent(participant) {
  return [
    'attachment_1', 'attachment_3', 'attachment_4',
    'early_openness_comfort', 'conversation_depth_pref',
    'conversational_role', 'curiosity_style',
  ].map((key) => `${key}:${String(getMatchAnswer(participant, key) ?? '')}`).join('|')
}

export function getMatchInsightsCacheContent(participant) {
  return MATCH_INSIGHT_IDS.map((key) => {
    const value = getMatchAnswer(participant, key)
    return `${key}:${Array.isArray(value) ? [...value].map(String).sort().join(',') : String(value ?? '')}`
  }).join('|')
}

export function validateMatchInsights(input, { requireAll = true } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const errors = {}
  const cleaned = {}

  const validateChoice = (key) => {
    if (!(key in source) && !requireAll) return
    const value = String(source[key] ?? '').toUpperCase()
    if (!['A', 'B', 'C', 'D'].includes(value)) errors[key] = 'invalid_choice'
    else cleaned[key] = value
  }
  validateChoice('match_disagreement_style')
  validateChoice('match_similarity_preference')
  validateChoice('conversation_initiative_preference')

  if ('match_current_curiosity' in source || requireAll) {
    const curiosity = String(source.match_current_curiosity ?? '').replace(/\s+/g, ' ').trim()
    if (curiosity.length < 20 || curiosity.length > 150) errors.match_current_curiosity = 'invalid_length'
    else cleaned.match_current_curiosity = curiosity
  }

  if ('match_current_focus' in source || requireAll) {
    const focus = normalizeFocus(source.match_current_focus)
    const original = Array.isArray(source.match_current_focus) ? source.match_current_focus.map(String) : []
    if (focus.length !== 2 || new Set(original).size !== 2 || original.some((value) => !MATCH_FOCUS_VALUES.includes(value))) {
      errors.match_current_focus = 'select_exactly_two'
    } else {
      cleaned.match_current_focus = focus
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, answers: cleaned }
}

export function buildVibeDescription(answers = {}) {
  const parts = []
  const add = (label, value) => {
    if (Array.isArray(value)) {
      if (value.length) parts.push(`${label}: ${value.join(', ')}`)
    } else if (String(value ?? '').trim()) {
      parts.push(`${label}: ${String(value).trim()}`)
    }
  }
  add('Current curiosity', answers.match_current_curiosity)
  add('Hobbies', answers.vibe_2)
  add('Music', answers.vibe_3)
  add('Deep conversations', answers.vibe_4)
  add('Friends describe me', answers.vibe_5)
  add('Current life focus', normalizeFocus(answers.match_current_focus))
  return parts.join(' | ')
}
