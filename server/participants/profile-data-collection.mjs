export const PROFILE_DATA_COLLECTION_IDS = Object.freeze([
  'expression_language',
  'minimum_partner_religious_commitment',
  'social_relationship_style',
])

export const PROFILE_DATA_COLLECTION_CHOICES = Object.freeze({
  expression_language: Object.freeze(['1', '2', '3', '4', '5']),
  minimum_partner_religious_commitment: Object.freeze(['1', '2', '3', '4']),
  social_relationship_style: Object.freeze(['1', '2', '3', '4']),
})

export function validateProfileDataCollection(input, { requireAll = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const answers = {}
  const errors = {}

  for (const id of PROFILE_DATA_COLLECTION_IDS) {
    const rawValue = source[id]
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim()

    if (!value) {
      if (requireAll) errors[id] = 'required'
      continue
    }

    if (!PROFILE_DATA_COLLECTION_CHOICES[id].includes(value)) {
      errors[id] = 'invalid_choice'
      continue
    }

    answers[id] = value
  }

  return {
    valid: Object.keys(errors).length === 0,
    answers,
    errors,
  }
}
