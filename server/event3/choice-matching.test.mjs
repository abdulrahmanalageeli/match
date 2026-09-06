import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChoiceMatches,
  buildGlobalChoiceMatches,
  buildIndividualPriorityChoiceMatches,
  buildIndividualPriorityChoiceRound,
  buildMutualChoiceRound,
  buildMutualChoiceRounds,
  buildThreeMutualChoiceRounds,
  buildTwoMutualChoiceRounds,
  compareIndividualPriorityEdges,
  compareMutualEdges,
  maximumCardinalityMatching,
} from "./choice-matching.mjs"
import { buildChoiceOnlySeatingPlan } from "./choice-only-seating.mjs"

const rows = ballots => Object.entries(ballots).flatMap(([ranker, order]) =>
  order.map((ranked, index) => ({ ranker_number: Number(ranker), ranked_number: ranked, rank: index + 1 })))

const pairKeys = result => result.pairs.map(pair => `${pair.a}-${pair.b}`)

test("individual-priority rounds try the historical strongest pair first but backtrack to remain reciprocal", () => {
  // 1-2 has the best historical score, but it would strand 3 and 4. The
  // complete plan therefore retains the next strongest feasible pair set.
  const result = buildIndividualPriorityChoiceRound({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({ 1: [2, 3], 2: [1, 4], 3: [1], 4: [2] }),
  })

  assert.deepEqual(pairKeys(result), ["1-3", "2-4"])
  assert.deepEqual(result.unmatched, [])
  assert.equal(result.pairs.every(pair => Number.isFinite(pair.priorityScore)), true)
})

test("individual-priority ties preserve the Event 25/26 opposite-gender preference", () => {
  const sameGender = { a: 1, b: 2, priorityScore: 2, oppositeGender: 0 }
  const oppositeGender = { a: 3, b: 4, priorityScore: 2, oppositeGender: 1 }
  assert.deepEqual(
    [sameGender, oppositeGender].sort(compareIndividualPriorityEdges),
    [oppositeGender, sameGender],
  )
})

test("individual priority and the third-round global policy keep their distinct historical orderings", () => {
  const lopsided = {
    a: 1, b: 2, aRank: 1, bRank: 6,
    worstRank: 6, rankSum: 7, rankGap: 5,
    priorityScore: 7.5, oppositeGender: 1,
  }
  const balanced = {
    a: 3, b: 4, aRank: 5, bRank: 5,
    worstRank: 5, rankSum: 10, rankGap: 0,
    priorityScore: 8, oppositeGender: 1,
  }

  assert.ok(compareIndividualPriorityEdges(lopsided, balanced) < 0)
  assert.ok(compareMutualEdges(balanced, lopsided) < 0)
})

test("maximizes attendance before accepting a locally strongest greedy edge", () => {
  // 1-2 is the strongest edge, but taking it would strand both 3 and 4.
  const result = buildMutualChoiceRound({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({ 1: [2, 3], 2: [1, 4], 3: [1], 4: [2] }),
  })

  assert.deepEqual(pairKeys(result), ["1-3", "2-4"])
  assert.deepEqual(result.unmatched, [])
  assert.equal(result.maximumPairCount, 2)
})

test("among maximum-cardinality results, keeps the strongest mutual ranks", () => {
  const result = buildMutualChoiceRound({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({
      1: [2, 3, 4],
      2: [1, 4, 3],
      3: [4, 1, 2],
      4: [3, 2, 1],
    }),
  })

  assert.deepEqual(pairKeys(result), ["1-2", "3-4"])
  assert.deepEqual(result.pairs.map(pair => [pair.worstRank, pair.rankSum, pair.rankGap]), [[1, 2, 0], [1, 2, 0]])
})

test("round two excludes every round-one partner and finds the next strongest result", () => {
  const result = buildTwoMutualChoiceRounds({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({
      1: [2, 3, 4],
      2: [1, 4, 3],
      3: [4, 1, 2],
      4: [3, 2, 1],
    }),
  })

  assert.deepEqual(pairKeys(result.round1), ["1-2", "3-4"])
  assert.deepEqual(pairKeys(result.round2), ["1-3", "2-4"])
  assert.equal(pairKeys(result.round2).some(key => pairKeys(result.round1).includes(key)), false)
})

