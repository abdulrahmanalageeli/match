import assert from "node:assert/strict"
import test from "node:test"

import {
  formatSeatPaymentDeadline,
  isPaymentReminderTemplate,
  SEAT_PAYMENT_DEADLINE_LABEL,
} from "./payment-deadline.mjs"

test("seat payment reminders use an end-of-day 11:59 PM deadline", () => {
  assert.equal(SEAT_PAYMENT_DEADLINE_LABEL, "11:59 مساءً")
  assert.equal(formatSeatPaymentDeadline(), "11:59 مساءً")
})

test("the seat deadline template follows payment-reminder tracking", () => {
  assert.equal(isPaymentReminderTemplate("payment"), true)
  assert.equal(isPaymentReminderTemplate("seat_payment_deadline"), true)
  assert.equal(isPaymentReminderTemplate("reminder"), false)
})
