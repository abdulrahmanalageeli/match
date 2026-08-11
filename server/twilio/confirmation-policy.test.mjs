import assert from "node:assert/strict"
import test from "node:test"
import {
  attendanceDeclineAccessState,
  confirmationPaymentState,
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

test("only unlocks payment after current-event admin contact", () => {
  const enrolled = { signup_for_next_event: true, signup_event_id: 21 }
  assert.equal(paymentAccessState(enrolled, 21), "not_contacted")
  assert.equal(paymentAccessState({ ...enrolled, PAID: true }, 21), "not_contacted")
  assert.equal(paymentAccessState({ ...enrolled, PAID: true, whatsapp_contacted_event_id: 20 }, 21), "not_contacted")
  assert.equal(paymentAccessState({ ...enrolled, PAID: false, whatsapp_contacted_event_id: 21 }, 21), "not_contacted")
  assert.equal(paymentAccessState({ ...enrolled, PAID: true, whatsapp_contacted_event_id: 21 }, 21), "eligible")
  assert.equal(paymentAccessState({ event_id: 20, PAID: true, whatsapp_contacted_event_id: 21 }, 21), "not_enrolled")
})

test("accepts a decline from a current-event invitee even when signup metadata is stale", () => {
  assert.equal(attendanceDeclineAccessState({
    event_id: 18,
    signup_for_next_event: true,
    signup_event_id: null,
    PAID: true,
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
    PAID: false,
    whatsapp_contacted_event_id: null,
  }, 24), "not_contacted")
})