test("the generic round builder excludes partners from every earlier round", () => {
  const result = buildMutualChoiceRounds({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({
      1: [2, 3, 4],
      2: [1, 4, 3],
      3: [4, 1, 2],
      4: [3, 2, 1],
    }),
    roundCount: 3,
  })

  assert.deepEqual(result.rounds.map(pairKeys), [
    ["1-2", "3-4"],
    ["1-3", "2-4"],
    ["1-4", "2-3"],
  ])
})

test("the real 42-person three-group plan yields three complete reciprocal choice rounds", () => {
  const participantNumbers = Array.from({ length: 42 }, (_, index) => index + 1)
  const seating = buildChoiceOnlySeatingPlan(participantNumbers)
  assert.equal(seating.error, undefined)

  const tablemates = new Map(participantNumbers.map(number => [number, new Set()]))
  for (const round of [seating.round1, seating.round2, seating.round3]) {
    for (const group of round) {
      for (const participant of group) {
        for (const tablemate of group) {
          if (tablemate !== participant) tablemates.get(participant).add(tablemate)
        }
      }
    }
  }

  const rankings = new Map([...tablemates].map(([participant, met]) => [
    participant,
    [...met].sort((a, b) => a - b),
  ]))
  const result = buildThreeMutualChoiceRounds({ participantNumbers, rankings })

  assert.equal(result.round1.pairs.length, 21)
  assert.equal(result.round2.pairs.length, 21)
  assert.equal(result.round3.pairs.length, 21)
  assert.deepEqual(result.round1.unmatched, [])
  assert.deepEqual(result.round2.unmatched, [])
  assert.deepEqual(result.round3.unmatched, [])

  const previousPartners = new Map(participantNumbers.map(number => [number, new Set()]))
  for (const round of [result.round1, result.round2, result.round3]) {
    for (const pair of round.pairs) {
      assert.ok(tablemates.get(pair.a).has(pair.b))
      assert.ok(tablemates.get(pair.b).has(pair.a))
      assert.equal(previousPartners.get(pair.a).has(pair.b), false)
      assert.equal(previousPartners.get(pair.b).has(pair.a), false)
      previousPartners.get(pair.a).add(pair.b)
      previousPartners.get(pair.b).add(pair.a)
    }
  }
  for (const partners of previousPartners.values()) assert.equal(partners.size, 3)
})

for (const participantCount of [6, 16, 20, 30, 44]) {
  test(`${participantCount}-person three-group plans yield three complete, non-repeating reciprocal rounds`, () => {
    const participantNumbers = Array.from({ length: participantCount }, (_, index) => index + 1)
    const seating = buildChoiceOnlySeatingPlan(participantNumbers)
    assert.equal(seating.error, undefined)

    const tablemates = new Map(participantNumbers.map(number => [number, new Set()]))
    for (const round of [seating.round1, seating.round2, seating.round3]) {
      for (const group of round) {
        for (const participant of group) {
          for (const tablemate of group) {
            if (tablemate !== participant) tablemates.get(participant).add(tablemate)
          }
        }
      }
    }

    const result = buildThreeMutualChoiceRounds({
      participantNumbers,
      rankings: new Map([...tablemates].map(([participant, met]) => [participant, [...met].sort((a, b) => a - b)])),
    })
    const pairCount = participantCount / 2
    for (const round of [result.round1, result.round2, result.round3]) {
      assert.equal(round.pairs.length, pairCount)
      assert.deepEqual(round.unmatched, [])
    }
    const seenPairs = result.round1.pairs.concat(result.round2.pairs, result.round3.pairs)
      .map(pair => `${pair.a}-${pair.b}`)
    assert.equal(new Set(seenPairs).size, pairCount * 3)
  })
}

