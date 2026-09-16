// Keep every score detail, but never request the entire multi-megabyte report.
export async function loadAdminResultPairs(sessionId, fetcher, { isCurrent = () => true } = {}) {
  const pairs = []
  let offset = 0
  while (isCurrent()) {
    const response = await fetcher('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-admin-result-pairs', sessionId, offset }),
    })
    const page = await response.json()
    if (!response.ok || !page.success) throw new Error(page.error || 'Could not load score details')
    if (!isCurrent()) return null
    if (!Array.isArray(page.pairs)) throw new Error('Invalid score details response')
    pairs.push(...page.pairs)
    if (page.nextOffset == null) return pairs
    if (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset) throw new Error('Invalid score details cursor')
    offset = page.nextOffset
  }
  return null
}
