import test from "node:test"
import assert from "node:assert/strict"
import { canAccessEvent3DuringTest, isEvent3TestImpersonation } from "./test-access.mjs"

test("normal Event3 access remains open outside test mode", () => {
  assert.equal(canAccessEvent3DuringTest({ testModeActive: false }), true)
})

test("test mode requires the impersonation URL marker", () => {
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: false }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: "0" }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: "1" }), true)
})

test("supported request encodings recognize impersonation", () => {
  assert.equal(isEvent3TestImpersonation(true), true)
  assert.equal(isEvent3TestImpersonation(1), true)
  assert.equal(isEvent3TestImpersonation("1"), true)
  assert.equal(isEvent3TestImpersonation(undefined), false)
})
