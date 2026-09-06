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

test("keeps seating caches for six hours", () => {
  assert.equal(choiceSeatingCacheInternals.CACHE_TTL_SECONDS, 21_600)
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

test("saves each bounded generation step and resumes without rebuilding earlier work", async () => {
  const receivedCheckpoints = []
  const buildStep = checkpoint => {
    receivedCheckpoints.push(checkpoint?.completed || 0)
    const completed = Number(checkpoint?.completed || 0) + 1
    if (completed < 3) {
      return {
        complete: false,
        checkpoint: { completed },
        progress: { completed_steps: completed, total_steps: 3, percent: Math.round(completed / 3 * 100) },
      }
    }
    return {
      complete: true,
      generated: generatedFixture(9),
      progress: { completed_steps: 3, total_steps: 3, percent: 100 },
    }
  }

  const first = await getOrBuildChoiceSeatingCandidates({ contextHash: "checkpoint-context", eventId: 26, buildStep })
  const second = await getOrBuildChoiceSeatingCandidates({ contextHash: "checkpoint-context", eventId: 26, buildStep })
  const third = await getOrBuildChoiceSeatingCandidates({ contextHash: "checkpoint-context", eventId: 26, buildStep })
  const cached = await getOrBuildChoiceSeatingCandidates({ contextHash: "checkpoint-context", eventId: 26, buildStep })

  assert.deepEqual(receivedCheckpoints, [0, 1, 2])
  assert.equal(first.pending, true)
  assert.equal(first.cache.status, "checkpoint")
  assert.equal(first.cache.completed_steps, 1)
  assert.equal(second.pending, true)
  assert.equal(second.cache.completed_steps, 2)
  assert.deepEqual(third.generated, generatedFixture(9))
  assert.equal(third.cache.status, "miss")
  assert.equal(cached.cache.status, "hit")
  assert.deepEqual(cached.generated, third.generated)
})
