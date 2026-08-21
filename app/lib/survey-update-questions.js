export const MATCH_INSIGHT_IDS = Object.freeze([
  'age_flex_one_year',
  'match_disagreement_style',
  'match_similarity_preference',
  'match_current_curiosity',
  'match_current_focus',
  'conversation_initiative_preference',
])

export const PROFILE_DATA_COLLECTION_IDS = Object.freeze([
  'expression_language',
  'minimum_partner_religious_commitment',
  'social_relationship_style',
])

export const SURVEY_UPDATE_IDS = Object.freeze([...MATCH_INSIGHT_IDS, ...PROFILE_DATA_COLLECTION_IDS])

export function isProfileDataCollectionId(id) {
  return PROFILE_DATA_COLLECTION_IDS.includes(id)
}

export function getMissingSurveyUpdateIds(answers) {
  return SURVEY_UPDATE_IDS.filter((id) => {
    const value = answers[id]
    if (id === 'age_flex_one_year') return !['accept', 'decline', 'not_applicable'].includes(String(value || '').toLowerCase())
    if (id === 'match_current_focus') return !Array.isArray(value) || value.length !== 2
    if (id === 'match_current_curiosity') return typeof value !== 'string' || value.trim().length < 20
    if (id === 'expression_language') return !['1', '2', '3', '4', '5'].includes(String(value || ''))
    if (id === 'minimum_partner_religious_commitment' || id === 'social_relationship_style') {
      return !['1', '2', '3', '4'].includes(String(value || ''))
    }
    return !['A', 'B', 'C', 'D'].includes(String(value || '').toUpperCase())
  })
}
