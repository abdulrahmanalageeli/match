import assert from "node:assert/strict"
import test from "node:test"

import { buildEvent3Uri, hasEvent3AdminUriOverride } from "./event3-admin-uri.mjs"

test("accepts the supported Event3 admin URL markers", () => {
  assert.equal(hasEvent3AdminUriOverride("?admin"), true)
  assert.equal(hasEvent3AdminUriOverride("?admin=1"), true)
  assert.equal(hasEvent3AdminUriOverride("?admin=true"), true)
  assert.equal(hasEvent3AdminUriOverride("?admin=on"), true)
  assert.equal(hasEvent3AdminUriOverride("?%25admin=1"), true)
})

test("does not enable the override for absent or disabled markers", () => {
  assert.equal(hasEvent3AdminUriOverride("?token=participant"), false)
  assert.equal(hasEvent3AdminUriOverride("?admin=0"), false)
  assert.equal(hasEvent3AdminUriOverride("?admin=false"), false)
})

test("Event3 links retain the complete current test-mode URI", () => {
  assert.equal(
    buildEvent3Uri("?token=participant%2F7&impersonate=1&admin=on"),
    "/event3?token=participant%2F7&impersonate=1&admin=on",
  )
  assert.equal(
    buildEvent3Uri("?%25admin=1&discussionPreview=1"),
    "/event3?%25admin=1&discussionPreview=1",
  )
})

test("Event3 query updates do not discard access markers", () => {
  assert.equal(
    buildEvent3Uri("?token=participant&impersonate=1", {
      set: { questionPreview: "aiWelcome" },
    }),
    "/event3?token=participant&impersonate=1&questionPreview=aiWelcome",
  )
  assert.equal(
    buildEvent3Uri("?token=participant&t=legacy&impersonate=1&admin=1", {
      remove: ["token", "t"],
    }),
    "/event3?impersonate=1&admin=1",
  )
})
