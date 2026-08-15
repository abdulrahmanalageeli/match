import assert from "node:assert/strict"
import test from "node:test"

import { buildDislikeLeaderboard } from "./dislike-ranking.mjs"

const ballot = (eventId, rankerNumber, rankedNumbers, extra = {}) => rankedNumbers.map((rankedNumber, index) => ({
  event_id: eventId,
  ranker_number: rankerNumber,
  ranked_number: rankedNumber,
  rank: index + 1,
  ...extra,
}))

test("repeated last-place rankings rise above a single last-place ranking", () => {
  const rows = [
    ...ballot(20, 1, [10, 11, 12]),
    ...ballot(20, 2, [10, 11, 12]),
    ...ballot(20, 3, [10, 11, 12]),
    ...ballot(20, 4, [20, 21, 22]),
  ]
  const leaderboard = buildDislikeLeaderboard(rows)
  assert.equal(leaderboard[0].number, 12)
  assert.equal(leaderboard[0].last_place_count, 3)
  assert.ok(leaderboard[0].score > leaderboard.find(person => person.number === 22).score)
})

test("supports a mirrored most-liked sort based on repeated first-place rankings", () => {
  const leaderboard = buildDislikeLeaderboard([
    ...ballot(20, 1, [10, 11, 12]),
    ...ballot(20, 2, [10, 11, 12]),
    ...ballot(20, 3, [10, 11, 12]),
    ...ballot(20, 4, [20, 21, 22]),
  ])
  const liked = [...leaderboard].sort((a, b) => b.like_score - a.like_score)
  assert.equal(liked[0].number, 10)
  assert.equal(liked[0].first_place_count, 3)
  assert.ok(liked[0].like_score > leaderboard.find(person => person.number === 20).like_score)
})

test("normalizes differently sized ballots to the same last-place severity", () => {
  const leaderboard = buildDislikeLeaderboard([
    ...ballot(20, 1, [1, 2, 3]),
    ...ballot(20, 2, [4, 5, 6, 7, 8, 9]),
  ])
  assert.equal(leaderboard.find(person => person.number === 3).score, leaderboard.find(person => person.number === 9).score)
})

test("ignores auto-saved rankings and reports cross-event evidence", () => {
  const leaderboard = buildDislikeLeaderboard([
    ...ballot(20, 1, [10, 12]),
    ...ballot(21, 2, [11, 12]),
    ...ballot(22, 3, [12, 10], { auto_saved: true }),
  ], new Map([[12, "Noor"]]))
  const noor = leaderboard.find(person => person.number === 12)
  assert.equal(noor.name, "Noor")
  assert.equal(noor.received_rankings, 2)
  assert.equal(noor.events_count, 2)
  assert.equal(noor.last_place_count, 2)
})

test("skips incomplete one-entry ballots instead of calling them last place", () => {
  assert.deepEqual(buildDislikeLeaderboard(ballot(20, 1, [9])), [])
})
