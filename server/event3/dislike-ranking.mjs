const EVIDENCE_SCALE = 3

function asName(nameByNumber, number) {
  if (nameByNumber instanceof Map) return nameByNumber.get(number) || `#${number}`
  return nameByNumber?.[number] || `#${number}`
}

/**
 * Rank recipients by repeated low placements.
 *
 * Every ballot is normalized to a 0..1 percentile so a last-place vote in a
 * list of four is comparable with a last-place vote in a list of eight. The
 * signal deliberately bends toward the bottom (percentile squared), adds
 * explicit last-place and bottom-third signals, then discounts small samples.
 * Auto-saved ballots are ignored because their order is operational, not an
 * expression of participant preference.
 */
export function buildDislikeLeaderboard(rows = [], nameByNumber = {}) {
  const ballots = new Map()

  for (const row of rows || []) {
    if (row?.auto_saved) continue
    const eventId = Number(row?.event_id)
    const rankerNumber = Number(row?.ranker_number)
    const rankedNumber = Number(row?.ranked_number)
    const rank = Number(row?.rank)
    if (!Number.isFinite(eventId) || !Number.isFinite(rankerNumber) || !Number.isFinite(rankedNumber) || !Number.isFinite(rank) || rank < 1) continue

    const key = `${eventId}:${rankerNumber}`
    if (!ballots.has(key)) ballots.set(key, { eventId, entries: new Map() })
    ballots.get(key).entries.set(rankedNumber, { rankedNumber, rank })
  }

  const recipients = new Map()
  for (const ballot of ballots.values()) {
    const entries = [...ballot.entries.values()]
    if (entries.length < 2) continue
    const maxRank = Math.max(...entries.map(entry => entry.rank))
    if (maxRank <= 1) continue

    for (const entry of entries) {
      const percentile = Math.max(0, Math.min(1, (entry.rank - 1) / (maxRank - 1)))
      const firstPlace = entry.rank === 1
      const lastPlace = entry.rank === maxRank
      const topThird = percentile <= (1 / 3)
      const bottomThird = percentile >= (2 / 3)
      // Severity focuses on the tail while still preserving the full ordering.
      const dislikeSeverity = (0.55 * percentile ** 2) + (0.30 * Number(lastPlace)) + (0.15 * Number(bottomThird))
      // Like severity mirrors the same formula around the top of the ballot.
      const likePercentile = 1 - percentile
      const likeSeverity = (0.55 * likePercentile ** 2) + (0.30 * Number(firstPlace)) + (0.15 * Number(topThird))

      if (!recipients.has(entry.rankedNumber)) {
        recipients.set(entry.rankedNumber, {
          number: entry.rankedNumber,
          dislikeSeverities: [],
          likeSeverities: [],
          percentiles: [],
          firstPlaceCount: 0,
          lastPlaceCount: 0,
          topThirdCount: 0,
          bottomThirdCount: 0,
          eventIds: new Set(),
        })
      }
      const recipient = recipients.get(entry.rankedNumber)
      recipient.dislikeSeverities.push(dislikeSeverity)
      recipient.likeSeverities.push(likeSeverity)
      recipient.percentiles.push(percentile)
      recipient.firstPlaceCount += Number(firstPlace)
      recipient.lastPlaceCount += Number(lastPlace)
      recipient.topThirdCount += Number(topThird)
      recipient.bottomThirdCount += Number(bottomThird)
      recipient.eventIds.add(ballot.eventId)
    }
  }

  const leaderboard = [...recipients.values()].map(recipient => {
    const receivedRankings = recipient.dislikeSeverities.length
    const averageDislikeSeverity = recipient.dislikeSeverities.reduce((sum, value) => sum + value, 0) / receivedRankings
    const averageLikeSeverity = recipient.likeSeverities.reduce((sum, value) => sum + value, 0) / receivedRankings
    const averagePercentile = recipient.percentiles.reduce((sum, value) => sum + value, 0) / receivedRankings
    // One extreme ballot should not outrank a pattern repeated by many people.
    const evidence = 1 - Math.exp(-receivedRankings / EVIDENCE_SCALE)
    const evidenceMultiplier = 0.65 + (0.35 * evidence)
    const dislikeScore = 100 * averageDislikeSeverity * evidenceMultiplier
    const likeScore = 100 * averageLikeSeverity * evidenceMultiplier

    return {
      number: recipient.number,
      name: asName(nameByNumber, recipient.number),
      score: Number(dislikeScore.toFixed(1)),
      dislike_score: Number(dislikeScore.toFixed(1)),
      like_score: Number(likeScore.toFixed(1)),
      received_rankings: receivedRankings,
      average_bottom_percentile: Number((averagePercentile * 100).toFixed(1)),
      first_place_count: recipient.firstPlaceCount,
      first_place_rate: Number(((recipient.firstPlaceCount / receivedRankings) * 100).toFixed(1)),
      last_place_count: recipient.lastPlaceCount,
      last_place_rate: Number(((recipient.lastPlaceCount / receivedRankings) * 100).toFixed(1)),
      top_third_count: recipient.topThirdCount,
      top_third_rate: Number(((recipient.topThirdCount / receivedRankings) * 100).toFixed(1)),
      bottom_third_count: recipient.bottomThirdCount,
      bottom_third_rate: Number(((recipient.bottomThirdCount / receivedRankings) * 100).toFixed(1)),
      events_count: recipient.eventIds.size,
    }
  })

  return leaderboard.sort((a, b) =>
    b.dislike_score - a.dislike_score
    || b.last_place_rate - a.last_place_rate
    || b.received_rankings - a.received_rankings
    || a.number - b.number
  )
}
