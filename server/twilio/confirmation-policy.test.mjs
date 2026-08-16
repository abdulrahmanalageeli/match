import assert from "node:assert/strict"
import test from "node:test"
import {
  attendanceDeclineAccessState,
  confirmationPaymentState,
  isParticipantContactedForEvent,
  isParticipantEnrolledForEvent,
  paymentAccessState,
} from "./confirmation-policy.mjs"

test("uses the organizer waiver for a free participant", () => {
  assert.equal(confirmationPaymentState({ payment_waived: true, payment_waived_event_id: 21, PAID_DONE: false }, 21), "waived")
  assert.equal(confirmationPaymentState({ payment_waived: true, payment_waived_event_id: 20, PAID_DONE: false }, 21), "payment_pending")
  assert.equal(confirmationPaymentState({ payment_waived: true, PAID_DONE: false }, 21), "payment_pending")
})

test("treats everyone without an organizer waiver normally", () => {
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: true, payment_completed_event_id: 21 }, 21), "paid")
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: true, payment_completed_event_id: 20 }, 21), "payment_pending")
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: true }, 21), "payment_pending")
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: false }, 21), "payment_pending")
  assert.equal(confirmationPaymentState({}, 21), "payment_pending")
})

test("requires enrollment in the active event", () => {
  assert.equal(isParticipantEnrolledForEvent({ event_id: 21 }, 21), true)
  assert.equal(isParticipantEnrolledForEvent({ signup_for_next_event: true, signup_event_id: 21 }, 21), true)
  assert.equal(isParticipantEnrolledForEvent({ auto_signup_next_event: true }, 21), true)
  assert.equal(isParticipantEnrolledForEvent({ signup_for_next_event: true, signup_event_id: 20 }, 21), false)
  assert.equal(isParticipantEnrolledForEvent({ event_id: 20 }, 21), false)
})

test("uses only the current-event WhatsApp contact marker for Twilio access", () => {
  assert.equal(isParticipantContactedForEvent({ whatsapp_contacted_event_id: 21 }, 21), true)
  assert.equal(isParticipantContactedForEvent({ whatsapp_contacted_event_id: 20 }, 21), false)
  assert.equal(isParticipantContactedForEvent({}, 21), false)

  assert.equal(paymentAccessState({ signup_for_next_event: false, PAID: false, whatsapp_contacted_event_id: 21 }, 21), "eligible")
  assert.equal(paymentAccessState({ event_id: 21, PAID: true, whatsapp_contacted_event_id: 20 }, 21), "not_contacted")
  assert.equal(paymentAccessState({ auto_signup_next_event: true, PAID: true }, 21), "not_contacted")
  assert.equal(paymentAccessState({ event_id: 20, signup_for_next_event: false, auto_signup_next_event: false }, 21), "not_enrolled")
})

test("uses the same current-event contact marker for attendance declines", () => {
  assert.equal(attendanceDeclineAccessState({
    event_id: 18,
    signup_for_next_event: false,
    PAID: false,
    whatsapp_contacted_event_id: 24,
  }, 24), "eligible")

  assert.equal(attendanceDeclineAccessState({
    event_id: 23,
    signup_for_next_event: true,
    signup_event_id: null,
    PAID: true,
    whatsapp_contacted_event_id: 23,
  }, 24), "not_enrolled")

  assert.equal(attendanceDeclineAccessState({
    signup_for_next_event: true,
    signup_event_id: 24,
    whatsapp_contacted_event_id: null,
  }, 24), "not_contacted")

  assert.equal(attendanceDeclineAccessState({
    event_id: 23,
    signup_for_next_event: false,
    auto_signup_next_event: false,
    whatsapp_contacted_event_id: null,
  }, 24), "not_enrolled")
})
