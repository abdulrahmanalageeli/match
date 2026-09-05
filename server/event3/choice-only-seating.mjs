import { buildSixBySevenPlan, normalizedGender } from "./round2-age-optimizer.mjs"
import { optimizeRound1SparkGroups } from "./round1-spark.mjs"
import { createRoundLensScorer, getRoundLensProfileMissingFields } from "./round23-lenses.mjs"
import { buildFlexibleChoiceOnlySeatingCandidates } from "./flexible-choice-seating.mjs"

const TABLE_COUNT = 6
const GROUP_SIZE = 7
const PARTICIPANT_COUNT = TABLE_COUNT * GROUP_SIZE

export const CHOICE_ONLY_SEATING_OBJECTIVE_VERSION = "spark-depth-rhythm-v1"

// Preview alternatives must feel like different complete plans, not the same
// tables with different numbers. Replacing half of the 126 companion
// relationships in every round means every accepted option changes at least
// three of an average participant's six tablemates. Requiring 36 affected
// participants also prevents those changes from being concentrated in one
// corner.
const CANDIDATE_DIVERSITY_POLICY = Object.freeze({
  minimumPairMembershipChangesPerRound: 126,
  minimumParticipantsWithChangedCompanionsPerRound: 36,
  // Retain the original response keys for persisted previews created while
  // this feature was in development.
  minimumPairMembershipChangesPerLensRound: 126,
  minimumParticipantsWithChangedCompanionsPerLensRound: 36,
})

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

function popcount32(value) {
  value -= (value >>> 1) & 0x55555555
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333)
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function buildPairSignature(groups, participantIndex) {
  const pairBits = new Uint32Array(Math.ceil((PARTICIPANT_COUNT ** 2) / 32))
  const companionBits = new Uint32Array(PARTICIPANT_COUNT * 2)
  for (const group of groups) {
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) {
        const leftIndex = participantIndex.get(group[left])
        const rightIndex = participantIndex.get(group[right])
        const a = Math.min(leftIndex, rightIndex)
        const b = Math.max(leftIndex, rightIndex)
        const pairIndex = (a * PARTICIPANT_COUNT) + b
        pairBits[pairIndex >>> 5] |= 1 << (pairIndex & 31)
        companionBits[(a * 2) + (b >>> 5)] |= 1 << (b & 31)
        companionBits[(b * 2) + (a >>> 5)] |= 1 << (a & 31)
      }
    }
  }
  return { pairBits, companionBits }
}

function pairDifference(left, right) {
  let changedPairMemberships = 0
  for (let index = 0; index < left.pairBits.length; index++) {
    changedPairMemberships += popcount32(left.pairBits[index] ^ right.pairBits[index])
  }
  let participantsWithChangedCompanions = 0
  for (let index = 0; index < PARTICIPANT_COUNT; index++) {
    if (left.companionBits[index * 2] !== right.companionBits[index * 2]
      || left.companionBits[(index * 2) + 1] !== right.companionBits[(index * 2) + 1]) {
      participantsWithChangedCompanions++
    }
  }
  return {
    changedPairMemberships,
    replacedPairs: changedPairMemberships / 2,
    participantsWithChangedCompanions,
    averageTablematesReplaced: changedPairMemberships / PARTICIPANT_COUNT,
    averageCompanionMembershipChanges: (changedPairMemberships * 2) / PARTICIPANT_COUNT,
  }
}

function diversityBetweenPlans(left, right) {
  const round1 = pairDifference(left.round1.pairSignature, right.round1.pairSignature)
  const round2 = pairDifference(left.round2.pairSignature, right.round2.pairSignature)
  const round3 = pairDifference(left.round3.pairSignature, right.round3.pairSignature)
  let participantsWithAnyChangedCompanions = 0
  for (let index = 0; index < PARTICIPANT_COUNT; index++) {
    const round1Changed = left.round1.pairSignature.companionBits[index * 2]
      !== right.round1.pairSignature.companionBits[index * 2]
      || left.round1.pairSignature.companionBits[(index * 2) + 1]
        !== right.round1.pairSignature.companionBits[(index * 2) + 1]
    const round2Changed = left.round2.pairSignature.companionBits[index * 2]
      !== right.round2.pairSignature.companionBits[index * 2]
      || left.round2.pairSignature.companionBits[(index * 2) + 1]
        !== right.round2.pairSignature.companionBits[(index * 2) + 1]
    const round3Changed = left.round3.pairSignature.companionBits[index * 2]
      !== right.round3.pairSignature.companionBits[index * 2]
      || left.round3.pairSignature.companionBits[(index * 2) + 1]
        !== right.round3.pairSignature.companionBits[(index * 2) + 1]
    if (round1Changed || round2Changed || round3Changed) participantsWithAnyChangedCompanions++
  }
  return {
    round1,
    round2,
    round3,
    totalChangedPairMemberships: round1.changedPairMemberships
      + round2.changedPairMemberships
      + round3.changedPairMemberships,
    participantsWithAnyChangedCompanions,
  }
}

