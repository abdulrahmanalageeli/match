import assert from "node:assert/strict"
import test from "node:test"

import { hasEvent3AdminUriOverride } from "./event3-admin-uri.mjs"

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
