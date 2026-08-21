export const GROUP_EXPERIENCES = Object.freeze(['great', 'good', 'neutral', 'uncomfortable'])

export const GROUP_FEEDBACK_TAGS = Object.freeze([
  'fun', 'comfortable', 'good_listener', 'respectful', 'engaging',
  'quiet', 'hard_to_connect', 'interrupts', 'dominates', 'disrespectful',
])

const EXPERIENCE_SET = new Set(GROUP_EXPERIENCES)
const TAG_SET = new Set(GROUP_FEEDBACK_TAGS)
const EXPERIENCE_WEIGHTS = Object.freeze({ great: 4, good: 3, neutral: 2, uncomfortable: 1 })
const POSITIVE_TAG_SET = new Set(['fun', 'comfortable', 'good_listener', 'respectful', 'engaging'])
const NEGATIVE_TAG_SET = new Set(['hard_to_connect', 'interrupts', 'dominates', 'disrespectful'])

const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0))
const confidenceForCount = count => clamp01(1 - Math.exp(-Math.max(0, Number(count) || 0) / 4))
const rate = (count, total) => total > 0 ? count / total : 0
const round2 = value => Math.round((Number(value) || 0) * 100) / 100

export function normalizeGroupMemberFeedback({ entries, groupRound, reviewerNumber, allowedNumbers }) {
  const round = Number(groupRound)
  const reviewer = Number(reviewerNumber)
  const allowed = allowedNumbers instanceof Set ? allowedNumbers : new Set(allowedNumbers || [])

  if (![1, 2].includes(round)) return { error: 'Group round must be 1 or 2' }
  if (!Array.isArray(entries) || entries.length === 0) return { error: 'Review at least one group member before saving' }
  if (entries.length > allowed.size) return { error: 'Feedback contains too many group members' }

  const normalized = []
  const seen = new Set()
  for (const raw of entries) {
    const memberNumber = Number(raw?.member_number)
    const experience = String(raw?.experience || '')
    const note = String(raw?.organizer_note || '').trim()
    const tags = Array.isArray(raw?.tags) ? [...new Set(raw.tags.map(tag => String(tag)))] : []

    if (!Number.isInteger(memberNumber) || memberNumber <= 0 || memberNumber === reviewer || seen.has(memberNumber)) {
      return { error: 'Feedback contains an invalid or duplicate group member' }
    }
    if (!allowed.has(memberNumber)) return { error: 'You can only review people from this group round' }
    if (!EXPERIENCE_SET.has(experience)) return { error: 'Choose an experience rating for every reviewed member' }
    if (tags.length > 3 || tags.some(tag => !TAG_SET.has(tag))) return { error: 'Choose no more than three valid feedback tags' }
    if (note.length > 300) return { error: 'Organizer note must be 300 characters or fewer' }

    seen.add(memberNumber)
    normalized.push({ member_number: memberNumber, experience, tags, organizer_note: note || null })
  }

  return { value: { groupRound: round, entries: normalized } }
}

/**
 * Organizer-facing summary for group member feedback.
 *
 * The old implementation sorted raw averages. That lets one 4/4 review outrank
 * a participant with ten consistently positive reviews. The enriched summary
 * keeps the old fields for compatibility, while adding confidence-weighted
 * liked/disliked scores, polarization, rates, reason buckets and per-round
 * consistency data for the admin intelligence dashboard.
 */
