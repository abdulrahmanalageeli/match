export const PARTICIPANT_BROWSER_TOKEN_KEYS = Object.freeze([
  'blindmatch_result_token',
  'blindmatch_returning_token',
])

export const PARTICIPANT_BROWSER_IDENTITY_KEYS = Object.freeze([
  ...PARTICIPANT_BROWSER_TOKEN_KEYS,
  'blindmatch_participant_name',
  'blindmatch_participant_number',
  'survey_progress',
])

export function getParticipantBrowserToken(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null

  for (const key of PARTICIPANT_BROWSER_TOKEN_KEYS) {
    try {
      const token = storage.getItem(key)
      if (typeof token === 'string' && token.trim()) return token.trim()
    } catch {
      // Try the next alias if a browser blocks one access.
    }
  }
  return null
}

/**
 * Remove every browser value that can restore or identify a participant.
 * Keep this list centralized so logout and account-switch flows cannot clear
 * one token alias while leaving another alias available to the welcome page.
 */
export function clearParticipantBrowserIdentity(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return

  for (const key of PARTICIPANT_BROWSER_IDENTITY_KEYS) {
    try {
      storage.removeItem(key)
    } catch {
      // Continue clearing the remaining keys if a browser blocks one access.
    }
  }
}
