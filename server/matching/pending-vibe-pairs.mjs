// A queued score must not trigger a second paid AI call during generation.
// Ignore stale input hashes and pending rows superseded by a usable AI result.
export function countPendingVibePairs(participants, rows, { cacheKeyFor, isPending, isReusable, isEligible }) {
  const byNumber = new Map(participants.map(p => [Number(p.assigned_number), p]))
  const ready = new Set(rows.filter(isReusable).map(row =>
    `${row.participant_a_number}-${row.participant_b_number}-${row.vibe_content_hash}`))
  const pending = new Set()
  for (const row of rows) {
    if (!isPending(row)) continue
    const a = byNumber.get(Number(row.participant_a_number))
    const b = byNumber.get(Number(row.participant_b_number))
    if (!a || !b || !isEligible(a, b)) continue
    const key = cacheKeyFor(a, b)
    const identity = `${row.participant_a_number}-${row.participant_b_number}-${key.vibeHash}`
    if (row.combined_content_hash === key.combinedHash && row.vibe_content_hash === key.vibeHash && !ready.has(identity)) {
      pending.add(identity)
    }
  }
  return pending.size
}

// Check the participant pool, not just existing rows: a missing or stale row
// otherwise slips through the pending check and starts foreground AI calls.
export function findMissingVibePairs(participants, rows, { cacheKeyFor, isReusable, isEligible }) {
  const identity = (a, b, hash) => `${Math.min(a, b)}-${Math.max(a, b)}-${hash}`
  const ready = new Set(rows.filter(isReusable).map(row =>
    identity(row.participant_a_number, row.participant_b_number, row.vibe_content_hash)))
  const missing = []
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i], b = participants[j]
      if (!isEligible(a, b)) continue
      if (!ready.has(identity(a.assigned_number, b.assigned_number, cacheKeyFor(a, b).vibeHash))) {
        missing.push([a, b])
      }
    }
  }
  return missing
}