export function buildGroupMemberFeedbackSummary(rows = [], nameMap = {}) {
  const summaries = new Map()
  const getName = number => nameMap instanceof Map ? nameMap.get(number) : nameMap[number]

  for (const row of rows || []) {
    const number = Number(row.member_number)
    if (!Number.isFinite(number)) continue
    const round = Number(row.group_round)
    const current = summaries.get(number) || {
      number,
      name: getName(number) || row.member_name || `#${number}`,
      reviews: 0,
      score_total: 0,
      great: 0,
      good: 0,
      neutral: 0,
      uncomfortable: 0,
      tag_counts: {},
      positive_tag_counts: {},
      negative_tag_counts: {},
      round_counts: {
        1: { reviews: 0, score_total: 0, positive: 0, neutral: 0, negative: 0 },
        2: { reviews: 0, score_total: 0, positive: 0, neutral: 0, negative: 0 },
      },
    }

    const experience = String(row.experience || '')
    const score = EXPERIENCE_WEIGHTS[experience] || 0
    current.reviews += 1
    current.score_total += score
    if (Object.hasOwn(current, experience)) current[experience] += 1

    for (const tag of row.tags || []) {
      current.tag_counts[tag] = (current.tag_counts[tag] || 0) + 1
      if (POSITIVE_TAG_SET.has(tag)) current.positive_tag_counts[tag] = (current.positive_tag_counts[tag] || 0) + 1
      if (NEGATIVE_TAG_SET.has(tag)) current.negative_tag_counts[tag] = (current.negative_tag_counts[tag] || 0) + 1
    }

    if ((round === 1 || round === 2) && current.round_counts[round]) {
      const bucket = current.round_counts[round]
      bucket.reviews += 1
      bucket.score_total += score
      if (experience === 'great' || experience === 'good') bucket.positive += 1
      else if (experience === 'neutral') bucket.neutral += 1
      else if (experience === 'uncomfortable') bucket.negative += 1
    }

    summaries.set(number, current)
  }

  const raw = [...summaries.values()]
  const totalReviews = raw.reduce((sum, item) => sum + item.reviews, 0)
  const totalPositive = raw.reduce((sum, item) => sum + item.great + item.good, 0)
  const totalNegative = raw.reduce((sum, item) => sum + item.uncomfortable, 0)
  const globalPositiveRate = totalReviews ? totalPositive / totalReviews : 0.5
  const globalNegativeRate = totalReviews ? totalNegative / totalReviews : 0.15

  return raw.map(item => {
    const positive = item.great + item.good
    const negative = item.uncomfortable
    const positiveRate = rate(positive, item.reviews)
    const neutralRate = rate(item.neutral, item.reviews)
    const negativeRate = rate(negative, item.reviews)
    const confidence = confidenceForCount(item.reviews)

    // Empirical-Bayes-style shrinkage toward this event's baseline. This is a
    // ranking heuristic, not a claim of statistical significance.
    const adjustedPositive = positiveRate * confidence + globalPositiveRate * (1 - confidence)
    const adjustedNegative = negativeRate * confidence + globalNegativeRate * (1 - confidence)
    const polarizingScore = Math.min(positiveRate, negativeRate)
      * (positiveRate + negativeRate)
      * confidence
      * 100

    const roundBreakdown = Object.fromEntries([1, 2].map(round => {
      const bucket = item.round_counts[round]
      return [round, {
        reviews: bucket.reviews,
        average: bucket.reviews ? round2(bucket.score_total / bucket.reviews) : 0,
        positive: bucket.positive,
        neutral: bucket.neutral,
        negative: bucket.negative,
        positive_rate: round2(rate(bucket.positive, bucket.reviews)),
        neutral_rate: round2(rate(bucket.neutral, bucket.reviews)),
        negative_rate: round2(rate(bucket.negative, bucket.reviews)),
      }]
    }))

    const reviewedRounds = [1, 2].filter(round => roundBreakdown[round].reviews > 0).length
    const negativeRounds = [1, 2].filter(round => roundBreakdown[round].reviews > 0 && roundBreakdown[round].negative_rate >= 0.34).length
    const positiveRounds = [1, 2].filter(round => roundBreakdown[round].reviews > 0 && roundBreakdown[round].positive_rate >= 0.6).length

    return {
      ...item,
      average: item.reviews ? round2(item.score_total / item.reviews) : 0,
      positive,
      negative,
      positive_rate: round2(positiveRate),
      neutral_rate: round2(neutralRate),
      negative_rate: round2(negativeRate),
      confidence: round2(confidence),
      confidence_label: item.reviews >= 6 ? 'strong' : item.reviews >= 3 ? 'medium' : 'initial',
      liked_score: round2(clamp01(adjustedPositive) * 100),
      disliked_score: round2(clamp01(adjustedNegative) * 100),
      polarizing_score: round2(polarizingScore),
      top_tags: Object.entries(item.tag_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
      positive_tags: Object.entries(item.positive_tag_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
      negative_tags: Object.entries(item.negative_tag_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
      round_breakdown: roundBreakdown,
      reviewed_rounds: reviewedRounds,
      negative_rounds: negativeRounds,
      positive_rounds: positiveRounds,
    }
  }).sort((a, b) => b.liked_score - a.liked_score || b.reviews - a.reviews || b.average - a.average || a.number - b.number)
}