for (const participantCount of [6, 16, 20, 30, 42, 44]) {
  test(`${participantCount}-person live policy completes two individual-priority rounds and one global round`, () => {
    const participantNumbers = Array.from({ length: participantCount }, (_, index) => index + 1)
    const seating = buildChoiceOnlySeatingPlan(participantNumbers)
    assert.equal(seating.error, undefined)
    const tablemates = new Map(participantNumbers.map(number => [number, new Set()]))
    for (const round of [seating.round1, seating.round2, seating.round3]) {
      for (const group of round) {
        for (const participant of group) {
          for (const tablemate of group) {
            if (tablemate !== participant) tablemates.get(participant).add(tablemate)
          }
        }
      }
    }
    const rankings = new Map([...tablemates].map(([participant, met]) => [participant, [...met].sort((a, b) => a - b)]))
    const exclusions = new Set()
    const first = buildIndividualPriorityChoiceMatches(rankings, { exclusions })
    assert.equal(first.pairs.length, participantCount / 2)
    assert.deepEqual(first.unmatched, [])
    for (const pair of first.pairs) exclusions.add(`${pair.a}-${pair.b}`)

    const second = buildIndividualPriorityChoiceMatches(rankings, { exclusions })
    assert.equal(second.pairs.length, participantCount / 2)
    assert.deepEqual(second.unmatched, [])
    for (const pair of second.pairs) exclusions.add(`${pair.a}-${pair.b}`)

    const third = buildGlobalChoiceMatches(rankings, { exclusions })
    assert.equal(third.pairs.length, participantCount / 2)
    assert.deepEqual(third.unmatched, [])
    assert.equal(third.pairs.every(pair => tablemates.get(pair.a).has(pair.b) && tablemates.get(pair.b).has(pair.a)), true)

    const allPairs = [...first.pairs, ...second.pairs, ...third.pairs].map(pair => `${pair.a}-${pair.b}`)
    assert.equal(new Set(allPairs).size, participantCount * 1.5)
  })
}

test("API wrapper returns the symmetric Map shape used by Event3", () => {
  const result = buildChoiceMatches(new Map([
    [1, [2, 3]],
    [2, [1, 3]],
    [3, [1, 2]],
  ]), { exclusions: new Set(["1-2"]) })

  assert.deepEqual([...result.matches], [[1, 3], [3, 1]])
  assert.deepEqual(result.unmatched, [2])
})

test("never invents a fallback pair when the ranking is not reciprocal", () => {
  const result = buildMutualChoiceRound({
    participantNumbers: [1, 2, 3, 4],
    rankings: rows({ 1: [2], 2: [1], 3: [4], 4: [] }),
  })

  assert.deepEqual(pairKeys(result), ["1-2"])
  assert.deepEqual(result.unmatched, [3, 4])
  assert.equal(result.candidatePairCount, 1)
})

test("honors operational exclusions in both rounds", () => {
  const result = buildTwoMutualChoiceRounds({
    participantNumbers: [1, 2, 3, 4],
    rankings: new Map([
      [1, [2, 3, 4]],
      [2, [1, 4, 3]],
      [3, [4, 1, 2]],
      [4, [3, 2, 1]],
    ]),
    excludedPairs: [[1, 2], { participant_a_number: 3, participant_b_number: 4 }],
  })

  assert.deepEqual(pairKeys(result.round1), ["1-3", "2-4"])
  assert.deepEqual(pairKeys(result.round2), ["1-4", "2-3"])
})

test("odd rosters leave exactly one person unmatched when the mutual graph permits it", () => {
  const participants = [1, 2, 3, 4, 5]
  const rankings = new Map(participants.map(number => [number, participants.filter(other => other !== number)]))
  const result = buildMutualChoiceRound({ participantNumbers: participants, rankings })

  assert.equal(result.pairs.length, 2)
  assert.equal(result.unmatched.length, 1)
  assert.deepEqual(new Set(result.pairs.flatMap(pair => [pair.a, pair.b])).size, 4)
})

test("ties and shuffled database rows produce the same canonical result", () => {
  const rankingRows = []
  for (const ranker of [4, 2, 1, 3]) {
    for (const ranked of [4, 3, 2, 1].filter(number => number !== ranker)) {
      rankingRows.push({ ranker_number: ranker, ranked_number: ranked, rank: 1 })
    }
  }
  const forward = buildMutualChoiceRound({ participantNumbers: [4, 1, 3, 2], rankings: rankingRows })
  const reversed = buildMutualChoiceRound({ participantNumbers: [2, 3, 1, 4], rankings: [...rankingRows].reverse() })

  assert.deepEqual(pairKeys(forward), ["1-2", "3-4"])
  assert.deepEqual(reversed, forward)
})

test("the cardinality oracle handles odd blossoms", () => {
  // A five-cycle is non-bipartite and requires general-graph matching logic.
  const result = maximumCardinalityMatching(
    [1, 2, 3, 4, 5],
    [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
  )
  assert.equal(result.length, 2)
  assert.equal(new Set(result.flatMap(pair => [pair.a, pair.b])).size, 4)
})

test("invalid rosters fail before any partial result is returned", () => {
  assert.throws(() => buildMutualChoiceRound({ participantNumbers: [1, 1], rankings: [] }), /duplicates/)
  assert.throws(() => buildMutualChoiceRound({ participantNumbers: [1, 0], rankings: [] }), /positive integers/)
})
