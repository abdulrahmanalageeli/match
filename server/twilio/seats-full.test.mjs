import assert from "node:assert/strict"
import test from "node:test"
import { shouldBlockNewEventPayment } from "./confirmation-policy.mjs"

test("blocks only unpaid participants when the seats-full switch is enabled", () => {
  assert.equal(shouldBlockNewEventPayment({}, 27, true), true)
  assert.equal(shouldBlockNewEventPayment({}, 27, false), false)
})

test("keeps already-paid current-event participants operating normally", () => {
  assert.equal(shouldBlockNewEventPayment({ PAID_DONE: true, payment_completed_event_id: 27 }, 27, true), false)
  assert.equal(shouldBlockNewEventPayment({ PAID_DONE: true, payment_completed_event_id: 26 }, 27, true), true)
})

test("keeps current-event payment waivers operating normally", () => {
  assert.equal(shouldBlockNewEventPayment({ payment_waived: true, payment_waived_event_id: 27 }, 27, true), false)
})
