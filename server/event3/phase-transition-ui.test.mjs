import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const readRoute = () => readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

test("phase bridge stays brief, finite, and light on mobile rendering", async () => {
  const route = await readRoute()
  const start = route.indexOf("function EventPhaseTransition")
  const end = route.indexOf("function EventStatusHeader", start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const transition = route.slice(start, end)

  assert.match(route, /EVENT_PHASE_TRANSITION_DURATION_MS = 820/)
  assert.match(transition, /EVENT_PHASE_TRANSITION_BINARY\.map/)
  assert.match(transition, /frameGap >= 180/)
  assert.match(transition, /slowFrames >= 3/)
  assert.match(transition, /reduceMotion \|\| document\.hidden/)
  assert.doesNotMatch(transition, /repeat:\s*Infinity/)
  assert.doesNotMatch(transition, /backdrop-blur/)
  assert.doesNotMatch(transition, /filter:/)
})

test("phase bridge protects participant drafts and active overlays", async () => {
  const route = await readRoute()

  assert.match(route, /if \(prev && prev !== cur\)/)
  assert.match(route, /Boolean\(rankingDraftContext\)/)
  assert.match(route, /Boolean\(pendingGroupFeedbackRound\)/)
  assert.match(route, /Boolean\(activeMatchFeedbackSlot\)/)
  assert.match(route, /groupsOpen/)
  assert.match(route, /finalQuestionsOpen/)
  assert.match(route, /data-event3-phase-transition=\{phase\}/)
})
