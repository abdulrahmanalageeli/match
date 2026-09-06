import { normalizedGender } from "./round2-age-optimizer.mjs"
import { createRound1SparkGroupScorer } from "./round1-spark.mjs"
import { createRoundLensScorer } from "./round23-lenses.mjs"

const MIN_PARTICIPANTS = 6
const MAX_PARTICIPANTS = 44
const TARGET_GROUP_SIZE = 6
const CANDIDATE_BUILD_STEPS = 4
const OPTIMIZATION_PASSES = 9
const BALANCED_MAX_ROSTER_SIZE = 44
const BALANCED_MAX_ROSTER_GENDER_COUNT = BALANCED_MAX_ROSTER_SIZE / 2
const CONSTRAINED_ROUND_ATTEMPTS = 12
const CONSTRAINED_ROUND_NODE_LIMIT = 100_000
const PROTECTED_PAIR_RELABEL_ATTEMPTS = 2_048
export const FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION = "spark-depth-rhythm-v8-balanced-44-hard-zero-repeat"

const pairKey = (left, right) => `${Math.min(Number(left), Number(right))}-${Math.max(Number(left), Number(right))}`

function normalizeParticipants(values) {
  if (!Array.isArray(values) || values.length < MIN_PARTICIPANTS || values.length > MAX_PARTICIPANTS || values.length % 2 !== 0) {
    return { error: `Choice-only seating requires an even roster of ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS} participants` }
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

function seededRandom(seed) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 2 ** 32
  }
}

