import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("Event3 token lookup only caches confirmed Supabase results", async () => {
  const api = await read("api/participant.mjs")
  const resolver = between(api, "const resolveE3Token", "const token =")

  assert.match(resolver, /const \{ data, error \} = await supabase[\s\S]*\.maybeSingle\(\)/)
  assert.match(resolver, /if \(error\) \{[\s\S]*status: "unavailable"/)
  assert.match(resolver, /catch \(error\) \{[\s\S]*status: "unavailable"/)

  const errorGuard = resolver.indexOf("if (error)")
  const cacheWrite = resolver.indexOf("_e3TokenCache.set")
  assert.ok(errorGuard >= 0 && cacheWrite > errorGuard, "cache writes must happen after the Supabase error guard")
})

test("Event3 heartbeat distinguishes invalid identity from retriable service failures", async () => {
  const api = await read("api/participant.mjs")
  const setup = between(api, "const token = typeof req.body.token", "const currentEventId")
  const heartbeat = between(api, "if (action === \"e3-get-state\" || action === \"e3-heartbeat\")", "// e3-login-by-phone")

  assert.match(setup, /tokenResolution\.status === "unavailable"[\s\S]*res\.status\(503\)[\s\S]*code: "EVENT3_AUTH_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(setup, /action === "e3-heartbeat" && !participant[\s\S]*res\.status\(401\)[\s\S]*code: "PARTICIPANT_TOKEN_INVALID"[\s\S]*retryable: false/)
  assert.match(setup, /code: "EVENT3_STATE_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(heartbeat, /if \(stateError\)[\s\S]*res\.status\(503\)/)
  assert.match(heartbeat, /if \(rosterError \|\| signupError\)[\s\S]*code: "EVENT3_ENROLLMENT_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(heartbeat, /if \(assignmentError\)[\s\S]*code: "EVENT3_ASSIGNMENT_UNAVAILABLE"[\s\S]*retryable: true/)
})

test("Event3 client only clears identity for the explicit invalid-token code", async () => {
  const route = await read("app/routes/event3.tsx")
  const fetchState = between(route, "const fetchState = useCallback", "const { data: eventState")

  assert.match(fetchState, /d\.code === "PARTICIPANT_TOKEN_INVALID" && d\.retryable === false/)
  assert.match(fetchState, /if \(!isImpersonating\) clearStoredParticipantIdentity\(\)/)
  assert.doesNotMatch(fetchState, /d\.error\.includes/)
  assert.match(fetchState, /if \(typeof d\.enrolled === "boolean"\) setEnrolled\(d\.enrolled\)/)
  assert.match(fetchState, /if \(d\.my_info && typeof d\.my_info === "object"\) setMyInfo\(d\.my_info\)/)
})

test("Event3 transport failures are structured as retriable and polling retains prior data", async () => {
  const route = await read("app/routes/event3.tsx")
  const call = between(route, "async function call", "// ─── \"Arrived at table\"")
  const poll = between(route, "function useApiPoll", "// ─── Shared Design Components")
  const pollCatch = between(poll, "} catch (err: any) {", "} finally {")

  assert.match(call, /code: "EVENT3_SERVICE_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(call, /code: error\?\.name === "AbortError" \? "EVENT3_REQUEST_TIMEOUT" : "EVENT3_NETWORK_UNAVAILABLE"/)
  assert.match(call, /http_status: 0,[\s\S]*retryable: true/)
  assert.doesNotMatch(pollCatch, /setData\(/, "transient polling failures must not erase the last successful heartbeat")
})
