import assert from "node:assert/strict"
import test from "node:test"

import { scoreRound2AgeGroup } from "./round2-age-lens.mjs"

test("age scoring reports pairwise average, RMS, squared cost, and missing coverage", () => {
  const result = scoreRound2AgeGroup([1, 2, 3, 4], {
    ageMap: new Map([[1, 20], [2, 24], [3, 32], [4, ""]]),
    lockedPairsSet: new Set(["1-4", "2-3"]),
  })

  assert.equal(result.score, 8)
  assert.equal(result.averageAgeGap, 8)
  assert.ok(Math.abs(result.rmsAgeGap - Math.sqrt(224 / 3)) < 1e-12)
  assert.equal(result.ageCost, 224)
  assert.equal(result.ageRange, 12)
  assert.equal(result.knownAgePairs, 3)
  assert.equal(result.missingAgePairs, 3)
  assert.equal(result.lockedPairs, 2)
})

test("a group with no known age pairs stays explicitly unscored", () => {
  const result = scoreRound2AgeGroup([1, 2, 3], {
    ageMap: { 1: null, 2: "", 3: 0 },
  })

  assert.equal(result.score, null)
  assert.equal(result.averageAgeGap, null)
  assert.equal(result.rmsAgeGap, null)
  assert.equal(result.ageRange, null)
  assert.equal(result.ageCost, 0)
  assert.equal(result.knownAgePairs, 0)
  assert.equal(result.missingAgePairs, 3)
})
