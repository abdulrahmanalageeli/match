import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARTICIPANT_BROWSER_IDENTITY_KEYS,
  clearParticipantBrowserIdentity,
} from '../../app/lib/participant-browser-auth.mjs'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

test('participant logout clears every token alias and cached identity value', () => {
  const storage = memoryStorage({
    blindmatch_result_token: 'result-token',
    blindmatch_returning_token: 'returning-token',
    blindmatch_participant_name: 'Previous person',
    blindmatch_participant_number: '123',
    survey_progress: '{"answers":{"name":"Previous person"}}',
    unrelated_preference: 'keep-me',
  })

  clearParticipantBrowserIdentity(storage)

  for (const key of PARTICIPANT_BROWSER_IDENTITY_KEYS) {
    assert.equal(storage.getItem(key), null, `${key} should be removed`)
  }
  assert.equal(storage.getItem('unrelated_preference'), 'keep-me')
})

test('participant logout tolerates unavailable browser storage', () => {
  assert.doesNotThrow(() => clearParticipantBrowserIdentity(null))
})
