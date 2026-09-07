const EVENT3_SAFE_PROMPT_PHASES = new Set([
  "setup",
  "break",
  "phase2_processing",
  "phase3_processing",
  "phase4_processing",
])

/**
 * Give Event3's server-driven prompts one deterministic priority order.
 * Active participant work always wins; only emergency alerts may interrupt it.
 */
export function resolveEvent3PromptVisibility({
  phase,
  hasPendingMoodCheck = false,
  hasPendingNotification = false,
  hasUrgentNotification = false,
  interactionOverlayOpen = false,
  showAiWelcome = false,
}) {
  const isSafePromptMoment = EVENT3_SAFE_PROMPT_PHASES.has(String(phase || ""))
  const canShowNotification = Boolean(
    hasPendingNotification
    && (hasUrgentNotification || (isSafePromptMoment && !interactionOverlayOpen)),
  )
  const canShowMoodCheck = Boolean(
    hasPendingMoodCheck
    && isSafePromptMoment
    && !interactionOverlayOpen
    && !hasPendingNotification,
  )
  const canShowAiWelcome = Boolean(
    showAiWelcome
    && phase === "setup"
    && !interactionOverlayOpen
    && !hasPendingMoodCheck
    && !hasPendingNotification,
  )

  return {
    isSafePromptMoment,
    canShowMoodCheck,
    canShowNotification,
    canShowAiWelcome,
  }
}
