import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChoiceOnlySeatingCandidates,
  buildChoiceOnlySeatingCandidatesStep,
  buildChoiceOnlySeatingPlan,
  CHOICE_ONLY_SEATING_OBJECTIVE_VERSION,
  choiceOnlySeatingMetrics,
} from "./choice-only-seating.mjs"
import { createRoundLensScorer } from "./round23-lenses.mjs"
import { ROUND1_SPARK_OPTIMIZATION_PASSES } from "./round1-spark.mjs"
import {
  choiceOnlyTargetGroupSizes,
  FLEXIBLE_CHOICE_SEATING_LIMITS,
  FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION,
} from "./flexible-choice-seating.mjs"

const participants = Array.from({ length: 42 }, (_, index) => index + 1)

function assertRound(round) {
  assert.equal(round.length, 7)
  assert.deepEqual(round.map(group => group.length), [6, 6, 6, 6, 6, 6, 6])
  assert.deepEqual([...round.flat()].sort((a, b) => a - b), participants)
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

function groupPairKeys(group) {
  const result = []
  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      const a = Math.min(group[left], group[right])
      const b = Math.max(group[left], group[right])
      result.push(`${a}-${b}`)
    }
  }
  return result
}

function repeatBurden(round1, round2, round3) {
  const sets = [pairSet(round1), pairSet(round2), pairSet(round3)]
  const repeated = [
    ...[...sets[0]].filter(key => sets[1].has(key)),
    ...[...sets[0]].filter(key => sets[2].has(key)),
    ...[...sets[1]].filter(key => sets[2].has(key)),
  ]
  const burden = new Map(participants.map(number => [number, 0]))
  for (const key of repeated) {
    for (const number of key.split("-").map(Number)) burden.set(number, burden.get(number) + 1)
  }
  return burden
}

function compareSortKeys(left, right) {
  for (let index = 0; index < left.length; index++) {
    const difference = left[index] - right[index]
    if (Math.abs(difference) > 1e-9) return difference
  }
  return 0
}

function changedPairMemberships(left, right) {
  const leftPairs = pairSet(left)
  const rightPairs = pairSet(right)
  return [...leftPairs].filter(key => !rightPairs.has(key)).length
    + [...rightPairs].filter(key => !leftPairs.has(key)).length
}

function richProfile(number, gender) {
  const style = ["A", "B", "C", "B"][number % 4]
  const role = ["A", "B", "C"][number % 3]
  const curiosity = ["A", "B", "C"][(number + 1) % 3]
  return {
    assigned_number: number,
    gender,
    age: 21 + (number % 18),
    survey_data: { answers: {
      humor_banter_style: style,
      early_openness_comfort: number % 4,
      conversational_role: role,
      conversation_depth_pref: number % 2 ? "A" : "B",
      curiosity_style: curiosity,
      social_battery: number % 2 ? "A" : "B",
      silence_comfort: number % 3 ? "A" : "B",
      match_current_focus: [`focus-${number % 5}`],
      intent_goal: ["A", "B", "C"][number % 3],
      match_disagreement_style: style,
      communication_1: style,
      communication_2: style,
      communication_3: style,
      communication_4: style,
      communication_5: style,
      attachment_1: style,
      attachment_3: style,
      attachment_4: style,
      lifestyle_1: ["A", "B", "C"][number % 3],
      lifestyle_2: ["A", "B", "C"][number % 3],
      lifestyle_3: ["A", "B", "C"][number % 3],
      lifestyle_4: ["A", "B", "C"][number % 3],
      lifestyle_5: ["A", "B", "C"][number % 3],
      core_values_1: ["A", "B", "C"][number % 3],
      core_values_2: ["A", "B", "C"][number % 3],
      core_values_3: ["A", "B", "C"][number % 3],
      core_values_4: ["A", "B", "C"][number % 3],
      core_values_5: ["A", "B", "C"][number % 3],
    } },
  }
}

let cachedPreview = null
function basePreview() {
  cachedPreview ||= buildChoiceOnlySeatingCandidates(participants)
  return cachedPreview
}

