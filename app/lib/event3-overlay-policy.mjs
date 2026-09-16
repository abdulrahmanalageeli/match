/**
 * Give Event3's server-driven prompts one deterministic priority order.
 * Protected participant work always wins; outside an open interaction, prompts
 * should arrive in the phase where the organizer sent them instead of waiting
 * indefinitely for a short phase allow-list.
 */
export function resolveEvent3PromptVisibility({
  phase,
  hasPendingMoodCheck = false,
  hasPendingNotification = false,
  hasUrgentNotification = false,
  hasPendingChoiceAward = false,
  interactionOverlayOpen = false,
  showAiWelcome = false,
}) {
  const isSafePromptMoment = !interactionOverlayOpen
  const canShowChoiceAward = Boolean(hasPendingChoiceAward && phase === "break" && isSafePromptMoment && !hasPendingNotification)
  const canShowNotification = Boolean(
    hasPendingNotification
    && (hasUrgentNotification || isSafePromptMoment),
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
    // The private celebration arrives before optional mood questions.
    canShowMoodCheck: canShowMoodCheck && !canShowChoiceAward,
    canShowNotification,
    canShowAiWelcome,
    canShowChoiceAward,
  }
}
