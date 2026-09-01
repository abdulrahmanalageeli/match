import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChoiceMatches,
  buildMutualChoiceRound,
  buildTwoMutualChoiceRounds,
  maximumCardinalityMatching,
} from "./choice-matching.mjs"
import { buildChoiceOnlySeatingPlan } from "./choice-only-seating.mjs"

const rows = ballots => Object.entries(ballots).flatMap(([ranker, order]) =>
  order.map((ranked, index) => ({ ranker_number: Number(ranker), ranked_number: ranked, rank: index + 1 })))

const pairKeys = result => result.pairs.map(pair => `${pair.a}-${pair.b}`)

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

test("the real 42-person three-group plan yields two complete reciprocal choice rounds", () => {
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
  const result = buildTwoMutualChoiceRounds({ participantNumbers, rankings })

  assert.equal(result.round1.pairs.length, 21)
  assert.equal(result.round2.pairs.length, 21)
  assert.deepEqual(result.round1.unmatched, [])
  assert.deepEqual(result.round2.unmatched, [])

  const firstPartners = new Map()
  for (const pair of result.round1.pairs) {
    assert.ok(tablemates.get(pair.a).has(pair.b))
    assert.ok(tablemates.get(pair.b).has(pair.a))
    firstPartners.set(pair.a, pair.b)
    firstPartners.set(pair.b, pair.a)
  }
  for (const pair of result.round2.pairs) {
    assert.ok(tablemates.get(pair.a).has(pair.b))
    assert.ok(tablemates.get(pair.b).has(pair.a))
    assert.notEqual(firstPartners.get(pair.a), pair.b)
    assert.notEqual(firstPartners.get(pair.b), pair.a)
  }
})

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