function isMateriallyDifferent(candidate, selected, roundNumbers = [1, 2, 3]) {
  const diversity = diversityBetweenPlans(candidate, selected)
  return roundNumbers.map(round => diversity[`round${round}`]).every(round => (
    round.changedPairMemberships >= CANDIDATE_DIVERSITY_POLICY.minimumPairMembershipChangesPerRound
    && round.participantsWithChangedCompanions
      >= CANDIDATE_DIVERSITY_POLICY.minimumParticipantsWithChangedCompanionsPerRound
  ))
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

function compareNumberVectors(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (Math.abs(difference) > 1e-9) return difference
  }
  return 0
}

function canonicalRound1MembershipVector(groups) {
  return groups
    .map(group => [...group].sort((left, right) => left - right))
    .sort(compareNumberVectors)
    .flat()
}

function round1ObjectiveVector(candidate) {
  const fitness = candidate.spark?.metrics?.after || {}
  return [
    // The established unconstrained winner remains rank one for backwards
    // compatibility. Every alternative is then ranked by exactly the old
    // Spark priorities before the later-lens objective.
    candidate.round1?.establishedBest === true ? 0 : 1,
    Number(fitness.lockedPairs || 0),
    Number(fitness.depthMismatches || 0),
    Number(fitness.missingInitiators || 0),
    Number(fitness.ageRangeViolations || 0),
    -Number(fitness.score || 0),
    ...canonicalRound1MembershipVector(candidate.round1?.groups || []),
  ]
}

function jointPlanObjectiveVector(candidate) {
  const worstGenderSpread = Math.max(candidate.round2.gender.maximumSpread, candidate.round3.gender.maximumSpread)
  const worstGenderDeviation = Math.max(candidate.round2.gender.squaredDeviation, candidate.round3.gender.squaredDeviation)
  const lockedPairs = candidate.round2.depth.lockedPairs + candidate.round3.rhythm.lockedPairs
  return [
    ...round1ObjectiveVector(candidate),
    worstGenderSpread,
    candidate.round2.gender.maximumSpread + candidate.round3.gender.maximumSpread,
    candidate.round2.gender.squaredDeviation + candidate.round3.gender.squaredDeviation,
    worstGenderDeviation,
    lockedPairs,
    candidate.round2.depth.lockedPairs,
    candidate.round2.depth.incompleteDepthCoverage,
    candidate.round2.depth.incompleteRoleCoverage,
    candidate.round2.depth.incompleteCuriosityCoverage,
    candidate.round2.depth.depthMismatches,
    candidate.round2.depth.missingInitiators,
    candidate.round2.depth.missingCuriosityMixes,
    candidate.round3.rhythm.incompleteRoleCoverage,
    candidate.round3.rhythm.incompleteCuriosityCoverage,
    candidate.round3.rhythm.missingInitiators,
    candidate.round3.rhythm.missingRoleTrios,
    candidate.round3.rhythm.missingCuriosityFlows,
    candidate.round3.rhythm.humorClashes,
    -candidate.minimumLensQuality,
    -candidate.quality,
    -candidate.anchorMinimum,
    -candidate.round2.quality,
    -candidate.round3.quality,
    candidate.ageCost,
    candidate.round3.ageCost,
    ...candidate.round2.shifts,
    ...candidate.round3.shifts,
  ]
}

