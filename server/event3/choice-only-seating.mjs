import { buildSixBySevenPlan, normalizedGender } from "./round2-age-optimizer.mjs"
import { optimizeRound1SparkGroups } from "./round1-spark.mjs"

const TABLE_COUNT = 6
const GROUP_SIZE = 7
const PARTICIPANT_COUNT = TABLE_COUNT * GROUP_SIZE
const ROUND2_SHIFTS = Object.freeze([0, 1, 2, 3, 4, 5, 0])

const modulo = value => ((value % TABLE_COUNT) + TABLE_COUNT) % TABLE_COUNT

function duplicateColumnPair(values) {
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      if (values[left] === values[right]) return [left, right]
    }
  }
  return null
}

function isMinimumRepeatShift(shifts) {
  const sourceCounts = Array(TABLE_COUNT).fill(0)
  const priorRoundCounts = Array(TABLE_COUNT).fill(0)
  const deltas = shifts.map((shift, column) => modulo(shift - ROUND2_SHIFTS[column]))
  shifts.forEach(shift => sourceCounts[shift]++)
  deltas.forEach(delta => priorRoundCounts[delta]++)

  // A new seven-person group draws from only six old groups, so one repeated
  // source is unavoidable at every table. These counts attain that lower bound
  // against both earlier rounds: one source twice, every other source once.
  if (!sourceCounts.every(count => count === 1 || count === 2)) return false
  if (!priorRoundCounts.every(count => count === 1 || count === 2)) return false

  // If the duplicate column pair is the same for both partitions, that exact
  // pair would sit together in all three rounds. Keep the unavoidable repeats
  // spread across different pairs instead.
  return duplicateColumnPair(shifts)?.join("-") !== duplicateColumnPair(deltas)?.join("-")
}

function buildValidRound3Shifts() {
  const result = []
  const shifts = Array(GROUP_SIZE).fill(0)
  const visit = column => {
    if (column === GROUP_SIZE) {
      if (isMinimumRepeatShift(shifts)) result.push([...shifts])
      return
    }
    for (let shift = 0; shift < TABLE_COUNT; shift++) {
      shifts[column] = shift
      visit(column + 1)
    }
  }
  visit(0)
  return result
}

const VALID_ROUND3_SHIFTS = buildValidRound3Shifts()

function applyColumnShifts(round1, shifts) {
  const groups = Array.from({ length: TABLE_COUNT }, () => [])
  for (let sourceTable = 0; sourceTable < TABLE_COUNT; sourceTable++) {
    for (let column = 0; column < GROUP_SIZE; column++) {
      groups[modulo(sourceTable + shifts[column])].push(round1[sourceTable][column])
    }
  }
  return groups
}

function pairSet(groups) {
  const result = new Set()
  for (const group of groups) {
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) {
        const a = Math.min(group[left], group[right])
        const b = Math.max(group[left], group[right])
        result.add(`${a}-${b}`)
      }
    }
  }
  return result
}

function intersection(left, right) {
  return [...left].filter(value => right.has(value))
}

export function choiceOnlySeatingMetrics(round1, round2, round3) {
  const sets = [pairSet(round1), pairSet(round2), pairSet(round3)]
  const repeated12 = intersection(sets[0], sets[1])
  const repeated13 = intersection(sets[0], sets[2])
  const repeated23 = intersection(sets[1], sets[2])
  const repeatedAll = repeated12.filter(key => sets[2].has(key))
  const burden = new Map()
  for (const key of [...repeated12, ...repeated13, ...repeated23]) {
    for (const number of key.split("-").map(Number)) burden.set(number, (burden.get(number) || 0) + 1)
  }
  const burdenValues = [...burden.values()]
  return {
    round1Round2: repeated12.length,
    round1Round3: repeated13.length,
    round2Round3: repeated23.length,
    totalRepeatedPairOccurrences: repeated12.length + repeated13.length + repeated23.length,
    repeatedInAllThree: repeatedAll.length,
    maximumParticipantRepeatBurden: burdenValues.length ? Math.max(...burdenValues) : 0,
    squaredParticipantRepeatBurden: burdenValues.reduce((sum, count) => sum + count ** 2, 0),
  }
}

function genderScore(groups, genderMap) {
  const categories = ["female", "male", "unknown"]
  let maximumSpread = 0
  let squaredDeviation = 0
  for (const category of categories) {
    const counts = groups.map(group => group.filter(number => normalizedGender(
      genderMap instanceof Map ? genderMap.get(number) : genderMap?.[number],
    ) === category).length)
    const total = counts.reduce((sum, count) => sum + count, 0)
    if (total === 0) continue
    maximumSpread = Math.max(maximumSpread, Math.max(...counts) - Math.min(...counts))
    const ideal = total / TABLE_COUNT
    squaredDeviation += counts.reduce((sum, count) => sum + (count - ideal) ** 2, 0)
  }
  return { maximumSpread, squaredDeviation }
}

