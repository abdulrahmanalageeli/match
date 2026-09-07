import assert from "node:assert/strict"
import test from "node:test"

import { resolveEvent3PromptVisibility } from "./event3-overlay-policy.mjs"

test("Event3 queues ordinary prompts behind active participant work", () => {
  for (const phase of ["round1", "round2", "round3", "ranking1", "phase2_reveal", "final_reveal"]) {
    const visibility = resolveEvent3PromptVisibility({
      phase,
      hasPendingMoodCheck: true,
      hasPendingNotification: true,
    })
    assert.equal(visibility.canShowMoodCheck, false, phase)
    assert.equal(visibility.canShowNotification, false, phase)
  }

  const blockedBreak = resolveEvent3PromptVisibility({
    phase: "break",
    hasPendingMoodCheck: true,
    interactionOverlayOpen: true,
  })
  assert.equal(blockedBreak.canShowMoodCheck, false)
})

test("Event3 shows at most one ordinary prompt in safe phases", () => {
  const notificationFirst = resolveEvent3PromptVisibility({
    phase: "break",
    hasPendingMoodCheck: true,
    hasPendingNotification: true,
  })
  assert.equal(notificationFirst.canShowNotification, true)
  assert.equal(notificationFirst.canShowMoodCheck, false)
  assert.equal(notificationFirst.canShowAiWelcome, false)

  const moodOnly = resolveEvent3PromptVisibility({
    phase: "phase2_processing",
    hasPendingMoodCheck: true,
  })
  assert.equal(moodOnly.canShowMoodCheck, true)
})

test("urgent Event3 alerts remain available above active work", () => {
  const visibility = resolveEvent3PromptVisibility({
    phase: "phase3_reveal",
    hasPendingNotification: true,
    hasUrgentNotification: true,
    interactionOverlayOpen: true,
  })
  assert.equal(visibility.canShowNotification, true)
  assert.equal(visibility.canShowMoodCheck, false)
})

test("AI welcome waits behind server prompts and participant overlays", () => {
  assert.equal(resolveEvent3PromptVisibility({ phase: "setup", showAiWelcome: true }).canShowAiWelcome, true)
  assert.equal(resolveEvent3PromptVisibility({ phase: "setup", showAiWelcome: true, hasPendingMoodCheck: true }).canShowAiWelcome, false)
  assert.equal(resolveEvent3PromptVisibility({ phase: "setup", showAiWelcome: true, interactionOverlayOpen: true }).canShowAiWelcome, false)
})
