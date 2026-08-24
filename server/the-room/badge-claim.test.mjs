import test from "node:test"
import assert from "node:assert/strict"
import { chooseTheRoomBadgeCandidate } from "./badge-claim.mjs"

function attendee(id, attendeeNumber, gender, checkedIn = false) {
  return {
    id,
    attendee_number: attendeeNumber,
    gender,
    checked_in: checkedIn,
    included_in_schedule: true,
    attendance_status: "registered",
  }
}

function tableSeats(roundNumber, tableNumber, attendeeIds) {
  return attendeeIds.map((attendeeId, index) => ({
    attendee_id: attendeeId,
    round_number: roundNumber,
    table_number: tableNumber,
    seat_number: index + 1,
  }))
}

test("claims the next badge of the requested gender without reassignment", () => {
  const attendees = [
    attendee("f2", 2, "female"),
    attendee("m1", 1, "male"),
    attendee("f1", 1, "female"),
  ]

  const choice = chooseTheRoomBadgeCandidate({ attendees, requestedGender: "female" })

  assert.equal(choice.attendee.id, "f1")
  assert.equal(choice.reassigned, false)
})

test("reassigns the unused badge that least disrupts future table balance", () => {
  const attendees = [
    attendee("m1", 1, "male", true),
    attendee("m2", 2, "male", true),
    attendee("f1", 3, "female"),
    attendee("f2", 4, "female"),
    attendee("f3", 5, "female", true),
    attendee("f4", 6, "female", true),
  ]
  const seats = [
    ...tableSeats(1, 1, ["m1", "m2", "f1"]),
    ...tableSeats(1, 2, ["f2", "f3", "f4"]),
    ...tableSeats(2, 1, ["m1", "m2", "f1"]),
    ...tableSeats(2, 2, ["f2", "f3", "f4"]),
  ]

  const choice = chooseTheRoomBadgeCandidate({
    attendees,
    seats,
    requestedGender: "male",
    tableCount: 2,
    roundCount: 2,
  })

  assert.equal(choice.attendee.id, "f2")
  assert.equal(choice.reassigned, true)
})

test("returns no badge only when the entire unused pool is exhausted", () => {
  const attendees = [
    attendee("m1", 1, "male", true),
    attendee("f1", 2, "female", true),
  ]

  assert.equal(chooseTheRoomBadgeCandidate({ attendees, requestedGender: "male" }), null)
})

test("keeps registering men after the prepared male pool is exhausted at 28 guests", () => {
  const original = Array.from({ length: 23 }, (_, index) =>
    attendee(`original-${index + 1}`, index + 1, index < 10 ? "female" : "male", true)
  )
  const prepared = [
    attendee("prepared-24", 24, "female"),
    attendee("prepared-25", 25, "female"),
    attendee("prepared-26", 26, "female"),
    attendee("prepared-27", 27, "female"),
    attendee("prepared-28", 28, "male"),
  ]
  const attendees = [...original, ...prepared]

  const first = chooseTheRoomBadgeCandidate({ attendees, requestedGender: "male" })
  first.attendee.checked_in = true
  const second = chooseTheRoomBadgeCandidate({ attendees, requestedGender: "male" })

  assert.equal(first.attendee.id, "prepared-28")
  assert.equal(first.reassigned, false)
  assert.equal(second.attendee.id, "prepared-24")
  assert.equal(second.reassigned, true)
})