test("creates three complete rounds of seven groups of exactly six", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  assert.equal(plan.error, undefined)
  assertRound(plan.round1)
  assertRound(plan.round2)
  assertRound(plan.round3)
  assert.deepEqual({ T: plan.T, G: plan.G, R: plan.R }, { T: 7, G: 6, R: 0 })
  assert.equal(Object.keys(plan.positionMap).length, 42)
  for (let index = 0; index < participants.length; index++) {
    assert.equal(plan.positionMap[plan.round1.flat()[index]], index)
  }
})

test("returns three deterministic preview candidates without changing the established best plan", () => {
  const preview = basePreview()
  const repeated = buildChoiceOnlySeatingCandidates([...participants])
  assert.equal(preview.error, undefined)
  assert.equal(preview.objectiveVersion, CHOICE_ONLY_SEATING_OBJECTIVE_VERSION)
  assert.deepEqual(repeated, preview)
  assert.deepEqual(preview.candidates.map(candidate => candidate.rank), [1, 2, 3])
  assert.equal(new Set(preview.candidates.map(candidate => candidate.id)).size, 3)
  assert.deepEqual(preview.candidates[0].plan, buildChoiceOnlySeatingPlan(participants))
})

test("orders every preview by the same canonical objective", () => {
  const { candidates } = basePreview()
  assert.ok(compareSortKeys(
    candidates[0].canonicalObjective.sortKey,
    candidates[1].canonicalObjective.sortKey,
  ) < 0)
  assert.ok(compareSortKeys(
    candidates[1].canonicalObjective.sortKey,
    candidates[2].canonicalObjective.sortKey,
  ) < 0)
  for (const [index, candidate] of candidates.entries()) {
    assert.equal(candidate.canonicalObjective.version, CHOICE_ONLY_SEATING_OBJECTIVE_VERSION)
    assert.equal(candidate.canonicalObjective.establishedBest, index === 0)
    assert.equal(
      candidate.canonicalObjective.round1SparkScore,
      candidate.plan.round1Spark.after.score,
    )
  }
})

test("makes all three rounds materially different from every earlier preview", () => {
  const preview = basePreview()
  const minimumChanges = preview.diversityPolicy.minimumPairMembershipChangesPerRound
  const minimumParticipants = preview.diversityPolicy.minimumParticipantsWithChangedCompanionsPerRound

  assert.equal(preview.candidates[0].diversity.fromBest, null)
  assert.ok(preview.candidates.every(candidate => candidate.diversity.round1Fixed === false))
  for (let index = 1; index < preview.candidates.length; index++) {
    const candidate = preview.candidates[index]
    assert.equal(candidate.diversity.comparedWithEarlier.length, index)
    for (let earlierIndex = 0; earlierIndex < index; earlierIndex++) {
      const earlier = preview.candidates[earlierIndex]
      const comparison = candidate.diversity.comparedWithEarlier[earlierIndex]
      assert.equal(comparison.candidateId, earlier.id)
      assert.equal(comparison.rank, earlier.rank)
      assert.equal(comparison.round1.changedPairMemberships, changedPairMemberships(
        candidate.plan.round1,
        earlier.plan.round1,
      ))
      assert.equal(comparison.round2.changedPairMemberships, changedPairMemberships(
        candidate.plan.round2,
        earlier.plan.round2,
      ))
      assert.equal(comparison.round3.changedPairMemberships, changedPairMemberships(
        candidate.plan.round3,
        earlier.plan.round3,
      ))
      for (const round of [comparison.round1, comparison.round2, comparison.round3]) {
        assert.ok(round.changedPairMemberships >= minimumChanges)
        assert.ok(round.participantsWithChangedCompanions >= minimumParticipants)
        assert.ok(round.averageTablematesReplaced >= 3)
      }
    }
  }
})

