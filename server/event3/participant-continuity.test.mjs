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
  const heartbeat = between(api, "if (action === \"e3-get-state\" || action === \"e3-heartbeat\")", "// Cached clients must not retain")

  assert.match(setup, /tokenResolution\.status === "unavailable"[\s\S]*res\.status\(503\)[\s\S]*code: "EVENT3_AUTH_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(setup, /action === "e3-heartbeat" && !participant[\s\S]*res\.status\(401\)[\s\S]*code: "PARTICIPANT_TOKEN_INVALID"[\s\S]*retryable: false/)
  assert.match(setup, /code: "EVENT3_STATE_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(heartbeat, /if \(stateError\)[\s\S]*res\.status\(503\)/)
  assert.match(heartbeat, /if \(rosterError \|\| signupError\)[\s\S]*code: "EVENT3_ENROLLMENT_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(heartbeat, /if \(assignmentError\)[\s\S]*code: "EVENT3_ASSIGNMENT_UNAVAILABLE"[\s\S]*retryable: true/)
  assert.match(heartbeat, /const auxiliaryError = sosRes\.error \|\| moodRes\.error \|\| notifRes\.error/)
  assert.match(heartbeat, /if \(auxiliaryError\)[\s\S]*code: "EVENT3_AUXILIARY_UNAVAILABLE"[\s\S]*retryable: true/)
})

test("Event3 standalone support, mood, and notification reads fail closed on transient database errors", async () => {
  const api = await read("api/participant.mjs")
  const support = between(api, 'if (action === "e3-sos-check")', '// e3-get-mood-check')
  const mood = between(api, 'if (action === "e3-get-mood-check")', '// e3-submit-mood-check')
  const notification = between(api, 'if (action === "e3-get-notification")', '// e3-dismiss-notification')

  assert.match(support, /if \(error\)[\s\S]*status\(503\)[\s\S]*EVENT3_SUPPORT_UNAVAILABLE/)
  assert.match(mood, /if \(error\)[\s\S]*status\(503\)[\s\S]*EVENT3_MOOD_UNAVAILABLE/)
  assert.match(notification, /if \(error\)[\s\S]*status\(503\)[\s\S]*EVENT3_NOTIFICATION_UNAVAILABLE/)
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

test("Event3 organizer help stays above one-to-one session surfaces", async () => {
  const route = await read("app/routes/event3.tsx")
  const support = between(route, "function SOSButton", "// ─── Phase 2 Reveal Screen")

  assert.match(route, /fixed inset-0 z-\[220\][^\n]*h-\[100dvh\]/)
  assert.match(support, /z-\[280\]/)
  assert.match(support, /<LifeBuoy size=\{14\}/)
  assert.match(support, /backdrop-blur-xl/)
  assert.match(route, /function OneToOneSupportSection\(\)/)
  assert.equal((route.match(/<OneToOneSupportSection \/>/g) || []).length, 2)
  assert.match(route, /triggerHidden=\{oneToOneSessionOpen\}/)
  assert.match(support, /window\.addEventListener\(EVENT3_OPEN_SUPPORT_EVENT/)
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

test("Event3 participant requests are pinned to both the displayed edition and runtime session", async () => {
  const api = await read("api/participant.mjs")
  const route = await read("app/routes/event3.tsx")
  const requestGuard = between(api, "const requestTestMode =", "const activeEvent3Phase =")
  const call = between(route, "async function call", "// ─── \"Arrived at table\"")

  assert.match(requestGuard, /`live:\$\{currentEventId\}:\$\{Number\(e3EventState\?\.event3_runtime_generation\) \|\| 1\}`/)
  assert.match(requestGuard, /expected_event_id/)
  assert.match(requestGuard, /Number\(expectedEvent3EventId\) !== Number\(currentEventId\)/)
  assert.match(call, /event3_runtime_event_id/)
  assert.match(call, /expected_event_id: Number\(expectedEventId\)/)
  assert.match(route, /EVENT3_SESSION_DISCOVERY_ACTIONS = new Set\([\s\S]*"e3-heartbeat"[\s\S]*"e3-get-public-format"[\s\S]*"e3-request-login-otp"[\s\S]*"e3-verify-login-otp"[\s\S]*\)/)
  assert.match(call, /removeItem\("event3_runtime_session_key"\)[\s\S]*removeItem\("event3_runtime_event_id"\)[\s\S]*return call\(action, token, extra, true\)/)
})

test("ordinary results omit the current edition while its temporary Event3 test data is active", async () => {
  const api = await read("api/participant.mjs")
  const guards = [...api.matchAll(/const hiddenTestEventId = e3State\?\.test_mode_active === true/g)]
  const filters = [...api.matchAll(/filter\(match => Number\(match\.event_id\) !== hiddenTestEventId\)/g)]

  assert.equal(guards.length, 2, "both Event3 history builders must derive the hidden test edition")
  assert.equal(filters.length, 2, "both Event3 history builders must remove temporary current-edition rows")
  assert.equal((api.match(/select\("phase,current_event_id,results_visible,test_mode_active"\)/g) || []).length, 2)
})

test("Event3 tokenless walkthrough loads only public onboarding metadata before rendering", async () => {
  const api = await read("api/participant.mjs")
  const route = await read("app/routes/event3.tsx")
  const publicAction = between(
    api,
    "if (action === \"e3-get-public-format\")",
    "// Test mode uses real participant records",
  )

  assert.match(publicAction, /return res\.status\(200\)\.json\(\{\s*event_format: eventFormat,\s*group_round_count: groupRoundCount,\s*participant_access_locked: participantAccessLocked,\s*\}\)/)
  assert.doesNotMatch(publicAction, /\b(?:phase|event_id|participant|test_mode)\s*:/)
  assert.match(route, /call\("e3-get-public-format", null\)/)
  assert.match(route, /eventState\?\.event_format \?\? publicFormatState\?\.event_format/)
  assert.match(route, /if \(showWelcome && publicFormatLoading && !publicFormatState && !eventState\)/)
  assert.ok(
    route.indexOf("if (showWelcome) return <WelcomeScreen")
      < route.indexOf("if (testModeBlocked || publicFormatState?.participant_access_locked === true)"),
    "the tutorial must render before the admission-closed disclosure",
  )
})

test("Event3 results and cohost keep edition-aware top-level fallbacks", async () => {
  const api = await read("api/participant.mjs")
  const resultsRoute = await read("app/routes/results.tsx")
  const cohostRoute = await read("app/routes/admin-cohost.tsx")
  const resultsAction = between(api, "// GET MATCH RESULTS BY TOKEN ACTION", "// CHECK FEEDBACK SUBMITTED ACTION")
  const resultsSetter = between(resultsRoute, "setResultsData({", "setError(null)")
  const classicPhaseLabels = between(cohostRoute, "const PHASE_LABELS", "function phaseLabel")

  assert.match(resultsAction, /const resultsEventFormat = await loadEvent3Format\([\s\S]*event_format: resultsEventFormat/)
  assert.match(resultsSetter, /event_format: data\.event_format \?\? null/)
  assert.match(classicPhaseLabels, /phase3_processing: "تجهيز ترشيح النظام"/)
})
