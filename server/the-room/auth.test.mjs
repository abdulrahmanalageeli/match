import test from "node:test"
import assert from "node:assert/strict"
import {
  enforceTheRoomRateLimit,
  hasTheRoomSession,
  loginTheRoom,
  logoutTheRoom,
} from "./auth.mjs"

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

test("creates and verifies an independently scoped signed session", () => {
  const oldKey = process.env.THE_ROOM_ADMIN_KEY
  const oldSecret = process.env.THE_ROOM_SESSION_SECRET
  process.env.THE_ROOM_ADMIN_KEY = "room-test-key"
  process.env.THE_ROOM_SESSION_SECRET = "room-test-secret-with-more-than-32-characters"
  try {
    const loginResponse = response()
    assert.deepEqual(loginTheRoom({ headers: {} }, loginResponse, "room-test-key"), { ok: true })
    const cookie = loginResponse.headers["Set-Cookie"].split(";", 1)[0]
    assert.equal(hasTheRoomSession({ headers: { cookie } }), true)

    const logoutResponse = response()
    logoutTheRoom({ headers: {} }, logoutResponse)
    assert.match(logoutResponse.headers["Set-Cookie"], /Max-Age=0/)
  } finally {
    if (oldKey === undefined) delete process.env.THE_ROOM_ADMIN_KEY
    else process.env.THE_ROOM_ADMIN_KEY = oldKey
    if (oldSecret === undefined) delete process.env.THE_ROOM_SESSION_SECRET
    else process.env.THE_ROOM_SESSION_SECRET = oldSecret
  }
})

test("uses a separate strict bucket for login attempts", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.77" } }
  assert.equal(enforceTheRoomRateLimit(req, response(), { limit: 2, scope: "login-test" }), true)
  assert.equal(enforceTheRoomRateLimit(req, response(), { limit: 2, scope: "login-test" }), true)
  const blocked = response()
  assert.equal(enforceTheRoomRateLimit(req, blocked, { limit: 2, scope: "login-test" }), false)
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.body.error, "Too many requests. Please wait a moment.")
})
