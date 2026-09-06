import assert from "node:assert/strict"
import test from "node:test"

import {
  isEvent3JoinEligible,
  isEvent3PaidForEvent,
  isEvent3SignedUp,
} from "./enrollment.mjs"

test("accepts participants assigned to the active event", () => {
  assert.equal(isEvent3SignedUp({ event_id: 24 }, 24), true)
  assert.equal(isEvent3SignedUp({ event_id: 23 }, 24), false)
})

test("accepts manual and automatic next-event signups", () => {
  assert.equal(isEvent3SignedUp({ event_id: 23, signup_for_next_event: true }, 24), true)
  assert.equal(isEvent3SignedUp({ event_id: 23, auto_signup_next_event: true }, 24), true)
})

test("rejects participants without an active-event signup", () => {
  assert.equal(isEvent3SignedUp({ event_id: 23, signup_for_next_event: false, auto_signup_next_event: false }, 24), false)
  assert.equal(isEvent3SignedUp(null, 24), false)
  assert.equal(isEvent3SignedUp({ event_id: 24 }, null), false)
})

test("accepts PAID_DONE only when it belongs to the active event", () => {
  assert.equal(isEvent3PaidForEvent({ PAID_DONE: true, payment_completed_event_id: 24 }, 24), true)
  assert.equal(isEvent3PaidForEvent({ PAID_DONE: true, payment_completed_event_id: 23 }, 24), false)
  assert.equal(isEvent3PaidForEvent({ PAID_DONE: true, payment_completed_event_id: null }, 24), false)
  assert.equal(isEvent3PaidForEvent({ PAID_DONE: false, payment_completed_event_id: 24 }, 24), false)
})

test("accepts either active roster membership or active-event payment", () => {
  assert.equal(isEvent3JoinEligible({ PAID_DONE: false }, 24, true), true)
  assert.equal(isEvent3JoinEligible({ PAID_DONE: true, payment_completed_event_id: 24 }, 24, false), true)
  assert.equal(isEvent3JoinEligible({ PAID_DONE: true, payment_completed_event_id: 23 }, 24, false), false)
  assert.equal(isEvent3JoinEligible({ PAID_DONE: false }, null, true), false)
  assert.equal(isEvent3JoinEligible(null, 24, true), false)
})