test("preserves repeat, gender, and protected-pair invariants in all three previews", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const lockedPairsSet = new Set(["1-2", "3-4", "5-6"])
  const preview = buildChoiceOnlySeatingCandidates(participants, { genderMap, lockedPairsSet })
  assert.equal(preview.error, undefined)

  for (const { plan } of preview.candidates) {
    for (const round of [plan.round1, plan.round2, plan.round3]) {
      assertRound(round)
      assert.ok(round.every(group => {
        const femaleCount = group.filter(number => genderMap[number] === "female").length
        return femaleCount === 3
      }))
      for (const group of round) {
        const keys = new Set(groupPairKeys(group))
        for (const locked of lockedPairsSet) assert.equal(keys.has(locked), false)
      }
    }
    const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
    assert.deepEqual({
      round1Round2: metrics.round1Round2,
      round1Round3: metrics.round1Round3,
      round2Round3: metrics.round2Round3,
      repeatedInAllThree: metrics.repeatedInAllThree,
      maximumParticipantRepeatBurden: metrics.maximumParticipantRepeatBurden,
    }, {
      round1Round2: 0,
      round1Round3: 0,
      round2Round3: 0,
      repeatedInAllThree: 0,
      maximumParticipantRepeatBurden: 0,
    })
  }
})

test("uses the seven-table geometry to avoid every repeated tablemate", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)

  assert.deepEqual({
    round1Round2: metrics.round1Round2,
    round1Round3: metrics.round1Round3,
    round2Round3: metrics.round2Round3,
    total: metrics.totalRepeatedPairOccurrences,
  }, { round1Round2: 0, round1Round3: 0, round2Round3: 0, total: 0 })
  assert.equal(metrics.repeatedInAllThree, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 0)
  assert.equal(metrics.squaredParticipantRepeatBurden, 0)

  const sets = [pairSet(plan.round1), pairSet(plan.round2), pairSet(plan.round3)]
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 0).length, 42)

  const uniquePartners = new Map(participants.map(number => [number, new Set()]))
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    for (const group of round) {
      for (const number of group) group.filter(other => other !== number).forEach(other => uniquePartners.get(number).add(other))
    }
  }
  assert.equal([...uniquePartners.values()].filter(values => values.size === 15).length, 42)

  for (const group of plan.round2) {
    assert.equal(groupPairKeys(group).filter(key => sets[0].has(key)).length, 0)
  }
  for (const group of plan.round3) {
    const round1Anchors = groupPairKeys(group).filter(key => sets[0].has(key))
    const round2Anchors = groupPairKeys(group).filter(key => sets[1].has(key))
    assert.equal(round1Anchors.length, 0)
    assert.equal(round2Anchors.length, 0)
  }

  assert.equal(plan.round2Depth.anchors.count, 0)
  assert.equal(plan.round3Rhythm.anchors.round1Spark.count, 0)
  assert.equal(plan.round3Rhythm.anchors.round2Depth.count, 0)
  assert.deepEqual(plan.round3Rhythm.repeatMetrics, metrics)
})

test("balances a 21/21 roster into three women and three men per table", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const plan = buildChoiceOnlySeatingPlan(participants, { genderMap })
  const femaleCounts = round => round.map(group => group.filter(number => genderMap[number] === "female").length)

  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.ok(femaleCounts(round).every(count => count === 3))
  }
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 0)
  assert.equal(metrics.squaredParticipantRepeatBurden, 0)
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 0).length, 42)
})

