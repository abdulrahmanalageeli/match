import test from "node:test"
import assert from "node:assert/strict"
import { normalizeTheRoomActiveRound, resolveTheRoomRoundAdvance, TheRoomLiveStateError } from "./live-state.mjs"

test("accepts a live round inside the event range", () => {
  assert.equal(normalizeTheRoomActiveRound(2, 3), 2)
  assert.equal(normalizeTheRoomActiveRound("3", 3), 3)
})

test("rejects live rounds outside the event range", () => {
  assert.throws(
    () => normalizeTheRoomActiveRound(4, 3),
    error => error instanceof TheRoomLiveStateError
      && error.code === "INVALID_ACTIVE_ROUND"
      && error.details.maximum === 3,
  )
})

test("rejects fractional live rounds", () => {
  assert.throws(() => normalizeTheRoomActiveRound(1.5, 3), TheRoomLiveStateError)
})

test("advances exactly one round from the expected state", () => {
  assert.deepEqual(resolveTheRoomRoundAdvance({ expectedRound: 1, requestedRound: 2, currentRound: 1, roundCount: 3 }), {
    activeRound: 2,
    changed: true,
  })
})

test("treats a stale request as a no-op when another device already advanced farther", () => {
  assert.deepEqual(resolveTheRoomRoundAdvance({ expectedRound: 1, requestedRound: 2, currentRound: 3, roundCount: 3 }), {
    activeRound: 3,
    changed: false,
  })
})

test("rejects skipped and backward round transitions", () => {
  assert.throws(
    () => resolveTheRoomRoundAdvance({ expectedRound: 1, requestedRound: 3, currentRound: 1, roundCount: 3 }),
    error => error?.code === "INVALID_ROUND_TRANSITION",
  )
  assert.throws(
    () => resolveTheRoomRoundAdvance({ expectedRound: 2, requestedRound: 1, currentRound: 2, roundCount: 3 }),
    error => error?.code === "INVALID_ROUND_TRANSITION",
  )
})
