import test from "node:test"
import assert from "node:assert/strict"
import { analyzeTheRoomMove, TheRoomMoveError } from "./manual-move.mjs"

const attendees = [
  { id: "a", attendee_number: 1 },
  { id: "b", attendee_number: 2 },
  { id: "c", attendee_number: 3 },
  { id: "d", attendee_number: 4 },
]

const seats = [
  { id: 1, attendee_id: "a", round_number: 1, table_number: 1, seat_number: 1 },
  { id: 2, attendee_id: "b", round_number: 1, table_number: 1, seat_number: 2 },
  { id: 3, attendee_id: "c", round_number: 1, table_number: 2, seat_number: 1 },
  { id: 4, attendee_id: "d", round_number: 1, table_number: 2, seat_number: 2 },
  { id: 5, attendee_id: "a", round_number: 2, table_number: 1, seat_number: 1 },
  { id: 6, attendee_id: "c", round_number: 2, table_number: 1, seat_number: 2 },
  { id: 7, attendee_id: "b", round_number: 2, table_number: 2, seat_number: 1 },
  { id: 8, attendee_id: "d", round_number: 2, table_number: 2, seat_number: 2 },
]

test("reports prior meetings before a manual table move", () => {
  const result = analyzeTheRoomMove({ seats, attendees, attendeeId: "a", roundNumber: 2, targetTable: 2, tableCount: 2 })
  assert.equal(result.fromTable, 1)
  assert.equal(result.toTable, 2)
  assert.deepEqual(result.repeatedWithNumbers, [2])
  assert.equal(result.nextSeatNumber, 3)
})

test("rejects moving a guest to the same table", () => {
  assert.throws(
    () => analyzeTheRoomMove({ seats, attendees, attendeeId: "a", roundNumber: 2, targetTable: 1, tableCount: 2 }),
    error => error instanceof TheRoomMoveError && error.code === "SAME_TABLE",
  )
})
