import test from "node:test"
import assert from "node:assert/strict"
import { generateTheRoomSchedule } from "./scheduler.mjs"
import { extendTheRoomSchedule } from "./incremental-scheduler.mjs"

function attendees(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `guest-${index + 1}`,
    gender: index % 2 === 0 ? "female" : "male",
  }))
}

function seatRows(schedule) {
  return schedule.rounds.flatMap(round => round.tables.flatMap(table => table.attendeeIds.map((attendeeId, index) => ({
    attendee_id: attendeeId,
    round_number: round.roundNumber,
    table_number: table.tableNumber,
    seat_number: index + 1,
  }))))
}

test("adds newcomers without moving any established guest", () => {
  const originalPeople = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 5, roundCount: 3, seed: "incremental" })
  const originalRows = seatRows(schedule)
  const allPeople = attendees(24)
  const result = extendTheRoomSchedule({
    participants: allPeople,
    existingSeats: originalRows,
    newAttendeeIds: allPeople.slice(20).map(person => person.id),
    tableCount: 5,
    roundCount: 3,
  })

  assert.deepEqual(result.rows.slice(0, originalRows.length), originalRows)
  for (let round = 1; round <= 3; round += 1) {
    assert.equal(new Set(result.rows.filter(row => row.round_number === round).map(row => row.attendee_id)).size, 24)
  }
})

test("keeps new guests apart when there are enough tables", () => {
  const originalPeople = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 5, roundCount: 3, seed: "apart" })
  const allPeople = attendees(24)
  const newcomers = new Set(allPeople.slice(20).map(person => person.id))
  const result = extendTheRoomSchedule({ participants: allPeople, existingSeats: seatRows(schedule), newAttendeeIds: [...newcomers], tableCount: 5, roundCount: 3 })

  for (let round = 1; round <= 3; round += 1) {
    for (let table = 1; table <= 5; table += 1) {
      const newAtTable = result.rows.filter(row => row.round_number === round && row.table_number === table && newcomers.has(row.attendee_id))
      assert.ok(newAtTable.length <= 1)
    }
  }
  assert.equal(result.metrics.newGuestPairCount, 0)
  assert.equal(result.metrics.repeatPairCount, 0)
  assert.ok(result.metrics.genderSpreadMax <= 1)
})

test("avoids repeating newcomer pairs when separation is mathematically impossible", () => {
  const originalPeople = attendees(12)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 4, roundCount: 2, seed: "crowded" })
  const allPeople = attendees(18)
  const newcomers = allPeople.slice(12).map(person => person.id)
  const result = extendTheRoomSchedule({ participants: allPeople, existingSeats: seatRows(schedule), newAttendeeIds: newcomers, tableCount: 4, roundCount: 2 })

  assert.equal(result.metrics.newGuestRepeatPairCount, 0)
})