test("reports survey-lens and intentional-anchor metrics from the selected layouts", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const profiles = participants.map(number => richProfile(number, genderMap[number]))
  const profileMap = new Map(profiles.map(value => [value.assigned_number, value]))
  const ageMap = Object.fromEntries(profiles.map(value => [value.assigned_number, value.age]))
  const plan = buildChoiceOnlySeatingPlan(participants, {
    genderMap,
    profileMap,
    ageMap,
    requireCompleteLensProfiles: true,
  })
  const scorer = createRoundLensScorer({ profileMap })
  const round1Pairs = pairSet(plan.round1)
  const round2Pairs = pairSet(plan.round2)
  const round3Pairs = pairSet(plan.round3)
  const intersection = (left, right) => [...left].filter(key => right.has(key))
  const scoresFor = (keys, scorePair) => keys.map(key => scorePair(...key.split("-").map(Number)))
  const stats = scores => ({
    count: scores.length,
    average: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0,
    minimum: scores.length ? Math.min(...scores) : 0,
  })
  const assertStatsClose = (actual, expected) => {
    assert.equal(actual.count, expected.count)
    assert.ok(Math.abs(actual.average - expected.average) < 1e-12)
    assert.ok(Math.abs(actual.minimum - expected.minimum) < 1e-12)
  }

  const depthAverage = plan.round2.map(scorer.depthGroup).reduce((sum, group) => sum + group.score, 0) / 7
  const rhythmAverage = plan.round3.map(scorer.rhythmGroup).reduce((sum, group) => sum + group.score, 0) / 7
  assert.equal(plan.round2Depth.score, depthAverage)
  assert.equal(plan.round3Rhythm.score, rhythmAverage)
  assertStatsClose(plan.round2Depth.anchors, stats(scoresFor(intersection(round1Pairs, round2Pairs), scorer.sparkPairScore)))
  assertStatsClose(plan.round3Rhythm.anchors.round1Spark, stats(scoresFor(intersection(round1Pairs, round3Pairs), scorer.sparkPairScore)))
  assertStatsClose(plan.round3Rhythm.anchors.round2Depth, stats(scoresFor(intersection(round2Pairs, round3Pairs), scorer.depthPairScore)))
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 0)
  assert.equal(metrics.squaredParticipantRepeatBurden, 0)
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 0).length, 42)
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.ok(round.every(group => {
      const femaleCount = group.filter(number => genderMap[number] === "female").length
      return femaleCount === 3
    }))
  }
})

test("keeps avoidable locked pairs apart in every lens round", () => {
  const lockedPairsSet = new Set(["1-2", "3-4", "5-6"])
  const plan = buildChoiceOnlySeatingPlan(participants, { lockedPairsSet })
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    for (const group of round) {
      const keys = new Set(groupPairKeys(group))
      for (const locked of lockedPairsSet) assert.equal(keys.has(locked), false)
    }
  }
  assert.equal(plan.round1Spark.after.lockedPairs, 0)
  assert.equal(plan.round2Depth.lockedPairs, 0)
  assert.equal(plan.round3Rhythm.lockedPairs, 0)
})

test("keeps the real #7 and #312 exclusion apart in every generated option", () => {
  const roster = participants.map(number => number === 42 ? 312 : number)
  const preview = buildChoiceOnlySeatingCandidates(roster, { lockedPairsSet: new Set(["7-312"]) })
  assert.equal(preview.error, undefined)
  for (const candidate of preview.candidates) {
    for (const round of [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]) {
      assert.equal(round.some(group => group.includes(7) && group.includes(312)), false)
    }
  }
})

test("uses two additional optimization passes for exact and flexible rosters", () => {
  assert.equal(ROUND1_SPARK_OPTIMIZATION_PASSES, 38)
  assert.equal(FLEXIBLE_CHOICE_SEATING_LIMITS.optimizationPasses, 7)
})

test("is deterministic, including gender and age tie-breaking", () => {
  const genderMap = new Map(participants.map(number => [number, number % 2 ? "female" : "male"]))
  const ageMap = new Map(participants.map(number => [number, 22 + (number % 13)]))
  const first = buildChoiceOnlySeatingPlan(participants, { genderMap, ageMap })
  const second = buildChoiceOnlySeatingPlan([...participants], { genderMap, ageMap })

  assert.deepEqual(second, first)
})

test("uses age as a real tie-breaker after repeat and gender constraints", () => {
  const ageMap = Object.fromEntries(participants.map(number => [
    number,
    18 + ((number + 3 * number ** 2) % 47),
  ]))
  const ageCost = groups => groups.reduce((total, group) => total + group.reduce(
    (groupTotal, left, index) => groupTotal + group.slice(index + 1).reduce(
      (pairTotal, right) => pairTotal + (ageMap[left] - ageMap[right]) ** 2,
      0,
    ),
    0,
  ), 0)
  const baseline = buildChoiceOnlySeatingPlan(participants)
  const ageAware = buildChoiceOnlySeatingPlan(participants, { ageMap })

  assert.ok(ageCost(ageAware.round3) < ageCost(baseline.round3))
  assert.equal(choiceOnlySeatingMetrics(
    ageAware.round1,
    ageAware.round2,
    ageAware.round3,
  ).totalRepeatedPairOccurrences, 0)
})

