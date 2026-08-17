import assert from "node:assert/strict"
import test from "node:test"

import {
  EVENT3_TIMER_ROUND_SECONDS,
  getEvent3PhaseTimerSeconds,
} from "./timing.mjs"

test("Event3 phase defaults match the current live schedule", () => {
  assert.equal(getEvent3PhaseTimerSeconds("round1"), 35 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("ranking1"), 3 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("round2"), 25 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("ranking2"), 3 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("break"), 10 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("phase2_reveal"), 26 * 60)
  assert.equal(getEvent3PhaseTimerSeconds("phase3_reveal"), 26 * 60)
})

test("non-timed Event3 phases default to zero rather than a stale session length", () => {
  assert.equal(getEvent3PhaseTimerSeconds("setup"), 0)
  assert.equal(getEvent3PhaseTimerSeconds("phase2_processing"), 0)
  assert.equal(getEvent3PhaseTimerSeconds("final_reveal"), 0)
  assert.equal(getEvent3PhaseTimerSeconds("unknown"), 0)
})

test("timer control round defaults follow the phase schedule", () => {
  assert.equal(EVENT3_TIMER_ROUND_SECONDS[0], 3 * 60)
  assert.equal(EVENT3_TIMER_ROUND_SECONDS[1], 35 * 60)
  assert.equal(EVENT3_TIMER_ROUND_SECONDS[2], 25 * 60)
  assert.equal(EVENT3_TIMER_ROUND_SECONDS[4], 26 * 60)
})
