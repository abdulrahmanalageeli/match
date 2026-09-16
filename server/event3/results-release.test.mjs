import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { event3ResultsReleased, loadEvent3ResultsReleases } from "./results-release.mjs"

const midnight = Date.parse("2026-09-17T00:00:00+03:00")
const releases = new Map([[28, "2026-09-16T21:00:00Z"]])
const state = { current_event_id: 28, phase: "final_reveal", results_visible: true, test_mode_active: false }

test("Riyadh midnight is an exact server-side boundary despite an early reveal", () => {
  assert.equal(event3ResultsReleased(28, state, releases, midnight - 1), false)
  assert.equal(event3ResultsReleased(28, state, releases, midnight), true)
  assert.equal(event3ResultsReleased(28, state, releases, midnight + 1), true)
  assert.equal(event3ResultsReleased(28, { ...state, phase: "final", results_visible: false }, releases, midnight), true)
})

test("changing editions cannot bypass an existing schedule or hide previous results", () => {
  assert.equal(event3ResultsReleased(27, state, releases, midnight - 1), true)
  assert.equal(event3ResultsReleased(28, { ...state, current_event_id: 29 }, releases, midnight - 1), false)
  assert.equal(event3ResultsReleased(28, { ...state, current_event_id: 29 }, releases, midnight), true)
})

test("unscheduled events preserve reveal rules and test results remain private", () => {
  assert.equal(event3ResultsReleased(28, state, new Map()), true)
  assert.equal(event3ResultsReleased(28, { ...state, phase: "groups", results_visible: false }, new Map()), false)
  assert.equal(event3ResultsReleased(28, { ...state, test_mode_active: true }, releases, midnight), false)
  assert.equal(event3ResultsReleased(28, null, releases, midnight), false)
  assert.equal(event3ResultsReleased(28, state, new Map([[28, "invalid"]]), midnight), false)
})

test("schedule lookup errors fail closed", async () => {
  const query = { select() { return this }, eq() { return this }, not() { return { error: new Error("offline") } } }
  await assert.rejects(loadEvent3ResultsReleases({ from: () => query }, "event3"), /offline/)
})

test("both participant result paths filter before collecting partner contact data", async () => {
  const source = await readFile(new URL("../../api/participant.mjs", import.meta.url), "utf8")
  assert.equal((source.match(/const releases = await loadEvent3ResultsReleases\(supabase, E3_MATCH_ID\)/g) || []).length, 2)
  assert.equal((source.match(/event3ResultsReleased\((?:match\.event_id|eventId), e3State, releases\)/g) || []).length, 2)
  assert.match(source, /results_release_at: currentEventResultsReleaseAt/)
})
