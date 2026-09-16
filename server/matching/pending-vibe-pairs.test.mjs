import test from 'node:test'
import assert from 'node:assert/strict'
import { countPendingVibePairs } from './pending-vibe-pairs.mjs'

const participants = [1, 2, 3].map(assigned_number => ({ assigned_number }))
const row = { participant_a_number: 1, participant_b_number: 2, combined_content_hash: 'current', vibe_content_hash: 'vibe', pending: true }
const options = {
  cacheKeyFor: () => ({ combinedHash: 'current', vibeHash: 'vibe' }),
  isPending: r => r.pending,
  isReusable: r => r.ready,
  isEligible: () => true,
}
test('generation waits for current pending work, counting duplicate cache rows only once', () => {
  assert.equal(countPendingVibePairs(participants, [row, row], options), 1)
})
test('generation ignores stale, excluded, unrelated, and already enriched pairs', () => {
  assert.equal(countPendingVibePairs(participants, [{ ...row, combined_content_hash: 'old' }], options), 0)
  assert.equal(countPendingVibePairs(participants, [{ ...row, vibe_content_hash: 'old' }], options), 0)
  assert.equal(countPendingVibePairs(participants, [{ ...row, participant_b_number: 99 }], options), 0)
  assert.equal(countPendingVibePairs(participants, [row], { ...options, isEligible: () => false }), 0)
  assert.equal(countPendingVibePairs(participants, [row, { ...row, pending: false, ready: true }], options), 0)
})
