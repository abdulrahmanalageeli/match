import assert from "node:assert/strict"
import test from "node:test"

import { isEvent3SignedUp } from "./enrollment.mjs"

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
