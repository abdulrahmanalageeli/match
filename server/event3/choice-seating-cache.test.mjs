import assert from "node:assert/strict"
import test from "node:test"

import {
  choiceSeatingCacheInternals,
  getOrBuildChoiceSeatingCandidates,
} from "./choice-seating-cache.mjs"

function generatedFixture(seed = 1) {
  return {
    objectiveVersion: "test-objective-v1",
    candidates: [1, 2, 3].map(rank => ({ id: `candidate-${seed}-${rank}`, rank, plan: {} })),
  }
}

test.beforeEach(() => {
  choiceSeatingCacheInternals.resetForTests()
})

test("reuses generated candidates for the same seating context", async () => {
  let builds = 0
  const build = () => {
    builds++
    return generatedFixture(builds)
  }

  const first = await getOrBuildChoiceSeatingCandidates({ contextHash: "same-context", eventId: 26, build })
  const second = await getOrBuildChoiceSeatingCandidates({ contextHash: "same-context", eventId: 26, build })
  const changed = await getOrBuildChoiceSeatingCandidates({ contextHash: "changed-context", eventId: 26, build })

  assert.equal(builds, 2)
  assert.equal(first.cache.status, "miss")
  assert.equal(second.cache.status, "hit")
  assert.equal(second.cache.layer, "memory")
  assert.deepEqual(second.generated, first.generated)
  assert.equal(changed.cache.status, "miss")
  assert.notDeepEqual(changed.generated, first.generated)
})

test("coalesces simultaneous generation requests inside one function isolate", async () => {
  let builds = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const build = async () => {
    builds++
    await gate
    return generatedFixture(7)
  }

  const firstPromise = getOrBuildChoiceSeatingCandidates({ contextHash: "concurrent-context", eventId: 26, build })
  await Promise.resolve()
  await Promise.resolve()
  const secondPromise = getOrBuildChoiceSeatingCandidates({ contextHash: "concurrent-context", eventId: 26, build })
  release()
  const [first, second] = await Promise.all([firstPromise, secondPromise])

  assert.equal(builds, 1)
  assert.equal(first.cache.status, "miss")
  assert.equal(second.cache.status, "coalesced")
  assert.deepEqual(second.generated, first.generated)
})
