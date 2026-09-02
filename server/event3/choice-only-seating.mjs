import { buildSixBySevenPlan, normalizedGender } from "./round2-age-optimizer.mjs"
import { optimizeRound1SparkGroups } from "./round1-spark.mjs"
import { createRoundLensScorer, getRoundLensProfileMissingFields } from "./round23-lenses.mjs"

const TABLE_COUNT = 6
const GROUP_SIZE = 7
const PARTICIPANT_COUNT = TABLE_COUNT * GROUP_SIZE

const modulo = value => ((value % TABLE_COUNT) + TABLE_COUNT) % TABLE_COUNT

function duplicateColumnPair(values) {
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      if (values[left] === values[right]) return [left, right]
    }
  }
  return null
}

function isMinimumRepeatPattern(values) {
  const counts = Array(TABLE_COUNT).fill(0)
  values.forEach(value => counts[value]++)
  return counts.every(count => count === 1 || count === 2)
}

function buildMinimumRepeatShifts() {
  const result = []
  const shifts = Array(GROUP_SIZE).fill(0)
  const visit = column => {
    if (column === GROUP_SIZE) {
      if (isMinimumRepeatPattern(shifts)) result.push(Object.freeze([...shifts]))
      return
    }
    // Adding the same amount to every column only renumbers tables. Pinning the
    // first column removes those six equivalent copies from the search.
    if (column === 0) {
      shifts[column] = 0
      visit(column + 1)
      return
    }
    for (let shift = 0; shift < TABLE_COUNT; shift++) {
      shifts[column] = shift
      visit(column + 1)
    }
  }
  visit(0)
  return Object.freeze(result)
}

const MINIMUM_REPEAT_SHIFTS = buildMinimumRepeatShifts()

function columnPairMask(pair) {
  return pair ? (1 << pair[0]) | (1 << pair[1]) : 0
}

const DUPLICATE_MASK_BY_SHIFT = new Map(MINIMUM_REPEAT_SHIFTS.map(shifts => [
  shifts,
  columnPairMask(duplicateColumnPair(shifts)),
]))

const SHIFTS_BY_DUPLICATE_MASK = new Map()
for (const shifts of MINIMUM_REPEAT_SHIFTS) {
  const mask = DUPLICATE_MASK_BY_SHIFT.get(shifts)
  if (!SHIFTS_BY_DUPLICATE_MASK.has(mask)) SHIFTS_BY_DUPLICATE_MASK.set(mask, [])
  SHIFTS_BY_DUPLICATE_MASK.get(mask).push(shifts)
}

function duplicateDeltaMask(shifts, round2Shifts) {
  const firstColumnByValue = [-1, -1, -1, -1, -1, -1]
  let uniqueValues = 0
  let duplicateMask = 0
  for (let column = 0; column < GROUP_SIZE; column++) {
    const value = modulo(shifts[column] - round2Shifts[column])
    const firstColumn = firstColumnByValue[value]
    if (firstColumn === -1) {
      firstColumnByValue[value] = column
      uniqueValues++
    } else {
      // Two duplicated values, or one value appearing three times, cannot be a
      // minimum-repeat pattern.
      if (duplicateMask) return 0
      duplicateMask = (1 << firstColumn) | (1 << column)
    }
  }
  return uniqueValues === TABLE_COUNT ? duplicateMask : 0
}

function isValidRound3Shift(shifts, round2Shifts) {
  const round2Mask = DUPLICATE_MASK_BY_SHIFT.get(round2Shifts)
    || columnPairMask(duplicateColumnPair(round2Shifts))
  const round3Mask = DUPLICATE_MASK_BY_SHIFT.get(shifts)
    || columnPairMask(duplicateColumnPair(shifts))
  if (!round2Mask || !round3Mask || (round2Mask & round3Mask)) return false
  const deltaMask = duplicateDeltaMask(shifts, round2Shifts)
  if (!deltaMask) return false

  // Each duplicate column pair creates six unavoidable repeated participant
  // pairs. Keeping all three column-pairs vertex-disjoint makes those 18
  // repeats land on 36 different people: nobody repeats twice, six people have
  // no repeat, and no exact pair can survive all three rounds.
  return (deltaMask & (round2Mask | round3Mask)) === 0
}

