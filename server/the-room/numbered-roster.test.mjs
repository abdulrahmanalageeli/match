import test from "node:test"
import assert from "node:assert/strict"
import { buildNumberedRosterRows, rosterGenderCounts } from "./numbered-roster.mjs"

test("creates an exactly even numbered roster for an even minimum", () => {
  const rows = buildNumberedRosterRows({ eventId: "event-1", count: 20 })
  assert.deepEqual(rows.map(row => row.attendee_number), Array.from({ length: 20 }, (_, index) => index + 1))
  assert.deepEqual(rosterGenderCounts(rows), { male: 10, female: 10 })
  assert.equal(rows[0].full_name, "Guest 1")
  assert.equal(rows[19].full_name, "Guest 20")
})

test("new numbers continue from the last guest and correct an uneven split", () => {
  const rows = buildNumberedRosterRows({
    eventId: "event-2",
    count: 4,
    startNumber: 21,
    maleCount: 8,
    femaleCount: 12,
  })
  assert.deepEqual(rows.map(row => row.attendee_number), [21, 22, 23, 24])
  assert.ok(rows.every(row => row.gender === "male"))
})