test("accepts participant records and preserves their supplied order in the position map", () => {
  const records = [...participants].reverse().map(assigned_number => ({ assigned_number }))
  const plan = buildChoiceOnlySeatingPlan(records)
  assert.equal(plan.positionMap[42], 0)
  assert.equal(plan.positionMap[1], 41)
  assertRound(plan.round1)
})

test("targets six-person tables and distributes every remainder into larger groups", () => {
  const expectedSizes = new Map([
    [6, [6]],
    [8, [8]],
    [12, [6, 6]],
    [18, [6, 6, 6]],
    [20, [7, 7, 6]],
    [22, [8, 7, 7]],
    [30, [6, 6, 6, 6, 6]],
    [44, [7, 7, 6, 6, 6, 6, 6]],
  ])
  for (const [count, sizes] of expectedSizes) {
    const flexibleParticipants = Array.from({ length: count }, (_, index) => index + 1)
    assert.deepEqual(choiceOnlyTargetGroupSizes(count), sizes)
    const generated = buildChoiceOnlySeatingCandidates(flexibleParticipants)
    assert.equal(generated.candidates.length, 3)
    assert.equal(generated.objectiveVersion, FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION)
    for (const candidate of generated.candidates) {
      const roundSizes = [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]
        .map(round => round.map(group => group.length))
      assert.deepEqual(roundSizes, [sizes, sizes, sizes])
      for (const round of [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]) {
        assert.deepEqual(round.map(group => group.length), sizes)
        assert.deepEqual([...round.flat()].sort((a, b) => a - b), flexibleParticipants)
      }
    }
  }
  assert.match(buildChoiceOnlySeatingPlan(participants.slice(0, 4)).error, /even roster of 6 to 44/)
  assert.match(buildChoiceOnlySeatingPlan(participants.slice(0, 7)).error, /even roster/)
  assert.match(buildChoiceOnlySeatingPlan(Array.from({ length: 46 }, (_, index) => index + 1)).error, /6 to 44/)
  assert.match(buildChoiceOnlySeatingPlan([...participants.slice(0, 41), 41]).error, /unique/)
  assert.match(buildChoiceOnlySeatingPlan(participants, {
    requireCompleteLensProfiles: true,
  }).error, /complete survey profiles/)
})

test("builds flexible seating as four resumable candidate checkpoints", () => {
  const flexibleParticipants = Array.from({ length: 6 }, (_, index) => index + 1)
  let checkpoint = null
  for (let completed = 1; completed <= 4; completed++) {
    const result = buildChoiceOnlySeatingCandidatesStep(flexibleParticipants, {}, checkpoint)
    assert.equal(result.progress.completed_steps, completed)
    assert.equal(result.progress.total_steps, 4)
    if (completed < 4) {
      assert.equal(result.complete, false)
      assert.equal(result.checkpoint.candidates.length, completed)
      checkpoint = result.checkpoint
    } else {
      assert.equal(result.complete, true)
      assert.equal(result.generated.objectiveVersion, FLEXIBLE_CHOICE_SEATING_OBJECTIVE_VERSION)
      assert.equal(result.generated.candidates.length, 3)
    }
  }
})

test("keeps conflict-of-interest exclusions out of every flexible group", () => {
  const flexibleParticipants = Array.from({ length: 44 }, (_, index) => index + 1)
  const lockedPairsSet = new Set(Array.from({ length: 10 }, (_, index) => `${index * 2 + 1}-${index * 2 + 2}`))
  const generated = buildChoiceOnlySeatingCandidates(flexibleParticipants, { lockedPairsSet })
  assert.equal(generated.error, undefined)
  for (const candidate of generated.candidates) {
    for (const round of [candidate.plan.round1, candidate.plan.round2, candidate.plan.round3]) {
      for (const group of round) {
        const keys = new Set(groupPairKeys(group))
        for (const excludedPair of lockedPairsSet) assert.equal(keys.has(excludedPair), false)
      }
    }
  }
})

test("refuses an impossible flexible group exclusion instead of seating the pair together", () => {
  const generated = buildChoiceOnlySeatingCandidates([1, 2, 3, 4, 5, 6], { lockedPairsSet: new Set(["1-2"]) })
  assert.match(generated.error, /conflict-of-interest exclusion/)
})
