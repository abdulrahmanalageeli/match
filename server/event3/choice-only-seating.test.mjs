import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChoiceOnlySeatingCandidates,
  buildChoiceOnlySeatingPlan,
  CHOICE_ONLY_SEATING_OBJECTIVE_VERSION,
  choiceOnlySeatingMetrics,
} from "./choice-only-seating.mjs"
import { createRoundLensScorer } from "./round23-lenses.mjs"

const participants = Array.from({ length: 42 }, (_, index) => index + 1)

function assertRound(round) {
  assert.equal(round.length, 6)
  assert.deepEqual(round.map(group => group.length), [7, 7, 7, 7, 7, 7])
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

test("creates three complete rounds of six groups of exactly seven", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  assert.equal(plan.error, undefined)
  assertRound(plan.round1)
  assertRound(plan.round2)
  assertRound(plan.round3)
  assert.deepEqual({ T: plan.T, G: plan.G, R: plan.R }, { T: 6, G: 7, R: 0 })
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
        return femaleCount === 3 || femaleCount === 4
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
      round1Round2: 6,
      round1Round3: 6,
      round2Round3: 6,
      repeatedInAllThree: 0,
      maximumParticipantRepeatBurden: 1,
    })
  }
})

test("attains the unavoidable repeat lower bound and never repeats one pair all three times", () => {
  const plan = buildChoiceOnlySeatingPlan(participants)
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)

  // Each new table has seven people but only six prior tables to draw from, so
  // every pair of rounds must repeat at least one pair at each of six tables.
  assert.deepEqual({
    round1Round2: metrics.round1Round2,
    round1Round3: metrics.round1Round3,
    round2Round3: metrics.round2Round3,
    total: metrics.totalRepeatedPairOccurrences,
  }, { round1Round2: 6, round1Round3: 6, round2Round3: 6, total: 18 })
  assert.equal(metrics.repeatedInAllThree, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 1)
  assert.equal(metrics.squaredParticipantRepeatBurden, 36)

  const sets = [pairSet(plan.round1), pairSet(plan.round2), pairSet(plan.round3)]
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 1).length, 36)
  assert.equal([...burden.values()].filter(value => value === 0).length, 6)

  const uniquePartners = new Map(participants.map(number => [number, new Set()]))
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    for (const group of round) {
      for (const number of group) group.filter(other => other !== number).forEach(other => uniquePartners.get(number).add(other))
    }
  }
  assert.equal([...uniquePartners.values()].filter(values => values.size === 17).length, 36)
  assert.equal([...uniquePartners.values()].filter(values => values.size === 18).length, 6)

  for (const group of plan.round2) {
    assert.equal(groupPairKeys(group).filter(key => sets[0].has(key)).length, 1)
  }
  for (const group of plan.round3) {
    const round1Anchors = groupPairKeys(group).filter(key => sets[0].has(key))
    const round2Anchors = groupPairKeys(group).filter(key => sets[1].has(key))
    assert.equal(round1Anchors.length, 1)
    assert.equal(round2Anchors.length, 1)
    assert.notEqual(round1Anchors[0], round2Anchors[0])
  }

  assert.equal(plan.round2Depth.anchors.count, 6)
  assert.equal(plan.round3Rhythm.anchors.round1Spark.count, 6)
  assert.equal(plan.round3Rhythm.anchors.round2Depth.count, 6)
  assert.deepEqual(plan.round3Rhythm.repeatMetrics, metrics)
})

test("balances a 21/21 roster in every round while retaining minimum repeats", () => {
  const genderMap = Object.fromEntries(participants.map(number => [number, number <= 21 ? "female" : "male"]))
  const plan = buildChoiceOnlySeatingPlan(participants, { genderMap })
  const femaleCounts = round => round.map(group => group.filter(number => genderMap[number] === "female").length)

  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.ok(femaleCounts(round).every(count => count === 3 || count === 4))
  }
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 18)
  assert.equal(metrics.maximumParticipantRepeatBurden, 1)
  assert.equal(metrics.squaredParticipantRepeatBurden, 36)
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 1).length, 36)
  assert.equal([...burden.values()].filter(value => value === 0).length, 6)
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
    average: scores.reduce((sum, value) => sum + value, 0) / scores.length,
    minimum: Math.min(...scores),
  })

  const depthAverage = plan.round2.map(scorer.depthGroup).reduce((sum, group) => sum + group.score, 0) / 6
  const rhythmAverage = plan.round3.map(scorer.rhythmGroup).reduce((sum, group) => sum + group.score, 0) / 6
  assert.equal(plan.round2Depth.score, depthAverage)
  assert.equal(plan.round3Rhythm.score, rhythmAverage)
  assert.deepEqual(plan.round2Depth.anchors, stats(scoresFor(intersection(round1Pairs, round2Pairs), scorer.sparkPairScore)))
  assert.deepEqual(plan.round3Rhythm.anchors.round1Spark, stats(scoresFor(intersection(round1Pairs, round3Pairs), scorer.sparkPairScore)))
  assert.deepEqual(plan.round3Rhythm.anchors.round2Depth, stats(scoresFor(intersection(round2Pairs, round3Pairs), scorer.depthPairScore)))
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 18)
  assert.equal(metrics.maximumParticipantRepeatBurden, 1)
  assert.equal(metrics.squaredParticipantRepeatBurden, 36)
  const burden = repeatBurden(plan.round1, plan.round2, plan.round3)
  assert.equal([...burden.values()].filter(value => value === 1).length, 36)
  assert.equal([...burden.values()].filter(value => value === 0).length, 6)
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.ok(round.every(group => {
      const femaleCount = group.filter(number => genderMap[number] === "female").length
      return femaleCount === 3 || femaleCount === 4
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
  ).totalRepeatedPairOccurrences, 18)
})

test("accepts participant records and preserves their supplied order in the position map", () => {
  const records = [...participants].reverse().map(assigned_number => ({ assigned_number }))
  const plan = buildChoiceOnlySeatingPlan(records)
  assert.equal(plan.positionMap[42], 0)
  assert.equal(plan.positionMap[1], 41)
  assertRound(plan.round1)
})

test("returns a reviewable error for a non-42 or duplicate roster", () => {
  assert.match(buildChoiceOnlySeatingPlan(participants.slice(0, 41)).error, /exactly 42/)
  assert.match(buildChoiceOnlySeatingPlan([...participants.slice(0, 41), 41]).error, /unique/)
  assert.match(buildChoiceOnlySeatingPlan(participants, {
    requireCompleteLensProfiles: true,
  }).error, /complete survey profiles/)
})