function compareJointPlans(left, right) {
  const leftObjective = jointPlanObjectiveVector(left)
  const rightObjective = jointPlanObjectiveVector(right)
  return compareNumberVectors(leftObjective, rightObjective)
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
function buildChoiceOnlySeatingSearch(values, {
  genderMap = {},
  ageMap = {},
  profileMap = new Map(),
  lockedPairsSet = new Set(),
  requireCompleteLensProfiles = false,
} = {}, candidateCount = 1, {
  round1Source = null,
  excludedCandidates = [],
  diversityRoundNumbers = [1, 2, 3],
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

  const participantIndex = new Map(participants.map((number, index) => [number, index]))
  let spark
  if (round1Source) {
    spark = {
      groups: round1Source.spark.groups.map(group => [...group]),
      metrics: round1Source.spark.metrics,
    }
  } else {
    const genderObject = genderMap instanceof Map ? Object.fromEntries(genderMap) : genderMap
    const balanced = buildSixBySevenPlan(participants, genderObject)
    const baselineRound1 = balanced?.round1 || Array.from({ length: TABLE_COUNT }, (_, table) =>
      participants.slice(table * GROUP_SIZE, (table + 1) * GROUP_SIZE))
    spark = optimizeRound1SparkGroups(baselineRound1, {
      genderMap,
      ageMap,
      profileMap,
      lockedPairsSet,
    })
  }
  const round1 = spark.groups
  const round1Layout = {
    groups: round1,
    pairSignature: buildPairSignature(round1, participantIndex),
    gender: genderScore(round1, genderMap),
    ageCost: ageCost(round1, ageMap),
    establishedBest: !round1Source,
    variantKey: round1Source?.variantKey || "primary",
  }
  const lenses = createRoundLensScorer({ profileMap, lockedPairsSet })

  const layoutCache = new Map()
  const layoutFor = shifts => {
    if (layoutCache.has(shifts)) return layoutCache.get(shifts)
    const groups = applyColumnShifts(round1, shifts)
    const layout = {
      shifts,
      groups,
      pairSignature: buildPairSignature(groups, participantIndex),
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

  const bestCandidates = []
  for (let rank = 0; rank < candidateCount; rank++) {
    let best = null
    for (const [round2Shifts, round3Shifts] of getFeasibleShiftPairs()) {
      const round2Candidate = round2For(round2Shifts)
      // Selecting the rounds together prevents a locally attractive Depth round
      // from stranding Rhythm without a gender-balanced, burden-one solution.
      const round3Base = round3BaseFor(round3Shifts)
      const diversityProbe = {
        round1: round1Layout,
        spark,
        round2: round2Candidate,
        round3: round3Base,
      }
      if ([...excludedCandidates, ...bestCandidates]
        .some(selected => !isMateriallyDifferent(diversityProbe, selected, diversityRoundNumbers))) continue

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
        round1: round1Layout,
        spark,
        round2: round2Candidate,
        round3: round3Candidate,
        quality: round2Candidate.quality + round3Candidate.quality,
        minimumLensQuality: Math.min(round2Candidate.quality, round3Candidate.quality),
        anchorMinimum: Math.min(round2Candidate.anchors.minimum, round3Candidate.anchors.minimum),
        ageCost: round2Candidate.ageCost + round3Candidate.ageCost,
      }
      if (!best || compareJointPlans(candidate, best) < 0) best = candidate
    }
    if (!best) {
      return {
        error: candidateCount === 1
          ? "Could not construct joint minimum-repeat Depth and Rhythm rounds"
          : `Could not construct ${candidateCount} materially different minimum-repeat seating candidates`,
      }
    }
    bestCandidates.push(best)
  }

  return { participants, bestCandidates }
}

function serializeChoiceOnlyPlan({ participants }, best) {
  const round1 = best.round1.groups
  const spark = best.spark
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

function candidateIdentifier(candidate) {
  const round1Prefix = candidate.round1.establishedBest ? "" : `r1-${candidate.round1.variantKey}-`
  return `${round1Prefix}r2-${candidate.round2.shifts.join("")}-r3-${candidate.round3.shifts.join("")}`
}

function canonicalObjective(candidate) {
  const sparkFitness = candidate.spark?.metrics?.after || {}
  return {
    version: CHOICE_ONLY_SEATING_OBJECTIVE_VERSION,
    sortKey: jointPlanObjectiveVector(candidate),
    establishedBest: candidate.round1.establishedBest === true,
    round1SparkScore: sparkFitness.score ?? null,
    quality: candidate.quality,
    minimumLensQuality: candidate.minimumLensQuality,
    anchorMinimum: candidate.anchorMinimum,
    ageCost: candidate.ageCost,
  }
}

function round1MembershipKey(groups) {
  return canonicalRound1MembershipVector(groups).join(".")
}

function round1VariantKey(groups) {
  let hash = 14695981039346656037n
  for (const number of canonicalRound1MembershipVector(groups)) {
    hash ^= BigInt(number)
    hash = BigInt.asUintN(64, hash * 1099511628211n)
  }
  return hash.toString(36)
}

function rawSparkResult(groups, scored) {
  return {
    groups: groups.map(group => [...group]),
    metrics: {
      before: scored.metrics.before,
      after: scored.metrics.before,
      swaps: 0,
    },
  }
}

function alternativeRound1Sources(seedCandidates, options) {
  const sources = []
  const add = spark => sources.push({
    spark,
    variantKey: round1VariantKey(spark.groups),
  })

  // The three already-ranked Depth layouts are pairwise diverse and retain
  // the structural gender guarantees. Re-optimizing each one with the legacy
  // Spark scorer produces high-quality alternative first rounds; the raw
  // layout remains as a deterministic fallback if local optimization converges
  // back toward an earlier arrangement.
  for (const candidate of seedCandidates) {
    const seed = candidate.round2.groups.map(group => [...group])
    const optimized = optimizeRound1SparkGroups(seed, options)
    add(optimized)
    add(rawSparkResult(seed, optimized))
  }
  const unique = new Map()
  for (const source of sources) {
    const key = round1MembershipKey(source.spark.groups)
    if (!unique.has(key)) unique.set(key, source)
  }
  return [...unique.values()].sort((left, right) => compareNumberVectors(
    round1ObjectiveVector({
      round1: { groups: left.spark.groups, establishedBest: false },
      spark: left.spark,
    }),
    round1ObjectiveVector({
      round1: { groups: right.spark.groups, establishedBest: false },
      spark: right.spark,
    }),
  ))
}

/**
 * Return three deterministic, canonically ranked preview choices. Rank two is
 * the best plan materially different from rank one; rank three is the best
 * plan materially different from both earlier choices. All three use the same
 * objective and preserve the exact structural repeat guarantees while applying
 * the same gender, protected-pair, lens-quality, and age priorities.
 *
 * Rank one intentionally remains the established best Spark arrangement for
 * backwards compatibility. Ranks two and three use separately Spark-scored
 * first rounds, then rebuild both later rounds from those grids. Material
 * diversity is enforced independently in all three rounds.
 */
export function buildChoiceOnlySeatingCandidates(values, options = {}) {
  if (Array.isArray(values) && values.length !== PARTICIPANT_COUNT) {
    return buildFlexibleChoiceOnlySeatingCandidates(values, options)
  }
  const primarySearch = buildChoiceOnlySeatingSearch(values, options, 3, {
    // These two extra fixed-Spark results only seed alternative Round 1 grids.
    diversityRoundNumbers: [2, 3],
  })
  if (primarySearch.error) return primarySearch

  const bestCandidates = [primarySearch.bestCandidates[0]]
  const sources = alternativeRound1Sources(primarySearch.bestCandidates, options)
  for (const round1Source of sources) {
    if (bestCandidates.length === 3) break
    const search = buildChoiceOnlySeatingSearch(values, options, 1, {
      round1Source,
      excludedCandidates: bestCandidates,
    })
    if (!search.error) bestCandidates.push(search.bestCandidates[0])
  }
  if (bestCandidates.length !== 3) {
    return { error: "Could not construct three materially different complete seating candidates" }
  }

  const resultContext = { participants: primarySearch.participants }
  const ids = bestCandidates.map(candidateIdentifier)
  const candidates = bestCandidates.map((candidate, index) => {
    const comparisons = bestCandidates.slice(0, index).map((earlier, earlierIndex) => ({
      candidateId: ids[earlierIndex],
      rank: earlierIndex + 1,
      ...diversityBetweenPlans(candidate, earlier),
    }))
    return {
      id: ids[index],
      rank: index + 1,
      plan: serializeChoiceOnlyPlan(resultContext, candidate),
      canonicalObjective: canonicalObjective(candidate),
      diversity: {
        round1Fixed: false,
        fromBest: comparisons[0] || null,
        comparedWithEarlier: comparisons,
      },
    }
  })
  return {
    objectiveVersion: CHOICE_ONLY_SEATING_OBJECTIVE_VERSION,
    diversityPolicy: { ...CANDIDATE_DIVERSITY_POLICY },
    candidates,
  }
}

export function buildChoiceOnlySeatingPlan(values, options = {}) {
  if (Array.isArray(values) && values.length !== PARTICIPANT_COUNT) {
    const generated = buildFlexibleChoiceOnlySeatingCandidates(values, options)
    return generated.error ? generated : generated.candidates[0].plan
  }
  const search = buildChoiceOnlySeatingSearch(values, options, 1)
  if (search.error) return search
  return serializeChoiceOnlyPlan(search, search.bestCandidates[0])
}
