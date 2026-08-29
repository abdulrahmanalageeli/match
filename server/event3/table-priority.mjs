export const PREFERRED_ONE_TO_ONE_TABLES = Object.freeze([1, 2, 4, 5, 8, 9, 10, 11, 12, 15, 16])
export const EVENT3_PRIORITY_PARTICIPANT = 7
export const EVENT3_PRIORITY_TABLE = 5

const MIDDLE_TABLES = Object.freeze([3, 6, 7, 13, 14])

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : 0
}
function normalizedAge(value) {
  const age = Number(value)
  return Number.isFinite(age) && age >= 18 && age <= 100 ? age : 30
}

export function describePairPriority(pair, participantProfiles = {}, priorAttendanceCounts = {}) {
  const a = positiveInteger(pair?.a)
  const b = positiveInteger(pair?.b)
  const aPriorEvents = positiveInteger(priorAttendanceCounts[a])
  const bPriorEvents = positiveInteger(priorAttendanceCounts[b])
  const aAge = normalizedAge(participantProfiles[a]?.age)
  const bAge = normalizedAge(participantProfiles[b]?.age)
  const averageAge = (aAge + bAge) / 2
  const bothFirstTime = aPriorEvents === 0 && bPriorEvents === 0
  const hasFirstTimer = aPriorEvents === 0 || bPriorEvents === 0
  const bothFrequent = aPriorEvents >= 2 && bPriorEvents >= 2

  // This is intentionally a gentle priority, not an eligibility filter. Age
  // and first-time attendance lift a pair; only two frequent attendees receive
  // a strong downward nudge so they are the first candidates for tables 17+.
  const score = (averageAge * 10)
    + (bothFirstTime ? 350 : hasFirstTimer ? 150 : 0)
    - (bothFrequent ? 1200 : 0)

  return {
    score,
    averageAge,
    aPriorEvents,
    bPriorEvents,
    bothFirstTime,
    hasFirstTimer,
    bothFrequent,
    reason: bothFrequent
      ? "both_frequent"
      : bothFirstTime
        ? "both_first_time"
        : hasFirstTimer
          ? "has_first_timer"
          : "age_priority",
  }
}

function buildAvailableTables(pairCount, maxTableNumber) {
  const requestedMax = positiveInteger(maxTableNumber)
  const maxTable = Math.max(16, pairCount, requestedMax || 24)
  const preferred = PREFERRED_ONE_TO_ONE_TABLES.filter(table => table <= maxTable)
  const middle = MIDDLE_TABLES.filter(table => table <= maxTable)
  const overflow = []
  for (let table = 17; table <= maxTable; table++) overflow.push(table)
  return { preferred, middle, overflow }
}

export function assignPriorityTables(
  pairs,
  participantProfiles = {},
  priorAttendanceCounts = {},
  { maxTableNumber = 24 } = {},
) {
  if (!Array.isArray(pairs) || pairs.length === 0) return []

  const rankedPairs = pairs.map((pair, originalIndex) => ({
    ...pair,
    originalIndex,
    priority: describePairPriority(pair, participantProfiles, priorAttendanceCounts),
  })).sort((left, right) =>
    right.priority.score - left.priority.score
      || right.priority.averageAge - left.priority.averageAge
      || left.originalIndex - right.originalIndex
  )

  const { preferred, middle, overflow } = buildAvailableTables(pairs.length, maxTableNumber)
  const frequentCount = rankedPairs.filter(pair => pair.priority.bothFrequent).length
  const reservedOverflowCount = Math.min(frequentCount, overflow.length, pairs.length)

  // Reserve enough 17+ tables for frequent-returning pairs, then fill the
  // remaining seats from the preferred set and finally the middle set.
  const selected = []
  const nonOverflowNeeded = pairs.length - reservedOverflowCount
  selected.push(...preferred.slice(0, nonOverflowNeeded))
  if (selected.length < nonOverflowNeeded) {
    selected.push(...middle.slice(0, nonOverflowNeeded - selected.length))
  }
  if (selected.length < nonOverflowNeeded) {
    selected.push(...overflow.slice(0, nonOverflowNeeded - selected.length))
  }

  const selectedSet = new Set(selected)
  const reservedOverflow = overflow.filter(table => !selectedSet.has(table)).slice(0, reservedOverflowCount)
  selected.push(...reservedOverflow)

  if (selected.length < pairs.length) {
    const allTables = [...preferred, ...middle, ...overflow]
    for (const table of allTables) {
      if (!selectedSet.has(table) && !selected.includes(table)) selected.push(table)
      if (selected.length === pairs.length) break
    }
  }

  const assigned = rankedPairs.map((pair, index) => ({
    a: pair.a,
    b: pair.b,
    score: pair.score,
    table: selected[index],
    priority: pair.priority,
    originalIndex: pair.originalIndex,
  }))

  // Keep the requested organizer/VIP placement as a table preference only: it
  // never changes who is matched with whom. If table 5 is already occupied,
  // exchange the two table labels so every pair still owns exactly one table.
  const priorityPairIndex = assigned.findIndex(pair =>
    Number(pair.a) === EVENT3_PRIORITY_PARTICIPANT
      || Number(pair.b) === EVENT3_PRIORITY_PARTICIPANT
  )
  if (priorityPairIndex >= 0 && assigned[priorityPairIndex].table !== EVENT3_PRIORITY_TABLE) {
    const previousTable = assigned[priorityPairIndex].table
    const tableFivePairIndex = assigned.findIndex(pair => pair.table === EVENT3_PRIORITY_TABLE)
    assigned[priorityPairIndex].table = EVENT3_PRIORITY_TABLE
    if (tableFivePairIndex >= 0) assigned[tableFivePairIndex].table = previousTable
  }

  return assigned
}