function ageCost(groups, ageMap) {
  let cost = 0
  for (const group of groups) {
    for (let left = 0; left < group.length; left++) {
      const leftAge = Number(ageMap instanceof Map ? ageMap.get(group[left]) : ageMap?.[group[left]])
      if (!Number.isFinite(leftAge) || leftAge <= 0) continue
      for (let right = left + 1; right < group.length; right++) {
        const rightAge = Number(ageMap instanceof Map ? ageMap.get(group[right]) : ageMap?.[group[right]])
        if (Number.isFinite(rightAge) && rightAge > 0) cost += (leftAge - rightAge) ** 2
      }
    }
  }
  return cost
}

function compareShiftPlans(left, right) {
  const numeric = [
    left.gender.maximumSpread - right.gender.maximumSpread,
    left.gender.squaredDeviation - right.gender.squaredDeviation,
    left.metrics.maximumParticipantRepeatBurden - right.metrics.maximumParticipantRepeatBurden,
    left.metrics.squaredParticipantRepeatBurden - right.metrics.squaredParticipantRepeatBurden,
    left.ageCost - right.ageCost,
  ]
  for (const difference of numeric) if (difference !== 0) return difference
  for (let index = 0; index < left.shifts.length; index++) {
    if (left.shifts[index] !== right.shifts[index]) return left.shifts[index] - right.shifts[index]
  }
  return 0
}

function normalizedParticipants(values) {
  if (!Array.isArray(values) || values.length !== PARTICIPANT_COUNT) {
    return { error: `Choice-only seating requires exactly ${PARTICIPANT_COUNT} participants` }
  }
  const participants = values.map(value => Number(value?.participant_number ?? value?.assigned_number ?? value))
  if (participants.some(number => !Number.isInteger(number) || number <= 0)) {
    return { error: "Choice-only seating participant numbers must be positive integers" }
  }
  if (new Set(participants).size !== participants.length) {
    return { error: "Choice-only seating participant numbers must be unique" }
  }
  return { participants }
}

/**
 * Build six groups of seven for three rounds. Round one starts from the
 * established gender-balanced Event3 grid, then improves its survey-only Spark
 * fit without changing any gender slot. The later cyclic rounds are rebuilt
 * from that grid so their repeat guarantees stay valid.
 */
export function buildChoiceOnlySeatingPlan(values, {
  genderMap = {},
  ageMap = {},
  profileMap = new Map(),
  lockedPairsSet = new Set(),
} = {}) {
  const normalized = normalizedParticipants(values)
  if (normalized.error) return normalized
  const participants = normalized.participants

  const genderObject = genderMap instanceof Map ? Object.fromEntries(genderMap) : genderMap
  const balanced = buildSixBySevenPlan(participants, genderObject)
  const baselineRound1 = balanced?.round1 || Array.from({ length: TABLE_COUNT }, (_, table) =>
    participants.slice(table * GROUP_SIZE, (table + 1) * GROUP_SIZE))
  const spark = optimizeRound1SparkGroups(baselineRound1, {
    genderMap,
    ageMap,
    profileMap,
    lockedPairsSet,
  })
  const round1 = spark.groups

  // buildSixBySevenPlan derives Round 2 from its original Round 1. Rebuild it
  // after Spark swaps so the cyclic no-repeat construction uses the optimized
  // Round-1 grid rather than stale participant positions.
  const derivedRound2 = applyColumnShifts(round1, ROUND2_SHIFTS)

  let best = null
  for (const shifts of VALID_ROUND3_SHIFTS) {
    const round3 = applyColumnShifts(round1, shifts)
    const candidate = {
      shifts,
      round3,
      gender: genderScore(round3, genderMap),
      metrics: choiceOnlySeatingMetrics(round1, derivedRound2, round3),
      ageCost: ageCost(round3, ageMap),
    }
    if (!best || compareShiftPlans(candidate, best) < 0) best = candidate
  }

  if (!best) return { error: "Could not construct a minimum-repeat third group round" }
  const positionMap = {}
  round1.flat().forEach((number, index) => { positionMap[number] = index })
  return {
    round1,
    round2: derivedRound2,
    round3: best.round3,
    T: TABLE_COUNT,
    G: GROUP_SIZE,
    R: 0,
    positionMap,
    round1Spark: spark.metrics,
  }
}
