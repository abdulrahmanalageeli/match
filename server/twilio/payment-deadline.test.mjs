import assert from "node:assert/strict"
import test from "node:test"

import {
  formatSeatPaymentDeadline,
  hasPaymentReminderBeenSent,
  isPaymentReminderTemplate,
  paymentReminderSentField,
  paymentReminderSentUpdate,
  SEAT_PAYMENT_DEADLINE_WINDOW_MS,
} from "./payment-deadline.mjs"
import { attendanceDeclineAccessState } from "./confirmation-policy.mjs"

test("seat payment reminders expire one hour after send in Riyadh", () => {
  assert.equal(SEAT_PAYMENT_DEADLINE_WINDOW_MS, 60 * 60 * 1000)
  assert.equal(formatSeatPaymentDeadline(new Date("2026-09-05T12:15:00Z")), "4:15 مساءً")
})

test("the one-hour seat deadline formats midnight rollover correctly", () => {
  assert.equal(formatSeatPaymentDeadline(new Date("2026-09-05T20:30:00Z")), "12:30 صباحًا")
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
