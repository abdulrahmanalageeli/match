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

test("spreads individually added guests of the same gender across every round", () => {
  let people = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: people, tableCount: 5, roundCount: 3, seed: "individual-imbalance" })
  let rows = seatRows(schedule)

  for (let index = 1; index <= 5; index += 1) {
    const added = { id: `extra-man-${index}`, gender: "male" }
    const before = rows.map(row => ({ ...row }))
    people = [...people, added]
    const result = extendTheRoomSchedule({
      participants: people,
      existingSeats: rows,
      newAttendeeIds: [added.id],
      tableCount: 5,
      roundCount: 3,
    })
    assert.deepEqual(result.rows.slice(0, before.length), before)
    assert.ok(result.metrics.genderSpreadMax <= 1)
    rows = result.rows
  }
})

test("prefers gender balance even when the balanced table contains more prior meetings", () => {
  const people = [
    { id: "m1", gender: "male" }, { id: "m2", gender: "male" }, { id: "m3", gender: "male" },
    { id: "f1", gender: "female" }, { id: "f2", gender: "female" }, { id: "f3", gender: "female" },
    { id: "new", gender: "male" },
  ]
  const existingSeats = [
    ...["m1", "m2", "m3"].map((id, index) => ({ attendee_id: id, round_number: 1, table_number: 1, seat_number: index + 1 })),
    ...["f1", "f2", "f3"].map((id, index) => ({ attendee_id: id, round_number: 1, table_number: 2, seat_number: index + 1 })),
    ...["m1", "m2", "f1"].map((id, index) => ({ attendee_id: id, round_number: 2, table_number: 1, seat_number: index + 1 })),
    ...["m3", "f2", "f3"].map((id, index) => ({ attendee_id: id, round_number: 2, table_number: 2, seat_number: index + 1 })),
  ]

  const result = extendTheRoomSchedule({ participants: people, existingSeats, newAttendeeIds: ["new"], tableCount: 2, roundCount: 2 })
  const secondRound = result.rows.find(row => row.attendee_id === "new" && row.round_number === 2)

  assert.equal(secondRound.table_number, 2)
  assert.equal(result.placements[0].reason, "gender_balance_first")
})

test("does not invent past meetings for a guest who joins after round one", () => {
  const originalPeople = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 5, roundCount: 3, seed: "late-round-two" })
  const newcomer = { id: "late-guest", gender: "female" }
  const result = extendTheRoomSchedule({
    participants: [...originalPeople, newcomer],
    existingSeats: seatRows(schedule),
    newAttendeeIds: [newcomer.id],
    tableCount: 5,
    roundCount: 3,
    activeRound: 2,
  })

  const newcomerSeats = result.rows.filter(row => row.attendee_id === newcomer.id)
  assert.deepEqual(newcomerSeats.map(row => row.round_number), [2, 3])
  assert.deepEqual(result.placements[0].tables.map(table => table.roundNumber), [2, 3])
})

test("can extend a later round when an earlier late arrival also has no past seat", () => {
  const originalPeople = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 5, roundCount: 3, seed: "successive-late-guests" })
  const firstLateGuest = { id: "late-round-two", gender: "female" }
  const afterRoundTwoArrival = extendTheRoomSchedule({
    participants: [...originalPeople, firstLateGuest],
    existingSeats: seatRows(schedule),
    newAttendeeIds: [firstLateGuest.id],
    tableCount: 5,
    roundCount: 3,
    activeRound: 2,
  })
  const secondLateGuest = { id: "late-round-three", gender: "male" }
  const afterRoundThreeArrival = extendTheRoomSchedule({
    participants: [...originalPeople, firstLateGuest, secondLateGuest],
    existingSeats: afterRoundTwoArrival.rows,
    newAttendeeIds: [secondLateGuest.id],
    tableCount: 5,
    roundCount: 3,
    activeRound: 3,
  })

  assert.equal(afterRoundThreeArrival.rows.some(row => row.attendee_id === firstLateGuest.id && row.round_number === 1), false)
  assert.deepEqual(afterRoundThreeArrival.rows.filter(row => row.attendee_id === secondLateGuest.id).map(row => row.round_number), [3])
})

test("rejects a stale extension that silently omits another concurrent walk-in", () => {
  const originalPeople = attendees(20)
  const schedule = generateTheRoomSchedule({ participants: originalPeople, tableCount: 5, roundCount: 3, seed: "concurrent-walk-ins" })
  const firstWalkIn = { id: "walk-in-one", gender: "female" }
  const secondWalkIn = { id: "walk-in-two", gender: "male" }

  assert.throws(
    () => extendTheRoomSchedule({
      participants: [...originalPeople, firstWalkIn, secondWalkIn],
      existingSeats: seatRows(schedule),
      newAttendeeIds: [firstWalkIn.id],
      tableCount: 5,
      roundCount: 3,
      activeRound: 2,
    }),
    error => error?.code === "UNSEATED_PARTICIPANT" && error?.details?.attendeeIds?.includes(secondWalkIn.id),
  )
})
