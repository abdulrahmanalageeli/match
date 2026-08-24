import test from "node:test"
import assert from "node:assert/strict"
import { normalizeTheRoomActiveRound, TheRoomLiveStateError } from "./live-state.mjs"

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
