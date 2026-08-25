import {
  BALANCED_COMPATIBILITY_VERSION,
  BALANCED_VIBE_MAX,
  calculateBalancedAttachmentScore,
  calculateBalancedCompatibility,
  calculateBalancedCurrentFocusScore,
  calculateBalancedDisagreementScore,
  calculateBalancedSimilarityPreferenceScore,
} from './balanced-compatibility.mjs'

export const MATCH_INSIGHTS_VERSION = BALANCED_COMPATIBILITY_VERSION

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

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

export function getMatchAnswer(participant, key) {
  return participant?.survey_data?.answers?.[key] ?? participant?.survey_data?.[key] ?? participant?.[key] ?? null
}

export function calculateDisagreementStyleScore(participantA, participantB) {
  return calculateBalancedDisagreementScore(participantA, participantB)
}

const normalizeFocus = (value) => {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(source.map((item) => String(item).trim()).filter((item) => MATCH_FOCUS_VALUES.includes(item)))].slice(0, 2)
}

export function calculateCurrentFocusScore(participantA, participantB) {
  return calculateBalancedCurrentFocusScore(participantA, participantB)
}

export function calculateSimilarityPreferenceScore(participantA, participantB, contentSimilarity = 0.6) {
  void contentSimilarity
  return calculateBalancedSimilarityPreferenceScore(participantA, participantB)
}

export function calculatePersistedMatchInsightScores(participantA, participantB, vibeScore, vibeMaximum = BALANCED_VIBE_MAX) {
  const sourceMaximum = Number(vibeMaximum) > 0 ? Number(vibeMaximum) : BALANCED_VIBE_MAX
  const normalizedVibe = clamp(Number(vibeScore) || 0, 0, sourceMaximum) / sourceMaximum
  const score = calculateBalancedCompatibility(participantA, participantB, {
    vibeScore: normalizedVibe * BALANCED_VIBE_MAX,
  })

  return {
    disagreement_style_score: score.disagreementScore,
    current_life_overlap_score: score.currentFocusScore,
    similarity_preference_score: score.similarityPreferenceScore,
    attachment_pace_score: score.attachmentPaceScore,
  }
}

export function calculateAttachmentPaceScore(participantA, participantB) {
  return calculateBalancedAttachmentScore(participantA, participantB)
}

export function getAttachmentPaceCacheContent(participant) {
  return [
    'attachment_1', 'attachment_3', 'attachment_4',
  ].map((key) => `${key}:${String(getMatchAnswer(participant, key) ?? '')}`).join('|')
}

export function getMatchInsightsCacheContent(participant) {
  return MATCH_INSIGHT_IDS.map((key) => {
    const value = getMatchAnswer(participant, key)
    return `${key}:${Array.isArray(value) ? [...value].map(String).sort().join(',') : String(value ?? '')}`
  }).join('|')
}

export function getMatchInsightsCompletion(participant) {
  const validChoice = (key) => ['A', 'B', 'C', 'D'].includes(String(getMatchAnswer(participant, key) || '').trim().toUpperCase())
  const curiosity = String(getMatchAnswer(participant, 'match_current_curiosity') || '').replace(/\s+/g, ' ').trim()
  const focus = normalizeFocus(getMatchAnswer(participant, 'match_current_focus'))
  const checks = {
    match_disagreement_style: validChoice('match_disagreement_style'),
    match_similarity_preference: validChoice('match_similarity_preference'),
    match_current_curiosity: curiosity.length >= 20 && curiosity.length <= 150,
    match_current_focus: focus.length === 2,
    conversation_initiative_preference: validChoice('conversation_initiative_preference'),
  }
  const answeredCount = Object.values(checks).filter(Boolean).length
  return {
    answeredCount,
    totalCount: MATCH_INSIGHT_IDS.length,
    complete: answeredCount === MATCH_INSIGHT_IDS.length,
    answeredIds: MATCH_INSIGHT_IDS.filter((id) => checks[id]),
    version: participant?.survey_data?.matchInsightsVersion || null,
    updatedAt: participant?.survey_data?.matchInsightsUpdatedAt || null,
  }
}

// Snapshot the questionnaire generation actually available when the pair was
// scored. Deriving this later from live profiles could make an old score look
// current after one of the participants submits the new answers.
export function getPairMatchInsightsCoverage(participantA, participantB) {
  const a = getMatchInsightsCompletion(participantA)
  const b = getMatchInsightsCompletion(participantB)
  const completedCount = Number(a.complete) + Number(b.complete)
  return {
    match_insights_status: completedCount === 2 ? 'both' : completedCount === 1 ? 'mixed' : 'neither',
    match_insights_complete_a: a.complete,
    match_insights_complete_b: b.complete,
    match_insights_answered_a: a.answeredCount,
    match_insights_answered_b: b.answeredCount,
    match_insights_total_questions: MATCH_INSIGHT_IDS.length,
    match_insights_version_a: a.version,
    match_insights_version_b: b.version,
    score_model_version: MATCH_INSIGHTS_VERSION,
  }
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

  // The welcome update popup also carries the one-year age-range fallback.
  // It is optional here because it is a hard matching preference, not one of
  // the five scored match-insight questions.
  if ('age_flex_one_year' in source) {
    const ageFlex = String(source.age_flex_one_year ?? '').trim().toLowerCase()
    if (!['accept', 'decline', 'not_applicable'].includes(ageFlex)) errors.age_flex_one_year = 'invalid_choice'
    else cleaned.age_flex_one_year = ageFlex
  }

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