let feasibleShiftPairs = null

function getFeasibleShiftPairs() {
  if (feasibleShiftPairs) return feasibleShiftPairs
  const result = []
  for (const round2Shifts of MINIMUM_REPEAT_SHIFTS) {
    const round2Mask = DUPLICATE_MASK_BY_SHIFT.get(round2Shifts)
    for (const [round3Mask, candidates] of SHIFTS_BY_DUPLICATE_MASK) {
      if (round2Mask & round3Mask) continue
      for (const round3Shifts of candidates) {
        if (isValidRound3Shift(round3Shifts, round2Shifts)) {
          result.push(Object.freeze([round2Shifts, round3Shifts]))
        }
      }
    }
  }
  feasibleShiftPairs = Object.freeze(result)
  return feasibleShiftPairs
}

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

function average(values, fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

function anchorStats(keys, scorePair) {
  const scores = keys.map(key => {
    const [left, right] = key.split("-").map(Number)
    return scorePair(left, right)
  })
  return {
    count: scores.length,
    average: average(scores, 0),
    minimum: scores.length ? Math.min(...scores) : 0,
  }
}

function repeatedSourcePairKeys(sourceRound, shifts) {
  const columns = duplicateColumnPair(shifts)
  if (!columns) return []
  return sourceRound.map(group => {
    const left = group[columns[0]]
    const right = group[columns[1]]
    return left < right ? `${left}-${right}` : `${right}-${left}`
  })
}

function repeatedBetweenShiftPairKeys(sourceRound, firstShifts, secondShifts) {
  const deltas = secondShifts.map((shift, column) => modulo(shift - firstShifts[column]))
  const columns = duplicateColumnPair(deltas)
  if (!columns) return []
  const [leftColumn, rightColumn] = columns
  const rightRowOffset = modulo(firstShifts[leftColumn] - firstShifts[rightColumn])
  return sourceRound.map((group, leftRow) => {
    const left = group[leftColumn]
    const right = sourceRound[modulo(leftRow + rightRowOffset)][rightColumn]
    return left < right ? `${left}-${right}` : `${right}-${left}`
  })
}

function summarizeDepth(groupScores) {
  return {
    score: average(groupScores.map(group => group.score), 0),
    lockedPairs: groupScores.reduce((sum, group) => sum + group.lockedPairs, 0),
    incompleteDepthCoverage: groupScores.filter(group => group.depthCoverageIncomplete).length,
    incompleteRoleCoverage: groupScores.filter(group => group.roleCoverageIncomplete).length,
    incompleteCuriosityCoverage: groupScores.filter(group => group.curiosityCoverageIncomplete).length,
    depthMismatches: groupScores.filter(group => group.depthMismatch).length,
    missingInitiators: groupScores.filter(group => group.initiatorMissing).length,
    missingCuriosityMixes: groupScores.filter(group => group.curiosityMixMissing).length,
    groupScores,
  }
}

function summarizeRhythm(groupScores) {
  return {
    score: average(groupScores.map(group => group.score), 0),
    compositionBonus: average(groupScores.map(group => group.compositionBonus), 0),
    qualityScore: average(groupScores.map(group => group.qualityScore), 0),
    lockedPairs: groupScores.reduce((sum, group) => sum + group.lockedPairs, 0),
    incompleteRoleCoverage: groupScores.filter(group => group.roleCoverageIncomplete).length,
    incompleteCuriosityCoverage: groupScores.filter(group => group.curiosityCoverageIncomplete).length,
    missingInitiators: groupScores.filter(group => group.initiatorMissing).length,
    missingRoleTrios: groupScores.filter(group => group.roleTrioMissing).length,
    missingCuriosityFlows: groupScores.filter(group => group.curiosityFlowMissing).length,
    humorClashes: groupScores.filter(group => group.humorClash).length,
    groupScores,
  }
}

function compareShiftVectors(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function compareJointPlans(left, right) {
  const leftWorstGenderSpread = Math.max(left.round2.gender.maximumSpread, left.round3.gender.maximumSpread)
  const rightWorstGenderSpread = Math.max(right.round2.gender.maximumSpread, right.round3.gender.maximumSpread)
  const leftWorstGenderDeviation = Math.max(left.round2.gender.squaredDeviation, left.round3.gender.squaredDeviation)
  const rightWorstGenderDeviation = Math.max(right.round2.gender.squaredDeviation, right.round3.gender.squaredDeviation)
  const leftLockedPairs = left.round2.depth.lockedPairs + left.round3.rhythm.lockedPairs
  const rightLockedPairs = right.round2.depth.lockedPairs + right.round3.rhythm.lockedPairs
  const numeric = [
    leftWorstGenderSpread - rightWorstGenderSpread,
    (left.round2.gender.maximumSpread + left.round3.gender.maximumSpread)
      - (right.round2.gender.maximumSpread + right.round3.gender.maximumSpread),
    (left.round2.gender.squaredDeviation + left.round3.gender.squaredDeviation)
      - (right.round2.gender.squaredDeviation + right.round3.gender.squaredDeviation),
    leftWorstGenderDeviation - rightWorstGenderDeviation,
    leftLockedPairs - rightLockedPairs,
    left.round2.depth.lockedPairs - right.round2.depth.lockedPairs,
    left.round2.depth.incompleteDepthCoverage - right.round2.depth.incompleteDepthCoverage,
    left.round2.depth.incompleteRoleCoverage - right.round2.depth.incompleteRoleCoverage,
    left.round2.depth.incompleteCuriosityCoverage - right.round2.depth.incompleteCuriosityCoverage,
    left.round2.depth.depthMismatches - right.round2.depth.depthMismatches,
    left.round2.depth.missingInitiators - right.round2.depth.missingInitiators,
    left.round2.depth.missingCuriosityMixes - right.round2.depth.missingCuriosityMixes,
    left.round3.rhythm.incompleteRoleCoverage - right.round3.rhythm.incompleteRoleCoverage,
    left.round3.rhythm.incompleteCuriosityCoverage - right.round3.rhythm.incompleteCuriosityCoverage,
    left.round3.rhythm.missingInitiators - right.round3.rhythm.missingInitiators,
    left.round3.rhythm.missingRoleTrios - right.round3.rhythm.missingRoleTrios,
    left.round3.rhythm.missingCuriosityFlows - right.round3.rhythm.missingCuriosityFlows,
    left.round3.rhythm.humorClashes - right.round3.rhythm.humorClashes,
    right.minimumLensQuality - left.minimumLensQuality,
    right.quality - left.quality,
    right.anchorMinimum - left.anchorMinimum,
    right.round2.quality - left.round2.quality,
    right.round3.quality - left.round3.quality,
    left.ageCost - right.ageCost,
    left.round3.ageCost - right.round3.ageCost,
  ]
  for (const difference of numeric) if (Math.abs(difference) > 1e-9) return difference
  return compareShiftVectors(left.round2.shifts, right.round2.shifts)
    || compareShiftVectors(left.round3.shifts, right.round3.shifts)
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
 * fit without changing any gender slot. Round two searches the minimum-repeat
 * layouts for Depth/Common Ground and strong Spark anchors. Round three keeps
 * the same repeat lower bound while optimizing Rhythm/Discovery.
 */
export function buildChoiceOnlySeatingPlan(values, {
  genderMap = {},
  ageMap = {},
  profileMap = new Map(),
  lockedPairsSet = new Set(),
  requireCompleteLensProfiles = false,
} = {}) {
  const normalized = normalizedParticipants(values)
  if (normalized.error) return normalized
  const participants = normalized.participants

  if (requireCompleteLensProfiles) {
    const incomplete = participants.filter(number => {
      const profile = profileMap instanceof Map ? profileMap.get(number) : profileMap?.[number]
      return !profile || getRoundLensProfileMissingFields(profile).length > 0
    })
    if (incomplete.length) {
      const preview = incomplete.slice(0, 10).map(number => `#${number}`).join(", ")
      const remainder = incomplete.length > 10 ? ` and ${incomplete.length - 10} more` : ""
      return { error: `Choice-only lens rounds require complete survey profiles; incomplete: ${preview}${remainder}` }
    }
  }

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
  const lenses = createRoundLensScorer({ profileMap, lockedPairsSet })

  const layoutCache = new Map()
  const layoutFor = shifts => {
    if (layoutCache.has(shifts)) return layoutCache.get(shifts)
    const groups = applyColumnShifts(round1, shifts)
    const layout = {
      shifts,
      groups,
      gender: genderScore(groups, genderMap),
      ageCost: ageCost(groups, ageMap),
    }
    layoutCache.set(shifts, layout)
    return layout
  }

  const round2Cache = new Map()
  const round2For = shifts => {
    if (round2Cache.has(shifts)) return round2Cache.get(shifts)
    const layout = layoutFor(shifts)
    const depth = summarizeDepth(layout.groups.map(lenses.depthGroup))
    const anchors = anchorStats(repeatedSourcePairKeys(round1, shifts), lenses.sparkPairScore)
    const candidate = {
      ...layout,
      depth,
      anchors,
      // Depth owns the table experience; the repeated Spark pair is a deliberate
      // social anchor rather than an arbitrary structural duplicate.
      quality: (depth.score * 0.75) + (anchors.average * 0.15) + (anchors.minimum * 0.10),
    }
    round2Cache.set(shifts, candidate)
    return candidate
  }

  const round3BaseCache = new Map()
  const round3BaseFor = shifts => {
    if (round3BaseCache.has(shifts)) return round3BaseCache.get(shifts)
    const layout = layoutFor(shifts)
    const candidate = {
      ...layout,
      rhythm: summarizeRhythm(layout.groups.map(lenses.rhythmGroup)),
      sparkAnchors: anchorStats(repeatedSourcePairKeys(round1, shifts), lenses.sparkPairScore),
    }
    round3BaseCache.set(shifts, candidate)
    return candidate
  }

  let best = null
  for (const [round2Shifts, round3Shifts] of getFeasibleShiftPairs()) {
    const round2Candidate = round2For(round2Shifts)
    // Selecting the rounds together prevents a locally attractive Depth round
    // from stranding Rhythm without a gender-balanced, burden-one solution.
    const round3Base = round3BaseFor(round3Shifts)
    const sparkAnchors = round3Base.sparkAnchors
    const depthAnchors = anchorStats(
      repeatedBetweenShiftPairKeys(round1, round2Shifts, round3Shifts),
      lenses.depthPairScore,
    )
    const allAnchorMinimum = Math.min(sparkAnchors.minimum, depthAnchors.minimum)
    const round3Candidate = {
      ...round3Base,
      anchors: {
        round1Spark: sparkAnchors,
        round2Depth: depthAnchors,
        minimum: allAnchorMinimum,
      },
      quality: (round3Base.rhythm.qualityScore * 0.75)
        + (sparkAnchors.average * 0.10)
        + (depthAnchors.average * 0.10)
        + (allAnchorMinimum * 0.05),
    }
    const candidate = {
      round2: round2Candidate,
      round3: round3Candidate,
      quality: round2Candidate.quality + round3Candidate.quality,
      minimumLensQuality: Math.min(round2Candidate.quality, round3Candidate.quality),
      anchorMinimum: Math.min(round2Candidate.anchors.minimum, round3Candidate.anchors.minimum),
      ageCost: round2Candidate.ageCost + round3Candidate.ageCost,
    }
    if (!best || compareJointPlans(candidate, best) < 0) best = candidate
  }

  if (!best) return { error: "Could not construct joint minimum-repeat Depth and Rhythm rounds" }
  const round2 = best.round2.groups
  const round3 = best.round3.groups
  const repeatMetrics = choiceOnlySeatingMetrics(round1, round2, round3)
  const positionMap = {}
  round1.flat().forEach((number, index) => { positionMap[number] = index })
  return {
    round1,
    round2,
    round3,
    T: TABLE_COUNT,
    G: GROUP_SIZE,
    R: 0,
    positionMap,
    round1Spark: spark.metrics,
    round2Depth: {
      ...best.round2.depth,
      anchors: best.round2.anchors,
      quality: best.round2.quality,
      ageCost: best.round2.ageCost,
      shifts: best.round2.shifts,
    },
    round3Rhythm: {
      ...best.round3.rhythm,
      anchors: best.round3.anchors,
      quality: best.round3.quality,
      ageCost: best.round3.ageCost,
      shifts: best.round3.shifts,
      repeatMetrics,
    },
  }
}
