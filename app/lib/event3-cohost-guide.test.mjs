import assert from "node:assert/strict"
import test from "node:test"

import { EVENT3_PHASE_TIMER_SECONDS } from "../../server/event3/timing.mjs"
import {
  EVENT3_CHOICE_COHOST_PHASES,
  buildEvent3DisplayedMutationContext,
  calculateEvent3ServerClockOffsetMs,
  getEvent3ChoiceCohostNextPhase,
  getEvent3ChoiceCohostPhase,
  getEvent3CohostTimerStatus,
  summarizeEvent3GroupFeedbackProgress,
} from "./event3-cohost-guide.mjs"

test("choice co-host timeline includes every phase in live order with canonical durations", () => {
  assert.deepEqual(EVENT3_CHOICE_COHOST_PHASES.map(item => item.phase), [
    "setup",
    "round1",
    "ranking1",
    "round2",
    "ranking2",
    "round3",
    "ranking3",
    "phase2_processing",
    "break",
    "phase2_reveal",
    "phase3_processing",
    "phase3_reveal",
    "phase4_processing",
    "phase4_reveal",
    "final_reveal",
  ])

  for (const item of EVENT3_CHOICE_COHOST_PHASES) {
    assert.equal(item.durationSeconds, EVENT3_PHASE_TIMER_SECONDS[item.phase])
    assert.ok(item.instruction.length > 20)
    assert.ok(item.nextAction.length > 20)
  }
})

test("choice co-host phase lookup includes processing transitions and next phase", () => {
  assert.equal(getEvent3ChoiceCohostPhase("phase3_processing")?.label, "تجهيز الاختيار الثاني")
  assert.equal(getEvent3ChoiceCohostNextPhase("phase3_processing")?.phase, "phase3_reveal")
  assert.equal(getEvent3ChoiceCohostNextPhase("final_reveal"), null)
  assert.equal(getEvent3ChoiceCohostPhase("unexpected"), null)
})

test("co-host timer uses supplied server-corrected time and distinguishes expiry", () => {
  const startTime = "2026-09-05T12:00:00.000Z"
  assert.deepEqual(getEvent3CohostTimerStatus({
    active: true,
    startTime,
    durationSeconds: 20 * 60,
    nowMs: Date.parse("2026-09-05T12:07:30.000Z"),
  }), { state: "running", remainingSeconds: 12 * 60 + 30 })

  assert.deepEqual(getEvent3CohostTimerStatus({
    active: true,
    startTime,
    durationSeconds: 20 * 60,
    nowMs: Date.parse("2026-09-05T12:20:01.000Z"),
  }), { state: "expired", remainingSeconds: 0 })

  assert.deepEqual(getEvent3CohostTimerStatus({
    active: false,
    startTime,
    durationSeconds: 25 * 60,
  }), { state: "inactive", remainingSeconds: 25 * 60 })
})

test("server clock offset uses the request midpoint and fails safely", () => {
  assert.equal(calculateEvent3ServerClockOffsetMs({
    serverNow: "2026-09-05T12:00:01.000Z",
    requestStartedAt: Date.parse("2026-09-05T12:00:00.000Z"),
    responseReceivedAt: Date.parse("2026-09-05T12:00:00.200Z"),
  }), 900)
  assert.equal(calculateEvent3ServerClockOffsetMs({
    serverNow: "invalid",
    requestStartedAt: 0,
    responseReceivedAt: 100,
  }), 0)
})

test("displayed mutation context requires an exact event and test session", () => {
  assert.deepEqual(buildEvent3DisplayedMutationContext({
    eventId: "21",
    testMode: false,
  }), {
    expected_event_id: 21,
    expected_test_mode: false,
    expected_test_session_key: "live",
  })
  assert.deepEqual(buildEvent3DisplayedMutationContext({
    eventId: 21,
    testMode: true,
    testSessionKey: "2026-09-05T12:00:00.000Z",
  }), {
    expected_event_id: 21,
    expected_test_mode: true,
    expected_test_session_key: "2026-09-05T12:00:00.000Z",
  })
  assert.equal(buildEvent3DisplayedMutationContext({ eventId: 21, testMode: true }), null)
  assert.equal(buildEvent3DisplayedMutationContext({ eventId: 0, testMode: false }), null)
  assert.equal(buildEvent3DisplayedMutationContext({ eventId: 21, testMode: null }), null)
})

test("partial group feedback remains incomplete while progress stays visible", () => {
  assert.deepEqual(summarizeEvent3GroupFeedbackProgress([
    "complete",
    "complete",
    "partial",
    "missing",
    "not_applicable",
  ]), {
    expectedCount: 4,
    completeCount: 2,
    partialCount: 1,
    missingCount: 1,
    remainingCount: 2,
  })
})