function shuffled(values, seed) {
  const result = [...values]
  const random = seededRandom(seed)
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function choiceOnlyTargetGroupSizes(participantCount) {
  if (!Number.isInteger(participantCount) || participantCount < MIN_PARTICIPANTS || participantCount > MAX_PARTICIPANTS || participantCount % 2 !== 0) return []
  const tableCount = Math.max(1, Math.floor(participantCount / TARGET_GROUP_SIZE))
  const base = Math.floor(participantCount / tableCount)
  const remainder = participantCount % tableCount
  return Array.from({ length: tableCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

function initialGroups(participants, sizes, seed, genderMap) {
  const byGender = new Map(["female", "male", "unknown"].map(gender => [gender, []]))
  for (const participant of shuffled(participants, seed)) {
    byGender.get(normalizedGender(genderMap instanceof Map ? genderMap.get(participant) : genderMap?.[participant])).push(participant)
  }
  const ordered = []
  while ([...byGender.values()].some(bucket => bucket.length)) {
    for (const gender of ["female", "male", "unknown"]) {
      const bucket = byGender.get(gender)
      if (bucket.length) ordered.push(bucket.shift())
    }
  }
  const groups = sizes.map(() => [])
  for (const participant of ordered) {
    const candidates = groups.map((group, index) => ({ index, fill: group.length / sizes[index] }))
      .filter(({ index }) => groups[index].length < sizes[index])
      .sort((left, right) => left.fill - right.fill || ((left.index + seed) % groups.length) - ((right.index + seed) % groups.length))
    groups[candidates[0].index].push(participant)
  }
  return groups
}

function pairSet(groups) {
  const result = new Set()
  for (const group of groups) {
    for (let left = 0; left < group.length; left++) {
      for (let right = left + 1; right < group.length; right++) result.add(pairKey(group[left], group[right]))
    }
  }
  return result
}

function repeatMetrics(round1, round2, round3) {
  const sets = [pairSet(round1), pairSet(round2), pairSet(round3)]
  const overlaps = (left, right) => [...left].filter(key => right.has(key))
  const repeated12 = overlaps(sets[0], sets[1])
  const repeated13 = overlaps(sets[0], sets[2])
  const repeated23 = overlaps(sets[1], sets[2])
  const repeatedAll = repeated12.filter(key => sets[2].has(key))
  const burden = new Map()
  for (const key of [...repeated12, ...repeated13, ...repeated23]) {
    for (const number of key.split("-").map(Number)) burden.set(number, (burden.get(number) || 0) + 1)
  }
  return {
    round1Round2: repeated12.length,
    round1Round3: repeated13.length,
    round2Round3: repeated23.length,
    totalRepeatedPairOccurrences: repeated12.length + repeated13.length + repeated23.length,
    repeatedInAllThree: repeatedAll.length,
    maximumParticipantRepeatBurden: burden.size ? Math.max(...burden.values()) : 0,
    squaredParticipantRepeatBurden: [...burden.values()].reduce((sum, value) => sum + value ** 2, 0),
  }
}

function genderCost(groups, genderMap) {
  let maximumSpread = 0
  let squaredDeviation = 0
  for (const category of ["female", "male", "unknown"]) {
    const counts = groups.map(group => group.filter(number => normalizedGender(
      genderMap instanceof Map ? genderMap.get(number) : genderMap?.[number],
    ) === category).length)
    const total = counts.reduce((sum, value) => sum + value, 0)
    if (!total) continue
    maximumSpread = Math.max(maximumSpread, Math.max(...counts) - Math.min(...counts))
    const ideal = total / groups.length
    squaredDeviation += counts.reduce((sum, value) => sum + (value - ideal) ** 2, 0)
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

function aggregate(groupScores, lens) {
  const scoreValues = groupScores.map(group => lens === "rhythm" ? group.qualityScore ?? group.score : group.score)
  const score = scoreValues.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, scoreValues.length)
  return {
    score,
    qualityScore: score,
    compositionBonus: lens === "rhythm"
      ? groupScores.reduce((sum, group) => sum + Number(group.compositionBonus || 0), 0) / Math.max(1, groupScores.length)
      : 0,
    lockedPairs: groupScores.reduce((sum, group) => sum + Number(group.lockedPairs || 0), 0),
    incompleteDepthCoverage: groupScores.filter(group => group.depthCoverageIncomplete).length,
    incompleteRoleCoverage: groupScores.filter(group => group.roleCoverageIncomplete).length,
    incompleteCuriosityCoverage: groupScores.filter(group => group.curiosityCoverageIncomplete).length,
    depthMismatches: groupScores.filter(group => group.depthMismatch).length,
    missingInitiators: groupScores.filter(group => group.initiatorMissing).length,
    missingCuriosityMixes: groupScores.filter(group => group.curiosityMixMissing).length,
    missingRoleTrios: groupScores.filter(group => group.roleTrioMissing).length,
    missingCuriosityFlows: groupScores.filter(group => group.curiosityFlowMissing).length,
    humorClashes: groupScores.filter(group => group.humorClash).length,
    groupScores,
  }
}

function compareVectors(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0)
    if (Math.abs(difference) > 1e-9) return difference
  }
  return 0
}

function evaluate(groups, { previousPairSets, groupScore, genderMap, ageMap, prioritizeWeakest = false }) {
  const currentPairs = pairSet(groups)
  let repeats = 0
  for (const previous of previousPairSets) for (const key of currentPairs) if (previous.has(key)) repeats++
  const repeatedInEveryRound = previousPairSets.length > 1
    ? [...currentPairs].filter(key => previousPairSets.every(previous => previous.has(key))).length
    : 0
  const groupScores = groups.map(groupScore)
  const protectedPairs = groupScores.reduce((sum, group) => sum + Number(group.lockedPairs || 0), 0)
  const gender = genderCost(groups, genderMap)
  const qualityValues = groupScores.map(group => Number(group.qualityScore ?? group.score ?? 0))
  const quality = qualityValues.reduce((sum, value) => sum + value, 0)
  const minimumQuality = qualityValues.length ? Math.min(...qualityValues) : 0
  return {
    vector: [
      protectedPairs,
      repeatedInEveryRound,
      repeats,
      gender.maximumSpread,
      gender.squaredDeviation,
      ...(prioritizeWeakest ? [-minimumQuality] : []),
      -quality,
      ageCost(groups, ageMap),
    ],
    groupScores,
    gender,
    currentPairs,
    minimumQuality,
  }
}

function optimize(groups, options) {
  const result = groups.map(group => [...group])
  const groupScoreCache = new Map()
  const cachedGroupScore = group => {
    const key = [...group].sort((left, right) => Number(left) - Number(right)).join(",")
    if (!groupScoreCache.has(key)) groupScoreCache.set(key, options.groupScore(group))
    return groupScoreCache.get(key)
  }
  const evaluationOptions = { ...options, groupScore: cachedGroupScore }
  const before = evaluate(result, evaluationOptions)
  let current = before
  let swaps = 0
  for (let pass = 0; pass < OPTIMIZATION_PASSES; pass++) {
    let best = null
    for (let leftTable = 0; leftTable < result.length; leftTable++) {
      for (let rightTable = leftTable + 1; rightTable < result.length; rightTable++) {
        for (let leftIndex = 0; leftIndex < result[leftTable].length; leftIndex++) {
          for (let rightIndex = 0; rightIndex < result[rightTable].length; rightIndex++) {
            ;[result[leftTable][leftIndex], result[rightTable][rightIndex]] = [result[rightTable][rightIndex], result[leftTable][leftIndex]]
            const candidate = evaluate(result, evaluationOptions)
            ;[result[leftTable][leftIndex], result[rightTable][rightIndex]] = [result[rightTable][rightIndex], result[leftTable][leftIndex]]
            if (compareVectors(candidate.vector, current.vector) >= 0) continue
            if (!best || compareVectors(candidate.vector, best.evaluation.vector) < 0) {
              best = { leftTable, rightTable, leftIndex, rightIndex, evaluation: candidate }
            }
          }
        }
      }
    }
    if (!best) break
    ;[result[best.leftTable][best.leftIndex], result[best.rightTable][best.rightIndex]] = [result[best.rightTable][best.rightIndex], result[best.leftTable][best.leftIndex]]
    current = best.evaluation
    swaps++
  }
  return { groups: result, evaluation: current, before, swaps }
}

function participantGender(number, genderMap) {
  return normalizedGender(genderMap instanceof Map ? genderMap.get(number) : genderMap?.[number])
}

function balanced44FemaleTargets(participants, sizes, genderMap, seed) {
  if (participants.length !== BALANCED_MAX_ROSTER_SIZE
    || sizes.length !== 7
    || sizes.filter(size => size === 7).length !== 2
    || sizes.filter(size => size === 6).length !== 5) return null
  const counts = participants.reduce((result, number) => {
    result[participantGender(number, genderMap)]++
    return result
  }, { female: 0, male: 0, unknown: 0 })
  if (counts.female !== BALANCED_MAX_ROSTER_GENDER_COUNT
    || counts.male !== BALANCED_MAX_ROSTER_GENDER_COUNT
    || counts.unknown !== 0) return null

  const sevenSeatTables = sizes.map((size, index) => size === 7 ? index : -1).filter(index => index >= 0)
  const femaleHeavyTable = sevenSeatTables[Math.abs(Number(seed)) % sevenSeatTables.length]
  return sizes.map((size, table) => size === 6 ? 3 : table === femaleHeavyTable ? 4 : 3)
}

function matchesBalanced44Targets(groups, genderMap) {
  if (groups.length !== 7) return false
  const femaleCounts = groups.map(group => group.filter(number => participantGender(number, genderMap) === "female").length)
  const maleCounts = groups.map(group => group.filter(number => participantGender(number, genderMap) === "male").length)
  return groups.every((group, table) => {
    if (group.length === 6) return femaleCounts[table] === 3 && maleCounts[table] === 3
    if (group.length === 7) return [femaleCounts[table], maleCounts[table]].sort((left, right) => left - right).join(",") === "3,4"
    return false
  })
}

function unionPairSets(pairSets = []) {
  const result = new Set()
  for (const pairs of pairSets) for (const key of pairs || []) result.add(key)
  return result
}

function rosterOrderEntropy(participants) {
  let hash = 2_166_136_261
  for (const number of participants) {
    hash ^= Number(number) >>> 0
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function buildConstrainedRound(participants, sizes, femaleTargets, {
  genderMap,
  forbiddenPairs,
  seed,
}) {
  const tableTargets = sizes.map((size, table) => ({
    female: femaleTargets[table],
    male: size - femaleTargets[table],
  }))
  const tableIndexes = sizes.map((_, index) => index)
  const participantOrder = shuffled(participants, seed)
  const participantPriority = new Map(participantOrder.map((number, index) => [number, index]))
  const tableOrder = shuffled(tableIndexes, seed ^ 0x9e3779b9)
  const tablePriority = new Map(tableOrder.map((table, index) => [table, index]))
  const forbiddenDegree = new Map(participants.map(number => [number, 0]))
  for (const key of forbiddenPairs) {
    const [left, right] = key.split("-").map(Number)
    if (forbiddenDegree.has(left)) forbiddenDegree.set(left, forbiddenDegree.get(left) + 1)
    if (forbiddenDegree.has(right)) forbiddenDegree.set(right, forbiddenDegree.get(right) + 1)
  }

  const groups = sizes.map(() => [])
  const genderCounts = sizes.map(() => ({ female: 0, male: 0 }))
  const remaining = new Set(participantOrder)
  let visitedNodes = 0

  const validTables = number => {
    const gender = participantGender(number, genderMap)
    if (gender !== "female" && gender !== "male") return []
    return tableIndexes.filter(table => (
      groups[table].length < sizes[table]
      && genderCounts[table][gender] < tableTargets[table][gender]
      && groups[table].every(other => !forbiddenPairs.has(pairKey(number, other)))
    ))
  }

  const visit = () => {
    if (remaining.size === 0) return true
    if (++visitedNodes > CONSTRAINED_ROUND_NODE_LIMIT) return false

    let selected = null
    let selectedTables = null
    for (const number of remaining) {
      const candidates = validTables(number)
      if (!candidates.length) return false
      if (selected === null
        || candidates.length < selectedTables.length
        || (candidates.length === selectedTables.length
          && forbiddenDegree.get(number) > forbiddenDegree.get(selected))
        || (candidates.length === selectedTables.length
          && forbiddenDegree.get(number) === forbiddenDegree.get(selected)
          && participantPriority.get(number) < participantPriority.get(selected))) {
        selected = number
        selectedTables = candidates
      }
    }

    const gender = participantGender(selected, genderMap)
    selectedTables.sort((left, right) => {
      const leftGenderSlots = tableTargets[left][gender] - genderCounts[left][gender]
      const rightGenderSlots = tableTargets[right][gender] - genderCounts[right][gender]
      return leftGenderSlots - rightGenderSlots
        || (groups[right].length / sizes[right]) - (groups[left].length / sizes[left])
        || tablePriority.get(left) - tablePriority.get(right)
    })

    remaining.delete(selected)
    for (const table of selectedTables) {
      groups[table].push(selected)
      genderCounts[table][gender]++
      if (visit()) return true
      genderCounts[table][gender]--
      groups[table].pop()
    }
    remaining.add(selected)
    return false
  }

  return visit() ? groups : null
}

function assembleCandidate(participants, options, seed, round1, round2, round3) {
  const repeats = repeatMetrics(round1.groups, round2.groups, round3.groups)
  const spark = aggregate(round1.evaluation.groupScores, "spark")
  const depth = aggregate(round2.evaluation.groupScores, "depth")
  const rhythm = aggregate(round3.evaluation.groupScores, "rhythm")
  const positionMap = Object.fromEntries(round1.groups.flat().map((number, index) => [number, index]))
  const minimumRhythmQuality = round3.evaluation.minimumQuality
  const sortKey = [
    repeats.repeatedInAllThree,
    repeats.totalRepeatedPairOccurrences,
    repeats.maximumParticipantRepeatBurden,
    round1.evaluation.vector[0] + round2.evaluation.vector[0] + round3.evaluation.vector[0],
    Math.max(round1.evaluation.gender.maximumSpread, round2.evaluation.gender.maximumSpread, round3.evaluation.gender.maximumSpread),
    -minimumRhythmQuality,
    -(spark.score + depth.score + rhythm.qualityScore),
    ...round1.groups.flat(),
    ...round2.groups.flat(),
    ...round3.groups.flat(),
  ]
  return {
    seed,
    sortKey,
    plan: {
      round1: round1.groups,
      round2: round2.groups,
      round3: round3.groups,
      T: choiceOnlyTargetGroupSizes(participants.length).length,
      G: Math.max(...choiceOnlyTargetGroupSizes(participants.length)),
      R: repeats.totalRepeatedPairOccurrences,
      positionMap,
      round1Spark: { before: spark, after: spark, swaps: round1.swaps },
      round2Depth: { ...depth, ageCost: ageCost(round2.groups, options.ageMap), shifts: [] },
      round3Rhythm: {
        ...rhythm,
        minimumQuality: minimumRhythmQuality,
        beforeMinimumQuality: round3.before.minimumQuality,
        ageCost: ageCost(round3.groups, options.ageMap),
        shifts: [],
        repeatMetrics: repeats,
      },
    },
  }
}

function relabelBalancedSchedule(rounds, participants, genderMap, protectedPairs, seed) {
  const slotsByGender = {
    female: participants.filter(number => participantGender(number, genderMap) === "female"),
    male: participants.filter(number => participantGender(number, genderMap) === "male"),
  }
  for (let attempt = 0; attempt < PROTECTED_PAIR_RELABEL_ATTEMPTS; attempt++) {
    const mapping = new Map()
    for (const [genderIndex, gender] of ["female", "male"].entries()) {
      const slots = slotsByGender[gender]
      const assigned = shuffled(slots, seed + (attempt * 104_729) + (genderIndex * 65_537))
      slots.forEach((slot, index) => mapping.set(slot, assigned[index]))
    }
    const relabeled = rounds.map(round => round.map(group => group.map(number => mapping.get(number))))
    const probe = { plan: { round1: relabeled[0], round2: relabeled[1], round3: relabeled[2] } }
    if (!candidateHasLockedPair(probe, protectedPairs)) return relabeled
  }
  return null
}

function buildBalanced44Candidate(participants, options, seed) {
  // The roster is a set for construction purposes. Canonicalizing here keeps a
  // harmless API/input permutation from sending the bounded backtracker down a
  // different branch and turning the same feasible constraints into a failure.
  const canonicalParticipants = [...participants].sort((left, right) => Number(left) - Number(right))
  const inputOrderEntropy = rosterOrderEntropy(participants)
  const sizes = choiceOnlyTargetGroupSizes(canonicalParticipants.length)
  const firstTargets = balanced44FemaleTargets(canonicalParticipants, sizes, options.genderMap, seed)
  if (!firstTargets) return null
  const lenses = createRoundLensScorer(options)
  const sparkGroup = createRound1SparkGroupScorer(options)
  const protectedPairs = new Set(options.lockedPairsSet || [])

  for (let attempt = 0; attempt < CONSTRAINED_ROUND_ATTEMPTS; attempt++) {
    const attemptSeed = (seed * 65_537) + (attempt * 7_919)
    const round1Start = buildConstrainedRound(canonicalParticipants, sizes,
      balanced44FemaleTargets(canonicalParticipants, sizes, options.genderMap, attemptSeed + 1), {
        genderMap: options.genderMap,
        forbiddenPairs: new Set(),
        seed: attemptSeed + 101,
      })
    if (!round1Start) continue

    const round2Start = buildConstrainedRound(canonicalParticipants, sizes,
      balanced44FemaleTargets(canonicalParticipants, sizes, options.genderMap, attemptSeed + 2), {
        genderMap: options.genderMap,
        forbiddenPairs: pairSet(round1Start),
        seed: attemptSeed + 211,
      })
    if (!round2Start) continue

    const round3Start = buildConstrainedRound(canonicalParticipants, sizes,
      balanced44FemaleTargets(canonicalParticipants, sizes, options.genderMap, attemptSeed + 3), {
        genderMap: options.genderMap,
        forbiddenPairs: unionPairSets([pairSet(round1Start), pairSet(round2Start)]),
        seed: attemptSeed + 307,
      })
    if (!round3Start) continue

    // A same-gender relabel preserves every table size, gender target, and
    // cross-round repeat invariant. It lets sparse participant-specific
    // exclusions be satisfied without forcing the round constructor into an
    // expensive identity-aware search.
    const relabeled = relabelBalancedSchedule(
      [round1Start, round2Start, round3Start],
      canonicalParticipants,
      options.genderMap,
      protectedPairs,
      attemptSeed + 401 + inputOrderEntropy,
    )
    if (!relabeled) continue
    const [safeRound1, safeRound2, safeRound3] = relabeled

    // Once all three rounds exist, each lens pass treats both other rounds as
    // hard history. Consequently a score-improving swap can never reintroduce
    // a repeated tablemate or a protected pair.
    const round1 = optimize(safeRound1, {
      previousPairSets: [pairSet(safeRound2), pairSet(safeRound3)],
      groupScore: sparkGroup,
      genderMap: options.genderMap,
      ageMap: options.ageMap,
    })
    const round2 = optimize(safeRound2, {
      previousPairSets: [round1.evaluation.currentPairs, pairSet(safeRound3)],
      groupScore: lenses.depthGroup,
      genderMap: options.genderMap,
      ageMap: options.ageMap,
    })
    const round3 = optimize(safeRound3, {
      previousPairSets: [round1.evaluation.currentPairs, round2.evaluation.currentPairs],
      groupScore: lenses.rhythmGroup,
      genderMap: options.genderMap,
      ageMap: options.ageMap,
      prioritizeWeakest: true,
    })

    const candidate = assembleCandidate(canonicalParticipants, options, seed, round1, round2, round3)
    if (candidate.plan.R === 0
      && [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]
        .every(round => matchesBalanced44Targets(round, options.genderMap))
      && !candidateHasLockedPair(candidate, protectedPairs)) return candidate
  }
  return { error: "Could not construct hard-safe zero-repeat seating for the balanced 44-person roster" }
}

function changedMemberships(leftGroups, rightGroups) {
  const left = pairSet(leftGroups)
  const right = pairSet(rightGroups)
  let changed = 0
  for (const key of left) if (!right.has(key)) changed++
  for (const key of right) if (!left.has(key)) changed++
  return changed
}

function buildCandidate(participants, options, seed) {
  const sizes = choiceOnlyTargetGroupSizes(participants.length)
  const balanced44Candidate = buildBalanced44Candidate(participants, options, seed)
  if (balanced44Candidate) return balanced44Candidate
  const lenses = createRoundLensScorer(options)
  const sparkGroup = createRound1SparkGroupScorer(options)
  const round1Start = initialGroups(participants, sizes, seed * 101 + 17, options.genderMap)
  const round1 = optimize(round1Start, {
    previousPairSets: [],
    groupScore: sparkGroup,
    genderMap: options.genderMap,
    ageMap: options.ageMap,
  })
  const round2Start = initialGroups(participants, sizes, seed * 211 + 29, options.genderMap)
  const round2 = optimize(round2Start, {
    previousPairSets: [round1.evaluation.currentPairs],
    groupScore: lenses.depthGroup,
    genderMap: options.genderMap,
    ageMap: options.ageMap,
  })
  const round3Start = initialGroups(participants, sizes, seed * 307 + 43, options.genderMap)
  const round3 = optimize(round3Start, {
    previousPairSets: [round1.evaluation.currentPairs, round2.evaluation.currentPairs],
    groupScore: lenses.rhythmGroup,
    genderMap: options.genderMap,
    ageMap: options.ageMap,
  })
  return assembleCandidate(participants, options, seed, round1, round2, round3)
}

function candidateHasLockedPair(candidate, lockedPairsSet) {
  if (!(lockedPairsSet instanceof Set) || lockedPairsSet.size === 0) return false
  return [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]
    .some(round => [...pairSet(round)].some(key => lockedPairsSet.has(key)))
}

function finalizeFlexibleCandidates(participants, rawCandidates, lockedPairsSet = new Set()) {
  const failure = rawCandidates.find(candidate => candidate?.error)
  if (failure) return { error: failure.error }
  const allCandidates = [...rawCandidates]
    .filter(candidate => !candidateHasLockedPair(candidate, lockedPairsSet))
    .sort((left, right) => compareVectors(left.sortKey, right.sortKey))
  if (allCandidates.length < 3) {
    return { error: "Could not construct three seating plans without placing a conflict-of-interest exclusion at the same table" }
  }
  const repeatSafeCandidates = allCandidates
    .filter(candidate => candidate.plan.round3Rhythm.repeatMetrics.repeatedInAllThree === 0)
  const pool = repeatSafeCandidates.length >= 3 ? repeatSafeCandidates : allCandidates
  const selected = []
  const seen = new Set()
  for (const candidate of pool) {
    const key = [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]
      .flat(2).join(".")
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(candidate)
    if (selected.length === 3) break
  }
  for (const candidate of pool) {
    if (selected.length === 3) break
    if (!selected.includes(candidate)) selected.push(candidate)
  }
  if (selected.length !== 3) return { error: "Could not construct three flexible seating candidates" }
  const candidates = selected.map((candidate, index) => ({
    id: `flex-${participants.length}-${candidate.seed}`,
    rank: index + 1,
    plan: candidate.plan,
    canonicalObjective: {
      version: FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION,
      flexible: true,
      participantCount: participants.length,
      tableCount: candidate.plan.T,
      sortKey: candidate.sortKey,
    },
    diversity: index === 0 ? { round1Fixed: false, fromBest: null, comparedWithEarlier: [] } : {
      round1Fixed: false,
      fromBest: {
        changedPairMemberships: changedMemberships(candidate.plan.round1, selected[0].plan.round1),
      },
      comparedWithEarlier: selected.slice(0, index).map((earlier, earlierIndex) => ({
        rank: earlierIndex + 1,
        round1: { changedPairMemberships: changedMemberships(candidate.plan.round1, earlier.plan.round1) },
        round2: { changedPairMemberships: changedMemberships(candidate.plan.round2, earlier.plan.round2) },
        round3: { changedPairMemberships: changedMemberships(candidate.plan.round3, earlier.plan.round3) },
      })),
    },
  }))
  return {
    objectiveVersion: FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION,
    diversityPolicy: { flexible: true, targetGroupSize: TARGET_GROUP_SIZE },
    candidates,
  }
}

function validCheckpoint(checkpoint, participantCount) {
  if (!checkpoint
    || checkpoint.objective_version !== FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION
    || Number(checkpoint.participant_count) !== participantCount
    || !Array.isArray(checkpoint.candidates)
    || checkpoint.candidates.length >= CANDIDATE_BUILD_STEPS) return false
  return checkpoint.candidates.every((candidate, index) => (
    Number(candidate?.seed) === index + 1
    && Array.isArray(candidate?.sortKey)
    && candidate?.plan
    && Array.isArray(candidate.plan.round1)
    && Array.isArray(candidate.plan.round2)
    && Array.isArray(candidate.plan.round3)
  ))
}

export function buildFlexibleChoiceOnlySeatingCandidatesStep(values, options = {}, checkpoint = null) {
  const normalized = normalizeParticipants(values)
  if (normalized.error) return { complete: true, generated: normalized }
  const previousCandidates = validCheckpoint(checkpoint, normalized.participants.length)
    ? checkpoint.candidates
    : []
  const candidates = [...previousCandidates]
  const candidate = buildCandidate(normalized.participants, options, candidates.length + 1)
  if (candidate?.error) {
    return {
      complete: true,
      progress: { completed_steps: candidates.length, total_steps: CANDIDATE_BUILD_STEPS, percent: 100 },
      generated: { error: candidate.error },
    }
  }
  candidates.push(candidate)
  const progress = {
    completed_steps: candidates.length,
    total_steps: CANDIDATE_BUILD_STEPS,
    percent: Math.round((candidates.length / CANDIDATE_BUILD_STEPS) * 100),
  }
  if (candidates.length < CANDIDATE_BUILD_STEPS) {
    return {
      complete: false,
      progress,
      checkpoint: {
        objective_version: FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION,
        participant_count: normalized.participants.length,
        candidates,
      },
    }
  }
  return {
    complete: true,
    progress,
    generated: finalizeFlexibleCandidates(normalized.participants, candidates, options.lockedPairsSet),
  }
}

export function buildFlexibleChoiceOnlySeatingCandidates(values, options = {}) {
  const normalized = normalizeParticipants(values)
  if (normalized.error) return normalized
  const candidates = Array.from({ length: CANDIDATE_BUILD_STEPS }, (_, index) => (
    buildCandidate(normalized.participants, options, index + 1)
  ))
  return finalizeFlexibleCandidates(normalized.participants, candidates, options.lockedPairsSet)
}

export const FLEXIBLE_CHOICE_SEATING_LIMITS = Object.freeze({
  minimumParticipants: MIN_PARTICIPANTS,
  maximumParticipants: MAX_PARTICIPANTS,
  targetGroupSize: TARGET_GROUP_SIZE,
  candidateBuildSteps: CANDIDATE_BUILD_STEPS,
  optimizationPasses: OPTIMIZATION_PASSES,
})
