export const MATCH_INSIGHT_IDS: readonly [
  'age_flex_one_year',
  'match_disagreement_style',
  'match_similarity_preference',
  'match_current_curiosity',
  'match_current_focus',
  'conversation_initiative_preference',
]

export const PROFILE_DATA_COLLECTION_IDS: readonly [
  'expression_language',
  'minimum_partner_religious_commitment',
  'social_relationship_style',
]

export const SURVEY_UPDATE_IDS: readonly [...typeof MATCH_INSIGHT_IDS, ...typeof PROFILE_DATA_COLLECTION_IDS]

export type SurveyUpdateId = typeof SURVEY_UPDATE_IDS[number]
export type SurveyUpdateAnswers = Record<string, string | string[]>

export function isProfileDataCollectionId(id: SurveyUpdateId): boolean
export function getMissingSurveyUpdateIds(answers: SurveyUpdateAnswers): SurveyUpdateId[]
