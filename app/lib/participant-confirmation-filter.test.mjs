import assert from "node:assert/strict"
import test from "node:test"

import { matchesParticipantConfirmationFilter } from "./participant-confirmation-filter.mjs"

test("confirmed matches Twilio confirmed interest regardless of payment", () => {
  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: true,
    PAID_DONE: false,
    receipt_approved: false,
    payment_waived: false,
  }, "confirmed"), true)

  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: true,
    PAID_DONE: true,
  }, "confirmed"), true)

  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: false,
    PAID_DONE: true,
  }, "confirmed"), false)
})

test("awaiting payment remains the unpaid subset of confirmed interest", () => {
  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: true,
    PAID_DONE: false,
    receipt_approved: false,
    payment_waived: false,
  }, "awaiting_receipt"), true)

  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: true,
    PAID_DONE: true,
  }, "awaiting_receipt"), false)
})

test("declined and all preserve their existing meanings", () => {
  assert.equal(matchesParticipantConfirmationFilter({
    attendance_confirmed: false,
    attendance_denied_at: "2026-08-18T00:00:00.000Z",
  }, "declined"), true)
  assert.equal(matchesParticipantConfirmationFilter({}, "all"), true)
})
