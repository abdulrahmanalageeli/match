import assert from "node:assert/strict"
import test from "node:test"

import {
  formatSeatPaymentDeadline,
  hasPaymentReminderBeenSent,
  isPaymentReminderTemplate,
  paymentReminderSentField,
  paymentReminderSentUpdate,
  SEAT_PAYMENT_DEADLINE_LABEL,
} from "./payment-deadline.mjs"
import { attendanceDeclineAccessState } from "./confirmation-policy.mjs"

test("seat payment reminders use an end-of-day 11:59 PM deadline", () => {
  assert.equal(SEAT_PAYMENT_DEADLINE_LABEL, "11:59 مساءً")
  assert.equal(formatSeatPaymentDeadline(), "11:59 مساءً")
})

test("the seat deadline template follows payment-reminder tracking", () => {
  assert.equal(isPaymentReminderTemplate("payment"), true)
  assert.equal(isPaymentReminderTemplate("seat_payment_deadline"), true)
  assert.equal(isPaymentReminderTemplate("reminder"), false)
})

test("standard and seat payment reminders use independent sent flags", () => {
  const participant = {
    payment_reminder_sent: true,
    seat_payment_reminder_sent: false,
  }
  assert.equal(paymentReminderSentField("payment"), "payment_reminder_sent")
  assert.equal(paymentReminderSentField("seat_payment_deadline"), "seat_payment_reminder_sent")
  assert.equal(hasPaymentReminderBeenSent("payment", participant), true)
  assert.equal(hasPaymentReminderBeenSent("seat_payment_deadline", participant), false)
})

test("a sent seat reminder enables current-event decline actions", () => {
  const update = paymentReminderSentUpdate("seat_payment_deadline", 12)
  assert.deepEqual(update, {
    seat_payment_reminder_sent: true,
    whatsapp_contacted_event_id: 12,
  })
  assert.equal(attendanceDeclineAccessState({ event_id: 12, ...update }, 12), "eligible")
})
