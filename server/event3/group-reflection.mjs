export function normalizeGroupReflectionInput({ rankedNumbers, organizerNote, groupRound, rankerNumber, allowedNumbers }) {
  const ranking = Array.isArray(rankedNumbers) ? rankedNumbers.map(Number) : []
  const note = String(organizerNote || '').trim()
  const allowed = allowedNumbers instanceof Set ? allowedNumbers : new Set(allowedNumbers || [])
  const round = Number(groupRound)

  if (![1, 2].includes(round)) return { error: 'Group round must be 1 or 2' }
  if (ranking.length > 3) return { error: 'Choose no more than three participants' }
  if (note.length > 300) return { error: 'Organizer note must be 300 characters or fewer' }
  if (ranking.length === 0 && !note) return { error: 'Choose someone or add a note before saving' }
  if (ranking.some(number => !Number.isInteger(number) || number <= 0 || number === Number(rankerNumber)) || new Set(ranking).size !== ranking.length) {
    return { error: 'Group ranking contains an invalid or duplicate participant' }
  }
  if (ranking.some(number => !allowed.has(number))) return { error: 'You can only rank participants you met in your group rounds' }

  return {
    value: {
      rankedNumbers: ranking,
      organizerNote: note,
      groupRound: round,
      sourcePhase: `ranking${round}`,
    },
  }
}

export function buildGroupReflectionLeaderboard(rows = [], nameMap = {}) {
  const scores = new Map()
  const getName = number => nameMap instanceof Map ? nameMap.get(number) : nameMap[number]

  for (const row of rows || []) {
    ;(row.ranked_numbers || []).slice(0, 3).forEach((number, index) => {
      const current = scores.get(number) || {
        number,
        name: getName(number) || `#${number}`,
        points: 0,
        selections: 0,
        first_place_count: 0,
      }
      current.points += 3 - index
      current.selections += 1
      if (index === 0) current.first_place_count += 1
      scores.set(number, current)
    })
  }

  return [...scores.values()].sort((a, b) =>
    b.points - a.points
    || b.first_place_count - a.first_place_count
    || b.selections - a.selections
    || a.number - b.number
  )
}
