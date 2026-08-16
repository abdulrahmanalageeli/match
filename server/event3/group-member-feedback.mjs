export const GROUP_EXPERIENCES = Object.freeze(['great', 'good', 'neutral', 'uncomfortable'])

export const GROUP_FEEDBACK_TAGS = Object.freeze([
  'fun', 'comfortable', 'good_listener', 'respectful', 'engaging',
  'quiet', 'hard_to_connect', 'interrupts', 'dominates', 'disrespectful',
])

const EXPERIENCE_SET = new Set(GROUP_EXPERIENCES)
const TAG_SET = new Set(GROUP_FEEDBACK_TAGS)

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

export function buildGroupMemberFeedbackSummary(rows = [], nameMap = {}) {
  const weights = { great: 4, good: 3, neutral: 2, uncomfortable: 1 }
  const summaries = new Map()
  const getName = number => nameMap instanceof Map ? nameMap.get(number) : nameMap[number]

  for (const row of rows || []) {
    const number = Number(row.member_number)
    const current = summaries.get(number) || {
      number,
      name: getName(number) || `#${number}`,
      reviews: 0,
      score_total: 0,
      great: 0,
      good: 0,
      neutral: 0,
      uncomfortable: 0,
      tag_counts: {},
    }
    current.reviews += 1
    current.score_total += weights[row.experience] || 0
    if (Object.hasOwn(current, row.experience)) current[row.experience] += 1
    for (const tag of row.tags || []) current.tag_counts[tag] = (current.tag_counts[tag] || 0) + 1
    summaries.set(number, current)
  }

  return [...summaries.values()].map(item => ({
    ...item,
    average: item.reviews ? Math.round((item.score_total / item.reviews) * 10) / 10 : 0,
    positive: item.great + item.good,
    negative: item.uncomfortable,
    top_tags: Object.entries(item.tag_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3),
  })).sort((a, b) => b.average - a.average || b.reviews - a.reviews || a.number - b.number)
}
