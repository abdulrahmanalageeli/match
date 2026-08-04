import assert from "node:assert/strict"
import test from "node:test"
import { confirmationPaymentState } from "./confirmation-policy.mjs"

test("uses the organizer waiver for a free participant", () => {
  assert.equal(confirmationPaymentState({ payment_waived: true, PAID_DONE: false }), "waived")
})

test("treats everyone without an organizer waiver normally", () => {
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: true }), "paid")
  assert.equal(confirmationPaymentState({ payment_waived: false, PAID_DONE: false }), "payment_pending")
  assert.equal(confirmationPaymentState({}), "payment_pending")
})
