import test from "node:test"
import assert from "node:assert/strict"
import {
  canAccessEvent3DuringTest,
  isEvent3AdminOverride,
  isEvent3TestImpersonation,
} from "./test-access.mjs"

test("normal Event3 access remains open outside test mode", () => {
  assert.equal(canAccessEvent3DuringTest({ testModeActive: false }), true)
})

test("test mode requires the impersonation URL marker", () => {
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: false }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: "0" }), false)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, impersonate: "1" }), true)
})

test("the manual participant gate blocks Event3 independently of test runtime", () => {
  assert.equal(canAccessEvent3DuringTest({ participantAccessLocked: true }), false)
  assert.equal(canAccessEvent3DuringTest({ participantAccessLocked: false }), true)
})

test("an explicit admin URI marker bypasses either Event3 admission lock", () => {
  assert.equal(canAccessEvent3DuringTest({ participantAccessLocked: true, adminOverride: true }), true)
  assert.equal(canAccessEvent3DuringTest({ testModeActive: true, adminOverride: "1" }), true)
  assert.equal(canAccessEvent3DuringTest({ participantAccessLocked: true, adminOverride: "false" }), false)
})

test("supported request encodings recognize impersonation", () => {
  assert.equal(isEvent3TestImpersonation(true), true)
  assert.equal(isEvent3TestImpersonation(1), true)
  assert.equal(isEvent3TestImpersonation("1"), true)
  assert.equal(isEvent3TestImpersonation(undefined), false)
})

test("supported request encodings recognize the admin override", () => {
  assert.equal(isEvent3AdminOverride(true), true)
  assert.equal(isEvent3AdminOverride(""), true)
  assert.equal(isEvent3AdminOverride("true"), true)
  assert.equal(isEvent3AdminOverride("on"), true)
  assert.equal(isEvent3AdminOverride("false"), false)
  assert.equal(isEvent3AdminOverride(undefined), false)
})
